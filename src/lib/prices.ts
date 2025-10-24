const SYMBOL_TO_ID: Record<string, string> = {
  ETH: 'ethereum',
  MATIC: 'polygon-pos',
  BNB: 'binancecoin',
  BTC: 'bitcoin',
  USDT: 'tether',
  SOL: 'solana',
  LTC: 'litecoin',
};

type PriceMap = Record<string, number>; // symbol -> usd

const TTL_MS = 30_000; // 30 seconds
let memoryCache: { at: number; prices: PriceMap } | null = null;

function loadLocal(): { at: number; prices: PriceMap } | null {
  try {
    const raw = localStorage.getItem('priceCache');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocal(cache: { at: number; prices: PriceMap }) {
  try {
    localStorage.setItem('priceCache', JSON.stringify(cache));
  } catch {}
}

export async function getUsdPrices(symbols: string[]): Promise<PriceMap> {
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase())));

  const now = Date.now();
  const merged: PriceMap = {};

  const useCache = (cache: { at: number; prices: PriceMap } | null) => {
    if (!cache) return;
    if (now - cache.at <= TTL_MS) {
      for (const s of uniq) {
        const v = cache.prices[s];
        if (typeof v === 'number') merged[s] = v;
      }
    }
  };

  useCache(memoryCache);
  useCache(loadLocal());

  const missing = uniq.filter((s) => merged[s] == null).map((s) => SYMBOL_TO_ID[s]).filter(Boolean);
  if (missing.length > 0) {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(missing.join(','))}&vs_currencies=usd`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      for (const [sym, id] of Object.entries(SYMBOL_TO_ID)) {
        if (missing.includes(id)) {
          const usd = json?.[id]?.usd;
          if (typeof usd === 'number') merged[sym] = usd;
        }
      }
      const newCache = { at: now, prices: { ...(memoryCache?.prices || {}), ...merged } };
      memoryCache = newCache;
      saveLocal(newCache);
    } catch {
      // ignore network failures; return what we have
    }
  }

  return merged;
}

export async function getUsdPrice(symbol: string): Promise<number | null> {
  const prices = await getUsdPrices([symbol]);
  const v = prices[symbol.toUpperCase()];
  return typeof v === 'number' ? v : null;
}

// --- Coin logos (CoinGecko images) ---
type LogoMap = Record<string, string>; // symbol -> image url
const LOGO_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let logoMemoryCache: { at: number; logos: LogoMap } | null = null;

function loadLogosLocal(): { at: number; logos: LogoMap } | null {
  try {
    const raw = localStorage.getItem('logoCache');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLogosLocal(cache: { at: number; logos: LogoMap }) {
  try {
    localStorage.setItem('logoCache', JSON.stringify(cache));
  } catch {}
}

export async function getCoinLogos(symbols: string[]): Promise<LogoMap> {
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const now = Date.now();
  const merged: LogoMap = {};

  const useCache = (cache: { at: number; logos: LogoMap } | null) => {
    if (!cache) return;
    if (now - cache.at <= LOGO_TTL_MS) {
      for (const s of uniq) {
        const v = cache.logos[s];
        if (typeof v === 'string' && v) merged[s] = v;
      }
    }
  };

  useCache(logoMemoryCache);
  useCache(loadLogosLocal());

  const missingIds = uniq
    .filter((s) => merged[s] == null)
    .map((s) => SYMBOL_TO_ID[s])
    .filter(Boolean);

  if (missingIds.length > 0) {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
      missingIds.join(',')
    )}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (Array.isArray(json)) {
        for (const item of json) {
          const id = String(item.id || '');
          const image = String(item.image || '');
          const symbolEntry = Object.entries(SYMBOL_TO_ID).find(([, cid]) => cid === id);
          if (symbolEntry && image) {
            const sym = symbolEntry[0];
            merged[sym] = image;
          }
        }
      }
      const newCache = { at: now, logos: { ...(logoMemoryCache?.logos || {}), ...merged } };
      logoMemoryCache = newCache;
      saveLogosLocal(newCache);
    } catch {
      // ignore
    }
  }

  return merged;
}

export const SYMBOL_TO_ID_MAP = SYMBOL_TO_ID;


