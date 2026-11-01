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

export type SupportedCrop =
  | 'chilli' | 'cotton' | 'paddy'
  | 'wheat' | 'maize' | 'groundnut'
  | 'sugarcane' | 'soybean' | 'mustard' | 'onion';

export type FarmerProfile = {
  id?: string;
  name: string;
  phone?: string;
  state: string;
  district: string;
  village: string;
  crop: SupportedCrop;
  growth_stage: string;
  field_size_acres: number;
  language: string;
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
  advice_telugu: string;   // kept as field name; stores advice in farmer's language
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
