# Hotel Offers Aggregator API

A backend service built with **Node.js**, **TypeScript**, **Express**, **Temporal.io**, and **Redis** that aggregates hotel inventory across multiple supplier APIs, eliminates duplicates, selects the best rate per property, and provides filtering with Redis caching.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [End-to-End Request Flow](#end-to-end-request-flow)
3. [Core Engineering Decisions](#core-engineering-decisions)
   - [Deduplication & Price Selection](#1-deduplication--price-selection)
   - [Temporal Workflow Orchestration](#2-temporal-workflow-orchestration)
   - [Redis Caching & Offline Resilience](#3-redis-caching--offline-resilience)
   - [Supplier Outage Handling](#4-supplier-outage-handling)
   - [Structured Logging](#5-structured-logging)
4. [Project Structure](#project-structure)
5. [Environment Configuration](#environment-configuration)
6. [Getting Started](#getting-started)
   - [Option A: Running with Docker Compose (Recommended)](#option-a-running-with-docker-compose-recommended)
   - [Option B: Running Locally (Development Mode)](#option-b-running-locally-development-mode)
7. [API Reference & Examples](#api-reference--examples)
8. [Testing & Quality Assurance](#testing--quality-assurance)
9. [Postman Collection](#postman-collection)
10. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## System Architecture

```
                       +-------------------------+
                       |      HTTP Client        |
                       +------------+------------+
                                    |
                                    | GET /api/hotels?city=...&minPrice=...
                                    v
                       +-------------------------+
                       |    Express App Server   |
                       |  - requestLogger        |
                       |  - validation (Zod)     |
                       |  - hotel.controller     |
                       +------------+------------+
                                    |
                                    v
                       +-------------------------+
                       |      HotelService       |
                       +------------+------------+
                                    |
             +----------------------+----------------------+
             | Cache HIT                                   | Cache MISS
             v                                             v
     +---------------+                             +---------------+
     |  Redis Cache  |                             |Temporal Client|
     +---------------+                             +-------+-------+
                                                           |
                                                           v
                                            +-----------------------------+
                                            |  hotelAggregationWorkflow   |
                                            +--------------+--------------+
                                                           |
                                    +----------------------+----------------------+
                                    | (Parallel Execution)                        | (Parallel Execution)
                                    v                                             v
                         +---------------------+                       +---------------------+
                         | Supplier A Activity |                       | Supplier B Activity |
                         +----------+----------+                       +----------+----------+
                                    |                                             |
                                    v                                             v
                         +---------------------+                       +---------------------+
                         | GET /supplierA/...  |                       | GET /supplierB/...  |
                         +----------+----------+                       +----------+----------+
                                    |                                             |
                                    +----------------------+----------------------+
                                                           |
                                                           v
                                            +-----------------------------+
                                            |     aggregation.service     |
                                            |  - Normalize: name::city    |
                                            |  - Pick lowest price        |
                                            |  - Apply city/price filters |
                                            +--------------+--------------+
                                                           |
                                                           v
                                            +-----------------------------+
                                            | Write Result to Redis (TTL) |
                                            +--------------+--------------+
                                                           |
                                                           v
                                            +-----------------------------+
                                            | Clean JSON Response to User |
                                            +-----------------------------+
```

---

## End-to-End Request Flow

Here is what happens when a client calls `GET /api/hotels?city=Kolkata&minPrice=1000`:

1. **Request Reception & Logging** (`src/middleware/requestLogger.ts`)
   The HTTP request hits the Express server. The request logger captures the start time, HTTP method, and requested path.

2. **Parameter Validation** (`src/middleware/validation.ts`)
   The Zod schema validates the query parameters:
   - `city`: optional string, trimmed, non-empty.
   - `minPrice`: optional numeric string; must parse to a non-negative number ($\ge 0$).
   - `maxPrice`: optional numeric string; must be $\ge \text{minPrice}$ if both are present.
   - *If validation fails* (e.g. `minPrice=abc`), the request aborts immediately with a `400 Bad Request` and structured field-level errors.

3. **Cache Lookup** (`src/services/cache.service.ts`)
   `HotelService` builds a deterministic cache key:
   ```
   hotels:cache:city:kolkata:min:1000:max:none
   ```
   It queries Redis via `ioredis`:
   - **Cache HIT**: The cached JSON payload is parsed and returned immediately with HTTP header `X-Cache: HIT`. Response time is typically under 5ms.
   - **Cache MISS**: The request proceeds to workflow execution with `X-Cache: MISS`.

4. **Temporal Workflow Dispatch** (`src/temporal/client.ts`)
   The Express controller does not make outbound supplier HTTP requests directly. Instead, it requests a workflow execution from Temporal:
   ```typescript
   const workflowId = `hotel-aggregation-${Date.now()}-${uuid}`;
   const offers = await client.workflow.execute(hotelAggregationWorkflow, {
     taskQueue: 'hotel-aggregation',
     workflowId,
     args: [filters],
   });
   ```

5. **Parallel Activity Execution** (`src/temporal/workflows/hotelAggregation.workflow.ts`)
   The Temporal worker picks up the workflow task. The workflow uses `Promise.allSettled` to execute both supplier activities in parallel:
   - `fetchSupplierAHotels(city)`
   - `fetchSupplierBHotels(city)`
   
   Each activity runs in its own process/thread with a `5s` timeout and an exponential retry policy (`maximumAttempts: 2`, `initialInterval: 200ms`).

6. **Handling Outages & Validation** (`src/temporal/activities/`)
   - Inside each activity, an HTTP `GET` is issued to the respective supplier endpoint.
   - The response payload is validated against `supplierResponseSchema` using Zod.
   - Provenance is attached (`supplier: 'Supplier A'` or `'Supplier B'`).
   - If one supplier fails (503, timeout, or network blip), `Promise.allSettled` records the rejection while letting the healthy supplier succeed.
   - If **both** suppliers fail, the workflow throws an `ApplicationFailure` with error code `ALL_SUPPLIERS_FAILED`.

7. **Deduplication & Best Price Selection** (`src/services/aggregation.service.ts`)
   All collected offers are passed to pure, deterministic helper functions:
   - **Identity Key Generation**: Each offer is keyed by `clean(name)::clean(city)`.
   - **Conflict Resolution**: If the same key exists in both Supplier A and Supplier B, the system compares prices and retains the lower rate. If prices are identical, higher `commissionPct` acts as a deterministic tie-breaker.
   - **Filtering**: Filters are applied for `city`, `minPrice`, and `maxPrice`.
   - **Sorting**: The final list is sorted by price ascending.

8. **Redis Cache Population** (`src/services/cache.service.ts`)
   The deduplicated array is written to Redis with the configured TTL (default: 60 seconds). Subsequent requests with identical filters will be served from cache.

9. **Response Delivery** (`src/controllers/hotel.controller.ts`)
   Express returns `200 OK` with the unified JSON payload:
   ```json
   {
     "success": true,
     "count": 5,
     "data": [ ... ]
   }
   ```

10. **Error Propagation** (`src/middleware/errorHandler.ts`)
    If an error occurs anywhere upstream, Express invokes the 4-argument error handler (`err, req, res, next`):
    - `ALL_SUPPLIERS_FAILED` maps to **HTTP 502 Bad Gateway**.
    - Temporal connection dropped or deadline exceeded maps to **HTTP 503 Service Unavailable**.
    - Stack traces and internal URLs are logged internally and never exposed to the client.

---

## Core Engineering Decisions

### 1. Deduplication & Price Selection
- **The Problem**: Real-world hotel suppliers use proprietary IDs. Supplier A assigns `A1` and Supplier B assigns `B1` to the exact same physical property (*e.g., Hilton Kolkata*). We cannot deduplicate by `hotelId`.
- **The Solution**: Identity is normalized using lowercase trimmed `name` and `city` with internal whitespace collapsed:
  ```typescript
  export function normalizeHotelKey(name: string, city: string): string {
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanCity = city.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${cleanName}::${cleanCity}`;
  }
  ```
- **Winner Selection**: When matching keys are detected, the offer with `Math.min(offerA.price, offerB.price)` is retained. The winning offer preserves its original `hotelId` and supplier attribution (`supplier: 'Supplier B'`).

### 2. Temporal Workflow Orchestration
- **Workflow Determinism**: The workflow code (`hotelAggregation.workflow.ts`) contains zero direct I/O, no random numbers, and no network calls. It only coordinates activities and executes pure array transformations.
- **Parallel Dispatch**: We use `Promise.allSettled` instead of `Promise.all`. `Promise.all` aborts immediately upon the first rejected promise, which would destroy the result of a healthy supplier if the other one timed out. `Promise.allSettled` guarantees that partial success is preserved.

### 3. Redis Caching & Offline Resilience
- **Deterministic Keys**: Cache keys incorporate every query parameter to prevent cross-filter pollution:
  `hotels:cache:city:<city|all>:min:<minPrice|none>:max:<maxPrice|none>`
- **Fail-Safe Operation**: Redis connection errors must never crash the API. `CacheService` configures `enableOfflineQueue: false` and `maxRetriesPerRequest: 1`. If Redis is offline or drops connection, the service logs a single warning and gracefully falls back to querying the upstream workflow directly.
- **Debounced Logging**: Repeated connection failure events from `ioredis` are debounced so the terminal is not flooded with reconnect attempts.

### 4. Supplier Outage Handling
- **Partial Outage**: If Supplier A is offline and Supplier B is online, the user receives Supplier B's results.
- **Complete Outage**: If both suppliers fail, the API returns:
  ```json
  {
    "success": false,
    "error": "All hotel suppliers are currently unavailable. Please try again later."
  }
  ```
  with an HTTP status code of `502 Bad Gateway`.
- **Testing Outages**: Mock suppliers support four triggers to simulate downtime:
  1. Setting `SUPPLIER_A_FAIL=true` or `SUPPLIER_B_FAIL=true` in `.env`.
  2. Query parameter: `?fail=true` (e.g. `/supplierA/hotels?fail=true`).
  3. Header: `x-fail: true`.
  4. Header: `x-fail-supplier-a: true` or `x-fail-supplier-b: true`.

### 5. Structured Logging
The custom `LoggerService` (`src/services/logger.service.ts`) provides:
- Four log levels: `DEBUG`, `INFO`, `WARN`, `ERROR` controlled via `LOG_LEVEL`.
- Context namespaces (`[HTTP]`, `[HotelService]`, `[SupplierA-Activity]`, `[RedisCache]`, `[ErrorHandler]`).
- ANSI terminal color-coding (Green for `INFO`, Yellow for `WARN`, Red for `ERROR`, Cyan for context).
- Automatic suppression of colors when `NO_COLOR=true` is set.

---

## Project Structure

```
.
├── Dockerfile                                 # Multi-stage production build (Node 20 slim)
├── docker-compose.yml                         # Orchestrates API, Worker, Redis, and Temporal
├── hotel-offers-aggregator.postman_collection.json # Ready-to-import Postman suite
├── jest.config.js                             # TypeScript test configuration
├── package.json                               # Dependencies & scripts
├── tsconfig.json                              # Strict TypeScript settings
├── src/
│   ├── app.ts                                 # Express application assembly
│   ├── server.ts                              # HTTP server boot & shutdown hooks
│   ├── config/
│   │   └── index.ts                           # Typed configuration loaded from environment
│   ├── controllers/
│   │   ├── health.controller.ts               # GET /health
│   │   ├── hotel.controller.ts                # GET /api/hotels
│   │   └── supplier.controller.ts             # Re-exports mock handlers
│   ├── middleware/
│   │   ├── errorHandler.ts                    # Centralized error mapping (502, 503, 500)
│   │   ├── requestLogger.ts                   # Inbound request tracing with latency
│   │   └── validation.ts                      # Zod validation for query parameters
│   ├── routes/
│   │   ├── health.routes.ts                   # /health routing
│   │   ├── hotel.routes.ts                    # /api/hotels routing
│   │   ├── supplier.routes.ts                 # /supplierA and /supplierB routing
│   │   └── index.ts                           # Root router mounting
│   ├── services/
│   │   ├── aggregation.service.ts             # Deduplication, comparison, and filtering
│   │   ├── cache.service.ts                   # Redis wrapper with offline fallback
│   │   ├── hotel.service.ts                   # Orchestrates cache + Temporal workflow
│   │   └── logger.service.ts                  # Structured colored logger
│   ├── suppliers/
│   │   ├── mockData.ts                        # Static seed data with price/overlap variations
│   │   ├── supplierA.ts                       # Mock Supplier A handler
│   │   └── supplierB.ts                       # Mock Supplier B handler
│   ├── temporal/
│   │   ├── client.ts                          # Temporal workflow client connection
│   │   ├── worker.ts                          # Temporal worker process
│   │   ├── activities/
│   │   │   ├── supplierA.activity.ts          # Activity: fetch Supplier A
│   │   │   ├── supplierB.activity.ts          # Activity: fetch Supplier B
│   │   │   └── index.ts                       # Activity barrel export
│   │   └── workflows/
│   │       └── hotelAggregation.workflow.ts   # Parallel orchestration workflow
│   └── types/
│       └── hotel.ts                           # Data contracts & Zod validation schemas
└── tests/
    ├── integration/
    │   └── api.test.ts                        # Supertest endpoint integration tests
    └── unit/
        ├── aggregation.test.ts                # Unit tests for deduplication & filters
        ├── cache.test.ts                      # Unit tests for Redis cache keying & TTL
        ├── hotel.service.test.ts              # Unit tests for cache-aside orchestration
        ├── logger.test.ts                     # Unit tests for logger levels & formatting
        └── workflow.test.ts                   # Unit tests for Temporal workflow & failures
```

---

## Environment Configuration

Copy the template to create your `.env` file:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment (`development` / `production` / `test`) | `development` |
| `REDIS_HOST` | Redis hostname | `localhost` (`redis` in Docker) |
| `REDIS_PORT` | Redis TCP port | `6379` |
| `CACHE_TTL` | Redis cache expiry time in seconds | `60` |
| `TEMPORAL_ADDRESS` | Temporal frontend gRPC address | `localhost:7233` (`temporal:7233` in Docker) |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `TEMPORAL_TASK_QUEUE` | Task queue name for workflow execution | `hotel-aggregation` |
| `SUPPLIER_A_URL` | Supplier A HTTP endpoint | `http://localhost:3000/supplierA/hotels` |
| `SUPPLIER_B_URL` | Supplier B HTTP endpoint | `http://localhost:3000/supplierB/hotels` |
| `SUPPLIER_A_FAIL` | Force Supplier A failure (`true` / `false`) | `false` |
| `SUPPLIER_B_FAIL` | Force Supplier B failure (`true` / `false`) | `false` |
| `LOG_LEVEL` | Minimum log level (`DEBUG`, `INFO`, `WARN`, `ERROR`) | `INFO` |

---

## Getting Started

### Option A: Running with Docker Compose (Recommended)

Docker Compose starts all four required services in isolated containers:
1. **API Server**: Express app on port `3000`.
2. **Temporal Worker**: Dedicated process executing workflows and activities.
3. **Temporal Server**: Complete Temporal dev server with Web UI on port `8233`.
4. **Redis**: Cache instance on port `6379`.

```bash
# 1. Ensure Docker Desktop is running
# 2. Build and start all services
docker compose up --build
```

Access the services:
- **API**: `http://localhost:3000/api/hotels`
- **Health**: `http://localhost:3000/health`
- **Temporal Web UI**: `http://localhost:8233` (view workflow executions live)

To stop the containers:
```bash
docker compose down
```

---

### Option B: Running Locally (Development Mode)

If you are developing locally without Docker:

```bash
# 1. Install dependencies
npm install

# 2. Start the Express API server with auto-reload
npm run dev
# (The API will run on http://localhost:3000)

# 3. In a separate terminal, start the Temporal Worker (if local Temporal is available)
npm run dev:worker

# 4. Build for production
npm run build

# 5. Run compiled production bundle
npm start
```

> **Note on Local Development**: If you run `npm run dev` while Docker/Temporal is offline, `HotelService` detects the missing cluster, logs an informative warning, and automatically engages a local parallel aggregation fallback so you can continue testing endpoints immediately.

---

## API Reference & Examples

### 1. Health Check
`GET /health`

Returns operational status for the service and its downstream dependencies.

```bash
curl -i http://localhost:3000/health
```

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "timestamp": "2026-10-03T12:00:00.000Z",
  "services": {
    "api": "healthy",
    "redis": "connected",
    "temporal": "connected",
    "supplierA": "healthy",
    "supplierB": "healthy"
  }
}
```

---

### 2. Get Aggregated Hotel Offers
`GET /api/hotels`

Fetches offers from both suppliers in parallel, deduplicates by hotel name and city, selects the lowest price, and returns the result sorted by price ascending.

```bash
curl -i http://localhost:3000/api/hotels
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "count": 11,
  "data": [
    {
      "hotelId": "A8",
      "name": "ITC Sonar",
      "price": 900,
      "city": "Kolkata",
      "commissionPct": 8,
      "supplier": "Supplier A"
    },
    {
      "hotelId": "B4",
      "name": "Novotel",
      "price": 1100,
      "city": "Kolkata",
      "commissionPct": 9,
      "supplier": "Supplier B"
    },
    {
      "hotelId": "B1",
      "name": "Hilton",
      "price": 1300,
      "city": "Kolkata",
      "commissionPct": 8,
      "supplier": "Supplier B"
    },
    {
      "hotelId": "A2",
      "name": "Radisson Blu",
      "price": 2200,
      "city": "Kolkata",
      "commissionPct": 12,
      "supplier": "Supplier A"
    }
  ]
}
```
*(Notice that Hilton was present in both Supplier A at 1500 and Supplier B at 1300; Supplier B won with the lower rate).*

---

### 3. Filter by City
`GET /api/hotels?city=Kolkata`

```bash
curl -i "http://localhost:3000/api/hotels?city=Kolkata"
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "count": 5,
  "data": [
    { "hotelId": "A8", "name": "ITC Sonar", "price": 900, "city": "Kolkata", "commissionPct": 8, "supplier": "Supplier A" },
    { "hotelId": "B4", "name": "Novotel", "price": 1100, "city": "Kolkata", "commissionPct": 9, "supplier": "Supplier B" },
    { "hotelId": "B1", "name": "Hilton", "price": 1300, "city": "Kolkata", "commissionPct": 8, "supplier": "Supplier B" },
    { "hotelId": "A2", "name": "Radisson Blu", "price": 2200, "city": "Kolkata", "commissionPct": 12, "supplier": "Supplier A" },
    { "hotelId": "B3", "name": "The Oberoi Grand", "price": 3100, "city": "Kolkata", "commissionPct": 13, "supplier": "Supplier B" }
  ]
}
```

---

### 4. Filter by City and Minimum Price
`GET /api/hotels?city=Kolkata&minPrice=2000`

```bash
curl -i "http://localhost:3000/api/hotels?city=Kolkata&minPrice=2000"
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    { "hotelId": "A2", "name": "Radisson Blu", "price": 2200, "city": "Kolkata", "commissionPct": 12, "supplier": "Supplier A" },
    { "hotelId": "B3", "name": "The Oberoi Grand", "price": 3100, "city": "Kolkata", "commissionPct": 13, "supplier": "Supplier B" }
  ]
}
```

---

### 5. Filter by Price Range
`GET /api/hotels?city=Delhi&minPrice=2000&maxPrice=4000`

```bash
curl -i "http://localhost:3000/api/hotels?city=Delhi&minPrice=2000&maxPrice=4000"
```

---

### 6. Parameter Validation Error Handling
`GET /api/hotels?minPrice=abc`

```bash
curl -i "http://localhost:3000/api/hotels?minPrice=abc"
```

**Response (`400 Bad Request`):**
```json
{
  "success": false,
  "error": "Invalid minPrice query parameter. Must be a non-negative number.",
  "details": [
    {
      "path": "minPrice",
      "message": "Invalid minPrice query parameter. Must be a non-negative number."
    }
  ]
}
```

---

### 7. Mock Supplier Endpoints
- Direct Supplier A data: `GET /supplierA/hotels`
- Direct Supplier B data: `GET /supplierB/hotels`
- Simulate Supplier A crash: `GET /supplierA/hotels?fail=true` (Returns `503 Service Unavailable`)

---

## Testing & Quality Assurance

The test suite contains **38 automated tests** across 6 test suites covering every requirement:

```bash
# Run all unit and integration tests
npm test

# Run tests with code coverage report
npm run test:coverage

# Perform static type checking without building
npm run typecheck
```

### Coverage Highlights
- **`aggregation.test.ts`**: Identity normalization, deduplication, lowest price selection, tie-breaker handling, city filtering, and price range filtering.
- **`cache.test.ts`**: Collision-free key generation, cache hits, cache misses, key deletions, and graceful fallback when Redis fails.
- **`hotel.service.test.ts`**: Cache-aside flow, Temporal workflow execution, cache writing, and cache hit bypassing.
- **`workflow.test.ts`**: Parallel activity execution, single supplier failure survival, and dual supplier failure rejection.
- **`api.test.ts`**: Express routes, health check responses, 400 validation error responses, 404 responses, and 502 error masking.
- **`logger.test.ts`**: Log level filtering, colored ANSI output, context tagging, and error formatting.

---

## Postman Collection

The file [`hotel-offers-aggregator.postman_collection.json`](./hotel-offers-aggregator.postman_collection.json) is ready to import into Postman:

1. Open Postman $\rightarrow$ Click **Import**.
2. Select `hotel-offers-aggregator.postman_collection.json`.
3. The collection is pre-configured with variable `baseUrl = http://localhost:3000`.
4. The collection contains 10 organized requests:
   - `1. Health Check`
   - `2. Get All Hotels`
   - `3. Get Hotels Filtered by City (Kolkata)`
   - `4. Get Hotels by City and minPrice`
   - `5. Get Hotels with Price Range`
   - `6. Mock Supplier A - Raw Hotels`
   - `7. Mock Supplier B - Raw Hotels`
   - `8. Supplier A Failure Simulation`
   - `9. Validation Error (minPrice=abc)`
   - `10. City with No Results`

---

## Troubleshooting & FAQ

### 1. `Error: listen EADDRINUSE: address already in use :::3000`
**Cause**: Another instance of the server (or another service) is already running on port 3000.  
**Fix**:
- On Windows PowerShell:
  ```powershell
  Get-Process -Name node | Stop-Process -Force
  ```
- Or change `PORT=3001` in your `.env` file.

### 2. `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`
**Cause**: The Docker CLI cannot communicate with the Docker daemon because the Docker Desktop application is closed.  
**Fix**: Open **Docker Desktop** from your Windows Start Menu. Wait ~30 seconds until the whale icon in the taskbar turns solid green ("Docker Desktop is running"). Then re-run `docker compose up --build`.

### 3. `Failed to connect before the deadline`
**Cause**: The Express API tried to contact the Temporal server at `localhost:7233`, but Temporal was not running on that port.  
**Fix**:
- Start the full stack with `docker compose up --build`, or
- If developing locally, ensure you pull the latest code: `hotel.service.ts` will automatically engage its development fallback mode when Temporal is offline.

---

## Assumptions

1. **Hotel Identity**: Supplier APIs assign independent IDs (`A1` vs `B1`). Entity resolution is established by composite normalization on `name + city` (`clean(name)::clean(city)`).
2. **Pricing Rules**: The lowest available base price wins. In the event of identical pricing, higher `commissionPct` wins as a deterministic tie-breaker.
3. **Partial Availability**: If at least one supplier responds, the service delivers available inventory rather than failing the user. A `502 Bad Gateway` is only returned when all suppliers fail.
4. **Cache Scope**: Cache keys are formed strictly per distinct filter permutation to prevent cache bleeding across different user queries.
