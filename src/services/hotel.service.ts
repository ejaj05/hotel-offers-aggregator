import { getTemporalClient } from '../temporal/client';
import { hotelAggregationWorkflow } from '../temporal/workflows/hotelAggregation.workflow';
import { cacheService } from './cache.service';
import { config } from '../config';
import { AggregatedHotelOffer, HotelFilterParams } from '../types/hotel';
import { logger } from './logger.service';

const hotelLogger = logger.forContext('HotelService');

export class HotelService {
  /**
   * Orchestrates hotel offer retrieval:
   * 1. Checks Redis cache.
   * 2. If cached, returns immediately.
   * 3. If cache miss, executes the Temporal workflow.
   * 4. Persists the result in Redis with TTL.
   * 5. Returns final aggregated offers.
   */
  public async getHotels(filters: HotelFilterParams): Promise<{
    offers: AggregatedHotelOffer[];
    cached: boolean;
  }> {
    const cacheKey = cacheService.generateKey(filters);
    hotelLogger.debug(`Checking Redis cache with key: ${cacheKey}`, { filters });

    // 1. Check Redis Cache
    const cachedData = await cacheService.get<AggregatedHotelOffer[]>(cacheKey);
    if (cachedData) {
      hotelLogger.info(`Cache HIT for key "${cacheKey}" (${cachedData.length} offers)`);
      return { offers: cachedData, cached: true };
    }

    hotelLogger.info(`Cache MISS for key "${cacheKey}". Initiating Temporal workflow...`);

    let offers: AggregatedHotelOffer[];

    try {
      // 2. Execute Temporal Workflow
      const client = await getTemporalClient();
      const workflowId = `hotel-aggregation-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      hotelLogger.info(`Executing Temporal workflow ${workflowId} on taskQueue "${config.temporal.taskQueue}"`);

      offers = await client.workflow.execute(hotelAggregationWorkflow, {
        taskQueue: config.temporal.taskQueue,
        workflowId,
        args: [filters],
      });

      hotelLogger.info(
        `Temporal workflow ${workflowId} completed successfully with ${offers.length} offers. Caching with TTL ${config.redis.cacheTtl}s`
      );
    } catch (temporalErr: any) {
      const isConnectionError =
        temporalErr?.message?.includes('Failed to connect') ||
        temporalErr?.message?.includes('deadline') ||
        temporalErr?.message?.includes('UNAVAILABLE') ||
        temporalErr?.message?.includes('Connection dropped');

      // If in development and Temporal server is offline, provide seamless local fallback
      if (isConnectionError && config.nodeEnv === 'development') {
        hotelLogger.warn(
          `Temporal server is unreachable at ${config.temporal.address}. Running local fallback aggregation for development...`
        );
        offers = await this.executeLocalAggregation(filters);
      } else {
        throw temporalErr;
      }
    }

    // 3. Cache Result in Redis
    await cacheService.set(cacheKey, offers, config.redis.cacheTtl);

    return { offers, cached: false };
  }

  /**
   * Local fallback execution when running Express in development without Temporal Docker container
   */
  private async executeLocalAggregation(filters: HotelFilterParams): Promise<AggregatedHotelOffer[]> {
    const { fetchSupplierAHotels } = await import('../temporal/activities/supplierA.activity');
    const { fetchSupplierBHotels } = await import('../temporal/activities/supplierB.activity');
    const { aggregateAndFilterHotels } = await import('./aggregation.service');

    const [resultA, resultB] = await Promise.allSettled([
      fetchSupplierAHotels(filters.city),
      fetchSupplierBHotels(filters.city),
    ]);

    const allOffers: any[] = [];
    if (resultA.status === 'fulfilled') allOffers.push(...resultA.value);
    if (resultB.status === 'fulfilled') allOffers.push(...resultB.value);

    if (resultA.status === 'rejected' && resultB.status === 'rejected') {
      const errorA = (resultA as PromiseRejectedResult).reason?.message || 'Error';
      const errorB = (resultB as PromiseRejectedResult).reason?.message || 'Error';
      throw new Error(`All hotel suppliers are currently unavailable. Supplier A: [${errorA}], Supplier B: [${errorB}]`);
    }

    return aggregateAndFilterHotels(allOffers, filters);
  }
}

export const hotelService = new HotelService();
