import { defineConfig } from "apibara/config";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  runtimeConfig: {
    startingBlock: Number(process.env.STARTING_BLOCK),
    indexerId: process.env.INDEXER_ID,
    streamUrl: process.env.STREAM_URL,
    webhookUrl: process.env.WEBHOOK_ENDPOINT,
    persistToRedis: process.env.PERSIST_TO_REDIS,
    websocketUrl: process.env.WEBSOCKET_ENDPOINT,
    contractAddress: process.env.CONTRACT_ADDRESS,
  },
  preset: "mainnet",
  presets: {
    mainnet: {
      runtimeConfig: {
        sinkId: process.env.INDEXER_ID,
        indexerId: process.env.INDEXER_ID,
        startingBlock: Number(process.env.STARTING_BLOCK),
        streamUrl: process.env.STREAM_URL,
        webhookUrl: process.env.WEBHOOK_ENDPOINT,
        persistToRedis: process.env.PERSIST_TO_REDIS,
        websocketUrl: process.env.WEBSOCKET_ENDPOINT,
        contractAddress: process.env.CONTRACT_ADDRESS,
        }
    },
    sepolia: {
      runtimeConfig: {
        sinkId: process.env.INDEXER_ID,
        indexerId: process.env.INDEXER_ID,
        startingBlock: Number(process.env.STARTING_BLOCK),
        streamUrl: process.env.STREAM_URL,
        webhookUrl: process.env.WEBHOOK_ENDPOINT,
        persistToRedis: process.env.PERSIST_TO_REDIS,
        websocketUrl: process.env.WEBSOCKET_ENDPOINT,
        contractAddress: process.env.CONTRACT_ADDRESS,
      }
    },
  },
});
