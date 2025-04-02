import { Redis } from 'ioredis';

/**
 * Redis persistence hook for Apibara
 * 
 * This hook stores the last processed block number in Redis
 * and can be used to resume indexing from the last processed block.
 */
export function redisPersist(options: {
  redisUrl: string | null | undefined;
  indexerId: string | null | undefined;
}) {
  if(!options.redisUrl || !options.indexerId) {
    throw new Error("Missing required options for redisPersist");
  }
  const { redisUrl, indexerId } = options;
  
  // Create Redis client
  const redis = new Redis(redisUrl);
  const redisKey = `apibara:${indexerId}:last_block`;
  
  console.log(`Redis persistence enabled for indexer ${indexerId}`);
  console.log(`Using Redis key: ${redisKey}`);

  // Check for last processed block
  (async () => {
    try {
      const lastBlock = await redis.get(redisKey);
      if (lastBlock) {
        console.log(`Retrieved last processed block from Redis: ${lastBlock}`);
      }
    } catch (error) {
      console.error('Failed to get last processed block from Redis:', error);
    }
  })();

  // Return a function that will be used as a plugin
  return (indexer: any) => {
    // This will be called after processing each block
    indexer.onData(async ({ block }: any) => {
      if (!block || !block.header) return;
      
      const blockNumber = block.header.blockNumber;
      
      try {
        // Store the block number in Redis
        await redis.set(redisKey, blockNumber.toString());
        console.log(`Persisted block ${blockNumber} to Redis`);
      } catch (error) {
        console.error(`Failed to persist block ${blockNumber} to Redis:`, error);
      }
    });
    
    // This will be called when the indexer stops
    indexer.onStop(async () => {
      console.log('Closing Redis connection');
      await redis.quit();
    });
  };
}
