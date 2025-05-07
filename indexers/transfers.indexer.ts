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
import { kafkaPlugin } from "../lib/kafka_producer";

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
  kafkaBrokers?: string[];
  kafkaTopic?: string;
  kafkaClientId?: string;
  kafkaTenantSchema?: string;
}

export default function (runtimeConfig: ApibaraRuntimeConfig) {

  const {
    indexerId,
    startingBlock,
    streamUrl,
    persistToRedis,
    webhookUrl,
    websocketUrl,
    websocketDelayMs,
    kafkaBrokers,
    kafkaTopic,
    kafkaClientId,
    kafkaTenantSchema,
  } = runtimeConfig as unknown as TransfersConfig;
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

      // Use Kafka if brokers are configured
      ...(kafkaBrokers && kafkaTopic ? [
        kafkaPlugin({
          brokers: kafkaBrokers,
          topic: kafkaTopic,
          clientId: kafkaClientId || `transfers-indexer-${indexerId || 'default'}`,
          // Send data for both regular messages and finalized blocks
          sendOnEveryMessage: true,
          // Transform the data to a more convenient format for Kafka
          transformData: ({ block: { header, events, receipts } }) => {

            // Extract transfers from the block data
            const transfers: Transfer[] = [];
            const blockNumber = BigInt(header.blockNumber).toString()
            const timestamp = header.timestamp.toISOString()
            
            // Use the explicit tenant schema from config, falling back to fixed values
            // This ensures we're always using the correct schema regardless of indexerId
            const tenant_schema = kafkaTenantSchema || 'mainnet';

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
              tenant_schema,
              blockNumber,
              timestamp,
              transfers,
            };
          },
          // Add retry logic
          retry: {
            maxAttempts: 5,
            delayMs: 2000,
          },
        })
      ] : []),
      
      // Fallback to WebSocket if Kafka is not configured
      // ...(websocketUrl ? [
      //   websocketPlugin({
      //     url: websocketUrl,
      //     // Send data for both regular messages and finalized blocks
      //     sendOnEveryMessage: true,
      //     // Add delay before sending data to the WebSocket (if configured)
      //     sendDelayMs: websocketDelayMs,
      //     // Transform the data to a more convenient format for the WebSocket
      //     transformData: ({ block: { header, events, receipts } }) => {

      //       // Extract transfers from the block data
      //       const transfers: Transfer[] = [];
      //       const blockNumber = BigInt(header.blockNumber).toString()
      //       const timestamp = header.timestamp.toISOString()

      //       for (const event of events || []) {
      //         const decoded = decodeEvent({
      //           abi,
      //           event,
      //           eventName: "Transfer",
      //           strict: false,
      //         });

      //         if (decoded) {
      //           const receipt = receipts?.find(
      //             (rx: any) => rx.meta.transactionIndex === decoded.transactionIndex
      //           );

      //           transfers.push({
      //             token: decoded.address,
      //             from: decoded.args.from as string,
      //             to: decoded.args.to as string,
      //             value: BigInt(decoded.args.value as string)?.toString(),
      //             txhash: decoded.transactionHash,
      //             timestamp: timestamp,
      //             block: blockNumber,
      //             status: decoded.transactionStatus,
      //             fee: receipt ? getActualFee(receipt) : "0",
      //           });
      //         }
      //       }

      //       return {
      //         blockNumber,
      //         timestamp,
      //         transfers,
      //       };
      //     },
      //   }),
      // ] : []),
    ],

    async transform({ block: { receipts, events, header } }) {
      // Logger
      const logger = useLogger();
      
      // Log block processing
      const blockNumber = BigInt(header.blockNumber).toString();
      logger.info(`Processing block number: ${blockNumber}`);
      
      // Return a resolved promise (required by the transform function)
      return Promise.resolve();
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