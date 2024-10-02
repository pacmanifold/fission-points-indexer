import {
  CosmosEvent,
  CosmosBlock,
  CosmosMessage,
  CosmosTransaction,
} from "@subql/types-cosmos";
import {
  Burn,
  Claim,
  DailyClaimSummary,
  Mint,
  MinterRedeem,
  MinterSplit,
  TokenBalance,
  Transfer,
} from "../types";
import { logger } from "../logger";
import { coin, parseCoins } from "@cosmjs/proto-signing";
import { QueryClient } from "@cosmjs/stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
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
    if (!TRACKED_DENOMS.includes(denom)) {
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
    if (!TRACKED_DENOMS.includes(denom)) {
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
    if (!TRACKED_DENOMS.includes(denom)) {
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
