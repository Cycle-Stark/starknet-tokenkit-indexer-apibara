import { defineIndexer } from "@apibara/indexer";
import {
  Abi,
  decodeEvent,
  getSelector,
  TransactionReceipt,
} from "@apibara/starknet";
import { useLogger } from "@apibara/indexer/plugins";
import { StarknetStream } from "@apibara/starknet";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { webhookPlugin } from "../lib/webhook";
import { redisPlugin } from "../lib/redis";
import { websocketPlugin } from "lib/websocket";

const abi = [
  {
    kind: "struct",
    name: "Transfer",
    type: "event",
    members: [
      {
        kind: "data",
        name: "from",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        kind: "data",
        name: "to",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        kind: "data",
        name: "value",
        type: "core::integer::u256",
      },
    ],
  },
] satisfies Abi;

/**
 * Represents a token transfer event
 */
export interface Transfer {
  token: string;
  from: string;
  to: string;
  value: string;
  txhash: string;
  timestamp: string;
  block: string;
  status: string;
  fee: string;
}

/**
 * Represents the transformed data structure sent to the webhook
 */
export interface WebhookTransformedData {
  blockNumber: string;
  timestamp: string;
  transfers: Transfer[];
}

// Extend the runtime config type to include webhookUrl and persistToRedis
interface TransfersConfig {
  startingBlock: number;
  streamUrl: string;
  webhookUrl?: string;
  websocketUrl?: string;
  websocketDelayMs?: number;
  persistToRedis?: string;
  indexerId?: string;
}

export default function (runtimeConfig: ApibaraRuntimeConfig) {

  const { startingBlock, streamUrl, webhookUrl, websocketUrl, websocketDelayMs, persistToRedis, indexerId } = runtimeConfig as unknown as TransfersConfig;
  console.log("Starting block: ", startingBlock);
  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "accepted",
    startingBlock: BigInt(startingBlock),
    filter: {
      // FILL ME: contract address
      events: [
        {
          keys: [getSelector("Transfer")],
          includeReceipt: true,
          includeTransaction: false,
          transactionStatus: "all",
        },
      ],
    },
    plugins: [
      // Redis persistence plugin if enabled
      // @ts-ignore - Type compatibility issues with generic plugins
      redisPlugin({
        url: persistToRedis,
        indexerId: indexerId,
      }),

      // Add webhook plugin to send transfer events to a webhook endpoint
      // webhookPlugin<WebhookTransformedData>({
      //   url: webhookUrl!!,
      //   // Send data for both regular messages and finalized blocks for debugging
      //   sendOnEveryMessage: true,
      //   // Transform the data to a more convenient format for the webhook
      //   transformData: ({block: {header, events, receipts}}) => {

      //     // Extract transfers from the block data
      //     const transfers: Transfer[] = [];
      //     const blockNumber = BigInt(header.blockNumber).toString()
      //     const timestamp = header.timestamp.toISOString()

      //     for (const event of events || []) {
      //       const decoded = decodeEvent({
      //         abi,
      //         event,
      //         eventName: "Transfer",
      //         strict: false,
      //       });

      //       if (decoded) {
      //         const receipt = receipts?.find(
      //           (rx: any) => rx.meta.transactionIndex === decoded.transactionIndex
      //         );

      //         transfers.push({
      //           token: decoded.address,
      //           from: decoded.args.from as string,
      //           to: decoded.args.to as string,
      //           value: BigInt(decoded.args.value as string)?.toString(),
      //           txhash: decoded.transactionHash,
      //           timestamp: timestamp,
      //           block: blockNumber,
      //           status: decoded.transactionStatus,
      //           fee: receipt ? getActualFee(receipt) : "0",
      //         });
      //       }
      //     }

      //     // Return typed data structure
      //     return {
      //       blockNumber: blockNumber,
      //       timestamp: timestamp,
      //       transfers,
      //     };

      //   },
      //   // Add retry logic
      //   retry: {
      //     maxAttempts: 5,
      //     delayMs: 2000,
      //   },
      // }),

      websocketPlugin({
        url: websocketUrl!!,
        // Send data for both regular messages and finalized blocks
        sendOnEveryMessage: true,
        // Add delay before sending data to the WebSocket (if configured)
        sendDelayMs: websocketDelayMs,
        // Transform the data to a more convenient format for the WebSocket
        transformData: ({ block: { header, events, receipts } }) => {

          // Extract transfers from the block data
          const transfers: Transfer[] = [];
          const blockNumber = BigInt(header.blockNumber).toString()
          const timestamp = header.timestamp.toISOString()

          for (const event of events || []) {
            const decoded = decodeEvent({
              abi,
              event,
              eventName: "Transfer",
              strict: false,
            });

            if (decoded) {
              const receipt = receipts?.find(
                (rx: any) => rx.meta.transactionIndex === decoded.transactionIndex
              );

              transfers.push({
                token: decoded.address,
                from: decoded.args.from as string,
                to: decoded.args.to as string,
                value: BigInt(decoded.args.value as string)?.toString(),
                txhash: decoded.transactionHash,
                timestamp: timestamp,
                block: blockNumber,
                status: decoded.transactionStatus,
                fee: receipt ? getActualFee(receipt) : "0",
              });
            }
          }

          return {
            blockNumber,
            timestamp,
            transfers,
          };
        },
      }),
    ],

    async transform({ block: { receipts, events, header } }) {

      // Logger
      const logger = useLogger()
      // Get the webhook plugin from context

      const blockNumber = BigInt(header.blockNumber).toString()
      logger.info(`Processing block number: ${blockNumber}`)

    },
  });
}

function getActualFee(receipt: TransactionReceipt): string {
  try {
    // FILL ME: decide what to do if fee is ETH.
    return BigInt(receipt.meta.actualFee.amount).toString();
  } catch {
    return "0";
  }
}