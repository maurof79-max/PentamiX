import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const LOGO_URL = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }
    if (password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Trova utente con questo token valido
      const { data: user, error: findError } = await supabase
        .from('utenti')
        .select('*')
        .eq('token', token)
        .gt('token_scadenza', Date.now()) // Token non scaduto
        .single();

      if (findError || !user) throw new Error("Link scaduto o non valido.");

      // 2. Aggiorna Password e rimuovi token
      const newHash = await sha256(password);
      
      const { error: updateError } = await supabase
        .from('utenti')
        .update({ 
          password: newHash,
          token: null,
          token_scadenza: null
        })
        .eq('email', user.email);

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => navigate('/'), 3000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div className="text-white text-center p-10">Token mancante.</div>;

  return (
    <div className="flex items-center justify-center min-h-screen bg-accademia-dark relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-accademia-dark z-0"></div>
      
      <div className="w-full max-w-md p-8 bg-accademia-card border border-gray-800 rounded-xl shadow-2xl z-10 backdrop-blur-sm relative">
        <div className="text-center mb-8">
            <img src={LOGO_URL} alt="Logo" className="h-16 mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-light text-white uppercase">Reimposta Password</h1>
        </div>

        {error && <div className="mb-4 p-3 bg-red-900/40 border border-red-800 text-red-200 rounded text-sm text-center">{error}</div>}
        
        {success ? (
          <div className="p-4 bg-green-900/40 border border-green-800 text-green-200 rounded text-center">
            <h3 className="font-bold text-lg mb-2">Password Aggiornata!</h3>
            <p>Sarai reindirizzato al login tra pochi secondi...</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nuova Password</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 bg-accademia-input border border-gray-700 rounded-lg text-white focus:border-accademia-red focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Conferma Password</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 bg-accademia-input border border-gray-700 rounded-lg text-white focus:border-accademia-red focus:outline-none"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-accademia-red hover:bg-red-700 text-white font-bold rounded-lg transition-all shadow-lg"
            >
              {loading ? 'Salvataggio...' : 'SALVA NUOVA PASSWORD'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}