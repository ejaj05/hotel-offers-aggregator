import express, { Request, Response } from 'express';
import cors from 'cors';
import { mainRouter } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export function createApp(): express.Application {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Application routes
  app.use(mainRouter);

  // 404 handler for unmatched routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Resource not found',
    });
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
