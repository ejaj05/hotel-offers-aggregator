import { Request, Response, NextFunction } from 'express';
import { hotelService } from '../services/hotel.service';
import { HotelFilterParams } from '../types/hotel';

/**
 * Controller for GET /api/hotels
 */
export async function getHotelsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filters: HotelFilterParams = req.validatedFilters || {};
    const { offers, cached } = await hotelService.getHotels(filters);

    res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    next(error);
  }
}
