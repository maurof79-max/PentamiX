import { createClient } from '@supabase/supabase-js';

// Usa import.meta.env per Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL or Key missing. Check .env file');
}

export const supabase = createClient(supabaseUrl, supabaseKey);