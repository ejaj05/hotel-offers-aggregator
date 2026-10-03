import { Request, Response } from 'express';
import { mockSupplierAHotels } from './mockData';
import { config } from '../config';
import { logger } from '../services/logger.service';

const mockLogger = logger.forContext('MockSupplierA');

/**
 * Express handler for mock Supplier A API: GET /supplierA/hotels
 * Simulates failure if:
 * - Environment variable SUPPLIER_A_FAIL === 'true'
 * - Query parameter ?fail=true
 * - Header x-fail: true
 */
export const supplierAHandler = (req: Request, res: Response) => {
  const shouldFail =
    config.suppliers.supplierA.fail ||
    req.query.fail === 'true' ||
    req.headers['x-fail'] === 'true' ||
    req.headers['x-fail-supplier-a'] === 'true';

  if (shouldFail) {
    mockLogger.warn('Simulating outage for Supplier A (returning 503)');
    return res.status(503).json({
      error: 'Supplier A is currently experiencing high load or is temporarily unavailable'
    });
  }

  const { city } = req.query;
  let hotels = [...mockSupplierAHotels];

  if (typeof city === 'string' && city.trim() !== '') {
    hotels = hotels.filter((h) => h.city.toLowerCase() === city.trim().toLowerCase());
  }

  return res.status(200).json(hotels);
};
