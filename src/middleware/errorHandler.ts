import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

const errorLogger = logger.forContext('ErrorHandler');

/**
 * Centralized Express Error Handling Middleware.
 * Catches unhandled errors, translates Temporal & supplier failures,
 * logs detailed diagnostics internally, and ensures no internal stack traces
 * or URLs leak to clients.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorMessage = err?.message || 'Unknown error';
  const errorType = err?.cause?.type || err?.type || '';

  // Check for All Suppliers Failed scenario
  if (
    errorType === 'ALL_SUPPLIERS_FAILED' ||
    errorMessage.includes('ALL_SUPPLIERS_FAILED') ||
    errorMessage.includes('All hotel suppliers are currently unavailable')
  ) {
    errorLogger.warn(`All suppliers failed for request ${req.method} ${req.originalUrl}: ${errorMessage}`);
    res.status(502).json({
      success: false,
      error: 'All hotel suppliers are currently unavailable. Please try again later.',
    });
    return;
  }

  // Check for Temporal service connection issues
  if (
    errorMessage.includes('UNAVAILABLE') ||
    errorMessage.includes('Connection dropped') ||
    errorMessage.includes('Failed to connect') ||
    errorMessage.includes('deadline') ||
    errorMessage.includes('Failed to connect to Temporal')
  ) {
    errorLogger.error(
      `Temporal orchestration service unavailable during ${req.method} ${req.originalUrl}: ${errorMessage}`
    );
    res.status(503).json({
      success: false,
      error: 'Orchestration service (Temporal) is temporarily unavailable. Please start Temporal or run via Docker Compose.',
    });
    return;
  }

  // Default internal server error (clean message, no leaked internals)
  errorLogger.error(`Unhandled error during ${req.method} ${req.originalUrl}: ${errorMessage}`, err);
  res.status(500).json({
    success: false,
    error: 'An internal error occurred while processing the request.',
  });
}
