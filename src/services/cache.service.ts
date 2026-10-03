import Redis from 'ioredis';
import { config } from '../config';
import { HotelFilterParams } from '../types/hotel';
import { logger } from './logger.service';

const cacheLogger = logger.forContext('RedisCache');

export class CacheService {
  private client: Redis | null = null;
  private isConnected = false;
  private wasConnected = false;
  private hasLoggedOfflineWarning = false;

  constructor(customClient?: Redis) {
    if (customClient) {
      this.client = customClient;
      this.isConnected = true;
      this.wasConnected = true;
      cacheLogger.debug('Initialized CacheService with custom client');
      return;
    }

    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            // Stop aggressive retries if Redis is down
            return null;
          }
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.wasConnected = true;
        this.hasLoggedOfflineWarning = false;
        cacheLogger.info(`Connected to Redis at ${config.redis.host}:${config.redis.port}`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        cacheLogger.info('Redis client is ready to accept commands');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        if (!this.hasLoggedOfflineWarning) {
          const detail = err?.message ? ` (${err.message})` : '';
          cacheLogger.warn(
            `Cannot connect to Redis at ${config.redis.host}:${config.redis.port}${detail}. Operating in offline fallback mode.`
          );
          this.hasLoggedOfflineWarning = true;
        }
      });

      this.client.on('close', () => {
        this.isConnected = false;
        // Only log "closed" if we had an active connection previously
        if (this.wasConnected) {
          this.wasConnected = false;
          cacheLogger.warn('Redis connection closed. Switched to offline fallback mode.');
        }
      });

      // Attempt initial connection asynchronously in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        this.client.connect().catch(() => {
          this.isConnected = false;
        });
      }
    } catch (err: any) {
      this.isConnected = false;
      if (!this.hasLoggedOfflineWarning) {
        cacheLogger.warn(`Failed to initialize Redis client: ${err?.message}`);
        this.hasLoggedOfflineWarning = true;
      }
    }
  }

  /**
   * Generates a deterministic, collision-proof cache key based on filter parameters
   */
  public generateKey(filters: HotelFilterParams): string {
    const city = filters.city ? filters.city.trim().toLowerCase() : 'all';
    const minPrice = filters.minPrice !== undefined ? filters.minPrice : 'none';
    const maxPrice = filters.maxPrice !== undefined ? filters.maxPrice : 'none';
    return `hotels:cache:city:${city}:min:${minPrice}:max:${maxPrice}`;
  }

  /**
   * Gets cached value by key, returning null if key is not found or Redis is offline
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      cacheLogger.debug(`Retrieved key from cache: ${key}`);
      return JSON.parse(data) as T;
    } catch (error: any) {
      cacheLogger.warn(`Failed to read key "${key}" from Redis: ${error?.message}`);
      return null;
    }
  }

  /**
   * Sets a cache key with a configurable TTL (in seconds)
   */
  public async set(
    key: string,
    value: unknown,
    ttlSeconds: number = config.redis.cacheTtl
  ): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized, 'EX', ttlSeconds);
      cacheLogger.debug(`Successfully cached key "${key}" with TTL ${ttlSeconds}s`);
    } catch (error: any) {
      cacheLogger.warn(`Failed to set key "${key}" in Redis: ${error?.message}`);
    }
  }

  /**
   * Deletes a cache key
   */
  public async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.del(key);
      cacheLogger.debug(`Deleted cache key: ${key}`);
    } catch (error: any) {
      cacheLogger.warn(`Failed to delete key "${key}" from Redis: ${error?.message}`);
    }
  }

  /**
   * Health check ping for Redis
   */
  public async isHealthy(): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    try {
      const pingPromise = this.client.ping().then((res) => res === 'PONG');
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 500);
      });
      return await Promise.race([pingPromise, timeoutPromise]);
    } catch {
      return false;
    }
  }

  /**
   * Disconnects the Redis client cleanly
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
