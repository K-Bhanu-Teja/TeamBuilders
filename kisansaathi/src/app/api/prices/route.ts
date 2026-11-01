import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Data.gov.in Agmarknet API — official open dataset
// Resource ID: 9ef84268-d588-465a-a308-a864a43d0070

const DATA_GOV_API_KEY = process.env.DATA_GOV_IN_API_KEY;
const AGMARKNET_RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';

const COMMODITY_MAP: Record<string, string[]> = {
  chilli: ['Chilli', 'Dry Chillies', 'Red Chilly'],
  cotton: ['Cotton', 'Cotton(Lint)', 'Cotton Seed'],
  paddy: ['Paddy(Dhan)(Common)', 'Paddy', 'Rice'],
};

const GUNTUR_MARKETS = ['Guntur', 'Guntur(Mirchi Yard)', 'Chirala', 'Narasaraopet'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const commodity = (searchParams.get('commodity') || 'chilli').toLowerCase();
  const fetchedAt = new Date().toISOString();

  const commodityVariants = COMMODITY_MAP[commodity] || [commodity];

  if (!DATA_GOV_API_KEY) {
    return NextResponse.json({ error: 'DATA_GOV_IN_API_KEY not configured', unavailable: true }, { status: 503 });
  }

  // Try each commodity variant until we get a result
  for (const commodityName of commodityVariants) {
    const url = new URL(`https://api.data.gov.in/resource/${AGMARKNET_RESOURCE_ID}`);
    url.searchParams.set('api-key', DATA_GOV_API_KEY);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '20');
    url.searchParams.set('filters[State.keyword]', 'Andhra Pradesh');
    url.searchParams.set('filters[Commodity]', commodityName);

    try {
      const res = await fetch(url.toString(), { next: { revalidate: 0 } });

      if (!res.ok) continue;

      const raw = await res.json();
      const records: AgmarknetRecord[] = raw?.records || [];

      // Filter for Guntur-area markets
      const gunturRecords = records.filter((r: AgmarknetRecord) =>
        GUNTUR_MARKETS.some(m => r.Market?.toLowerCase().includes(m.toLowerCase()))
      );

      const targetRecords = gunturRecords.length > 0 ? gunturRecords : records.slice(0, 5);

      if (targetRecords.length === 0) continue;

      // Aggregate: use best/most recent Guntur record
      const best = targetRecords[0];
      const modalPrices = targetRecords
        .map((r: AgmarknetRecord) => parseFloat(r.Modal_Price || r.modal_price || '0'))
        .filter((p: number) => p > 0);

      const avgModal = modalPrices.length > 0
        ? Math.round(modalPrices.reduce((a: number, b: number) => a + b, 0) / modalPrices.length)
        : 0;

      const result = {
        fetched_at: fetchedAt,
        unavailable: false,
        commodity: commodityName,
        market: best.Market || best.market || 'Guntur',
        state: 'Andhra Pradesh',
        min_price: parseFloat(best.Min_Price || best.min_price || '0'),
        max_price: parseFloat(best.Max_Price || best.max_price || '0'),
        modal_price: parseFloat(best.Modal_Price || best.modal_price || '0'),
        avg_modal_price_guntur: avgModal,
        price_date: best.Arrival_Date || best.arrival_date || fetchedAt.split('T')[0],
        unit: 'Rs/Quintal',
        all_markets: targetRecords.map((r: AgmarknetRecord) => ({
          market: r.Market || r.market,
          min: parseFloat(r.Min_Price || r.min_price || '0'),
          max: parseFloat(r.Max_Price || r.max_price || '0'),
          modal: parseFloat(r.Modal_Price || r.modal_price || '0'),
        })),
      };

      // Cache to Supabase price_cache table
      try {
        await supabaseAdmin.from('price_cache').upsert({
          commodity: commodity,
          market: result.market,
          min_price: result.min_price,
          max_price: result.max_price,
          modal_price: result.modal_price,
          fetched_at: fetchedAt,
        }, { onConflict: 'commodity' });
      } catch {
        // Cache failure is non-fatal
      }

      return NextResponse.json(result);
    } catch {
      continue;
    }
  }

  // All variants failed — try returning cached data from Supabase
  try {
    const { data: cached } = await supabaseAdmin
      .from('price_cache')
      .select('*')
      .eq('commodity', commodity)
      .single();

    if (cached) {
      return NextResponse.json({
        ...cached,
        unavailable: true,
        cached: true,
        message: `Live data unavailable. Showing cached price from ${new Date(cached.fetched_at).toLocaleTimeString('en-IN')}`,
      });
    }
  } catch {
    // ignore cache read failure
  }

  return NextResponse.json(
    { error: 'Live price data unavailable and no cache found', unavailable: true, commodity },
    { status: 503 }
  );
}

type AgmarknetRecord = {
  Market?: string;
  market?: string;
  Min_Price?: string;
  min_price?: string;
  Max_Price?: string;
  max_price?: string;
  Modal_Price?: string;
  modal_price?: string;
  Arrival_Date?: string;
  arrival_date?: string;
};
