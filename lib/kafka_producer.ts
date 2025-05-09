import { useIndexerContext } from "@apibara/indexer";
import { defineIndexerPlugin } from "@apibara/indexer/plugins";
import { Cursor, DataFinality } from "@apibara/protocol";
import { Block } from "@apibara/starknet";
import { Kafka, Producer, ProducerRecord } from 'kafkajs';



/**
 * Configuration options for the Kafka plugin.
 * @interface KafkaPluginOptions
 * @template T The type of data that will be returned by the transform function
 */
export interface KafkaPluginOptions<T = any> {
    /**
     * The Kafka brokers to connect to
     */
    brokers: string[];

    /**
     * The Kafka topic to send data to
     */
    topic: string;

    /**
     * The client ID to use for Kafka
     */
    clientId?: string;

    /**
     * Optional function to transform the data before sending it to Kafka
     * @template T The type of data that will be returned by the transform function
     */
    transformData?: (args: {
        block: Block;
        cursor?: Cursor | undefined;
        endCursor?: Cursor | undefined;
        finality: DataFinality;
        context: any;
    }) => T;

    /**
     * Whether to send data on every message or only on finalized blocks
     * @default false - only send on finalized blocks
     */
    sendOnEveryMessage?: boolean;

    /**
     * Optional retry configuration
     */
    retry?: {
        /**
         * Maximum number of retry attempts
         * @default 3
         */
        maxAttempts?: number;

        /**
         * Delay between retry attempts in milliseconds
         * @default 1000
         */
        delayMs?: number;
    };
    
    /**
     * Maximum number of transfers to include in a single Kafka message
     * Messages with more transfers than this will be split into multiple chunks
     * @default 200
     */
    chunkSize?: number;
}

/**
 * Interface for the Kafka plugin instance stored in context.
 * This provides methods for sending data to a Kafka topic.
 * @interface KafkaPlugin
 * @template T The type of data that will be returned by the transform function
 */
export interface KafkaPlugin<T = any> {
    /**
     * The Kafka topic to send data to
     */
    topic: string;

    /**
     * Function to transform data before sending it to Kafka
     */
    transformData: (args: {
        block: Block;
        cursor?: Cursor | undefined;
        endCursor?: Cursor | undefined;
        finality: DataFinality;
        context: any;
    }) => T;

    /**
     * Send data to the Kafka topic
     * @param data The data to send to Kafka
     * @returns A promise that resolves with the result of the Kafka send operation
     */
    sendData: (data: T) => Promise<{ success: boolean; error?: string; }>;
}

/**
 * Plugin that manages Kafka connections and persistence.
 * Maintains a static Kafka client to ensure connection persistence across messages.
 * @interface KafkaPluginFunction
 */
interface KafkaPluginFunction {
    (options: KafkaPluginOptions): any;
    kafkaProducer?: Producer | null;
    lastProcessedBlock?: number | null;
}

/**
 * Creates a Kafka plugin for Apibara indexers.
 * 
 * This plugin allows connecting to Kafka and sending data whenever new blocks are processed.
 * It supports retry logic, data transformation, and persistence of the last processed block.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * kafkaPlugin({
 *   brokers: ['localhost:9092'],
 *   topic: 'tokenkit-mainnet',
 *   clientId: 'transfers-indexer',
 *   sendOnEveryMessage: true,
 *   retry: { maxAttempts: 5, delayMs: 2000 }
 * })
 * 
 * // With type-safe transform function
 * interface TransferData {
 *   blockNumber: string;
 *   timestamp: string;
 *   transfers: Array<{token: string, from: string, to: string, value: string}>
 * }
 * 
 * kafkaPlugin<TransferData>({
 *   brokers: ['localhost:9092'],
 *   topic: 'tokenkit-mainnet',
 *   transformData: ({block}) => ({
 *     blockNumber: block.header.blockNumber.toString(),
 *     timestamp: block.header.timestamp.toISOString(),
 *     transfers: []
 *   })
 * })
 * ```
 * 
 * @template T The type of data that will be returned by the transform function
 * @param {KafkaPluginOptions<T>} options - Configuration options for the Kafka plugin
 * @returns {Function} An Apibara indexer plugin that connects to Kafka
 */
export const kafkaPlugin: KafkaPluginFunction = function <T = any>(options: KafkaPluginOptions<T>) {
    const {
        brokers,
        topic,
        clientId = 'apibara-indexer',
        transformData = (data) => data,
        sendOnEveryMessage = false,
        retry = { maxAttempts: 3, delayMs: 1000 },
        chunkSize = 200,
    } = options;

    const maxAttempts = retry.maxAttempts ?? 3;
    const delayMs = retry.delayMs ?? 1000;

    // Use a static Kafka producer to persist across messages
    if (!kafkaPlugin.kafkaProducer) {
        kafkaPlugin.kafkaProducer = null;
    }

    // Initialize last processed block
    if (kafkaPlugin.lastProcessedBlock === undefined) {
        kafkaPlugin.lastProcessedBlock = null;
    }

    return defineIndexerPlugin((indexer) => {
        /**
         * Connect to Kafka and create a producer.
         * This function creates a new Kafka producer if one doesn't exist.
         * 
         * @returns {Promise<boolean>} True if the producer was created successfully, false otherwise
         */
        async function connectToKafka(): Promise<boolean> {
            // If producer already exists and is connected, return true
            if (kafkaPlugin.kafkaProducer) {
                return true;
            }

            try {
                console.log(`Connecting to Kafka brokers: ${brokers.join(', ')}`);
                
                // Create Kafka client
                const kafka = new Kafka({
                    clientId,
                    brokers,
                    retry: {
                        initialRetryTime: 100,
                        retries: 8
                    }
                });
                
                // Create producer
                const producer = kafka.producer();
                
                // Connect to Kafka
                await producer.connect();
                console.log('Connected to Kafka');
                
                // Store the producer
                kafkaPlugin.kafkaProducer = producer;
                
                return true;
            } catch (error) {
                console.error(`Failed to connect to Kafka: ${error}`);
                return false;
            }
        }

        /**
         * Send data to Kafka with retry logic.
         * This function sends data to the Kafka topic and retries if it fails.
         * 
         * @param {any} data - The data to send to Kafka
         * @returns {Promise<boolean>} True if the data was sent successfully, false otherwise
         */
        async function sendToKafka(data: any): Promise<{ success: boolean; error?: string }> {
            // Connect to Kafka if not already connected
            const isConnected = await connectToKafka();
            if (!isConnected) {
                return { success: false, error: 'Failed to connect to Kafka' };
            }

            // Get the producer
            const producer = kafkaPlugin.kafkaProducer;
            if (!producer) {
                return { success: false, error: 'Kafka producer not available' };
            }

            // Extract block number for message key
            let blockNumber = '';
            if (data && typeof data === 'object' && 'blockNumber' in data) {
                blockNumber = String(data.blockNumber);
            }

            // Check if we need to chunk the data (if it contains transfers array)
            if (data && typeof data === 'object' && 'transfers' in data && Array.isArray(data.transfers) && data.transfers.length > chunkSize) {
                console.log(`Chunking ${data.transfers.length} transfers into chunks of ${chunkSize}`);
                
                // Create chunks of transfers
                const transferChunks = [];
                for (let i = 0; i < data.transfers.length; i += chunkSize) {
                    transferChunks.push(data.transfers.slice(i, i + chunkSize));
                }
                
                // Send each chunk as a separate message
                let allSuccessful = true;
                let lastError = '';
                
                for (let i = 0; i < transferChunks.length; i++) {
                    // Create a new data object with the chunk of transfers
                    const chunkData = {
                        ...data,
                        transfers: transferChunks[i],
                        chunkInfo: {
                            chunkIndex: i,
                            totalChunks: transferChunks.length,
                            originalCount: data.transfers.length
                        }
                    };
                    
                    // Create a unique key for each chunk by combining block number and chunk index
                    const chunkKey = blockNumber ? `${blockNumber}-chunk-${i}` : undefined;
                    
                    // Prepare the message for this chunk
                    const message: ProducerRecord = {
                        topic,
                        messages: [
                            {
                                key: chunkKey,
                                value: JSON.stringify(chunkData),
                                headers: {
                                    'content-type': 'application/json',
                                    'source': 'apibara-indexer',
                                    'chunk-index': String(i),
                                    'total-chunks': String(transferChunks.length),
                                    'original-block': blockNumber || ''
                                }
                            }
                        ]
                    };
                    
                    // Try to send the chunk with retries
                    let chunkSuccess = false;
                    
                    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            await producer.send(message);
                            console.log(`Successfully sent chunk ${i+1}/${transferChunks.length} to Kafka topic ${topic}`);
                            chunkSuccess = true;
                            break;
                        } catch (error) {
                            console.error(`Attempt ${attempt}/${maxAttempts} failed to send chunk ${i+1}/${transferChunks.length} to Kafka: ${error}`);
                            
                            // If this is the last attempt, record the error
                            if (attempt === maxAttempts) {
                                allSuccessful = false;
                                lastError = String(error);
                            } else {
                                // Wait before retrying
                                await new Promise(resolve => setTimeout(resolve, delayMs));
                            }
                        }
                    }
                    
                    // If we couldn't send this chunk after all retries, consider stopping
                    if (!chunkSuccess) {
                        console.error(`Failed to send chunk ${i+1}/${transferChunks.length} after ${maxAttempts} attempts`);
                    }
                }
                
                // Update last processed block if available
                if (blockNumber) {
                    kafkaPlugin.lastProcessedBlock = parseInt(blockNumber, 10);
                }
                
                return allSuccessful 
                    ? { success: true } 
                    : { success: false, error: `Failed to send some chunks: ${lastError}` };
            }
            
            // For data without transfers or small number of transfers, send as a single message
            // Prepare the message
            const message: ProducerRecord = {
                topic,
                messages: [
                    {
                        key: blockNumber ? blockNumber : undefined,
                        value: JSON.stringify(data),
                        headers: {
                            'content-type': 'application/json',
                            'source': 'apibara-indexer'
                        }
                    }
                ]
            };

            // Try to send the message with retries
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await producer.send(message);
                    console.log(`Successfully sent message to Kafka topic ${topic}`);
                    
                    // Update last processed block if available
                    if (blockNumber) {
                        kafkaPlugin.lastProcessedBlock = parseInt(blockNumber, 10);
                    }
                    
                    return { success: true };
                } catch (error) {
                    console.error(`Attempt ${attempt}/${maxAttempts} failed to send message to Kafka: ${error}`);
                    
                    // If this is the last attempt, return failure
                    if (attempt === maxAttempts) {
                        return { success: false, error: String(error) };
                    }
                    
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }

            // This should never be reached due to the return in the catch block
            return { success: false, error: 'Unknown error' };
        }

        /**
         * Register the Kafka plugin in the context during initialization.
         * This makes the Kafka plugin available to other parts of the indexer via the useKafka hook.
         */
        indexer.hooks.hook("run:before", async () => {
            const ctx = useIndexerContext();
            
            // Connect to Kafka
            await connectToKafka();
            
            // Store the Kafka plugin in the context
            ctx.kafkaPlugin = {
                topic,
                transformData,
                sendData: async (data: T) => {
                    return sendToKafka(data);
                }
            };
            
            console.log(`Kafka plugin initialized for topic ${topic}`);
        });

        /**
         * Process each incoming message and send data to Kafka if configured.
         * This hook is called for every message received from the Apibara stream.
         */
        indexer.hooks.hook("message", async ({ message }) => {
            if (sendOnEveryMessage && message._tag === "data" && message.data) {
                // Transform the data using the provided transform function
                const transformedData: any = transformData({
                    block: message.data.data[0] as Block,
                    context: indexer,
                    finality: message.data.finality,
                    cursor: message.data.cursor,
                    endCursor: message.data.endCursor
                });

                // Send the transformed data to Kafka
                if (transformedData) {
                    const result = await sendToKafka(transformedData);
                    if (!result.success) {
                        const data: any = message.data.data[0];
                        let blockNumber = BigInt(data?.header?.blockNumber).toString();
                        console.error(`Kafka could not process block: ${blockNumber}, Error: ${result.error}`);
                    }
                }
            }
        });

        /**
         * Clean up Kafka resources when the indexer stops.
         * This hook is called when the indexer is completely stopped, not after each message.
         */
        indexer.hooks.hook("run:after", async () => {
            // We'll keep the connection open for the entire indexer lifecycle
            // Only disconnect when the indexer is fully stopped
            console.log('Indexer stopped, keeping Kafka connection open for reuse');
            
            // Note: We're intentionally NOT disconnecting here to maintain a persistent connection
            // The connection will be properly closed when the process exits
            
            // If you need to force a disconnect, uncomment the following:
            /*
            if (kafkaPlugin.kafkaProducer) {
                try {
                    await kafkaPlugin.kafkaProducer.disconnect();
                    console.log('Disconnected from Kafka');
                    kafkaPlugin.kafkaProducer = null;
                } catch (error) {
                    console.error(`Failed to disconnect from Kafka: ${error}`);
                }
            }
            */
        });
    });
};

/**
 * Hook to access the Kafka plugin from the indexer context.
 * This allows other parts of the indexer to use the Kafka functionality.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const kafka = useKafka();
 * await kafka.sendData({ key: 'value' });
 * 
 * // With type safety
 * interface TransferData {
 *   blockNumber: string;
 *   transfers: Array<{token: string, from: string, to: string}>
 * }
 * 
 * const kafka = useKafka<TransferData>();
 * await kafka.sendData({
 *   blockNumber: '123',
 *   transfers: [{ token: '0x123', from: '0x456', to: '0x789' }]
 * });
 * ```
 * 
 * @template T The type of data that will be sent to Kafka
 * @throws {Error} If the Kafka plugin is not available in context
 * @returns {KafkaPlugin<T>} The Kafka plugin instance with methods to send data
 */
export function useKafka<T = any>(): KafkaPlugin<T> {
    const ctx = useIndexerContext();
    
    if (!ctx.kafkaPlugin) {
        throw new Error('Kafka plugin not available in context. Make sure to add the kafkaPlugin to your indexer.');
    }
    
    return ctx.kafkaPlugin as KafkaPlugin<T>;
}
