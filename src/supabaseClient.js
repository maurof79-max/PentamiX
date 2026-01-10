import { createClient } from '@supabase/supabase-js';

// Sostituisci con i tuoi dati reali da Supabase -> Settings -> API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);