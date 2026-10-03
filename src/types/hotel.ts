import { z } from 'zod';

export interface SupplierHotelOffer {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
  supplier?: string;
}

export interface AggregatedHotelOffer {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
  supplier: string;
}

export interface HotelFilterParams {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  count?: number;
  data?: T;
  error?: string;
}

// Zod schemas for validation
export const hotelOfferSchema = z.object({
  hotelId: z.string().min(1, 'hotelId is required'),
  name: z.string().min(1, 'name is required'),
  price: z.number().positive('price must be positive'),
  city: z.string().min(1, 'city is required'),
  commissionPct: z.number().min(0).max(100, 'commissionPct must be between 0 and 100')
});

export const supplierResponseSchema = z.array(hotelOfferSchema);

export const queryParamsSchema = z.object({
  city: z
    .string()
    .trim()
    .min(1, 'city parameter cannot be empty')
    .optional(),
  minPrice: z
    .string()
    .optional()
    .refine((val) => {
      if (val === undefined) return true;
      const num = Number(val);
      return !isNaN(num) && num >= 0;
    }, {
      message: 'Invalid minPrice query parameter. Must be a non-negative number.'
    })
    .transform((val) => (val !== undefined ? Number(val) : undefined)),
  maxPrice: z
    .string()
    .optional()
    .refine((val) => {
      if (val === undefined) return true;
      const num = Number(val);
      return !isNaN(num) && num >= 0;
    }, {
      message: 'Invalid maxPrice query parameter. Must be a non-negative number.'
    })
    .transform((val) => (val !== undefined ? Number(val) : undefined))
}).refine((data) => {
  if (data.minPrice !== undefined && data.maxPrice !== undefined) {
    return data.maxPrice >= data.minPrice;
  }
  return true;
}, {
  message: 'maxPrice cannot be less than minPrice',
  path: ['maxPrice']
});
