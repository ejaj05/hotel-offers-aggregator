import request from 'supertest';
import { app } from '../../src/app';
import { hotelService } from '../../src/services/hotel.service';
import { AggregatedHotelOffer } from '../../src/types/hotel';

describe('Express API Integration Tests', () => {
  describe('GET /health', () => {
    it('Requirement 10: Returns 200 OK with health status and service availability', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('services');
      expect(res.body.services).toHaveProperty('api', 'healthy');
      expect(res.body.services).toHaveProperty('supplierA');
      expect(res.body.services).toHaveProperty('supplierB');
    });
  });

  describe('Mock Supplier Endpoints', () => {
    it('GET /supplierA/hotels returns Supplier A hotel offers', async () => {
      const res = await request(app).get('/supplierA/hotels');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('hotelId');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('price');
      expect(res.body[0]).toHaveProperty('city');
    });

    it('GET /supplierB/hotels returns Supplier B hotel offers', async () => {
      const res = await request(app).get('/supplierB/hotels');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('hotelId');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('price');
      expect(res.body[0]).toHaveProperty('city');
    });

    it('Simulates Supplier A failure via ?fail=true query parameter', async () => {
      const res = await request(app).get('/supplierA/hotels?fail=true');
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('error');
    });

    it('Simulates Supplier B failure via x-fail header', async () => {
      const res = await request(app)
        .get('/supplierB/hotels')
        .set('x-fail', 'true');
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/hotels - Parameter Validation', () => {
    it('Requirement 11: Rejects non-numeric minPrice with HTTP 400', async () => {
      const res = await request(app).get('/api/hotels?minPrice=abc');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid minPrice query parameter');
    });

    it('Rejects negative minPrice with HTTP 400', async () => {
      const res = await request(app).get('/api/hotels?minPrice=-500');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid minPrice query parameter');
    });

    it('Rejects maxPrice lower than minPrice with HTTP 400', async () => {
      const res = await request(app).get('/api/hotels?minPrice=3000&maxPrice=1000');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('maxPrice cannot be less than minPrice');
    });

    it('Rejects empty city string with HTTP 400', async () => {
      const res = await request(app).get('/api/hotels?city=');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/hotels - Aggregation and Caching Integration', () => {
    const mockOffers: AggregatedHotelOffer[] = [
      {
        hotelId: 'B1',
        name: 'Hilton',
        price: 1300,
        city: 'Kolkata',
        commissionPct: 8,
        supplier: 'Supplier B',
      },
      {
        hotelId: 'A2',
        name: 'Radisson Blu',
        price: 2200,
        city: 'Kolkata',
        commissionPct: 12,
        supplier: 'Supplier A',
      },
    ];

    it('Returns clean JSON response format with count, data, and X-Cache header on cache miss', async () => {
      jest.spyOn(hotelService, 'getHotels').mockResolvedValueOnce({
        offers: mockOffers,
        cached: false,
      });

      const res = await request(app).get('/api/hotels?city=Kolkata');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body).toEqual({
        success: true,
        count: 2,
        data: mockOffers,
      });
    });

    it('Returns X-Cache HIT when served from Redis cache', async () => {
      jest.spyOn(hotelService, 'getHotels').mockResolvedValueOnce({
        offers: mockOffers,
        cached: true,
      });

      const res = await request(app).get('/api/hotels?city=Kolkata');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('Requirement 8: Returns HTTP 502 Bad Gateway when all suppliers fail', async () => {
      jest.spyOn(hotelService, 'getHotels').mockRejectedValueOnce({
        message: 'All hotel suppliers are currently unavailable',
        cause: { type: 'ALL_SUPPLIERS_FAILED' },
      });

      const res = await request(app).get('/api/hotels');
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('All hotel suppliers are currently unavailable');
      // Verify no stack trace or sensitive info is leaked
      expect(res.body.stack).toBeUndefined();
    });
  });

  describe('404 Route Not Found', () => {
    it('Returns clean JSON 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown-endpoint');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        error: 'Resource not found',
      });
    });
  });
});
