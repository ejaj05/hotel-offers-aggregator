import { Connection, Client } from '@temporalio/client';
import { config } from '../config';

let clientInstance: Client | null = null;
let connectionInstance: Connection | null = null;

/**
 * Retrieves or establishes the Temporal Workflow Client
 */
export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  connectionInstance = await Connection.connect({
    address: config.temporal.address,
    connectTimeout: '3 seconds',
  });

  clientInstance = new Client({
    connection: connectionInstance,
    namespace: config.temporal.namespace,
  });

  return clientInstance;
}

/**
 * Health check for Temporal connection
 */
export async function isTemporalHealthy(): Promise<boolean> {
  try {
    const checkPromise = (async () => {
      const client = await getTemporalClient();
      await client.workflowService.getSystemInfo({});
      return true;
    })();

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 500);
    });

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error) {
    return false;
  }
}

/**
 * Closes the Temporal connection
 */
export async function closeTemporalConnection(): Promise<void> {
  if (connectionInstance) {
    await connectionInstance.close();
    connectionInstance = null;
    clientInstance = null;
  }
}
