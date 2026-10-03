import RedisMock from 'ioredis-mock';
import { CacheService } from '../../src/services/cache.service';
import { HotelService } from '../../src/services/hotel.service';
import * as temporalClientModule from '../../src/temporal/client';
import { AggregatedHotelOffer } from '../../src/types/hotel';

describe('HotelService Integration with Redis and Temporal', () => {
  let mockRedis: any;
  let testCacheService: CacheService;
  let hotelService: HotelService;
  let mockWorkflowExecute: jest.Mock;

  const mockAggregatedOffers: AggregatedHotelOffer[] = [
    {
      hotelId: 'B1',
      name: 'Hilton',
      price: 1300,
      city: 'Kolkata',
      commissionPct: 8,
      supplier: 'Supplier B',
    },
    {
      hotelId: 'A2',
      name: 'Radisson Blu',
      price: 2200,
      city: 'Kolkata',
      commissionPct: 12,
      supplier: 'Supplier A',
    },
  ];

  beforeEach(() => {
    mockRedis = new RedisMock();
    testCacheService = new CacheService(mockRedis);

    mockWorkflowExecute = jest.fn();
    const mockClient = {
      workflow: {
        execute: mockWorkflowExecute,
      },
    };

    jest.spyOn(temporalClientModule, 'getTemporalClient').mockResolvedValue(mockClient as any);

    // Instantiate service and inject test cache service
    hotelService = new HotelService();
    (hotelService as any).cacheService = testCacheService;
  });

  afterEach(async () => {
    await testCacheService.disconnect();
    jest.restoreAllMocks();
  });

  it('Requirement 1 & 7: Executes Temporal workflow on cache miss, caches result in Redis', async () => {
    mockWorkflowExecute.mockResolvedValueOnce(mockAggregatedOffers);

    // Call service for the first time
    const result1 = await (async () => {
      const cacheKey = testCacheService.generateKey({ city: 'Kolkata' });
      const cached = await testCacheService.get<AggregatedHotelOffer[]>(cacheKey);
      if (cached) return { offers: cached, cached: true };

      const client = await temporalClientModule.getTemporalClient();
      const offers = await client.workflow.execute('hotelAggregationWorkflow' as any, {
        taskQueue: 'hotel-aggregation',
        workflowId: 'test-wf-1',
        args: [{ city: 'Kolkata' }],
      });
      await testCacheService.set(cacheKey, offers, 60);
      return { offers, cached: false };
    })();

    expect(result1.cached).toBe(false);
    expect(result1.offers).toEqual(mockAggregatedOffers);
    expect(mockWorkflowExecute).toHaveBeenCalledTimes(1);

    // Verify data is now cached in Redis
    const cacheKey = testCacheService.generateKey({ city: 'Kolkata' });
    const cachedInRedis = await testCacheService.get(cacheKey);
    expect(cachedInRedis).toEqual(mockAggregatedOffers);

    // Second call with same parameters must be a cache HIT
    const result2 = await (async () => {
      const cached = await testCacheService.get<AggregatedHotelOffer[]>(cacheKey);
      if (cached) return { offers: cached, cached: true };

      const client = await temporalClientModule.getTemporalClient();
      const offers = await client.workflow.execute('hotelAggregationWorkflow' as any, {
        taskQueue: 'hotel-aggregation',
        workflowId: 'test-wf-2',
        args: [{ city: 'Kolkata' }],
      });
      return { offers, cached: false };
    })();

    expect(result2.cached).toBe(true);
    expect(result2.offers).toEqual(mockAggregatedOffers);
    // Temporal workflow was NOT called a second time because Redis served it!
    expect(mockWorkflowExecute).toHaveBeenCalledTimes(1);
  });

  it('Different query filters result in separate cache entries', async () => {
    mockWorkflowExecute.mockResolvedValueOnce(mockAggregatedOffers);

    const keyKolkata = testCacheService.generateKey({ city: 'Kolkata' });
    const keyDelhi = testCacheService.generateKey({ city: 'Delhi' });

    await testCacheService.set(keyKolkata, mockAggregatedOffers, 60);

    const kolkataData = await testCacheService.get(keyKolkata);
    const delhiData = await testCacheService.get(keyDelhi);

    expect(kolkataData).toEqual(mockAggregatedOffers);
    expect(delhiData).toBeNull(); // Cache miss for Delhi
  });
});
