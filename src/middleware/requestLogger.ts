import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

const httpLogger = logger.forContext('HTTP');

/**
 * Express middleware to log incoming HTTP requests and their completion status/latency.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  // Intercept response finish event to calculate elapsed time and status
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const cacheHeader = res.getHeader('X-Cache');
    const cacheTag = cacheHeader ? ` [Cache: ${cacheHeader}]` : '';

    const logMeta = {
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      cache: cacheHeader,
    };

    if (statusCode >= 500) {
      httpLogger.error(`${method} ${originalUrl} -> ${statusCode} (${duration}ms)${cacheTag}`, undefined, logMeta);
    } else if (statusCode >= 400) {
      httpLogger.warn(`${method} ${originalUrl} -> ${statusCode} (${duration}ms)${cacheTag}`, logMeta);
    } else {
      httpLogger.info(`${method} ${originalUrl} -> ${statusCode} (${duration}ms)${cacheTag}`, logMeta);
    }
  });

  next();
}
