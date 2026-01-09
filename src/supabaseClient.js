import { createClient } from '@supabase/supabase-js';

// Sostituisci con i tuoi dati reali da Supabase -> Settings -> API
const supabaseUrl = 'https://mqdpojtisighqjmyzdwz.supabase.co';
const supabaseKey = 'sb_publishable_jNkRkb1bF-N6654An9dIvA_apAUtvSc'; // Quella che inizia con eyJ...

export const supabase = createClient(supabaseUrl, supabaseKey);