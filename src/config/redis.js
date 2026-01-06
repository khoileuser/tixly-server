const Redis = require('ioredis');
const env = require('./env');

let redisClient = null;

/**
 * Initialize Redis connection
 */
const connectRedis = () => {
  if (redisClient) {
    return redisClient;
  }

  const redisHost = env.redis?.host || process.env.REDIS_HOST;
  const redisPort = env.redis?.port || process.env.REDIS_PORT || 6379;

  if (!redisHost) {
    console.warn('Redis not configured - caching will be disabled');
    return null;
  }

  try {
    redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redisClient.on('connect', () => {
      console.log('✓ Redis connected:', redisHost);
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err.message);
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis:', error.message);
    return null;
  }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  return redisClient;
};

/**
 * Close Redis connection
 */
const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis disconnected');
  }
};

/**
 * Cache helper functions
 */
const cache = {
  /**
   * Get cached value
   */
  get: async (key) => {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error.message);
      return null;
    }
  },

  /**
   * Set cached value with optional TTL (in seconds)
   */
  set: async (key, value, ttl = 300) => {
    if (!redisClient) return false;
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redisClient.setex(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error.message);
      return false;
    }
  },

  /**
   * Delete cached value
   */
  del: async (key) => {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error.message);
      return false;
    }
  },

  /**
   * Delete multiple keys by pattern
   */
  delPattern: async (pattern) => {
    if (!redisClient) return false;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Redis DEL pattern error:', error.message);
      return false;
    }
  },

  /**
   * Check if key exists
   */
  exists: async (key) => {
    if (!redisClient) return false;
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error.message);
      return false;
    }
  },

  /**
   * Set expiration on a key
   */
  expire: async (key, seconds) => {
    if (!redisClient) return false;
    try {
      await redisClient.expire(key, seconds);
      return true;
    } catch (error) {
      console.error('Redis EXPIRE error:', error.message);
      return false;
    }
  },
};

module.exports = {
  connectRedis,
  getRedisClient,
  disconnectRedis,
  cache,
};
