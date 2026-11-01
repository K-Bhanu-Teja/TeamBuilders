import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const farmerId = searchParams.get('farmer_id');

  let query = supabaseAdmin
    .from('advice_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (farmerId) {
    query = query.eq('farmer_id', farmerId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
