import { defineConfig } from "apibara/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  // Default runtime configuration
  runtimeConfig: {
    persistToRedis: process.env.PERSIST_TO_REDIS,
  },
  // Default preset
  preset: "mainnet-tokenkit",
  // Define presets for different environments and indexers
  presets: {
    // Tokenkit presets
    "mainnet-tokenkit": {
      runtimeConfig: {
        indexerId: process.env.TOKENKIT_MAINNET_INDEXER_ID,
        startingBlock: Number(process.env.TRANSFERS_SEPOLIA_STARTING_BLOCK),
        streamUrl: process.env.MAINNET_STREAM_URL,
        persistToRedis: process.env.PERSIST_TO_REDIS,
        websocketUrl: process.env.TOKENKIT_MAINNET_WEBSOCKET_ENDPOINT,
        websocketDelayMs: Number(process.env.WEBSOCKET_DELAY_MS),
        contractAddress: process.env.TOKENKIT_MAINNET_CONTRACT_ADDRESS,
      }
    },
    "sepolia-tokenkit": {
      runtimeConfig: {
        indexerId: process.env.TOKENKIT_SEPOLIA_INDEXER_ID,
        startingBlock: Number(process.env.TOKENKIT_SEPOLIA_STARTING_BLOCK),
        streamUrl: process.env.SEPOLIA_STREAM_URL,
        persistToRedis: process.env.PERSIST_TO_REDIS,
        websocketUrl: process.env.TOKENKIT_SEPOLIA_WEBSOCKET_ENDPOINT,
        websocketDelayMs: Number(process.env.WEBSOCKET_DELAY_MS),
        contractAddress: process.env.TOKENKIT_SEPOLIA_CONTRACT_ADDRESS,
      }
    },
    // Transfers presets
    "mainnet-transfers": {
      runtimeConfig: {
        indexerId: process.env.TRANSFERS_MAINNET_INDEXER_ID,
        startingBlock: Number(process.env.TRANSFERS_MAINNET_STARTING_BLOCK),
        streamUrl: process.env.MAINNET_STREAM_URL,
        persistToRedis: process.env.PERSIST_TO_REDIS,
        websocketUrl: process.env.TRANSFERS_MAINNET_WEBSOCKET_ENDPOINT,
        websocketDelayMs: Number(process.env.WEBSOCKET_DELAY_MS),
      }
    },
    "sepolia-transfers": {
      runtimeConfig: {
        indexerId: process.env.TRANSFERS_SEPOLIA_INDEXER_ID,
        startingBlock: Number(process.env.TRANSFERS_SEPOLIA_STARTING_BLOCK),
        streamUrl: process.env.SEPOLIA_STREAM_URL,
        persistToRedis: process.env.PERSIST_TO_REDIS,
        websocketUrl: process.env.TRANSFERS_SEPOLIA_WEBSOCKET_ENDPOINT,
        websocketDelayMs: Number(process.env.WEBSOCKET_DELAY_MS),
      }
    },
  },
});
