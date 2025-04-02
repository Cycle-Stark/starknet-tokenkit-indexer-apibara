import { useIndexerContext } from "@apibara/indexer";
import { defineIndexerPlugin } from "@apibara/indexer/plugins";
import { Cursor, DataFinality } from "@apibara/protocol";
import { Block } from "@apibara/starknet";

/**
 * Configuration options for the webhook plugin.
 * @interface WebhookPluginOptions
 * @template T The type of data that will be returned by the transform function
 */
export interface WebhookPluginOptions<T = any> {
    /**
     * The URL of the webhook endpoint to send data to
     */
    url: string;

    /**
     * Optional headers to include in the webhook request
     */
    headers?: Record<string, string>;

    /**
     * Optional function to transform the data before sending it to the webhook
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
 * Interface for the webhook plugin instance stored in context
 */
/**
 * Interface for the webhook plugin instance stored in context.
 * This provides methods for sending data to a webhook endpoint.
 * @interface WebhookPlugin
 * @template T The type of data that will be returned by the transform function
 */
export interface WebhookPlugin<T = any> {
    /**
     * The URL of the webhook endpoint
     */
    url: string;

    /**
     * Headers to include in the webhook request
     */
    headers: Record<string, string>;

    /**
     * Function to transform data before sending it to the webhook
     */
    transformData: (args: {
        block: Block;
        cursor?: Cursor | undefined;
        endCursor?: Cursor | undefined;
        finality: DataFinality;
        context: any;
    }) => T;

    /**
     * Send data to the webhook endpoint
     * @param data The data to send to the webhook
     * @returns A promise that resolves with the result of the webhook request
     */
    sendData: (data: T) => Promise<{ success: boolean; status?: number; body?: string; error?: string; }>;
}

/**
 * Creates a webhook plugin for Apibara indexers.
 * 
 * This plugin allows sending data to a webhook endpoint whenever new blocks are processed.
 * It supports retry logic, custom headers, and data transformation.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * webhookPlugin({
 *   url: 'https://example.com/webhook',
 *   headers: { 'Authorization': 'Bearer token' },
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
 * webhookPlugin<TransferData>({
 *   url: 'https://example.com/webhook',
 *   transformData: ({block}) => ({
 *     blockNumber: block.header.blockNumber.toString(),
 *     timestamp: block.header.timestamp.toISOString(),
 *     transfers: []
 *   })
 * })
 * ```
 * 
 * @template T The type of data that will be returned by the transform function
 * @param {WebhookPluginOptions<T>} options - Configuration options for the webhook plugin
 * @returns {Function} An Apibara indexer plugin that sends data to a webhook endpoint
 */
export function webhookPlugin<T = any>(options: WebhookPluginOptions<T>) {
    const {
        url,
        headers = {},
        transformData = (data) => data,
        sendOnEveryMessage = false,
        retry = { maxAttempts: 3, delayMs: 1000 },
    } = options;

    const maxAttempts = retry.maxAttempts ?? 3;
    const delayMs = retry.delayMs ?? 1000;

    return defineIndexerPlugin((indexer) => {
        /**
         * Register the webhook in the context during initialization.
         * This makes the webhook available to other parts of the indexer via the useWebhook hook.
         */
        indexer.hooks.hook("run:before", () => {
            const ctx = useIndexerContext();
            // Store the webhook options in the context
            ctx.webhookPlugin = {
                url,
                headers,
                transformData,
                sendData: async (data: T) => {
                    return sendToWebhook(data);
                }
            };
            // Webhook plugin initialized
        });

        /**
         * Process each incoming message and send data to the webhook if configured.
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

                // Send the transformed data to the webhook
                if (transformedData) {
                    let isSuccess = await sendToWebhook(transformedData);
                    if (!isSuccess) {
                        const data: any = message.data.data[0]
                        let blockNumber = BigInt(data?.header?.blockNumber).toString()
                        console.error(`Webhook could not process block: ${blockNumber}`)
                    }
                }
            }
        });

        /**
         * Send data to the webhook endpoint with retry logic.
         * This function handles the actual HTTP request to the webhook endpoint,
         * including retries on failure and error handling.
         * 
         * @param {any} data - The data to send to the webhook endpoint
         * @returns {Promise<boolean>} True if the webhook request was successful, false otherwise
         */
        async function sendToWebhook(data: any) {
            try {


                let attempt = 0;
                let success = false;
                let lastError: Error | null = null;

                // Only log failed attempts
                let lastResponseStatus: number | null = null;
                while (attempt < maxAttempts && !success) {
                    try {
                        const response = await fetch(url, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                ...headers,
                            },
                            body: JSON.stringify(data),
                        });

                        const responseText = await response.text();
                        // Store response status for potential error reporting
                        lastResponseStatus = response.status;

                        if (!response.ok) {
                            throw new Error(`Webhook request failed with status ${response.status}: ${responseText}`);
                        }

                        success = true;
                        // Success - no need to log
                    } catch (error) {
                        lastError = error as Error;
                        attempt++;

                        // Only log on failures
                        if (attempt < maxAttempts) {
                            console.warn(`Webhook request failed (attempt ${attempt}/${maxAttempts}): ${(error as Error).message}. Retrying in ${delayMs}ms`);

                            // Wait before retrying
                            await new Promise((resolve) => setTimeout(resolve, delayMs));
                        }
                    }
                }

                if (!success) {
                    console.error(`❌ Webhook request failed after ${maxAttempts} attempts: ${lastError?.message}`);
                }
                return success
            } catch (error) {
                console.error(`❌ Error processing webhook data: ${(error as Error).message}`);
                console.error(error);
                // To indicate failed webhook logic
                return false
            }
        }
    });
}

/**
 * Hook to access the webhook plugin from the indexer context.
 * This allows other parts of the indexer to use the webhook functionality.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const webhook = useWebhook();
 * await webhook.sendData({ key: 'value' });
 * 
 * // With type safety
 * interface TransferData {
 *   blockNumber: string;
 *   transfers: Array<{token: string, from: string, to: string}>
 * }
 * 
 * const webhook = useWebhook<TransferData>();
 * await webhook.sendData({
 *   blockNumber: '123',
 *   transfers: [{ token: '0x123', from: '0x456', to: '0x789' }]
 * });
 * ```
 * 
 * @template T The type of data that will be sent to the webhook
 * @throws {Error} If the webhook plugin is not available in context
 * @returns {WebhookPlugin<T>} The webhook plugin instance with methods to send data
 */
export function useWebhook<T = any>(): WebhookPlugin<T> {
    const ctx = useIndexerContext();

    if (!ctx?.webhookPlugin) {
        throw new Error("Webhook plugin is not available in context");
    }

    return ctx.webhookPlugin as WebhookPlugin<T>;
}
