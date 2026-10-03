import { SupplierHotelOffer } from '../../src/types/hotel';

// Mock proxies for activities
const mockFetchSupplierAHotels = jest.fn();
const mockFetchSupplierBHotels = jest.fn();

jest.mock('@temporalio/workflow', () => {
  class MockApplicationFailure extends Error {
    public type?: string;
    public nonRetryable?: boolean;
    constructor(message: string, type?: string, nonRetryable = true) {
      super(message);
      this.name = 'ApplicationFailure';
      this.type = type;
      this.nonRetryable = nonRetryable;
    }
    static nonRetryable(message: string, type?: string) {
      return new MockApplicationFailure(message, type, true);
    }
  }

  return {
    proxyActivities: jest.fn(() => ({
      fetchSupplierAHotels: mockFetchSupplierAHotels,
      fetchSupplierBHotels: mockFetchSupplierBHotels,
    })),
    ApplicationFailure: MockApplicationFailure,
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
});

// Import workflow after mock setup
import { hotelAggregationWorkflow } from '../../src/temporal/workflows/hotelAggregation.workflow';

describe('Temporal Workflow: hotelAggregationWorkflow', () => {
  const supplierAData: SupplierHotelOffer[] = [
    {
      hotelId: 'A1',
      name: 'Hilton',
      price: 1500,
      city: 'Kolkata',
      commissionPct: 10,
      supplier: 'Supplier A',
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

  const supplierBData: SupplierHotelOffer[] = [
    {
      hotelId: 'B1',
      name: 'Hilton',
      price: 1300,
      city: 'Kolkata',
      commissionPct: 8,
      supplier: 'Supplier B',
    },
    {
      hotelId: 'B2',
      name: 'Novotel',
      price: 1100,
      city: 'Kolkata',
      commissionPct: 9,
      supplier: 'Supplier B',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Requirement 1 & 2: Fetches and aggregates from both suppliers in parallel through Temporal activities', async () => {
    mockFetchSupplierAHotels.mockResolvedValueOnce(supplierAData);
    mockFetchSupplierBHotels.mockResolvedValueOnce(supplierBData);

    const result = await hotelAggregationWorkflow({ city: 'Kolkata' });

    expect(mockFetchSupplierAHotels).toHaveBeenCalledWith('Kolkata');
    expect(mockFetchSupplierBHotels).toHaveBeenCalledWith('Kolkata');

    // Total distinct: Hilton, Radisson Blu, Novotel = 3
    expect(result).toHaveLength(3);

    // Hilton lowest price: 1300 from Supplier B
    const hilton = result.find((h) => h.name === 'Hilton');
    expect(hilton?.price).toBe(1300);
    expect(hilton?.supplier).toBe('Supplier B');
  });

  it('Requirement 7: Gracefully handles Supplier A failure when Supplier B succeeds', async () => {
    mockFetchSupplierAHotels.mockRejectedValueOnce(new Error('Supplier A timeout / 503'));
    mockFetchSupplierBHotels.mockResolvedValueOnce(supplierBData);

    const result = await hotelAggregationWorkflow({ city: 'Kolkata' });

    expect(result).toHaveLength(2);
    expect(result.every((h) => h.supplier === 'Supplier B')).toBe(true);
    expect(result.find((h) => h.name === 'Hilton')?.price).toBe(1300);
    expect(result.find((h) => h.name === 'Novotel')?.price).toBe(1100);
  });

  it('Requirement 8: Gracefully handles Supplier B failure when Supplier A succeeds', async () => {
    mockFetchSupplierAHotels.mockResolvedValueOnce(supplierAData);
    mockFetchSupplierBHotels.mockRejectedValueOnce(new Error('Supplier B network error'));

    const result = await hotelAggregationWorkflow({ city: 'Kolkata' });

    expect(result).toHaveLength(2);
    expect(result.every((h) => h.supplier === 'Supplier A')).toBe(true);
    expect(result.find((h) => h.name === 'Hilton')?.price).toBe(1500);
    expect(result.find((h) => h.name === 'Radisson Blu')?.price).toBe(2200);
  });

  it('Requirement 9: Throws ALL_SUPPLIERS_FAILED when both suppliers fail', async () => {
    mockFetchSupplierAHotels.mockRejectedValueOnce(new Error('Supplier A 503'));
    mockFetchSupplierBHotels.mockRejectedValueOnce(new Error('Supplier B 503'));

    await expect(hotelAggregationWorkflow({ city: 'Kolkata' })).rejects.toThrow(
      'All hotel suppliers are currently unavailable'
    );
  });

  it('Requirement 5 & 6: Applies city and minPrice filtering inside workflow', async () => {
    mockFetchSupplierAHotels.mockResolvedValueOnce(supplierAData);
    mockFetchSupplierBHotels.mockResolvedValueOnce(supplierBData);

    const result = await hotelAggregationWorkflow({ city: 'Kolkata', minPrice: 1400 });

    // Only Radisson Blu (2200) qualifies (Hilton 1300 and Novotel 1100 are < 1400)
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Radisson Blu');
    expect(result[0].price).toBe(2200);
  });
});
