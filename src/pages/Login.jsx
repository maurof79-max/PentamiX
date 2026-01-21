import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, useParams } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [view, setView] = useState('login'); 
  const navigate = useNavigate();

  // 1. Recuperiamo lo slug dall'URL (es. 'accademia-piacenza')
  const { schoolSlug } = useParams();
  
  // Stati per la personalizzazione grafica
  const [schoolInfo, setSchoolInfo] = useState(null);
  const DEFAULT_LOGO = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";
  const [currentLogo, setCurrentLogo] = useState(DEFAULT_LOGO);

  // 2. Appena carica la pagina, se c'è uno slug, cerchiamo la scuola
  useEffect(() => {
    if (schoolSlug) {
      fetchSchoolData();
    }
  }, [schoolSlug]);

  const fetchSchoolData = async () => {
    try {
      const { data, error } = await supabase
        .from('scuole')
        .select('nome, logo_url')
        .eq('slug', schoolSlug)
        .single();

      if (data) {
        setSchoolInfo(data);
        if (data.logo_url) setCurrentLogo(data.logo_url);
      }
    } catch (err) {
      console.log("Nessuna scuola trovata con questo link.", err);
      // In caso di errore restiamo col logo di default
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Login standard
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw new Error("Credenziali non valide");

      // Verifica profilo utente
      const { data: userProfile, error: profileError } = await supabase
        .from('utenti')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !userProfile) throw new Error("Profilo utente non trovato.");
      if (userProfile.stato !== 'Attivo') {
          await supabase.auth.signOut();
          throw new Error("Account non attivo o sospeso");
      }

      // Log Accesso
      await supabase.from('access_logs').insert([{
          user_id: userProfile.id,
          email: userProfile.email,
          action: 'LOGIN',
          timestamp: new Date().toISOString()
      }]);

      localStorage.setItem('accademia_user', JSON.stringify(userProfile));
      if (schoolSlug) {
    localStorage.setItem('preferred_school_slug', schoolSlug);
}
      navigate('/dashboard');

    } catch (err) {
      console.error("Login error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const { data: user } = await supabase.from('utenti').select('*').eq('email', email).single();
      if (!user) throw new Error("Email non trovata.");

      const token = crypto.randomUUID();
      const scadenza = Date.now() + 3600000;

      const { error: updateError } = await supabase
        .from('utenti')
        .update({ token: token, token_scadenza: scadenza })
        .eq('email', email);

      if (updateError) throw updateError;

      const resetLink = `${window.location.origin}/reset-password?token=${token}`;
      console.log("LINK RECUPERO:", resetLink);
      setSuccessMsg("Istruzioni inviate! (Controlla la Console per il link di test)");
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-accademia-dark relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-accademia-dark z-0"></div>
      <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 z-0 animate-pulse"></div>

      <div className="w-full max-w-md p-8 bg-accademia-card border border-gray-800 rounded-xl shadow-2xl z-10 backdrop-blur-sm relative">
        
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-48 h-48 mb-2 relative flex items-center justify-center">
            <div className="absolute inset-0 bg-accademia-red/20 blur-3xl rounded-full"></div>
            {/* LOGO DINAMICO */}
            <img 
              src={currentLogo} 
              alt="Logo" 
              className="w-full h-full object-contain relative z-10 drop-shadow-lg" 
            />
          </div>
          {/* NOME SCUOLA O TITOLO STANDARD */}
          <h1 className="text-2xl font-light text-white tracking-wide uppercase">
            {schoolInfo ? schoolInfo.nome : (view === 'login' ? 'Area Riservata' : 'Recupero Password')}
          </h1>
          <p className="text-xs text-accademia-muted mt-2 uppercase tracking-widest">
            {schoolInfo ? 'Portale Accesso' : 'Accademia della Musica'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/40 border border-red-800 text-red-200 rounded text-sm text-center animate-in fade-in slide-in-from-top-2">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-3 bg-green-900/40 border border-green-800 text-green-200 rounded text-sm text-center animate-in fade-in slide-in-from-top-2">
            {successMsg}
          </div>
        )}

        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 bg-accademia-input border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-accademia-red focus:ring-1 focus:ring-accademia-red transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1 ml-1">
                <label className="block text-xs font-bold text-gray-500 uppercase">Password</label>
                <button 
                    type="button"
                    onClick={() => { setError(null); setView('forgot'); }}
                    className="text-xs text-accademia-red hover:text-red-400 transition-colors"
                >
                    Password dimenticata?
                </button>
              </div>
              <input
                type="password"
                required
                className="w-full px-4 py-3 bg-accademia-input border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-accademia-red focus:ring-1 focus:ring-accademia-red transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-accademia-red hover:bg-red-700 text-white font-bold rounded-lg transition-all duration-300 shadow-lg shadow-red-900/30 hover:shadow-red-900/50 disabled:opacity-50"
            >
              {loading ? 'Accesso...' : 'ACCEDI'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handlePasswordReset} className="space-y-5">
            <div className="text-center text-sm text-gray-400 mb-4 px-4">
                Inserisci la tua email. Ti invieremo le istruzioni per reimpostare la password.
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Email</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 bg-accademia-input border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-accademia-red focus:ring-1 focus:ring-accademia-red transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-accademia-red hover:bg-red-700 text-white font-bold rounded-lg transition-all"
            >
               {loading ? 'Invio...' : 'INVIA ISTRUZIONI'}
            </button>
            <button
                type="button"
                onClick={() => { setError(null); setView('login'); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors mt-2"
            >
                Torna al Login
            </button>
          </form>
        )}
      </div>
      
      <div className="absolute bottom-4 text-center w-full text-[10px] text-gray-600 uppercase tracking-widest z-10">
          © {new Date().getFullYear()} {schoolInfo ? schoolInfo.nome : 'Accademia della Musica'} • Gestionale v2.0
      </div>
    </div>
  );
}