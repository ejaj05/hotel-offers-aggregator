import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config } from '../config';
import { logger } from '../services/logger.service';

const workerLogger = logger.forContext('TemporalWorker');

export async function runWorker(): Promise<void> {
  workerLogger.info(`Connecting to Temporal server at ${config.temporal.address}...`);

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath: require.resolve('./workflows/hotelAggregation.workflow'),
    activities,
  });

  workerLogger.info(`Worker listening on task queue: "${config.temporal.taskQueue}"`);

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    workerLogger.info(`Received ${signal}, shutting down Temporal worker...`);
    worker.shutdown();
    await connection.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await worker.run();
}

// If executed directly
if (require.main === module) {
  runWorker().catch((err) => {
    workerLogger.error('Temporal Worker failed to start:', err);
    process.exit(1);
  });
}
