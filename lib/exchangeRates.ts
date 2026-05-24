/**
 * Live USD → EUR, BDT exchange rates.
 *
 * Source: https://open.er-api.com (free, no API key, ~1500 req/month).
 * Cached in-memory for 6 hours so each Vercel cold-start fetches at most once
 * per cycle, then reuses across all subsequent requests.
 *
 * Used on /pricing and /upgrade to convert canonical USD prices into local
 * currency display.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

// Fallback used when the API is unreachable or returns garbage.
// Update these manually if the spot rate has drifted significantly and the
// API has been down for a while.
const FALLBACK_RATES = { EUR: 0.92, BDT: 120 }

interface Rates {
  EUR: number
  BDT: number
  asOf: Date
}

let cache: { rates: Rates; cachedAt: number } | null = null

export async function getExchangeRates(): Promise<Rates> {
  const now = Date.now()
  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache.rates
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      // Don't let Next.js cache this — we manage caching ourselves.
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json = await res.json()
    const eur = Number(json?.rates?.EUR)
    const bdt = Number(json?.rates?.BDT)
    if (!Number.isFinite(eur) || !Number.isFinite(bdt) || eur <= 0 || bdt <= 0) {
      throw new Error("invalid rates payload")
    }
    const rates: Rates = { EUR: eur, BDT: bdt, asOf: new Date() }
    cache = { rates, cachedAt: now }
    return rates
  } catch (err) {
    console.warn("[exchangeRates] fetch failed, using fallback:", (err as Error).message)
    return { ...FALLBACK_RATES, asOf: new Date(0) }
  }
}

/**
 * Format a canonical USD price into all three display currencies.
 * Rounding:
 *  - USD: nearest dollar (e.g., $5)
 *  - EUR: 2 decimal places (e.g., €4.60)
 *  - BDT: nearest 10 taka (e.g., ৳600)
 */
export function formatPrice(
  usd: number,
  rates: Pick<Rates, "EUR" | "BDT">
): { usd: string; eur: string; bdt: string } {
  const eur = usd * rates.EUR
  const bdt = usd * rates.BDT
  return {
    usd: `$${Math.round(usd)}`,
    eur: `€${eur.toFixed(2)}`,
    bdt: `৳${Math.round(bdt / 10) * 10}`,
  }
}

/**
 * True when the rates are from the in-memory fallback (API failed).
 * Pages can use this to render a softer "EUR/BDT updating shortly" tooltip.
 */
export function isFallbackRates(rates: Rates): boolean {
  return rates.asOf.getTime() === 0
}
