import { useIndexerContext } from "@apibara/indexer";
import { defineIndexerPlugin } from "@apibara/indexer/plugins";
import { Cursor, DataFinality } from "@apibara/protocol";
import { Block } from "@apibara/starknet";
import WebSocket from "ws";

/**
 * Configuration options for the WebSocket plugin.
 * @interface WebSocketPluginOptions
 * @template T The type of data that will be returned by the transform function
 */
export interface WebSocketPluginOptions<T = any> {
    /**
     * The URL of the WebSocket endpoint to connect to
     */
    url: string;

    /**
     * Optional headers to include in the WebSocket connection
     */
    headers?: Record<string, string>;

    /**
     * Optional function to transform the data before sending it to the WebSocket
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
}

/**
 * Interface for the WebSocket plugin instance stored in context.
 * This provides methods for sending data to a WebSocket endpoint.
 * @interface WebSocketPlugin
 * @template T The type of data that will be returned by the transform function
 */
export interface WebSocketPlugin<T = any> {
    /**
     * The URL of the WebSocket endpoint
     */
    url: string;

    /**
     * Headers to include in the WebSocket connection
     */
    headers: Record<string, string>;

    /**
     * Function to transform data before sending it to the WebSocket
     */
    transformData: (args: {
        block: Block;
        cursor?: Cursor | undefined;
        endCursor?: Cursor | undefined;
        finality: DataFinality;
        context: any;
    }) => T;

    /**
     * Send data to the WebSocket endpoint
     * @param data The data to send to the WebSocket
     * @returns A promise that resolves with the result of the WebSocket send operation
     */
    sendData: (data: T) => Promise<{ success: boolean; error?: string; }>;
}

/**
 * Plugin that manages WebSocket connections and persistence.
 * Maintains a static WebSocket client to ensure connection persistence across messages.
 * @interface WebSocketPluginFunction
 */
interface WebSocketPluginFunction {
    (options: WebSocketPluginOptions): any;
    wsClient?: WebSocket | null;
    lastProcessedBlock?: number | null;
}

/**
 * Creates a WebSocket plugin for Apibara indexers.
 * 
 * This plugin allows connecting to a WebSocket endpoint and sending data whenever new blocks are processed.
 * It supports retry logic, custom headers, data transformation, and persistence of the last processed block.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * websocketPlugin({
 *   url: 'ws://localhost:8000/ws/transfers/',
 *   headers: { 'Authorization': 'Bearer token' },
 *   sendOnEveryMessage: true,
 *   retry: { maxAttempts: 5, delayMs: 2000 },
 *   persistence: { indexerId: 'transfers-indexer' }
 * })
 * 
 * // With type-safe transform function
 * interface TransferData {
 *   blockNumber: string;
 *   timestamp: string;
 *   transfers: Array<{token: string, from: string, to: string, value: string}>
 * }
 * 
 * websocketPlugin<TransferData>({
 *   url: 'ws://localhost:8000/ws/transfers/',
 *   transformData: ({block}) => ({
 *     blockNumber: block.header.blockNumber.toString(),
 *     timestamp: block.header.timestamp.toISOString(),
 *     transfers: []
 *   }),
 *   persistence: { indexerId: 'transfers-indexer' }
 * })
 * ```
 * 
 * @template T The type of data that will be returned by the transform function
 * @param {WebSocketPluginOptions<T>} options - Configuration options for the WebSocket plugin
 * @returns {Function} An Apibara indexer plugin that connects to a WebSocket endpoint
 */
export const websocketPlugin: WebSocketPluginFunction = function<T = any>(options: WebSocketPluginOptions<T>) {
    const {
        url,
        headers = {},
        transformData = (data) => data,
        sendOnEveryMessage = false,
        retry = { maxAttempts: 3, delayMs: 1000 },
    } = options;

    const maxAttempts = retry.maxAttempts ?? 3;
    const delayMs = retry.delayMs ?? 1000;

    // Use a static WebSocket client to persist across messages
    if (!websocketPlugin.wsClient) {
        websocketPlugin.wsClient = null;
    }
    
    // Initialize last processed block
    if (websocketPlugin.lastProcessedBlock === undefined) {
        websocketPlugin.lastProcessedBlock = null;
    }

    return defineIndexerPlugin((indexer) => {


        /**
         * Attempt to reconnect to the WebSocket server.
         * This function tries to establish a new WebSocket connection if the current one is closed.
         * 
         * @returns {Promise<boolean>} True if reconnection was successful, false otherwise
         */
        async function reconnectWebSocket(): Promise<boolean> {
            // If WebSocket is already connected, return true
            if (websocketPlugin.wsClient && websocketPlugin.wsClient.readyState === WebSocket.OPEN) {
                return true;
            }
            
            // Close existing connection if it exists
            if (websocketPlugin.wsClient) {
                if (websocketPlugin.wsClient.readyState !== WebSocket.CLOSED) {
                    websocketPlugin.wsClient.close();
                }
                websocketPlugin.wsClient = null;
            }
            
            // Create a new WebSocket connection
            return new Promise((resolve) => {
                try {
                    // console.log('Attempting to reconnect to WebSocket...');
                    
                    // Create new WebSocket connection
                    websocketPlugin.wsClient = new WebSocket(url, { headers });
                    
                    // Set up event handlers
                    websocketPlugin.wsClient.onopen = () => {
                        console.log(`Reconnected to WebSocket at ${url}`);
                        resolve(true);
                    };
                    
                    websocketPlugin.wsClient.onerror = (error) => {
                        // console.error('WebSocket reconnection error:', error);
                        resolve(false);
                    };
                    
                    // Set a timeout for the connection attempt
                    setTimeout(() => {
                        if (websocketPlugin.wsClient && websocketPlugin.wsClient.readyState !== WebSocket.OPEN) {
                            // console.error('WebSocket reconnection timeout');
                            resolve(false);
                        }
                    }, 5000); // 5 second timeout
                } catch (error) {
                    // console.error('Failed to create WebSocket connection:', error);
                    resolve(false);
                }
            });
        }

        /**
         * Send data to the WebSocket.
         * This function handles sending data to the WebSocket endpoint,
         * including retries on failure and error handling.
         * 
         * @param {T} data - The data to send to the WebSocket endpoint
         * @returns {Promise<{success: boolean, error?: string}>} Result of the WebSocket send operation
         */
        async function sendToWebSocket(data: T): Promise<{ success: boolean; error?: string }> {
            let attempts = 0;
            let lastError: Error | null = null;

            while (attempts < maxAttempts) {
                try {
                    // Check if WebSocket is connected
                    if (!websocketPlugin.wsClient || websocketPlugin.wsClient.readyState !== WebSocket.OPEN) {
                        lastError = new Error('WebSocket not connected');
                        attempts++;
                        
                        if (attempts < maxAttempts) {
                            // console.log(`WebSocket not connected. Waiting ${delayMs}ms before retry attempt ${attempts}/${maxAttempts}...`);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                            reconnectWebSocket();
                            continue;
                        } else {
                            break;
                        }
                    }
                    
                    // Serialize data to JSON
                    const message = JSON.stringify(data);
                    
                    // Send data to WebSocket
                    websocketPlugin.wsClient!.send(message);
                    
                    return { success: true };
                } catch (error: any) {
                    lastError = error;
                    attempts++;
                    
                    if (attempts < maxAttempts) {
                        // console.log(`Send failed, retry attempt ${attempts}/${maxAttempts} - Waiting ${delayMs}ms before next attempt...`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }

            return { 
                success: false, 
                error: lastError ? lastError.message : 'Failed to send data to WebSocket after multiple attempts' 
            };
        }

        /**
         * Initialize WebSocket connection and register the plugin in the context.
         * This hook runs before the indexer starts and sets up the WebSocket connection.
         */
        indexer.hooks.hook("run:before", () => {
            const ctx = useIndexerContext();
            
            try {
                // Initialize WebSocket connection
                websocketPlugin.wsClient = new WebSocket(url, {
                    headers
                });
                
                // Set up WebSocket event handlers
                websocketPlugin.wsClient.on('open', () => {
                    console.log(`Connected to WebSocket at ${url}`);
                });
                
                websocketPlugin.wsClient.on('message', (data: WebSocket.Data) => {
                    try {
                        // Parse message from WebSocket if needed
                        const message = JSON.parse(data.toString());
                        // console.log('Received message from WebSocket:', message);
                    } catch (error) {
                        // console.error('Failed to parse WebSocket message:', error);
                    }
                });
                
                websocketPlugin.wsClient.on('error', (error: Error) => {
                    console.error('WebSocket error:', error.message);
                });
                
                websocketPlugin.wsClient.on('close', (code: number, reason: string) => {
                    console.log(`WebSocket connection closed: ${code} - ${reason}`);
                    
                    // Attempt to reconnect after a delay
                    setTimeout(async () => {
                        // console.log('Attempting to reconnect after connection closed...');
                        await reconnectWebSocket();
                    }, 2000);
                });
                
                // Store the WebSocket plugin in the context
                ctx.websocketPlugin = {
                    url,
                    headers,
                    transformData,
                    sendData: async (data: T) => {
                        return sendToWebSocket(data);
                    }
                };
                
                console.log('WebSocket plugin initialized');
            } catch (error) {
                console.error('Failed to initialize WebSocket plugin:', error);
            }
        });

        /**
         * Process each incoming message and send data to the WebSocket if configured.
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

                // Send the transformed data to the WebSocket
                if (transformedData) {
                    // Get the block number for logging
                    const data: any = message.data.data[0];
                    const blockNumber = BigInt(data?.header?.blockNumber).toString();
                    
                    // console.log(`Sending block ${blockNumber} to WebSocket...`);
                    const result = await sendToWebSocket(transformedData);
                    
                    if (!result.success) {
                        console.error(`WebSocket could not process block: ${blockNumber}, Error: ${result.error}`);
                        throw new Error(`WebSocket could not process block: ${blockNumber}, Error: ${result.error}`);
                    } else {
                        // console.log(`Successfully sent block ${blockNumber} to WebSocket`);
                    }
                }
            }
        });

        /**
         * Clean up resources when the indexer stops.
         * This hook is called when the indexer is shutting down.
         */
        // indexer.hooks.hook("run:after", () => {
        //     // Close WebSocket connection if open
        //     if (websocketPlugin.wsClient && websocketPlugin.wsClient.readyState === WebSocket.OPEN) {
        //         websocketPlugin.wsClient.close();
        //         console.log('WebSocket connection closed');
        //     }
        // });
    });
};

/**
 * Hook to access the WebSocket plugin from the indexer context.
 * This allows other parts of the indexer to use the WebSocket functionality.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const websocket = useWebSocket();
 * await websocket.sendData({ key: 'value' });
 * 
 * // With type safety
 * interface TransferData {
 *   blockNumber: string;
 *   transfers: Array<{token: string, from: string, to: string}>
 * }
 * 
 * const websocket = useWebSocket<TransferData>();
 * await websocket.sendData({
 *   blockNumber: '123',
 *   transfers: [{ token: '0x123', from: '0x456', to: '0x789' }]
 * });
 * ```
 * 
 * @template T The type of data that will be sent to the WebSocket
 * @throws {Error} If the WebSocket plugin is not available in context
 * @returns {WebSocketPlugin<T>} The WebSocket plugin instance with methods to send data
 */
export function useWebSocket<T = any>(): WebSocketPlugin<T> {
    const ctx = useIndexerContext();
    if (!ctx.websocketPlugin) {
        throw new Error("WebSocket plugin not available in context. Did you forget to add the websocketPlugin to your indexer?");
    }
    return ctx.websocketPlugin as WebSocketPlugin<T>;
}
