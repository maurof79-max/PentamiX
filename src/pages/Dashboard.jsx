import { useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  LogOut, Calendar, Users, DollarSign, BookOpen, Settings, 
  UserCog, GraduationCap, ClipboardList, TableProperties, Menu, ChevronLeft,
  Shield, LayoutDashboard, Building, Archive,
  ReceiptText, Euro, Scale // <--- IMPORTATI NUOVI COMPONENTI
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

// MAPPA ICONE: Stringa DB -> Componente React
const ICON_MAP = {
    'Users': <Users size={18} />,
    'GraduationCap': <GraduationCap size={18} />,
    'Settings': <Settings size={18} />,
    'Calendar': <Calendar size={18} />,
    'BookOpen': <BookOpen size={18} />,
    'DollarSign': <DollarSign size={18} />,
    'TableProperties': <TableProperties size={18} />,
    'ClipboardList': <ClipboardList size={18} />,
    'UserCog': <UserCog size={18} />,
    'SettingsRed': <Settings size={18} className="text-accademia-red" />,
    'Shield': <Shield size={18} />,
    'LayoutDashboard': <LayoutDashboard size={18} />, 
    'Building': <Building size={18} />,
    'Archive': <Archive size={18} />,
    // --- NUOVE ICONE AGGIUNTE ALLA MAPPA ---
    'ReceiptText': <ReceiptText size={18} />,
    'Euro': <Euro size={18} />,
    'Scale': <Scale size={18} />
};

// COMPONENTS (Lazy Loading)
const DocentiList = lazy(() => import('../components/DocentiList'));
const Calendario = lazy(() => import('../components/Calendario'));
const RegistroLezioni = lazy(() => import('../components/RegistroLezioni'));
const Pagamenti = lazy(() => import('../components/Pagamenti'));
const AlunniList = lazy(() => import('../components/AlunniList'));
const UtentiList = lazy(() => import('../components/UtentiList'));
const RiepilogoFinanziario = lazy(() => import('../components/RiepilogoFinanziario'));
const DettaglioPagamenti = lazy(() => import('../components/DettaglioPagamenti'));
const ConfigurazioniApp = lazy(() => import('../components/ConfigurazioniApp'));
const AccessLogs = lazy(() => import('../components/AccessLogs')); 
const GestioneMenu = lazy(() => import('../components/GestioneMenu'));     
const GestioneScuole = lazy(() => import('../components/GestioneScuole')); 
const CompensiDocenti = lazy(() => import('../components/CompensiDocenti')); 
const GestioneTipiLezioni = lazy(() => import('../components/GestioneTipiLezioni')); 
const GestioneTariffe = lazy(() => import('../components/GestioneTariffe'));         

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState(''); 
  const [menuGroups, setMenuGroups] = useState([]); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [currentAcademicYear, setCurrentAcademicYear] = useState('2025/2026');
  const [appConfig, setAppConfig] = useState({}); 
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState({ name: '', logo: '' });
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  
  const navigate = useNavigate();
  const DEFAULT_LOGO = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";

  useEffect(() => {
    const initDashboard = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            localStorage.removeItem('accademia_user');
            navigate('/');
            return;
        }

        let currentUser = null;
        const { data: profile } = await supabase
            .from('utenti')
            .select('*, scuole(nome, logo_url, moduli_attivi)') 
            .eq('id', session.user.id)
            .single();

        if (profile) {
            currentUser = profile;
            setUser(profile);
            localStorage.setItem('accademia_user', JSON.stringify(profile));

            if (profile.ruolo === 'Admin') {
                setSchoolInfo({
                    name: 'Amministrazione',
                    logo: DEFAULT_LOGO
                });
            } else {
                setSchoolInfo({
                    name: profile.scuole?.nome || 'Nessuna Scuola',
                    logo: profile.scuole?.logo_url || DEFAULT_LOGO
                });
            }

            const activeModules = profile.scuole?.moduli_attivi || [];

            const { data: moduliData } = await supabase.from('sys_moduli').select('*').order('ordine');
            const { data: schedeData } = await supabase.from('sys_schede').select('*').order('ordine');

            if (moduliData && schedeData) {
                const groups = [];
                moduliData.forEach(mod => {
                    const validItems = schedeData.filter(scheda => {
                        if (scheda.modulo_codice !== mod.codice) return false;
                        if (profile.ruolo === 'Admin') return true;
                        if (!activeModules.includes(mod.codice)) return false;
                        if (scheda.ruoli_ammessi && !scheda.ruoli_ammessi.includes(profile.ruolo)) return false;
                        return true;
                    }).map(scheda => ({
                        id: scheda.codice_vista, 
                        label: scheda.etichetta,
                        icon: ICON_MAP[scheda.icona] || <Settings size={18} /> 
                    }));

                    if (validItems.length > 0) {
                        groups.push({
                            moduleCode: mod.codice,
                            moduleLabel: mod.etichetta,
                            items: validItems
                        });
                    }
                });
                setMenuGroups(groups);
                
                if (!activeView && groups.length > 0 && groups[0].items.length > 0) {
                    setActiveView(groups[0].items[0].id);
                }
            }
        }

        if (currentUser && currentUser.must_change_password) setShowPasswordChangeModal(true);
        
        const { data: yearData } = await supabase
            .from('anni_accademici')
            .select('anno')
            .eq('is_current', true)
            .limit(1)
            .maybeSingle();
            
        if (yearData) setCurrentAcademicYear(yearData.anno);

        const { data: configData } = await supabase.from('config_app').select('*');
        if (configData) {
            const configMap = {};
            configData.forEach(item => configMap[item.chiave] = item.valore);
            setAppConfig(configMap);
        }
    };
    initDashboard();
  }, [navigate]); 

  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (window.innerWidth < 768) setIsSidebarOpen(false);
        else setIsSidebarOpen(true);
      }, 150);
    };
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const getCurrentViewLabel = () => {
      for (const group of menuGroups) {
          const item = group.items.find(i => i.id === activeView);
          if (item) return item.label;
      }
      return 'Dashboard';
  };

  const handleLogoutClick = () => setShowLogoutConfirm(true);

  // Sostituisci la vecchia handleLogoutConfirm con questa:
  const handleLogoutConfirm = async () => {
    // 1. Logout da Supabase
    await supabase.auth.signOut();

    // 2. Pulizia dati utente (ma non dello slug scuola!)
    localStorage.removeItem('accademia_user');
    // NOTA: Non rimuoviamo 'preferred_school_slug' per ricordare la scelta

    // 3. Recuperiamo lo slug salvato
    const savedSlug = localStorage.getItem('preferred_school_slug');

    // 4. Redirect intelligente
    if (savedSlug) {
        // Se c'è uno slug, torna alla pagina di login personalizzata
        navigate(`/login/${savedSlug}`);
    } else {
        // Altrimenti vai alla home generica
        navigate('/');
    }
  };

  const handleMenuClick = (viewId) => {
    setActiveView(viewId);
    // CHIUSURA AUTOMATICA PER VISTE FINANZIARIE
    if (window.innerWidth < 768 || ['dettaglio_pagamenti', 'finanza', 'compensi-docenti'].includes(viewId)) {
      setIsSidebarOpen(false);
    }
  };

  if (!user) return <div className="flex items-center justify-center h-screen bg-accademia-dark text-gray-500">Caricamento profilo...</div>;

  const renderContent = () => {
    switch (activeView) {
      case 'utenti': return <UtentiList />;
      case 'docenti': return <DocentiList userRole={user.ruolo} />;
      case 'alunni': return <AlunniList userRole={user.ruolo} userEmail={user.email} />;
      
      case 'catalogo_lezioni': return <GestioneTipiLezioni userRole={user.ruolo} />;
      case 'gestione_tariffe': return <GestioneTariffe userRole={user.ruolo} config={appConfig} />;
      
      case 'calendario_personale': 
      case 'calendario_docenti': return <Calendario user={user} />;
      case 'registro_lezioni': return <RegistroLezioni user={user} currentGlobalYear={currentAcademicYear} />;
      case 'compensi-docenti': return <CompensiDocenti user={user} />; 
      case 'pagamenti': return <Pagamenti user={user} currentGlobalYear={currentAcademicYear} />;
      
      case 'dettaglio_pagamenti': return <DettaglioPagamenti user={user} />;
      case 'finanza': return <RiepilogoFinanziario />;
      case 'configurazioni': return <ConfigurazioniApp />;
      case 'logs': return <AccessLogs />;
      case 'gestione_menu': return <GestioneMenu />;     
      case 'gestione_scuole': return <GestioneScuole />; 
      
      default: return <div className="p-10 text-center text-gray-500">Seleziona una voce dal menu</div>;
    }
  };

  return (
    <div className="h-screen flex bg-accademia-dark text-accademia-text font-sans overflow-hidden">
      
      <aside className={`bg-accademia-card border-r border-gray-800 flex flex-col shadow-2xl z-30 transition-all duration-300 ease-in-out absolute md:relative h-full ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden'}`}>
        
        <div className="p-6 border-b border-gray-800 flex justify-between items-center min-w-[16rem] h-28 shrink-0"> 
          <div className="flex items-center justify-center w-full pr-2"> 
              <img 
                src={schoolInfo.logo} 
                alt="Logo" 
                className="h-auto w-auto max-w-[160px] max-h-[90px] object-contain transition-all duration-300" 
              />
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white"><ChevronLeft size={24} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar min-w-[16rem]">
          {menuGroups.map((group, index) => (
              <div key={group.moduleCode} className="mb-6">
                  <div className="px-3 mb-2 mt-2">
                    {index > 0 && <div className="border-t border-gray-800/60 mb-3"></div>}
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {group.moduleLabel}
                    </h3>
                  </div>
                  <div className="space-y-1">
                      {group.items.map((item) => (
                        <button 
                            key={item.id} 
                            onClick={() => handleMenuClick(item.id)} 
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                                activeView === item.id 
                                ? 'bg-accademia-red text-white shadow-md shadow-red-900/20' 
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                        >
                            <span className={`transition-transform duration-200 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                                {item.icon}
                            </span>
                            <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                  </div>
              </div>
          ))}
        </nav>
        
        <div className="p-4 border-t border-gray-800 min-w-[16rem] text-center shrink-0">
            <div className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">AA: {currentAcademicYear}</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-accademia-dark relative w-full">
         <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-gray-900 to-transparent pointer-events-none z-0"></div>
        
        <header className="h-16 bg-accademia-card border-b border-gray-800 flex items-center justify-between px-4 z-20 shrink-0 gap-4 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"><Menu size={24} /></button>
            <div className="flex flex-col">
                <div className="flex items-center gap-3 md:hidden"> 
                    <img src={schoolInfo.logo} alt="Logo" className="h-8 w-auto object-contain" />
                    {user.ruolo !== 'Admin' && (
                        <span className="font-bold text-white text-sm leading-tight truncate max-w-[150px]">{schoolInfo.name}</span>
                    )}
                </div>
                <div className="hidden md:flex items-center gap-4">
                    <h1 className="text-xl font-light text-white capitalize tracking-tight ml-2">{getCurrentViewLabel()}</h1>
                </div>
            </div>
          </div>
          
          <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 items-center gap-4">
              {user.ruolo !== 'Admin' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/80 rounded-full border border-gray-700/50 backdrop-blur-sm text-xs font-mono text-gray-300 shadow-sm animate-in fade-in">
                     <Building size={12} className="text-accademia-red"/>
                     <span className="truncate max-w-[200px]">{schoolInfo.name}</span>
                  </div>
              )}

              <div className="flex items-center gap-3 bg-gray-900/50 px-4 py-1.5 rounded-full border border-gray-800/50 backdrop-blur-sm">
                  <div className="text-right leading-tight">
                      <div className="text-sm font-medium text-white">{user.nome_esteso}</div>
                      <div className="text-[10px] text-accademia-red uppercase tracking-wider font-bold">{user.ruolo}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accademia-red to-red-900 flex items-center justify-center text-white font-bold text-sm shadow-md border border-red-800/30">
                      {user.nome_esteso.charAt(0).toUpperCase()}
                  </div>
              </div>
          </div>

          <div className="flex items-center justify-end">
            <button 
              onClick={handleLogoutClick} 
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-red-900/20 hover:border-red-900/30 border border-transparent rounded-lg transition-all" 
              title="Disconnetti"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Esci</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 z-10 custom-scrollbar relative w-full">
            {isSidebarOpen && (<div className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>)}
            <div className="max-w-[1800px] mx-auto h-full flex flex-col">
                <div className="flex-1 bg-accademia-card border border-gray-800 rounded-xl shadow-2xl relative overflow-hidden flex flex-col h-full">
                  <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Caricamento...</div>}>
                    {renderContent()}
                  </Suspense>
                </div>
            </div>
        </div>
      </main>

      {showPasswordChangeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-accademia-card border border-red-500/50 w-full max-w-md rounded-xl shadow-2xl p-8 animate-in fade-in zoom-in-95">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                 <Settings className="text-accademia-red w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Primo Accesso</h2>
              <p className="text-gray-400 text-sm">
                Per motivi di sicurezza, è necessario impostare una nuova password personale prima di continuare.
              </p>
            </div>
            <ChangePasswordForm 
              onSuccess={async () => {
                await supabase.from('utenti').update({ must_change_password: false }).eq('id', user.id);
                const updatedUser = { ...user, must_change_password: false };
                setUser(updatedUser);
                localStorage.setItem('accademia_user', JSON.stringify(updatedUser));
                setShowPasswordChangeModal(false);
                setShowSuccessDialog(true);
              }} 
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        type="warning"
        title="Conferma Uscita"
        message="Sei sicuro di voler uscire dall'applicazione?"
        confirmText="Esci"
        cancelText="Annulla"
        showCancel={true}
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showSuccessDialog}
        type="success"
        title="Password Aggiornata"
        message="La tua password è stata modificata con successo. Benvenuto!"
        confirmText="Prosegui"
        showCancel={false} 
        onConfirm={() => setShowSuccessDialog(false)}
      />
    </div>
  );
}

function ChangePasswordForm({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("La password deve essere di almeno 6 caratteri.");
    if (password !== confirm) return setError("Le password non coincidono.");

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password: password });
      if (authError) throw authError;
      await onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nuova Password</label>
        <input 
          type="password" required minLength={6}
          className="w-full bg-accademia-input border border-gray-700 rounded-lg p-3 text-white focus:border-accademia-red outline-none focus:ring-1 focus:ring-accademia-red transition-all"
          value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Minimo 6 caratteri"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Conferma Password</label>
        <input 
          type="password" required minLength={6}
          className="w-full bg-accademia-input border border-gray-700 rounded-lg p-3 text-white focus:border-accademia-red outline-none focus:ring-1 focus:ring-accademia-red transition-all"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder="Ripeti password"
        />
      </div>
      {error && <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-xs animate-in fade-in">{error}</div>}
      <button 
        type="submit" disabled={loading}
        className="w-full py-3 bg-accademia-red hover:bg-red-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-red-900/20 disabled:opacity-50 mt-2"
      >
        {loading ? 'Aggiornamento...' : 'IMPOSTA PASSWORD E ACCEDI'}
      </button>
    </form>
  );
}