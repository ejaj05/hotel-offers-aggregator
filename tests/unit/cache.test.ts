import RedisMock from 'ioredis-mock';
import { CacheService } from '../../src/services/cache.service';
import { AggregatedHotelOffer } from '../../src/types/hotel';

describe('Redis Cache Service', () => {
  let mockRedis: any;
  let cacheService: CacheService;

  beforeEach(() => {
    mockRedis = new RedisMock();
    cacheService = new CacheService(mockRedis);
  });

  afterEach(async () => {
    await cacheService.disconnect();
  });

  describe('generateKey', () => {
    it('creates deterministic, collision-free keys based on filter parameters', () => {
      const keyAll = cacheService.generateKey({});
      expect(keyAll).toBe('hotels:cache:city:all:min:none:max:none');

      const keyCity = cacheService.generateKey({ city: 'Kolkata' });
      expect(keyCity).toBe('hotels:cache:city:kolkata:min:none:max:none');

      const keyCityMin = cacheService.generateKey({ city: 'Kolkata', minPrice: 1000 });
      expect(keyCityMin).toBe('hotels:cache:city:kolkata:min:1000:max:none');

      const keyRange = cacheService.generateKey({ city: 'Delhi', minPrice: 1000, maxPrice: 3000 });
      expect(keyRange).toBe('hotels:cache:city:delhi:min:1000:max:3000');

      // Ensure keys for different filters do not collide
      expect(keyAll).not.toEqual(keyCity);
      expect(keyCity).not.toEqual(keyCityMin);
    });
  });

  describe('get and set', () => {
    it('returns null on cache miss', async () => {
      const result = await cacheService.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('stores and retrieves cached hotel data correctly', async () => {
      const sampleData: AggregatedHotelOffer[] = [
        {
          hotelId: 'B1',
          name: 'Hilton',
          price: 1300,
          city: 'Kolkata',
          commissionPct: 8,
          supplier: 'Supplier B',
        },
      ];

      const key = cacheService.generateKey({ city: 'Kolkata' });
      await cacheService.set(key, sampleData, 60);

      const cached = await cacheService.get<AggregatedHotelOffer[]>(key);
      expect(cached).toEqual(sampleData);
    });

    it('handles delete properly', async () => {
      const key = 'test:del';
      await cacheService.set(key, { test: 123 }, 60);
      expect(await cacheService.get(key)).not.toBeNull();

      await cacheService.del(key);
      expect(await cacheService.get(key)).toBeNull();
    });
  });

  describe('Graceful error handling', () => {
    it('gracefully returns null without throwing when Redis fails', async () => {
      // Create a disconnected / errored instance
      const faultyService = new CacheService();
      // Service should not crash the app even if Redis is unreachable
      const res = await faultyService.get('any-key');
      expect(res).toBeNull();

      // Set should not throw
      await expect(faultyService.set('any-key', { test: true })).resolves.not.toThrow();
    });
  });
});
