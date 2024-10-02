import { CosmosEvent, CosmosBlock } from "@subql/types-cosmos";
import { Burn, Mint, PointsBalance, TokenBalance, Transfer } from "../types";
import { logger } from "../logger";
import { parseCoins } from "@cosmjs/proto-signing";
import { TRACKED_DENOMS } from "../config";

export async function handleTransferEvent(event: CosmosEvent): Promise<void> {
  const blockHeight = BigInt(event.block.block.header.height);

  logger.info(`New transfer at block ${blockHeight.toString()}`);

  const senderValue = event.event.attributes.find(
    (attr) => attr.key === "sender"
  )?.value;
  const sender =
    senderValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(senderValue)
      : senderValue;

  const recipientValue = event.event.attributes.find(
    (attr) => attr.key === "recipient"
  )?.value;
  const recipient =
    recipientValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(recipientValue)
      : recipientValue;

  const denomValue = event.event.attributes.find(
    (attr) => attr.key === "denom"
  )?.value;
  const denom =
    denomValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(denomValue)
      : denomValue;

  const amountValue = event.event.attributes.find(
    (attr) => attr.key === "amount"
  )?.value;
  const amount =
    amountValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(amountValue)
      : amountValue;

  if (!denom || !sender || !recipient || !amount) {
    logger.error(
      `Denom, sender, recipient, or amount is undefined in event ${JSON.stringify(
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
    const senderBalance = (
      await TokenBalance.getByFields(
        [
          ["address", "=", sender],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];

    // Get the latest token balance for the recipient
    const recipientBalance = (
      await TokenBalance.getByFields(
        [
          ["address", "=", recipient],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];

    // Save the new token balances. If the balance already exists for this block overwrite it with the new balance
    await store.set(
      "TokenBalance",
      `${blockHeight.toString()}-${sender}-${denom}`,
      new TokenBalance(
        `${blockHeight.toString()}-${sender}-${denom}`,
        blockHeight,
        sender,
        denom,
        senderBalance.balance - BigInt(amount)
      )
    );
    await store.set(
      "TokenBalance",
      `${blockHeight.toString()}-${recipient}-${denom}`,
      new TokenBalance(
        `${blockHeight.toString()}-${recipient}-${denom}`,
        blockHeight,
        recipient,
        denom,
        recipientBalance.balance + BigInt(amount)
      )
    );
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
  const recipient =
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
    if (!TRACKED_DENOMS.some(token => token.denom === denom)) {
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
    const recipientBalance = (
      await TokenBalance.getByFields(
        [
          ["address", "=", recipient],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];

    // Update the token balance for the recipient, if it exists, otherwise create it
    await store.set(
      "TokenBalance",
      `${blockHeight.toString()}-${recipient}-${denom}`,
      new TokenBalance(
        `${blockHeight.toString()}-${recipient}-${denom}`,
        blockHeight,
        recipient,
        denom,
        recipientBalance.balance + BigInt(amount)
      )
    );
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
    const senderBalance = (
      await TokenBalance.getByFields(
        [
          ["address", "=", sender],
          ["denom", "=", denom],
        ],
        { orderBy: "blockHeight", orderDirection: "DESC", limit: 1 }
      )
    )[0];

    // Update the token balance for the sender, if it exists, otherwise create it
    await store.set(
      "TokenBalance",
      `${blockHeight.toString()}-${sender}-${denom}`,
      new TokenBalance(
        `${blockHeight.toString()}-${sender}-${denom}`,
        blockHeight,
        sender,
        denom,
        senderBalance.balance - BigInt(amount)
      )
    );
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
