import { Request, Response, NextFunction } from 'express';
import { queryParamsSchema, HotelFilterParams } from '../types/hotel';

// Extend Express Request interface to hold validated query parameters
declare global {
  namespace Express {
    interface Request {
      validatedFilters?: HotelFilterParams;
    }
  }
}

/**
 * Middleware to validate query parameters for GET /api/hotels
 * Returns HTTP 400 with descriptive error message if invalid.
 */
export function validateHotelQueryParams(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = queryParamsSchema.safeParse(req.query);

  if (!result.success) {
    const primaryError = result.error.errors[0]?.message || 'Invalid query parameters';
    res.status(400).json({
      success: false,
      error: primaryError,
      details: result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  req.validatedFilters = result.data;
  next();
}
