import {
  CosmosEvent,
  CosmosBlock,
  CosmosMessage,
  CosmosTransaction,
} from "@subql/types-cosmos";
import { Claim, DailyClaimSummary, MinterRedeem, MinterSplit } from "../types";
import { logger } from "../logger";

type AirdropClaimMessageType = {
  type: string;
  sender: string;
  contract: string;
  msg: {
    claim: {
      amount: string;
      proof: string[];
    };
  };
};

type MinterSplitMessageType = {
  type: string;
  sender: string;
  contract: string;
  msg: {
    split: {
      auto_stake: boolean;
      maturity: number;
      recipient?: string | null;
    };
  };
};

type MinterRedeemMessageType = {
  type: string;
  sender: string;
  contract: string;
  msg: {
    redeem: {
      recipient?: string | null;
    };
  };
};

/*
export async function handleBlock(block: CosmosBlock): Promise<void> {
  // If you want to index each block in Cosmos (Archway), you could do that here
}

export async function handleTransaction(tx: CosmosTransaction): Promise<void> {
  // If you want to index each transaction in Cosmos (Archway), you could do that here
  const transactionRecord = Transaction.create({
    id: tx.hash,
    blockHeight: BigInt(tx.block.block.header.height),
    timestamp: tx.block.block.header.time,
  });
  await transactionRecord.save();
}
*/

async function checkGetDailyClaim(date: Date): Promise<DailyClaimSummary> {
  // Create the ID from the iso date string (e.g. '2023-03-26')
  // Timestamps are in seconds, need to convert to ms
  const id = date.toISOString().substring(0, 10);
  // Read to see if there is an existing aggregation record
  let dailyClaimSummary = await DailyClaimSummary.get(id);
  if (!dailyClaimSummary) {
    // This is a new day! Create a new aggregation
    dailyClaimSummary = DailyClaimSummary.create({
      id,
      total_claimed: BigInt(0),
    });
  }
  return dailyClaimSummary;
}

export async function handleAirdropClaim(
  msg: CosmosMessage<AirdropClaimMessageType>
): Promise<void> {
  // Example https://www.mintscan.io/neutron/txs/156FE31585BD75E06EE337CEA908C37EA0434CC49943B4860E7AABE2475B6B01?height=1437614
  logger.info(
    `New Airdrop Claim at block ${msg.block.header.height.toString()}`
  );

  // Claim records are created from on chain data
  const airdropClaimRecord = Claim.create({
    id: `${msg.tx.hash}-${msg.idx}`,
    blockHeight: BigInt(msg.block.block.header.height),
    date: new Date(msg.block.header.time.toISOString()),
    transactionHash: msg.tx.hash,
    receiver: msg.msg.decodedMsg.sender,
    amount: BigInt(msg.msg.decodedMsg.msg.claim.amount),
  });

  // We update the daily aggregation
  const dailyClaimSummary = await checkGetDailyClaim(airdropClaimRecord.date);
  dailyClaimSummary.total_claimed += airdropClaimRecord.amount;

  // Save data to the store
  await dailyClaimSummary.save();
  await airdropClaimRecord.save();
}

/*
export async function handleEvent(event: CosmosEvent): Promise<void> {
  const eventRecord = ExecuteEvent.create({
    id: `${event.tx.hash}-${event.msg.idx}-${event.idx}`,
    blockHeight: BigInt(event.block.block.header.height),
    txHash: event.tx.hash,
    contractAddress: event.event.attributes.find(attr => attr.key === '_contract_address').value
  });

  await eventRecord.save();
}
*/

export async function handleMinterSplitMsg(
  msg: CosmosMessage<MinterSplitMessageType>
): Promise<void> {
  logger.info(
    `New Minter Split at block ${msg.block.header.height.toString()}`
  );

  const attrValue = msg.tx.tx.events
    .find((event) => event.type === "wasm-fission/minter/split")
    ?.attributes.find((attr) => attr.key === "mint_amount")?.value;

  // Convert Uint8Array to string if tendermint 34
  const mintAmount =
    attrValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(attrValue)
      : attrValue;

  if (!mintAmount) {
    logger.error(`Mint amount is undefined`);
    return;
  }

  logger.info(`Mint amount: ${mintAmount}`);

  const splitRecord = MinterSplit.create({
    id: `${msg.tx.hash}-${msg.idx}`,
    blockHeight: BigInt(msg.block.block.header.height),
    date: new Date(msg.block.header.time.toISOString()),
    transactionHash: msg.tx.hash,
    mint_amount: BigInt(mintAmount),
    recipient:
      msg.msg.decodedMsg.msg.split.recipient || msg.msg.decodedMsg.sender,
  });
}

export async function handleMinterRedeemMsg(
  msg: CosmosMessage<MinterRedeemMessageType>
): Promise<void> {
  logger.info(
    `New Minter Redeem at block ${msg.block.header.height.toString()}`
  );

  const attrValue = msg.tx.tx.events
    .find((event) => event.type === "wasm-fission/minter/redeem")
    ?.attributes.find((attr) => attr.key === "py_amount")?.value;

  const redeemAmount =
    attrValue instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(attrValue)
      : attrValue;

  if (!redeemAmount) {
    logger.error(`Redeem amount is undefined`);
    return;
  }

  logger.info(`Redeem amount: ${redeemAmount}`);

  const redeemRecord = MinterRedeem.create({
    id: `${msg.tx.hash}-${msg.idx}`,
    blockHeight: BigInt(msg.block.block.header.height),
    date: new Date(msg.block.header.time.toISOString()),
    transactionHash: msg.tx.hash,
    amount: BigInt(redeemAmount),
    sender: msg.msg.decodedMsg.sender,
  });
}
