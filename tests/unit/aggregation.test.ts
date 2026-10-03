import {
  deduplicateOffers,
  filterOffers,
  aggregateAndFilterHotels,
  normalizeHotelKey,
} from '../../src/services/aggregation.service';
import { SupplierHotelOffer } from '../../src/types/hotel';

describe('Aggregation & Deduplication Service', () => {
  const sampleOffers: SupplierHotelOffer[] = [
    {
      hotelId: 'A1',
      name: 'Hilton',
      price: 1500,
      city: 'Kolkata',
      commissionPct: 10,
      supplier: 'Supplier A',
    },
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
    {
      hotelId: 'B2',
      name: 'Radisson Blu',
      price: 2400,
      city: 'Kolkata',
      commissionPct: 11,
      supplier: 'Supplier B',
    },
    {
      hotelId: 'A3',
      name: 'JW Marriott',
      price: 3000,
      city: 'Delhi',
      commissionPct: 14,
      supplier: 'Supplier A',
    },
    {
      hotelId: 'B4',
      name: 'Novotel',
      price: 900,
      city: 'Kolkata',
      commissionPct: 9,
      supplier: 'Supplier B',
    },
  ];

  describe('normalizeHotelKey', () => {
    it('normalizes names and cities with case-insensitivity and whitespace trimming', () => {
      expect(normalizeHotelKey(' Hilton ', ' Kolkata ')).toBe('hilton::kolkata');
      expect(normalizeHotelKey('HILTON', 'kolkata')).toBe('hilton::kolkata');
      expect(normalizeHotelKey('Radisson  Blu', 'Delhi')).toBe('radisson blu::delhi');
    });
  });

  describe('deduplicateOffers & Lowest Price Selection', () => {
    it('deduplicates hotels appearing across suppliers and chooses the lowest price', () => {
      const result = deduplicateOffers(sampleOffers);

      // Total distinct hotels: Hilton, Radisson Blu, JW Marriott, Novotel = 4
      expect(result).toHaveLength(4);

      // Hilton: Supplier B (1300) should beat Supplier A (1500)
      const hilton = result.find((h) => h.name.toLowerCase() === 'hilton');
      expect(hilton).toBeDefined();
      expect(hilton?.price).toBe(1300);
      expect(hilton?.supplier).toBe('Supplier B');
      expect(hilton?.hotelId).toBe('B1');

      // Radisson Blu: Supplier A (2200) should beat Supplier B (2400)
      const radisson = result.find((h) => h.name.toLowerCase().includes('radisson'));
      expect(radisson).toBeDefined();
      expect(radisson?.price).toBe(2200);
      expect(radisson?.supplier).toBe('Supplier A');
      expect(radisson?.hotelId).toBe('A2');

      // Non-duplicated hotels are preserved
      const novotel = result.find((h) => h.name === 'Novotel');
      expect(novotel).toBeDefined();
      expect(novotel?.price).toBe(900);
    });

    it('handles identical prices deterministically using commission or supplier tie-breaker', () => {
      const identicalOffers: SupplierHotelOffer[] = [
        {
          hotelId: 'A1',
          name: 'Taj Palace',
          price: 4000,
          city: 'Delhi',
          commissionPct: 15,
          supplier: 'Supplier A',
        },
        {
          hotelId: 'B1',
          name: 'Taj Palace',
          price: 4000,
          city: 'Delhi',
          commissionPct: 20, // Higher commission
          supplier: 'Supplier B',
        },
      ];

      const result = deduplicateOffers(identicalOffers);
      expect(result).toHaveLength(1);
      expect(result[0].price).toBe(4000);
      expect(result[0].supplier).toBe('Supplier B');
    });
  });

  describe('filterOffers', () => {
    it('filters correctly by city (case-insensitive)', () => {
      const deduplicated = deduplicateOffers(sampleOffers);
      const kolkataHotels = filterOffers(deduplicated, { city: 'kolkata' });

      expect(kolkataHotels.length).toBeGreaterThan(0);
      expect(kolkataHotels.every((h) => h.city.toLowerCase() === 'kolkata')).toBe(true);
    });

    it('filters correctly by minPrice', () => {
      const deduplicated = deduplicateOffers(sampleOffers);
      const minPriceHotels = filterOffers(deduplicated, { minPrice: 1500 });

      expect(minPriceHotels.every((h) => h.price >= 1500)).toBe(true);
      // Novotel (900) and Hilton (1300) must be filtered out
      expect(minPriceHotels.some((h) => h.name === 'Novotel')).toBe(false);
      expect(minPriceHotels.some((h) => h.name === 'Hilton')).toBe(false);
    });

    it('filters correctly by both city and minPrice', () => {
      const result = aggregateAndFilterHotels(sampleOffers, {
        city: 'Kolkata',
        minPrice: 2000,
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Radisson Blu');
      expect(result[0].price).toBe(2200);
    });

    it('filters correctly with price range minPrice and maxPrice', () => {
      const result = aggregateAndFilterHotels(sampleOffers, {
        minPrice: 1000,
        maxPrice: 2000,
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Hilton');
      expect(result[0].price).toBe(1300);
    });

    it('returns empty array when no hotels match filter criteria', () => {
      const result = aggregateAndFilterHotels(sampleOffers, {
        city: 'Tokyo',
      });
      expect(result).toEqual([]);
    });
  });
});
