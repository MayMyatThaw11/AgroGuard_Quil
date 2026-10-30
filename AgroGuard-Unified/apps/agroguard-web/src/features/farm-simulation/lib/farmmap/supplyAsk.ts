import type { SearchQuery } from './supplySearch.ts';

export function askFarmsBody(q: SearchQuery, town: string, listingIds: readonly string[]) {
  return {
    produce: q.produce,
    qty_kg: q.kg,
    needed_by: q.by,
    town,
    lat: q.lat,
    lon: q.lon,
    target_listing_ids: [...listingIds],
    ...(q.budget ? { price_offer_mmk_kg: Number(q.budget) } : {}),
  };
}
