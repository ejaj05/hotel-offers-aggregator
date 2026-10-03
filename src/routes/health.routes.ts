import { Router } from 'express';
import { healthCheckController } from '../controllers/health.controller';

export const healthRouter = Router();

// GET /health
healthRouter.get('/health', healthCheckController);
