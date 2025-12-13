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
  feeUnit: string;
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

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "accepted",
    startingBlock: BigInt(startingBlock),
    clientOptions: {
      channelOptions: {
        "grpc.max_send_message_length": 100_000_000,
        "grpc.max_receive_message_length": 100_000_000
      }
    },
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

      // Webhook plugin - PRIMARY data delivery method (replacing Kafka)
      ...(webhookUrl ? [
        webhookPlugin<WebhookTransformedData>({
          url: webhookUrl,
          // Send data for both regular messages and finalized blocks
          sendOnEveryMessage: true,
          // Transform the data to a more convenient format for the webhook
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
                const args: any = decoded.args;
                transfers.push({
                  token: decoded.address,
                  from: args.from as string,
                  to: args.to as string,
                  value: BigInt(args.value as string)?.toString(),
                  txhash: decoded.transactionHash,
                  timestamp: timestamp,
                  block: blockNumber,
                  status: decoded.transactionStatus,
                  fee: receipt ? getActualFee(receipt) : "0",
                  feeUnit: receipt?.meta.actualFee.unit ?? "fri"
                });
              }
            }

            // Return typed data structure
            return {
              blockNumber: blockNumber,
              timestamp: timestamp,
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

      // Kafka plugin - DISABLED (replaced by webhook)
      // Uncomment if you need Kafka for high-throughput scenarios
      // ...(kafkaBrokers && kafkaTopic ? [
      //   kafkaPlugin({
      //     brokers: kafkaBrokers,
      //     topic: kafkaTopic,
      //     clientId: kafkaClientId || `transfers-indexer-${indexerId || 'default'}`,
      //     sendOnEveryMessage: true,
      //     transformData: ({ block: { header, events, receipts } }) => {
      //       const transfers: Transfer[] = [];
      //       const blockNumber = BigInt(header.blockNumber).toString()
      //       const timestamp = header.timestamp.toISOString()
      //       const tenant_schema = kafkaTenantSchema || 'mainnet';
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
      //           const args: any = decoded.args;
      //           transfers.push({
      //             token: decoded.address,
      //             from: args.from as string,
      //             to: args.to as string,
      //             value: BigInt(args.value as string)?.toString(),
      //             txhash: decoded.transactionHash,
      //             timestamp: timestamp,
      //             block: blockNumber,
      //             status: decoded.transactionStatus,
      //             fee: receipt ? getActualFee(receipt) : "0",
      //           });
      //         }
      //       }
      //       return {
      //         tenant_schema,
      //         blockNumber,
      //         timestamp,
      //         transfers,
      //       };
      //     },
      //     retry: {
      //       maxAttempts: 5,
      //       delayMs: 2000,
      //     },
      //     chunkSize: 500,
      //   })
      // ] : []),
    ],

    async transform({ block: { receipts, events, header } }) {
      // Logger
      const logger = useLogger();

      // Log block processing
      const blockNumber = BigInt(header.blockNumber).toString();
      logger.info(`Processing block number: ${blockNumber}`);
      // const data = transformData({ block: { header, events, receipts } });
      // logger.info(`Processed ${data.transfers.length} transfer events`);
      // logger.info(`Transfer: ${JSON.stringify(data.transfers[0], null, 4)}`);
      // sleep for 20 seconds here
      // await new Promise((resolve) => setTimeout(resolve, 20000));
      // Return a resolved promise (required by the transform function)
      return Promise.resolve();
    },
  });
}

// function transformData({ block: { header, events, receipts } }: any) {

//   // Extract transfers from the block data
//   const transfers: Transfer[] = [];
//   const blockNumber = BigInt(header.blockNumber).toString()
//   const timestamp = header.timestamp.toISOString()

//   for (const event of events || []) {
//     const decoded = decodeEvent({
//       abi,
//       event,
//       eventName: "Transfer",
//       strict: false,
//     });

//     if (decoded) {
//       const receipt = receipts?.find(
//         (rx: any) => rx.meta.transactionIndex === decoded.transactionIndex
//       );

//       transfers.push({
//         token: decoded.address,
//         from: decoded.args.from as string,
//         to: decoded.args.to as string,
//         value: BigInt(decoded.args.value as string)?.toString(),
//         txhash: decoded.transactionHash,
//         timestamp: timestamp,
//         block: blockNumber,
//         status: decoded.transactionStatus,
//         fee: receipt ? getActualFee(receipt) : "0",
//       });
//     }
//   }

//   return {
//     blockNumber,
//     timestamp,
//     transfers,
//   };
// }


function getActualFee(receipt: TransactionReceipt): string {
  try {
    // FILL ME: decide what to do if fee is ETH.
    return BigInt(receipt.meta.actualFee.amount).toString();
  } catch {
    return "0";
  }
}