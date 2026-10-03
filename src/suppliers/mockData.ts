import { SupplierHotelOffer } from '../types/hotel';

/**
 * Mock data for Supplier A
 * Contains hotels across Kolkata, Delhi, and Mumbai.
 * Some hotels overlap with Supplier B with different prices to test deduplication and lowest-price selection.
 */
export const mockSupplierAHotels: SupplierHotelOffer[] = [
  {
    hotelId: 'A1',
    name: 'Hilton',
    price: 1500,
    city: 'Kolkata',
    commissionPct: 10,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A2',
    name: 'Radisson Blu',
    price: 2200,
    city: 'Kolkata',
    commissionPct: 12,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A3',
    name: 'The Oberoi Grand',
    price: 3500,
    city: 'Kolkata',
    commissionPct: 15,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A4',
    name: 'JW Marriott',
    price: 2800,
    city: 'Delhi',
    commissionPct: 14,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A5',
    name: 'Taj Palace',
    price: 4200,
    city: 'Delhi',
    commissionPct: 18,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A6',
    name: 'Hyatt Regency',
    price: 1900,
    city: 'Delhi',
    commissionPct: 11,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A7',
    name: 'The Lalit',
    price: 1600,
    city: 'Mumbai',
    commissionPct: 10,
    supplier: 'Supplier A'
  },
  {
    hotelId: 'A8',
    name: 'ITC Sonar',
    price: 900,
    city: 'Kolkata',
    commissionPct: 8,
    supplier: 'Supplier A'
  }
];

/**
 * Mock data for Supplier B
 * Contains hotels across Kolkata, Delhi, and Mumbai.
 * Overlaps with Supplier A:
 * - Hilton: Supplier B is CHEAPER (1300 vs 1500 in A) -> B should win
 * - Radisson Blu: Supplier A is CHEAPER (2200 vs 2400 in B) -> A should win
 * - The Oberoi Grand: Supplier B is CHEAPER (3100 vs 3500 in A) -> B should win
 * - JW Marriott: Supplier B is CHEAPER (2600 vs 2800 in A) -> B should win
 * - Taj Palace: Same price (4200 vs 4200) -> either can win deterministically
 * - Unique to B: Novotel (Kolkata), Leela Palace (Delhi), Trident (Mumbai)
 */
export const mockSupplierBHotels: SupplierHotelOffer[] = [
  {
    hotelId: 'B1',
    name: 'Hilton',
    price: 1300,
    city: 'Kolkata',
    commissionPct: 8,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B2',
    name: 'Radisson Blu',
    price: 2400,
    city: 'Kolkata',
    commissionPct: 11,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B3',
    name: 'The Oberoi Grand',
    price: 3100,
    city: 'Kolkata',
    commissionPct: 13,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B4',
    name: 'Novotel',
    price: 1100,
    city: 'Kolkata',
    commissionPct: 9,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B5',
    name: 'JW Marriott',
    price: 2600,
    city: 'Delhi',
    commissionPct: 12,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B6',
    name: 'Taj Palace',
    price: 4200,
    city: 'Delhi',
    commissionPct: 16,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B7',
    name: 'The Leela Palace',
    price: 4800,
    city: 'Delhi',
    commissionPct: 20,
    supplier: 'Supplier B'
  },
  {
    hotelId: 'B8',
    name: 'Trident Nariman Point',
    price: 2500,
    city: 'Mumbai',
    commissionPct: 15,
    supplier: 'Supplier B'
  }
];
