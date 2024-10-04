import { CosmosEvent, CosmosBlock } from "@subql/types-cosmos";
import { Burn, Mint, PointsBalance, TokenBalance, Transfer } from "../types";
import { parseCoins } from "@cosmjs/proto-signing";
import { FILTERED_ADDRESSES, MINTER_ADDRESS, TokenType, TRACKED_DENOMS } from "../config";

export async function handleTransferEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);

  logger.info(`New transfer at block ${blockHeight.toString()}`);

  const senderValue = event.event.attributes.find(
    (attr) => attr.key === "sender"
  )?.value;
  let sender =
    senderValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(senderValue)
      : senderValue;

  const recipientValue = event.event.attributes.find(
    (attr) => attr.key === "recipient"
  )?.value;
  let recipient =
    recipientValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(recipientValue)
      : recipientValue;

  const amountValue = event.event.attributes.find(
    (attr) => attr.key === "amount"
  )?.value;
  const amount =
    amountValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(amountValue)
      : amountValue;

  if (!sender || !recipient || !amount) {
    logger.error(
      `sender, recipient, or amount is undefined in event ${JSON.stringify(
        event.event
      )}`
    );
    return;
  }

  const coins = parseCoins(amount);

  if (coins.length === 0) {
    logger.error(`No coins in transfer event ${JSON.stringify(event.event)}`);
    return;
  }

  // For each of the sent coins, create a transfer record if the denom should be tracked
  for (const { denom, amount } of coins) {
    if (!TRACKED_DENOMS.some(token => token.denom === denom)) {
      continue;
    }

    const transferRecord = Transfer.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      date: new Date(event.block.header.time.toISOString()),
      transactionHash: event.tx.hash,
      amount: BigInt(0),
      recipient,
      sender,
      denom,
    });
    await transferRecord.save();

    // Get the latest token balance for the sender
    let senderBalance: TokenBalance | undefined = (
      await TokenBalance.getByFields(
        [
          ["address", "=", sender],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];
    if (!senderBalance) {
      senderBalance = await TokenBalance.create({
        id: `${blockHeight.toString()}-${sender}-${denom}`,
        blockHeight,
        address: sender,
        denom,
        balance: BigInt(0),
      });
    }

    // Get the latest token balance for the recipient
    let recipientBalance: TokenBalance | undefined = (
      await TokenBalance.getByFields(
        [
          ["address", "=", recipient],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];
    if (!recipientBalance) {
      recipientBalance = await TokenBalance.create({
        id: `${blockHeight.toString()}-${recipient}-${denom}`,
        blockHeight,
        address: recipient,
        denom,
        balance: BigInt(0),
      });
    }

    // Save the new token balances.
    senderBalance.balance -= BigInt(amount);
    await senderBalance.save();
    recipientBalance.balance += BigInt(amount);
    await recipientBalance.save();
  }
}

export async function handleStakeEvent(event: CosmosEvent): Promise<void> {
  logger.info(`New stake at block ${event.block.block.header.height.toString()}`);

  const blockHeight = BigInt(event.block.block.header.height);

  // Parse tx executor
  const otherEvents = event.tx.tx.events;
  const executeEvent = otherEvents.find(event => event.type == "message");
  if (!executeEvent || !executeEvent.attributes.some(attr => attr.key == "/cosmwasm.wasm.v1.MsgExecuteContract")) {
    logger.error(`No execute event in yield token mint tx ${JSON.stringify(event.tx)}`);
    return;
  }
  const executorValue = executeEvent.attributes.find(attr => attr.key == "sender")?.value;
  if (!executorValue) {
    logger.error(`No executor in yield token mint tx ${JSON.stringify(event.tx)}`);
    return;
  }
  const sender =
    executorValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(executorValue)
      : executorValue;

  const contractAddressValue = event.event.attributes.find(
    (attr) => attr.key === "_contract_address"
  )?.value;
  const contractAddress =
    contractAddressValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(contractAddressValue)
      : contractAddressValue;

  if (contractAddress != MINTER_ADDRESS) {
    return;
  }

  const amountValue = event.event.attributes.find(
    (attr) => attr.key === "amount"
  )?.value;
  const amountStr =
    amountValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(amountValue)
      : amountValue;
  const amount = BigInt(amountStr || "0");

  if (amount == BigInt(0)) {
    logger.error(`No amount in stake event ${JSON.stringify(event.event)}`);
    return;
  }

  const denomValue = event.event.attributes.find(
    (attr) => attr.key === "staked_token_denom"
  )?.value;
  const denom =
    denomValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(denomValue)
      : denomValue;

  if (!denom) {
    logger.error(`No denom in stake event ${JSON.stringify(event.event)}`);
    return;
  }

  // Get stakers old balance
  const oldBalance = await TokenBalance.getByFields(
    [
      ["address", "=", sender],
      ["denom", "=", `staked-${denom}`],
    ],
    { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
  );
  if (!oldBalance) {
    const balance = await TokenBalance.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      address: sender,
      denom: `staked-${denom}`,
      balance: amount,
    });
    await balance.save();
  }
  else {
    oldBalance[0].balance += amount;
    await oldBalance[0].save();
  }
}

export async function handleUnstakeEvent(event: CosmosEvent): Promise<void> {
  logger.info(`New unstake at block ${event.block.block.header.height.toString()}`);
  const blockHeight = BigInt(event.block.block.header.height);

  // Parse tx executor
  const otherEvents = event.tx.tx.events;
  const executeEvent = otherEvents.find(event => event.type == "message");
  if (!executeEvent || !executeEvent.attributes.some(attr => attr.key == "/cosmwasm.wasm.v1.MsgExecuteContract")) {
    logger.error(`No execute event in yield token mint tx ${JSON.stringify(event.tx)}`);
    return;
  }
  const executorValue = executeEvent.attributes.find(attr => attr.key == "sender")?.value;
  if (!executorValue) {
    logger.error(`No executor in yield token mint tx ${JSON.stringify(event.tx)}`);
    return;
  }
  const sender =
    executorValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(executorValue)
      : executorValue;


  const amountValue = event.event.attributes.find(
    (attr) => attr.key === "amount"
  )?.value;
  const amountStr =
    amountValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(amountValue)
      : amountValue;
  const amount = BigInt(amountStr || "0");

  if (amount == BigInt(0)) {
    logger.error(`No amount in stake event ${JSON.stringify(event.event)}`);
    return;
  }

  const denomValue = event.event.attributes.find(
    (attr) => attr.key === "staked_token_denom"
  )?.value;
  const denom =
    denomValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(denomValue)
      : denomValue;

  if (!denom) {
    logger.error(`No denom in stake event ${JSON.stringify(event.event)}`);
    return;
  }

  // Get stakers old balance
  const oldBalance = await TokenBalance.getByFields(
    [
      ["address", "=", sender],
      ["denom", "=", `staked-${denom}`],
    ],
    { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
  );
  if (!oldBalance) {
    const balance = await TokenBalance.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      address: sender,
      denom: `staked-${denom}`,
      balance: amount,
    });
    await balance.save();
  }
  else {
    oldBalance[0].balance -= amount;
    await oldBalance[0].save();
  }
}

export async function handleMintEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);

  logger.info(`New mint at block ${blockHeight.toString()}`);

  const amountValue = event.event.attributes.find(
    (attr) => attr.key === "amount"
  )?.value;
  const amount =
    amountValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(amountValue)
      : amountValue;

  const recipientValue = event.event.attributes.find(
    (attr) => attr.key === "mint_to_address"
  )?.value;
  let recipient =
    recipientValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(recipientValue)
      : recipientValue;

  if (!amount || !recipient) {
    logger.error(
      `Amount or recipient is undefined in event ${JSON.stringify(event.event)}`
    );
    return;
  }

  logger.info(`Mint amount: ${amount}, recipient: ${recipient}`);

  const coins = parseCoins(amount);

  for (const { denom, amount } of coins) {
    const token = TRACKED_DENOMS.find(token => token.denom === denom);
    if (token === undefined) {
      continue;
    }

    const mintRecord = Mint.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      date: new Date(event.block.header.time.toISOString()),
      transactionHash: event.tx.hash,
      denom,
      amount: BigInt(amount),
    });
    await mintRecord.save();

    // Get the latest token balance for the recipient
    let recipientBalance: TokenBalance | undefined = (
      await TokenBalance.getByFields(
        [
          ["address", "=", recipient],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];
    if (!recipientBalance) {
      recipientBalance = await TokenBalance.create({
        id: `${blockHeight.toString()}-${recipient}-${denom}`,
        blockHeight,
        address: recipient,
        denom,
        balance: BigInt(0),
      });
    }

    // Update the token balance for the recipient, if it exists, otherwise create it
    recipientBalance.balance += BigInt(amount);
    await recipientBalance.save();
  }
}

export async function handleBurnEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);

  logger.info(`New burn at block ${blockHeight.toString()}`);

  const amountValue = event.event.attributes.find(
    (attr) => attr.key === "amount"
  )?.value;
  const amount =
    amountValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(amountValue)
      : amountValue;

  const senderValue = event.event.attributes.find(
    (attr) => attr.key === "burn_from_address"
  )?.value;
  const sender =
    senderValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(senderValue)
      : senderValue;

  if (!amount || !sender) {
    logger.error(
      `Amount or sender is undefined in event ${JSON.stringify(event.event)}`
    );
    return;
  }

  logger.info(`Burn amount: ${amount}, sender: ${sender}`);

  const coins = parseCoins(amount);

  for (const { denom, amount } of coins) {
    if (!TRACKED_DENOMS.some(token => token.denom === denom)) {
      continue;
    }

    // Create the burn record
    const burnRecord = Burn.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      date: new Date(event.block.header.time.toISOString()),
      transactionHash: event.tx.hash,
      denom,
      amount: BigInt(amount),
    });
    await burnRecord.save();

    // Get the latest token balance for the sender
    let senderBalance: TokenBalance | undefined = (
      await TokenBalance.getByFields(
        [
          ["address", "=", sender],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];
    if (!senderBalance) {
      senderBalance = await TokenBalance.create({
        id: `${blockHeight.toString()}-${sender}-${denom}`,
        blockHeight,
        address: sender,
        denom,
        balance: BigInt(0),
      });
    }

    // Update the token balance for the sender, if it exists, otherwise create it
    senderBalance.balance -= BigInt(amount);
    await senderBalance.save();
  }
}

export async function handleAccumulatePoints(
  block: CosmosBlock
): Promise<void> {
  const currentBlockHeight = BigInt(block.block.header.height);
  const currentBlockTime = block.block.header.time.getTime() / 1000;
  const previousBlockHeight = currentBlockHeight - BigInt(1);

  logger.info(`Accumulating points at block ${currentBlockHeight.toString()}`);

  const pointsThisBlock = new Map<string, bigint>();

  // For each tracked denom loop over all the token balances from the previous block
  // and accumulate the points balances based on the multipliers
  for (const token of TRACKED_DENOMS) {
    const tokenBalances = await TokenBalance.getByFields([
      ["denom", "=", token.denom],
      ["blockHeight", "=", previousBlockHeight.toString()],
      ["address", "!in", FILTERED_ADDRESSES],
    ]);

    const multiplier = token.multiplier;

    // Update the points for each address
    for (const tokenBalance of tokenBalances) {
      // Filter out tokens that have matured
      if (token.maturity <= currentBlockTime) {
        continue;
      }

      const points = tokenBalance.balance * multiplier;
      const currentPoints =
        pointsThisBlock.get(tokenBalance.address) || BigInt(0);
      pointsThisBlock.set(tokenBalance.address, currentPoints + points);
    }
  }

  // Create the points balances for each address for the current block
  for (const [address, points] of pointsThisBlock) {
    const previousPointsBalance = await PointsBalance.get(
      `${previousBlockHeight.toString()}-${address}`
    );
    const pointsBalance = PointsBalance.create({
      id: `${currentBlockHeight.toString()}-${address}`,
      blockHeight: currentBlockHeight,
      address,
      balance: previousPointsBalance
        ? previousPointsBalance.balance + points
        : points,
    });
    await pointsBalance.save();
  }
}
