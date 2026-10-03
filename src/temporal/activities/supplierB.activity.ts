import axios from 'axios';
import { config } from '../../config';
import { SupplierHotelOffer, supplierResponseSchema } from '../../types/hotel';
import { logger } from '../../services/logger.service';

const activityLogger = logger.forContext('SupplierB-Activity');

/**
 * Temporal Activity to fetch hotel offers from Supplier B.
 * Performs HTTP call, response schema validation, and adds supplier attribution.
 */
export async function fetchSupplierBHotels(city?: string): Promise<SupplierHotelOffer[]> {
  const url = config.suppliers.supplierB.url;
  const params: Record<string, string> = {};
  if (city && city.trim() !== '') {
    params.city = city.trim();
  }

  // If SUPPLIER_B_FAIL is set via env, add failure query param / header
  const headers: Record<string, string> = {};
  if (config.suppliers.supplierB.fail) {
    headers['x-fail'] = 'true';
  }

  activityLogger.info(`Calling Supplier B API at ${url}`, { city, failSimulated: config.suppliers.supplierB.fail });
  const start = Date.now();

  try {
    const response = await axios.get(url, {
      params,
      headers,
      timeout: 4000
    });

    const parsed = supplierResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      activityLogger.error(`Supplier B response schema validation failed: ${parsed.error.message}`);
      throw new Error(`Supplier B returned invalid data format: ${parsed.error.message}`);
    }

    const duration = Date.now() - start;
    activityLogger.info(`Successfully fetched ${parsed.data.length} offers from Supplier B (${duration}ms)`);

    // Attach supplier attribution
    return parsed.data.map((hotel) => ({
      ...hotel,
      supplier: 'Supplier B'
    }));
  } catch (error: any) {
    const duration = Date.now() - start;
    const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error';
    activityLogger.warn(`Supplier B request failed after ${duration}ms: ${errorMessage}`);
    throw new Error(`Supplier B request failed: ${errorMessage}`);
  }
}
