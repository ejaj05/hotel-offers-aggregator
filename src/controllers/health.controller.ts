import { Request, Response } from 'express';
import { cacheService } from '../services/cache.service';
import { isTemporalHealthy } from '../temporal/client';
import { config } from '../config';

/**
 * Controller for GET /health
 * Returns overall system health and status of dependencies (Redis, Temporal, Suppliers).
 */
export async function healthCheckController(_req: Request, res: Response): Promise<void> {
  const [redisHealthy, temporalHealthy] = await Promise.all([
    cacheService.isHealthy(),
    isTemporalHealthy(),
  ]);

  const supplierAStatus = config.suppliers.supplierA.fail ? 'failing' : 'healthy';
  const supplierBStatus = config.suppliers.supplierB.fail ? 'failing' : 'healthy';

  const overallStatus = 'ok';

  res.status(200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      api: 'healthy',
      redis: redisHealthy ? 'connected' : 'disconnected',
      temporal: temporalHealthy ? 'connected' : 'disconnected',
      supplierA: supplierAStatus,
      supplierB: supplierBStatus,
    },
  });
}
