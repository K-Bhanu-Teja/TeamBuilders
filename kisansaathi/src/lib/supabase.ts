import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Browser client (anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side admin client (service role key) – only used in API routes
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

export type FarmerProfile = {
  id?: string;
  name: string;
  phone?: string;
  village: string;
  crop: 'chilli' | 'cotton' | 'paddy';
  growth_stage: string;
  field_size_acres: number;
  location_lat: number;
  location_lon: number;
  created_at?: string;
};

export type AdviceHistory = {
  id?: string;
  farmer_id: string;
  created_at?: string;
  weather_snapshot: Record<string, unknown>;
  soil_snapshot: Record<string, unknown>;
  price_snapshot: Record<string, unknown>;
  advice_telugu: string;
  advice_english: string;
  action_taken?: boolean;
};

export type PriceCache = {
  id?: string;
  commodity: string;
  market: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  fetched_at: string;
};
