import { app } from './app';
import { config } from './config';
import { cacheService } from './services/cache.service';
import { closeTemporalConnection } from './temporal/client';
import { logger } from './services/logger.service';

const serverLogger = logger.forContext('Server');

const server = app.listen(config.port, () => {
  serverLogger.info(`====================================================`);
  serverLogger.info(`🏨 Hotel Offers Aggregator API running on port ${config.port}`);
  serverLogger.info(`🌐 Base URL: http://localhost:${config.port}`);
  serverLogger.info(`🩺 Health:   http://localhost:${config.port}/health`);
  serverLogger.info(`🏨 API:      http://localhost:${config.port}/api/hotels`);
  serverLogger.info(`📦 Supplier A: http://localhost:${config.port}/supplierA/hotels`);
  serverLogger.info(`📦 Supplier B: http://localhost:${config.port}/supplierB/hotels`);
  serverLogger.info(`====================================================`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  serverLogger.info(`Received ${signal}. Gracefully shutting down server...`);
  server.close(async () => {
    try {
      await cacheService.disconnect();
      await closeTemporalConnection();
      serverLogger.info('All connections cleanly closed. Exiting process.');
      process.exit(0);
    } catch (err) {
      serverLogger.error('Error during shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default server;
