import { Router } from 'express';
import { supplierAHandler, supplierBHandler } from '../controllers/supplier.controller';

export const supplierRouter = Router();

// GET /supplierA/hotels
supplierRouter.get('/supplierA/hotels', supplierAHandler);

// GET /supplierB/hotels
supplierRouter.get('/supplierB/hotels', supplierBHandler);
