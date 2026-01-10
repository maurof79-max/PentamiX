import { createClient } from '@supabase/supabase-js';

// Usa import.meta.env per Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// DEBUG: Controlla la console del browser per vedere se i valori sono letti
// Nota: Non stampare la Key intera in produzione per sicurezza, ma per debug locale è ok
console.log("Supabase Init - URL:", supabaseUrl);
console.log("Supabase Init - Key Presente?", !!supabaseKey); 

if (!supabaseUrl || !supabaseKey) {
  // Messaggio di errore più esplicito per aiutarti
  console.error("ERRORE CRITICO: Variabili d'ambiente mancanti.");
  console.error("Assicurati di avere un file .env con VITE_SUPABASE_URL e VITE_SUPABASE_KEY");
  throw new Error('Supabase URL or Key missing. Check .env file or Vercel settings.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);