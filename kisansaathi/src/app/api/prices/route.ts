import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { COMMODITY_VARIANTS } from '@/lib/national-data';

const DATA_GOV_API_KEY = process.env.DATA_GOV_IN_API_KEY;
const BASE_URL = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';

type AgmarknetRecord = {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  variety?: string;
  min_price?: number;
  max_price?: number;
  modal_price?: number;
  arrival_date?: string;
};

async function fetchCommodity(
  commodityName: string,
  state: string
): Promise<AgmarknetRecord[]> {
  const params = new URLSearchParams({
    'api-key': DATA_GOV_API_KEY!,
    'format': 'json',
    'limit': '50',
    'filters[state.keyword]': state,
    'filters[commodity]': commodityName,
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) return [];
  const raw = await res.json();
  return (raw?.records as AgmarknetRecord[]) || [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const crop      = (searchParams.get('commodity') || 'chilli').toLowerCase();
  const state     = searchParams.get('state') || 'Andhra Pradesh';
  const district  = (searchParams.get('district') || '').toLowerCase();
  const fetchedAt = new Date().toISOString();

  if (!DATA_GOV_API_KEY) {
    return NextResponse.json({ error: 'DATA_GOV_IN_API_KEY not configured', unavailable: true }, { status: 503 });
  }

  const variants = COMMODITY_VARIANTS[crop] || [crop];

  for (const commodityName of variants) {
    try {
      const records = await fetchCommodity(commodityName, state);
      if (records.length === 0) continue;

      // Prefer farmer's district if provided
      const districtRecs = district
        ? records.filter(r => (r.district || '').toLowerCase().includes(district) || (r.market || '').toLowerCase().includes(district))
        : [];
      const pool = districtRecs.length > 0 ? districtRecs : records;
      const best = pool[0];

      const modalPrices = pool
        .map(r => Number(r.modal_price) || 0)
        .filter(p => p > 0);
      const avgModal = modalPrices.length > 0
        ? Math.round(modalPrices.reduce((a, b) => a + b, 0) / modalPrices.length)
        : Number(best.modal_price) || 0;

      const result = {
        fetched_at: fetchedAt,
        unavailable: false,
        commodity: commodityName,
        crop,
        state,
        market:      best.market   || state,
        district:    best.district || district || state,
        min_price:   Number(best.min_price)   || 0,
        max_price:   Number(best.max_price)   || 0,
        modal_price: Number(best.modal_price) || 0,
        avg_modal_price_state: avgModal,
        price_date: best.arrival_date || fetchedAt.split('T')[0],
        unit: 'Rs/Quintal',
        records_found: records.length,
        all_markets: pool.slice(0, 8).map(r => ({
          market:    r.market,
          district:  r.district,
          commodity: r.commodity,
          min:    Number(r.min_price)   || 0,
          max:    Number(r.max_price)   || 0,
          modal:  Number(r.modal_price) || 0,
          date:   r.arrival_date,
        })),
      };

      // Cache to Supabase
      try {
        await supabaseAdmin.from('price_cache').upsert({
          commodity:   `${crop}__${state}`,
          market:      result.market,
          min_price:   result.min_price,
          max_price:   result.max_price,
          modal_price: result.modal_price,
          fetched_at:  fetchedAt,
        }, { onConflict: 'commodity' });
      } catch { /* non-fatal */ }

      return NextResponse.json(result);
    } catch (err) {
      console.error(`prices: error fetching "${commodityName}" in ${state}:`, err);
      continue;
    }
  }

  // Supabase cache fallback
  try {
    const { data: cached } = await supabaseAdmin
      .from('price_cache')
      .select('*')
      .eq('commodity', `${crop}__${state}`)
      .single();

    if (cached) {
      const cacheTime = new Date(cached.fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return NextResponse.json({
        ...cached, crop, state, unavailable: true, cached: true,
        message: `Live data unavailable. Last cached: ${cacheTime}`,
      });
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    unavailable: true, crop, state,
    commodity: variants[0],
    message: `Agmarknet has no ${crop} data for ${state} today.`,
    fetched_at: fetchedAt,
  }, { status: 503 });
}
