import { CosmosEvent, CosmosBlock } from "@subql/types-cosmos";
import { Burn, Mint, PointsBalance, TokenBalance, Transfer } from "../types";
import { parseCoins } from "@cosmjs/proto-signing";
import { FILTERED_ADDRESSES, MINTER_ADDRESS, TOKENFACTORY_ADDRESS, TRACKED_DENOMS } from "../config";

function parseCoinsAndLogError(amount: string): { denom: string, amount: string }[] {
  let coins: { denom: string, amount: string }[] = [];
  try {
    coins = parseCoins(amount);
  } catch (e) {
    logger.error(`Error parsing coins: ${amount}. Error: ${e}`);
    return [];
  }
  return coins;
}

async function updateTokenBalance(blockHeight: bigint, address: string, denom: string, balanceChange: bigint) {
  // Read the last token balance and store it if it doesn't exist
  let latestTokenBalance: TokenBalance | undefined = (await TokenBalance.getByFields([
    ["address", "=", address],
    ["denom", "=", denom],
    ["isLatest", "=", true],
  ], {limit: 1}))[0];
  if (!latestTokenBalance) {
    latestTokenBalance = TokenBalance.create({
          id: `${blockHeight}-${address}-${denom}`,
          blockHeight,
          address,
          denom,
          balance: balanceChange,
          isLatest: true,
      });
      await latestTokenBalance.save();
      return;
  }

  // If the last stored block is this block, then we can just update the token balance
  if (latestTokenBalance.blockHeight == blockHeight) {
    latestTokenBalance.balance += balanceChange;
    await latestTokenBalance.save();
    return;
  }

  // Otherwise, update the old latest state and create a new latest token balance
  latestTokenBalance.isLatest = false;
  await latestTokenBalance.save();

  const newTokenBalance = TokenBalance.create({
      id: `${blockHeight}-${address}-${denom}`,
      blockHeight,
      address,
      denom,
      balance: balanceChange,
      isLatest: true,
  });
  await newTokenBalance.save();
}

export async function handleTransferEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);

  const senderValue = event.event.attributes.find(
    (attr) => attr.key === "sender"
  )?.value;
  let sender =
    senderValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(senderValue)
      : senderValue;

  // Filter out transfers from the token factory module, as we handle them in the mint event handler
  if (sender == TOKENFACTORY_ADDRESS) {
    return;
  }

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

  const coins = parseCoinsAndLogError(amount);

  if (coins.length === 0) {
    logger.error(`No coins in transfer event ${JSON.stringify(event.event)}`);
    return;
  }

  // For each of the sent coins, create a transfer record if the denom should be tracked
  for (const { denom, amount } of coins) {
    if (!TRACKED_DENOMS.some(token => token.denom === denom)) {
      continue;
    }

    logger.info(`New transfer at block ${blockHeight.toString()}. Sender: ${sender}, Recipient: ${recipient}, Amount: ${amount}, Denom: ${denom}`);

    const transferRecord = Transfer.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      date: new Date(event.block.header.time.toISOString()),
      transactionHash: event.tx.hash,
      amount: BigInt(amount),
      recipient,
      sender,
      denom,
    });
    await transferRecord.save();

    // Save the new token balances.
    updateTokenBalance(blockHeight, sender, denom, -BigInt(amount));
    updateTokenBalance(blockHeight, recipient, denom, BigInt(amount));
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

  // Update the staked token balance
  updateTokenBalance(blockHeight, sender, `staked-${denom}`, amount);
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

  // Update the staked token balance
  updateTokenBalance(blockHeight, sender, `staked-${denom}`, -amount);
}

export async function handleMintEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);



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

  const coins = parseCoinsAndLogError(amount);

  for (const { denom, amount } of coins) {
    const token = TRACKED_DENOMS.find(token => token.denom === denom);
    if (token === undefined) {
      continue;
    }
    logger.info(`New mint at block ${blockHeight.toString()}. Mint amount: ${amount}, recipient: ${recipient}, denom: ${denom}`);

    const mintRecord = Mint.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      date: new Date(event.block.header.time.toISOString()),
      transactionHash: event.tx.hash,
      denom,
      amount: BigInt(amount),
      recipient,
    });
    await mintRecord.save();

    // Update the token balance for the recipient, if it exists, otherwise create it
    updateTokenBalance(blockHeight, recipient, denom, BigInt(amount));
  }
}

export async function handleBurnEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);

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


  const coins = parseCoinsAndLogError(amount);

  for (const { denom, amount } of coins) {
    if (!TRACKED_DENOMS.some(token => token.denom === denom)) {
      continue;
    }

    logger.info(`New burn at block ${blockHeight.toString()}. Burn amount: ${amount}, sender: ${sender}`);

    // Create the burn record
    const burnRecord = Burn.create({
      id: `${event.tx.hash}-${event.idx}`,
      blockHeight,
      date: new Date(event.block.header.time.toISOString()),
      transactionHash: event.tx.hash,
      denom,
      amount: BigInt(amount),
      sender,
    });
    await burnRecord.save();

    // Update the token balance for the sender
    updateTokenBalance(blockHeight, sender, denom, -BigInt(amount));
  }
}

export async function handleAccumulatePoints(
  block: CosmosBlock
): Promise<void> {
  const currentBlockHeight = BigInt(block.block.header.height);
  const currentBlockTime = block.block.header.time.getTime() / 1000;
  const previousBlockHeight = currentBlockHeight - BigInt(1);

  if (currentBlockHeight <= BigInt(18646814 + 4)) {
    logger.info(`Accumulating points at block ${currentBlockHeight.toString()}`);
  }

  const pointsThisBlock = new Map<string, bigint>();

  // For each tracked denom loop over all the token balances from the previous block
  // and accumulate the points balances based on the multipliers
  for (const token of TRACKED_DENOMS) {
    const tokenBalances = await TokenBalance.getByFields([
      ["denom", "=", token.denom],
      ["address", "!in", FILTERED_ADDRESSES],
      ["isLatest", "=", true],
    ]);

    if (currentBlockHeight <= BigInt(18646814 + 4)) {
      logger.info(`Token: ${JSON.stringify(token)}`);
      logger.info(`Token balances: ${JSON.stringify(tokenBalances)}`);
    }
    const multiplier = token.multiplier;

    // Update the points for each address
    for (const tokenBalance of tokenBalances) {
      if (tokenBalance.blockHeight > previousBlockHeight) {
        logger.error(`Token balance block height is greater than previous block height: ${tokenBalance.blockHeight.toString()} > ${previousBlockHeight.toString()}`);
        continue;
      }

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

  if (currentBlockHeight <= BigInt(18646814 + 4)) {
    logger.info(`Points this block: ${JSON.stringify(pointsThisBlock)}`);
  }

  // Create the points balances for each address for the current block
  for (const [address, points] of pointsThisBlock) {
    // Set the previous points balance isLatest field to false
    const previousPointsBalance = await PointsBalance.get(
      `${previousBlockHeight.toString()}-${address}`
    );
    if (previousPointsBalance) {
      previousPointsBalance.isLatest = false;
      await previousPointsBalance.save();
    }

    const pointsBalance = PointsBalance.create({
      id: `${currentBlockHeight.toString()}-${address}`,
      blockHeight: currentBlockHeight,
      address,
      balance: previousPointsBalance
        ? previousPointsBalance.balance + points
        : points,
      isLatest: true,
    });
    await pointsBalance.save();
  }
}
