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

// ERC20/ERC721 Transfer event ABI
// NOTE: ERC20 Transfer(from, to, value) and ERC721 Transfer(from, to, tokenId)
// have the SAME event selector — they are indistinguishable at the event level.
// The backend handles this ambiguity via the chicken-and-egg pattern:
// always store value in token_id, default to ERC20 logic, and recompute
// balances when the token type is later determined.
const transferAbi = [
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

// ERC1155 TransferSingle event ABI
// TransferSingle has a DISTINCT selector from Transfer — no ambiguity.
const transferSingleAbi = [
  {
    kind: "struct",
    name: "TransferSingle",
    type: "event",
    members: [
      {
        kind: "data",
        name: "operator",
        type: "core::starknet::contract_address::ContractAddress",
      },
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
        name: "id",
        type: "core::integer::u256",
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
 * Represents a token transfer event.
 *
 * eventType distinguishes event sources:
 * - "Transfer": standard ERC20/ERC721 Transfer(from, to, value)
 *   value is amount for ERC20 or tokenId for ERC721 (ambiguous — backend resolves)
 * - "TransferSingle": ERC1155 TransferSingle(operator, from, to, id, value)
 *   tokenId is the NFT/SFT id, value is the amount
 */
export interface Transfer {
  token: string;
  from: string;
  to: string;
  value: string;
  tokenId?: string;       // ERC1155: the token id. For Transfer events, not set.
  eventType: string;      // "Transfer" | "TransferSingle"
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
      events: [
        // ERC20/ERC721 Transfer(from, to, value)
        {
          keys: [getSelector("Transfer")],
          includeReceipt: true,
          includeTransaction: false,
          transactionStatus: "all",
        },
        // ERC1155 TransferSingle(operator, from, to, id, value)
        {
          keys: [getSelector("TransferSingle")],
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
              // Try decoding as standard Transfer (ERC20/ERC721)
              const decodedTransfer = decodeEvent({
                abi: transferAbi,
                event,
                eventName: "Transfer",
                strict: false,
              });

              if (decodedTransfer) {
                const receipt = receipts?.find(
                  (rx: any) => rx.meta.transactionIndex === decodedTransfer.transactionIndex
                );
                const args: any = decodedTransfer.args;
                transfers.push({
                  token: decodedTransfer.address,
                  from: args.from as string,
                  to: args.to as string,
                  value: BigInt(args.value as string)?.toString(),
                  eventType: "Transfer",
                  txhash: decodedTransfer.transactionHash,
                  timestamp: timestamp,
                  block: blockNumber,
                  status: decodedTransfer.transactionStatus,
                  fee: receipt ? getActualFee(receipt) : "0",
                  feeUnit: receipt?.meta.actualFee.unit ?? "fri"
                });
                continue;
              }

              // Try decoding as ERC1155 TransferSingle
              const decodedSingle = decodeEvent({
                abi: transferSingleAbi,
                event,
                eventName: "TransferSingle",
                strict: false,
              });

              if (decodedSingle) {
                const receipt = receipts?.find(
                  (rx: any) => rx.meta.transactionIndex === decodedSingle.transactionIndex
                );
                const args: any = decodedSingle.args;
                transfers.push({
                  token: decodedSingle.address,
                  from: args.from as string,
                  to: args.to as string,
                  value: BigInt(args.value as string)?.toString(),
                  tokenId: BigInt(args.id as string)?.toString(),
                  eventType: "TransferSingle",
                  txhash: decodedSingle.transactionHash,
                  timestamp: timestamp,
                  block: blockNumber,
                  status: decodedSingle.transactionStatus,
                  fee: receipt ? getActualFee(receipt) : "0",
                  feeUnit: receipt?.meta.actualFee.unit ?? "fri"
                });
                continue;
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