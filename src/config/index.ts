import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    cacheTtl: parseInt(process.env.CACHE_TTL || '60', 10),
  },

  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'hotel-aggregation',
  },

  suppliers: {
    supplierA: {
      name: 'Supplier A',
      url: process.env.SUPPLIER_A_URL || 'http://localhost:3000/supplierA/hotels',
      fail: process.env.SUPPLIER_A_FAIL === 'true',
    },
    supplierB: {
      name: 'Supplier B',
      url: process.env.SUPPLIER_B_URL || 'http://localhost:3000/supplierB/hotels',
      fail: process.env.SUPPLIER_B_FAIL === 'true',
    },
  },
};
