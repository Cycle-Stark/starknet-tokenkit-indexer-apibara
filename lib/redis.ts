import { useIndexerContext } from "@apibara/indexer";
import { defineIndexerPlugin } from "@apibara/indexer/plugins";
import Redis from "ioredis";

/**
 * Configuration options for the Redis plugin.
 * @interface RedisPluginOptions
 */
export interface RedisPluginOptions {
    /**
     * Redis URL - required for connecting to Redis server
     */
    url: string | null | undefined;
    /**
     * Indexer ID - required for creating unique Redis keys
     */
    indexerId: string | null | undefined;
    /**
     * Optional key prefix for Redis keys
     * @default 'apibara'
     */
    keyPrefix?: string;
}

/**
 * Interface for the Redis plugin instance stored in context.
 * This provides methods for persisting and retrieving block numbers.
 * @interface RedisPlugin
 */
export interface RedisPlugin {
    url: string;
    indexerId: string;
    getLastProcessedBlock: () => Promise<number | null>;
    persistBlock: (blockNumber: string) => Promise<void>;
}

/**
 * Plugin that persists block data to Redis.
 * Maintains a static Redis client to ensure connection persistence across messages.
 * @interface RedisPluginFunction
 */
interface RedisPluginFunction {
    (options: RedisPluginOptions): any;
    redisClient?: Redis | null;
}

/**
 * Creates a Redis persistence plugin for Apibara indexers.
 * 
 * This plugin allows storing the last processed block number in Redis,
 * enabling the indexer to resume from where it left off after a restart.
 * 
 * @example
 * ```typescript
 * redisPlugin({
 *   url: 'redis://localhost:6379',
 *   indexerId: 'my-indexer',
 *   keyPrefix: 'custom-prefix'
 * })
 * ```
 * 
 * @param {RedisPluginOptions} options - Configuration options for the Redis plugin
 * @returns {Function} An Apibara indexer plugin that persists block numbers to Redis
 */
export const redisPlugin: RedisPluginFunction = function(options: RedisPluginOptions) {
    const {
        url,
        indexerId,
    } = options;

    // Return early if required options are missing
    if (!url) {
        console.error('Redis URL not provided, Redis persistence disabled');
        throw new Error('Redis URL is required for Redis persistence');
    }

    if (!indexerId) {
        console.error('Indexer ID not provided, Redis persistence disabled');
        throw new Error('Indexer ID is required for Redis persistence');
    }

    // Use a static Redis client to persist across messages
    if (!redisPlugin.redisClient) {
        redisPlugin.redisClient = null;
    }
    const keyPrefix = options.keyPrefix || 'apibara';
    const redisKey = `${keyPrefix}:${indexerId}:last_block`;

    /**
     * Define the indexer plugin that will handle block persistence.
     */
    return defineIndexerPlugin((indexer) => {
        /**
         * Persist a block number to Redis.
         * This function stores the last processed block number in Redis,
         * allowing the indexer to resume from this block after a restart.
         * 
         * @param {string} blockNumber - The block number to persist
         * @returns {Promise<void>}
         */
        async function persistBlock(blockNumber: string): Promise<void> {
            if (!redisPlugin.redisClient) {
                console.error('Redis client not initialized, cannot persist block');
                return;
            }
            
            try {
                await redisPlugin.redisClient.set(redisKey, blockNumber);
                // Only log when debugging is needed
                // console.log(`Persisted block ${blockNumber} to Redis`);
            } catch (error) {
                console.error(`Failed to persist block ${blockNumber} to Redis:`, error);
                // Don't throw here to avoid stopping indexer on persistence errors
            }
        }
        
        /**
         * Get the last processed block from Redis.
         * This function retrieves the last block number that was successfully processed
         * and persisted to Redis, allowing the indexer to resume from this point.
         * 
         * @returns {Promise<number|null>} The last processed block number or null if not found
         */
        async function getLastProcessedBlock(): Promise<number | null> {
            if (!redisPlugin.redisClient) {
                console.error('Redis client not initialized, cannot get last processed block');
                return null;
            }
            
            try {
                const lastBlock = await redisPlugin.redisClient.get(redisKey);
                if (lastBlock) {
                    const blockNum = Number(lastBlock);
                    return blockNum;
                }
            } catch (error) {
                console.error('Failed to get last processed block from Redis:', error);
                // Don't throw here to allow starting from default block if Redis fails
                return null;
            }
            
            return null;
        }

        /**
         * Initialize the Redis client and register the plugin in the context.
         * This hook runs before the indexer starts and sets up the Redis connection,
         * retrieves the last processed block, and configures the indexer to start from that block.
         */
        indexer.hooks.hook("run:before", async () => {
            try {
                /**
                 * Initialize Redis client with retry strategy and error handling.
                 * Creates a persistent Redis client that will be reused across messages.
                 */
                try {
                    const redisOptions: any = {
                        retryStrategy: (times: number) => {
                            const delay = Math.min(times * 50, 2000);
                            return delay;
                        },
                        maxRetriesPerRequest: 3,
                        enableReadyCheck: true,
                        reconnectOnError: (err: Error) => {
                            console.error('Redis connection error:', err.message);
                            return true; // Always reconnect on error
                        }
                    };
                    
                    if (url.startsWith('redis://')) {
                        // Use the URL directly for Redis connection string format
                        redisPlugin.redisClient = new Redis(url, redisOptions);
                        // Connection will be established
                    } else if (url.startsWith('http://') || url.startsWith('https://')) {
                        // Extract host and port from http URL
                        const urlObj = new URL(url);
                        redisPlugin.redisClient = new Redis({
                            ...redisOptions,
                            host: urlObj.hostname,
                            port: parseInt(urlObj.port || '6379', 10)
                        });
                        // Connection will be established
                    } else {
                        // Try to connect to localhost with the default port
                        redisPlugin.redisClient = new Redis({
                            ...redisOptions,
                            host: 'localhost',
                            port: 6379
                        });
                        // Connection will be established
                    }
                    
                    // Add event listeners for better debugging
                    // Only keep error event handler for critical errors
                    redisPlugin.redisClient.on('error', (err: Error) => {
                        console.error('Redis client error:', err.message);
                        // Don't throw error here to allow reconnection
                    });
                } catch (error) {
                    console.error('Error creating Redis client:', error);
                    throw new Error(`Failed to create Redis client: ${error}`);
                }
                
                /**
                 * Verify the Redis connection is working properly.
                 * Sends a PING command to ensure the connection is established.
                 */
                if (redisPlugin.redisClient) {
                    try {
                        await redisPlugin.redisClient.ping();
                        // Connection verified
                    } catch (error) {
                        console.error('Failed to ping Redis server:', error);
                        throw new Error(`Failed to ping Redis server: ${error}`);
                    }
                } else {
                    console.error('Redis client not initialized');
                    throw new Error('Redis client not initialized');
                }
                
                /**
                 * Retrieve the last processed block and configure the indexer.
                 * Sets the starting block to the last processed block + 1 if available.
                 */
                const lastBlock = await getLastProcessedBlock();
                if (lastBlock !== null) {
                    // Only log important state changes
                    console.log(`Resuming from last processed block: ${lastBlock}`);
                    indexer.options.startingBlock = BigInt(lastBlock + 1);
                } else {
                    // Starting from the configured block
                }

                /**
                 * Store the Redis plugin in the indexer context.
                 * Makes the plugin accessible to other parts of the indexer.
                 */
                const ctx = useIndexerContext();
                ctx.redisPlugin = {
                    url,
                    indexerId,
                    getLastProcessedBlock,
                    persistBlock,
                };
                
                // Redis persistence is now enabled
            } catch (error) {
                console.error('Failed to initialize Redis plugin:', error);
                // Important: Don't leave redisClient in a half-initialized state
                redisPlugin.redisClient = null;
            }
        });

        // Register with the message hook to process each incoming message
        indexer.hooks.hook("message", async ({ message }) => {
            if (message._tag === "data" && message.data) {
                const data: any = message.data.data[0];
                if (data?.header?.blockNumber) {
                    const blockNumber = BigInt(data.header.blockNumber).toString();
                    await persistBlock(blockNumber);
                }
            }
        });
        
        // Clean up when indexer stops completely, not after each message
        // indexer.hooks.hook("run:after", async () => {
        //     if (redisPlugin.redisClient) {
        //         await redisPlugin.redisClient.quit();
        //         console.log('Redis connection closed');
        //         redisPlugin.redisClient = null;
        //     }
        // });
    });
}

/**
 * Hook to access the redis plugin from the indexer context
 * @returns The redis plugin instance
 */
export function useRedis(): RedisPlugin {
    const ctx = useIndexerContext();

    if (!ctx?.redisPlugin) {
        throw new Error("Redis plugin is not available in context");
    }

    return ctx.redisPlugin as RedisPlugin;
}