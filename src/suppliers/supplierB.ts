import { Request, Response } from 'express';
import { mockSupplierBHotels } from './mockData';
import { config } from '../config';
import { logger } from '../services/logger.service';

const mockLogger = logger.forContext('MockSupplierB');

/**
 * Express handler for mock Supplier B API: GET /supplierB/hotels
 * Simulates failure if:
 * - Environment variable SUPPLIER_B_FAIL === 'true'
 * - Query parameter ?fail=true
 * - Header x-fail: true
 */
export const supplierBHandler = (req: Request, res: Response) => {
  const shouldFail =
    config.suppliers.supplierB.fail ||
    req.query.fail === 'true' ||
    req.headers['x-fail'] === 'true' ||
    req.headers['x-fail-supplier-b'] === 'true';

  if (shouldFail) {
    mockLogger.warn('Simulating outage for Supplier B (returning 503)');
    return res.status(503).json({
      error: 'Supplier B is currently experiencing high load or is temporarily unavailable'
    });
  }

  const { city } = req.query;
  let hotels = [...mockSupplierBHotels];

  if (typeof city === 'string' && city.trim() !== '') {
    hotels = hotels.filter((h) => h.city.toLowerCase() === city.trim().toLowerCase());
  }

  return res.status(200).json(hotels);
};
