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
import { redisPlugin } from "../lib/redis";
import { websocketPlugin } from "lib/websocket";

const abi = [
    {
        kind: "struct",
        name: "TokenCreated",
        type: "event",
        members: [
            {
                kind: "key",
                name: "id",
                type: "core::integer::u256",
            },
        ],
    },
    {
        kind: "struct",
        name: "TokenUpgraded",
        type: "event",
        members: [
            {
                kind: "key",
                name: "id",
                type: "core::integer::u256",
            },
        ],
    },
] satisfies Abi;

/**
 * Represents a token event
 */
export interface TokenEvent {
    token_id: number;
    event_type: string;
    txhash: string;
    timestamp: string;
    block: string;
    status: string;
}

/**
 * Represents the transformed data structure sent to the webhook/websocket
 */
export interface WebhookTransformedData {
    blockNumber: string;
    timestamp: string;
    tokens: TokenEvent[];
}

// Extend the runtime config type to include webhookUrl and persistToRedis
interface TokenkitConfig {
    startingBlock: number;
    streamUrl: string;
    contractAddress: string;
    webhookUrl?: string;
    websocketUrl?: string;
    persistToRedis?: string;
    indexerId?: string;
}


/**
 * Remove leading zeros from a hex string
 */
function removeLeadingZeros(hexString: string): string {
    // Check if the input starts with '0x' and remove leading zeros after '0x'
    const normalizedString = hexString.toLowerCase().replace(/^0x0+/, "0x");
    return normalizedString;
}

export default function (runtimeConfig: ApibaraRuntimeConfig) {

    const {
        startingBlock,
        streamUrl,
        contractAddress,
        webhookUrl,
        websocketUrl,
        persistToRedis,
        indexerId
    } = runtimeConfig as unknown as TokenkitConfig;
    console.log("Starting block: ", startingBlock);
    return defineIndexer(StarknetStream)({
        streamUrl,
        finality: "accepted",
        startingBlock: BigInt(startingBlock ?? 0),
        filter: {
            events: [
                {
                    address: contractAddress as `0x${string}`,
                    keys: [
                        // getSelector("TokenCreated"),
                        // getSelector("TokenUpgraded"),
                    ],
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

            // Add webhook plugin if URL is provided
            //   webhookUrl && webhookPlugin<WebhookTransformedData>({
            //     url: webhookUrl,
            //     // Send data for both regular messages and finalized blocks
            //     sendOnEveryMessage: true,
            //     // Transform the data to a more convenient format for the webhook
            //     transformData: ({block: {header, events, receipts}}) => {
            //       return transformTokenEvents(header, events, receipts);
            //     },
            //     // Add retry logic
            //     retry: {
            //       maxAttempts: 5,
            //       delayMs: 2000,
            //     },
            //   }),

            // Add websocket plugin if URL is provided
            websocketUrl && websocketPlugin({
                url: websocketUrl,
                // Send data for both regular messages and finalized blocks
                sendOnEveryMessage: true,
                // Transform the data to a more convenient format for the WebSocket
                transformData: ({ block: { header, events, receipts } }) => {
                    return transformTokenEvents(header, events, receipts);
                },
            }),

        ].filter(Boolean),

        transform({ block: { receipts, events, header } }) {

            const logger = useLogger();
            logger.info(`Processing block ${header.blockNumber}`);
            // Just log the data and return void to match the expected return type
            const data = transformTokenEvents(header, events, receipts);
            logger.info(`Processed ${data.tokens.length} token events`);
            return Promise.resolve();
        },
    });
}

/**
 * Transform token events from block data
 */
function transformTokenEvents(header: any, events: any, receipts?: any) {
    // Extract token events from the block data
    const tokens: TokenEvent[] = [];
    const blockNumber = BigInt(header.blockNumber).toString();
    const timestamp = header.timestamp.toISOString();

    const tokenCreatedSelector = getSelector("TokenCreated");
    const tokenUpgradedSelector = getSelector("TokenUpgraded");

    for (const event of events ? [...events] : []) {
        let eventType = "";
        let decoded;

        console.log("Event: ", event)

        // Check if it's a TokenCreated event
        if (removeLeadingZeros(event.keys?.[0]) === removeLeadingZeros(tokenCreatedSelector)) {
            decoded = decodeEvent({
                abi,
                event,
                eventName: "TokenCreated",
                strict: false,
            });
            eventType = "TokenCreated";
        }
        // Check if it's a TokenUpgraded event
        else if (removeLeadingZeros(event.keys?.[0]) === removeLeadingZeros(tokenUpgradedSelector)) {
            decoded = decodeEvent({
                abi,
                event,
                eventName: "TokenUpgraded",
                strict: false,
            });
            eventType = "TokenUpgraded";
        }

        if (decoded) {
            // const receipt = receipts?.find(
            //     (rx: any) => rx.meta.transactionIndex === decoded.transactionIndex
            // );

            // Convert the tokenId from Uint256 to a number
            const tokenId = BigInt(decoded.args.id as string).toString();

            tokens.push({
                token_id: Number(tokenId),
                event_type: eventType,
                txhash: decoded.transactionHash,
                timestamp,
                block: blockNumber,
                status: decoded.transactionStatus,
            });
        }
    }

    // Return typed data structure
    return {
        blockNumber,
        timestamp,
        tokens,
    };
}

/**
 * Get the actual fee from a transaction receipt
 */
function getActualFee(receipt: TransactionReceipt): string {
    if (!receipt.receipt) {
        return "0";
    }
    // Access actualFee safely with type checking
    const actualFee = receipt.meta.actualFee as any;
    return BigInt(actualFee || 0).toString();
}