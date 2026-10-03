import { proxyActivities, ApplicationFailure, log } from '@temporalio/workflow';
import type * as activities from '../activities';
import { AggregatedHotelOffer, HotelFilterParams, SupplierHotelOffer } from '../../types/hotel';
import { aggregateAndFilterHotels } from '../../services/aggregation.service';

const { fetchSupplierAHotels, fetchSupplierBHotels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  retry: {
    initialInterval: '200ms',
    maximumInterval: '2s',
    backoffCoefficient: 2,
    maximumAttempts: 2,
  },
});

/**
 * Temporal Workflow for Hotel Aggregation
 *
 * 1. Invokes Supplier A and Supplier B activities concurrently.
 * 2. Handles partial failures gracefully (if one supplier fails, continues with the other).
 * 3. Throws a non-retryable ApplicationFailure if all suppliers fail.
 * 4. Deduplicates overlapping hotels by name & city, selecting the lowest price.
 * 5. Applies filters (city, minPrice, maxPrice).
 * 6. Returns the final aggregated hotel offers.
 */
export async function hotelAggregationWorkflow(
  filters: HotelFilterParams
): Promise<AggregatedHotelOffer[]> {
  log.info('Starting hotelAggregationWorkflow', { filters });

  // Execute supplier activities in parallel
  const [resultA, resultB] = await Promise.allSettled([
    fetchSupplierAHotels(filters.city),
    fetchSupplierBHotels(filters.city),
  ]);

  const allOffers: SupplierHotelOffer[] = [];
  let aFailed = false;
  let bFailed = false;
  let errorMsgA = '';
  let errorMsgB = '';

  if (resultA.status === 'fulfilled') {
    allOffers.push(...resultA.value);
  } else {
    aFailed = true;
    errorMsgA = resultA.reason?.message || 'Supplier A activity error';
    log.warn('Supplier A activity failed', { error: errorMsgA });
  }

  if (resultB.status === 'fulfilled') {
    allOffers.push(...resultB.value);
  } else {
    bFailed = true;
    errorMsgB = resultB.reason?.message || 'Supplier B activity error';
    log.warn('Supplier B activity failed', { error: errorMsgB });
  }

  // If both suppliers fail, fail the workflow with clean error code
  if (aFailed && bFailed) {
    throw ApplicationFailure.nonRetryable(
      `All hotel suppliers are currently unavailable. Supplier A: [${errorMsgA}], Supplier B: [${errorMsgB}]`,
      'ALL_SUPPLIERS_FAILED'
    );
  }

  // Deduplicate and filter results
  const finalOffers = aggregateAndFilterHotels(allOffers, filters);

  log.info('Completed hotelAggregationWorkflow', {
    totalRawOffers: allOffers.length,
    finalCount: finalOffers.length,
  });

  return finalOffers;
}
