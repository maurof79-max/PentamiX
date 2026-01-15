import { useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { 
  LogOut, Calendar, Users, DollarSign, BookOpen, Settings, 
  UserCog, GraduationCap, ClipboardList, TableProperties, Menu, ChevronLeft
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

// COMPONENTS (Lazy Loading)
const DocentiList = lazy(() => import('../components/DocentiList'));
const Calendario = lazy(() => import('../components/Calendario'));
const RegistroLezioni = lazy(() => import('../components/RegistroLezioni'));
const Pagamenti = lazy(() => import('../components/Pagamenti'));
const AlunniList = lazy(() => import('../components/AlunniList'));
const TipiLezioni = lazy(() => import('../components/TipiLezioni'));
const UtentiList = lazy(() => import('../components/UtentiList'));
const RiepilogoFinanziario = lazy(() => import('../components/RiepilogoFinanziario'));
const DettaglioPagamenti = lazy(() => import('../components/DettaglioPagamenti'));
// Nuovo componente per le configurazioni
const ConfigurazioniApp = lazy(() => import('../components/ConfigurazioniApp'));

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState(''); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [currentAcademicYear, setCurrentAcademicYear] = useState('2025/2026');
  const [appConfig, setAppConfig] = useState({}); // Stato per le configurazioni globali
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();

  const LOGO_URL = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";

  useEffect(() => {
    const storedUser = localStorage.getItem('accademia_user');
    if (!storedUser) { navigate('/'); return; }
    
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    // Fetch Global Config (Anno Corrente + Parametri App)
    const fetchConfig = async () => {
        // 1. Anno Accademico Corrente
        const { data: yearData } = await supabase.from('anni_accademici').select('anno').eq('is_current', true).single();
        if (yearData) setCurrentAcademicYear(yearData.anno);

        // 2. Parametri di Configurazione App (Permessi, etc.)
        const { data: configData } = await supabase.from('config_app').select('*');
        if (configData) {
            const configMap = {};
            configData.forEach(item => {
                configMap[item.chiave] = item.valore;
            });
            setAppConfig(configMap);
        }
    };
    fetchConfig();

    // Default View Logic
    if (!activeView) {
      if (parsedUser.ruolo === 'Docente') setActiveView('calendario_personale'); 
      else if (parsedUser.ruolo === 'Admin') setActiveView('utenti');
      else setActiveView('docenti');
    }
    
  }, [navigate, activeView]);

  // Gestione Responsive Sidebar
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

  const handleLogoutClick = () => setShowLogoutConfirm(true);

  const handleLogoutConfirm = () => {
    localStorage.removeItem('accademia_user');
    navigate('/');
  };

  const handleMenuClick = (viewId) => {
    setActiveView(viewId);
    if (window.innerWidth < 768 || ['dettaglio_pagamenti', 'finanza'].includes(viewId)) {
      setIsSidebarOpen(false);
    }
  };

  if (!user) return <div className="flex items-center justify-center h-screen bg-accademia-dark text-gray-500">Caricamento profilo...</div>;

  const menuItems = [];
  if (user.ruolo === 'Admin') menuItems.push({ id: 'utenti', label: 'Gestione Utenti', icon: <UserCog size={18}/> });
  if (user.ruolo !== 'Docente') menuItems.push({ id: 'docenti', label: 'Gestione Docenti', icon: <Users size={18}/> });
  menuItems.push({ id: 'alunni', label: 'Gestione Alunni', icon: <GraduationCap size={18}/> });
  
  // Tipi Lezioni (Configurazioni & Anni)
  if (user.ruolo !== 'Docente') menuItems.push({ id: 'tipi_lezioni', label: 'Configurazioni & Anni', icon: <Settings size={18}/> });

  if (user.ruolo === 'Docente') menuItems.push({ id: 'calendario_personale', label: 'Il mio Calendario', icon: <Calendar size={18}/> });
  else menuItems.push({ id: 'calendario_docenti', label: 'Calendario Docenti', icon: <Calendar size={18}/> });
  
  menuItems.push({ id: 'registro_lezioni', label: 'Registro Lezioni', icon: <BookOpen size={18}/> });
  
  if (user.ruolo !== 'Docente') {
    menuItems.push({ id: 'pagamenti', label: 'Registro Pagamenti', icon: <DollarSign size={18}/> });
    menuItems.push({ id: 'dettaglio_pagamenti', label: 'Riepilogo Pagamenti', icon: <TableProperties size={18}/> });
    menuItems.push({ id: 'finanza', label: 'Riepilogo Finanziario', icon: <ClipboardList size={18}/> });
  }

  // Nuova voce menu Configurazioni (Solo Admin)
  if (user.ruolo === 'Admin') {
      menuItems.push({ id: 'configurazioni', label: 'Configurazioni App', icon: <Settings size={18} className="text-accademia-red"/> });
  }

  const renderContent = () => {
    switch (activeView) {
      case 'utenti': return <UtentiList />;
      case 'docenti': return <DocentiList userRole={user.ruolo} />;
      case 'alunni': return <AlunniList userRole={user.ruolo} userEmail={user.email} />;
      // Passiamo la config a TipiLezioni
      case 'tipi_lezioni': return <TipiLezioni userRole={user.ruolo} config={appConfig} />;
      case 'calendario_personale': 
      case 'calendario_docenti': return <Calendario user={user} />;
      case 'registro_lezioni': return <RegistroLezioni user={user} currentGlobalYear={currentAcademicYear} />;
      case 'pagamenti': return <Pagamenti currentGlobalYear={currentAcademicYear} />;
      case 'dettaglio_pagamenti': return <DettaglioPagamenti />;
      case 'finanza': return <RiepilogoFinanziario />;
      case 'configurazioni': return <ConfigurazioniApp />;
      default: return <div className="p-10 text-center text-gray-500">Seleziona una voce dal menu</div>;
    }
  };

  return (
    <div className="min-h-screen flex bg-accademia-dark text-accademia-text font-sans overflow-hidden">
      <aside className={`bg-accademia-card border-r border-gray-800 flex flex-col shadow-2xl z-30 transition-all duration-300 ease-in-out absolute md:relative h-full ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-gray-800 flex justify-between items-center min-w-[16rem]">
          <div className="flex items-center justify-center w-full pr-2"> <img src={LOGO_URL} alt="Accademia Logo" className="h-auto w-full max-w-[130px] object-contain" /></div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white"><ChevronLeft size={24} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar min-w-[16rem]">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest px-3 mb-2 mt-2">Menu</div>
          {menuItems.map((item) => (
            <button key={item.id} onClick={() => handleMenuClick(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${activeView === item.id ? 'bg-accademia-red text-white shadow-md shadow-red-900/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <span className={`transition-transform duration-200 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800 min-w-[16rem] text-center">
            <div className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">AA: {currentAcademicYear}</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-accademia-dark relative w-full">
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-gray-900 to-transparent pointer-events-none z-0"></div>
        <header className="h-16 bg-accademia-card border-b border-gray-800 flex items-center justify-between px-4 z-20 shrink-0 gap-4 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"><Menu size={24} /></button>
            <div className="flex flex-col">
                <div className="flex items-center gap-3 md:hidden"> <img src={LOGO_URL} alt="Logo" className="h-10 w-auto object-contain" /><span className="font-bold text-white text-lg leading-tight">Accademia</span></div>
                <div className="hidden md:flex items-center gap-4">
                    {!isSidebarOpen && (<img src={LOGO_URL} alt="Logo" className="h-12 w-auto object-contain transition-all duration-300 animate-in fade-in slide-in-from-left-4" />)}
                    <h1 className="text-xl font-light text-white capitalize tracking-tight border-l border-gray-700 pl-4 ml-2">{menuItems.find(i => i.id === activeView)?.label || 'Dashboard'}</h1>
                </div>
            </div>
          </div>
          <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 items-center gap-3 bg-gray-900/50 px-4 py-1.5 rounded-full border border-gray-800/50 backdrop-blur-sm">
              <div className="text-right leading-tight"><div className="text-sm font-medium text-white">{user.nome_esteso}</div><div className="text-[10px] text-accademia-red uppercase tracking-wider font-bold">{user.ruolo}</div></div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accademia-red to-red-900 flex items-center justify-center text-white font-bold text-sm shadow-md border border-red-800/30">{user.nome_esteso.charAt(0).toUpperCase()}</div>
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
                  <Suspense fallback={
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                      <div className="w-8 h-8 border-4 border-accademia-red border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-light animate-pulse">Caricamento sezione...</p>
                    </div>
                  }>
                    {renderContent()}
                  </Suspense>
                </div>
            </div>
        </div>
      </main>

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
    </div>
  );
}