import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Controllo di sicurezza: Verifica che le variabili esistano
if (!supabaseUrl || !supabaseKey) {
  console.error("ERRORE CRITICO: Variabili d'ambiente Supabase mancanti.");
  console.error("Verifica il file .env o le impostazioni di Vercel/Netlify.");
  throw new Error('Supabase URL or Key missing.');
}

// Inizializzazione del client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Log limitato solo in ambiente di sviluppo (opzionale, per debug)
if (import.meta.env.DEV) {
    console.debug(`Supabase connesso a: ${supabaseUrl}`);
}