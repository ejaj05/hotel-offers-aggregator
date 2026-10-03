import { AggregatedHotelOffer, HotelFilterParams, SupplierHotelOffer } from '../types/hotel';

/**
 * Normalizes hotel name and city to form a consistent deduplication key.
 * Trims whitespace, removes redundant internal spacing, and converts to lowercase.
 */
export function normalizeHotelKey(name: string, city: string): string {
  const cleanName = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanCity = city.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${cleanName}::${cleanCity}`;
}

/**
 * Deduplicates hotel offers from multiple suppliers.
 * When the same hotel (matching name and city) appears across multiple suppliers,
 * selects the offer with the lowest price.
 * If prices are equal, selects the offer with higher commission percentage or deterministic tie-breaker.
 */
export function deduplicateOffers(offers: SupplierHotelOffer[]): AggregatedHotelOffer[] {
  const map = new Map<string, AggregatedHotelOffer>();

  for (const offer of offers) {
    const key = normalizeHotelKey(offer.name, offer.city);
    const existing = map.get(key);

    const candidate: AggregatedHotelOffer = {
      hotelId: offer.hotelId,
      name: offer.name.trim(),
      price: offer.price,
      city: offer.city.trim(),
      commissionPct: offer.commissionPct,
      supplier: offer.supplier || 'Unknown Supplier'
    };

    if (!existing) {
      map.set(key, candidate);
    } else {
      // Pick lower price
      if (candidate.price < existing.price) {
        map.set(key, candidate);
      } else if (candidate.price === existing.price) {
        // Deterministic tie-breaker: higher commissionPct, then alphabetical supplier
        if (
          candidate.commissionPct > existing.commissionPct ||
          (candidate.commissionPct === existing.commissionPct && candidate.supplier < existing.supplier)
        ) {
          map.set(key, candidate);
        }
      }
    }
  }

  // Return sorted by price ascending for consistent, clean ordering
  return Array.from(map.values()).sort((a, b) => a.price - b.price);
}

/**
 * Filters aggregated hotel offers by city, minPrice, and maxPrice.
 */
export function filterOffers(
  offers: AggregatedHotelOffer[],
  filters: HotelFilterParams
): AggregatedHotelOffer[] {
  let filtered = offers;

  if (filters.city && filters.city.trim() !== '') {
    const targetCity = filters.city.trim().toLowerCase();
    filtered = filtered.filter((h) => h.city.toLowerCase() === targetCity);
  }

  if (filters.minPrice !== undefined && !isNaN(filters.minPrice)) {
    filtered = filtered.filter((h) => h.price >= filters.minPrice!);
  }

  if (filters.maxPrice !== undefined && !isNaN(filters.maxPrice)) {
    filtered = filtered.filter((h) => h.price <= filters.maxPrice!);
  }

  return filtered;
}

/**
 * Combines deduplication and filtering into a single pipeline.
 */
export function aggregateAndFilterHotels(
  offers: SupplierHotelOffer[],
  filters: HotelFilterParams
): AggregatedHotelOffer[] {
  const deduplicated = deduplicateOffers(offers);
  return filterOffers(deduplicated, filters);
}
