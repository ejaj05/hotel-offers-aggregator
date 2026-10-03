import { Router } from 'express';
import { getHotelsController } from '../controllers/hotel.controller';
import { validateHotelQueryParams } from '../middleware/validation';

export const hotelRouter = Router();

// GET /api/hotels (supports optional ?city=...&minPrice=...&maxPrice=...)
hotelRouter.get('/hotels', validateHotelQueryParams, getHotelsController);
