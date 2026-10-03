import { Router } from 'express';
import { hotelRouter } from './hotel.routes';
import { supplierRouter } from './supplier.routes';
import { healthRouter } from './health.routes';

export const mainRouter = Router();

// Health routes: /health
mainRouter.use(healthRouter);

// Mock supplier routes: /supplierA/hotels, /supplierB/hotels
mainRouter.use(supplierRouter);

// Main Aggregator API routes: /api/hotels
mainRouter.use('/api', hotelRouter);
