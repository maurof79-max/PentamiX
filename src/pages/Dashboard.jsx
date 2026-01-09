import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  Calendar, 
  Users, 
  DollarSign, 
  BookOpen, 
  Settings, 
  UserCog, 
  GraduationCap,
  ClipboardList,
  TableProperties,
  Menu,
  ChevronLeft
} from 'lucide-react';

// --- IMPORT DEI COMPONENTI REALI ---
import DocentiList from '../components/DocentiList';
import Calendario from '../components/Calendario';
import RegistroLezioni from '../components/RegistroLezioni';
import Pagamenti from '../components/Pagamenti';
import AlunniList from '../components/AlunniList';
import TipiLezioni from '../components/TipiLezioni';
import UtentiList from '../components/UtentiList'; 
import RiepilogoFinanziario from '../components/RiepilogoFinanziario'; 
import DettaglioPagamenti from '../components/DettaglioPagamenti'; 

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [activeView, setActiveView] = useState(''); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const navigate = useNavigate();

  // URL Logo Accademia (Supabase Storage)
  const LOGO_URL = "https://mqdpojtisighqjmyzdwz.supabase.co/storage/v1/object/public/images/logo-glow.png";

  useEffect(() => {
    const storedUser = localStorage.getItem('accademia_user');
    if (!storedUser) {
      navigate('/'); 
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    if (!activeView) {
      if (parsedUser.ruolo === 'Docente') {
        setActiveView('calendario_personale'); 
      } else {
        // Admin: Primo elemento è Gestione Utenti
        if (parsedUser.ruolo === 'Admin') setActiveView('utenti');
        // Gestore: Primo elemento è Gestione Docenti
        else setActiveView('docenti');
      }
    }
    
    // Su mobile, chiudi la sidebar di default
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [navigate, activeView]);

  const handleLogout = () => {
    if(confirm("Vuoi davvero uscire?")) {
      localStorage.removeItem('accademia_user');
      navigate('/');
    }
  };

  const handleMenuClick = (viewId) => {
    setActiveView(viewId);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  if (!user) return <div className="flex items-center justify-center h-screen bg-accademia-dark text-gray-500">Caricamento profilo...</div>;

  // --- LOGICA MENU LATERALE (ORDINE AGGIORNATO) ---
  const menuItems = [];

  // 1. GESTIONE UTENTI (Solo Admin)
  if (user.ruolo === 'Admin') {
    menuItems.push({ id: 'utenti', label: 'Gestione Utenti', icon: <UserCog size={18}/> });
  }

  // 2. GESTIONE DOCENTI (Admin e Gestore) - Rinominato
  if (user.ruolo !== 'Docente') {
    menuItems.push({ id: 'docenti', label: 'Gestione Docenti', icon: <Users size={18}/> });
  }

  // 3. GESTIONE ALUNNI (Tutti)
  menuItems.push({ id: 'alunni', label: 'Gestione Alunni', icon: <GraduationCap size={18}/> });

  // 4. TIPOLOGIE LEZIONI (Admin e Gestore)
  if (user.ruolo !== 'Docente') {
    menuItems.push({ id: 'tipi_lezioni', label: 'Tipologie Lezioni', icon: <Settings size={18}/> });
  }

  // 5. CALENDARIO
  if (user.ruolo === 'Docente') {
    menuItems.push({ id: 'calendario_personale', label: 'Il mio Calendario', icon: <Calendar size={18}/> });
  } else {
    menuItems.push({ id: 'calendario_docenti', label: 'Calendario Docenti', icon: <Calendar size={18}/> });
  }

  // 6. REGISTRO LEZIONI (Tutti)
  menuItems.push({ id: 'registro_lezioni', label: 'Registro Lezioni', icon: <BookOpen size={18}/> });

  // 7. REGISTRO PAGAMENTI (Admin e Gestore)
  if (user.ruolo !== 'Docente') {
    menuItems.push({ id: 'pagamenti', label: 'Registro Pagamenti', icon: <DollarSign size={18}/> });
  }

  // 8. RIEPILOGO PAGAMENTI (Admin e Gestore)
  if (user.ruolo !== 'Docente') {
    menuItems.push({ id: 'dettaglio_pagamenti', label: 'Riepilogo Pagamenti', icon: <TableProperties size={18}/> });
  }

  // 9. RIEPILOGO FINANZIARIO (Admin e Gestore)
  if (user.ruolo !== 'Docente') {
    menuItems.push({ id: 'finanza', label: 'Riepilogo Finanziario', icon: <ClipboardList size={18}/> });
  }


  // --- RENDER CONTENT ---
  const renderContent = () => {
    switch (activeView) {
      case 'utenti': return <UtentiList />;
      case 'docenti': return <DocentiList userRole={user.ruolo} />;
      case 'alunni': return <AlunniList userRole={user.ruolo} />;
      case 'tipi_lezioni': return <TipiLezioni userRole={user.ruolo} />;
      
      case 'calendario_personale': 
      case 'calendario_docenti': 
        return <Calendario user={user} />;
      
      case 'registro_lezioni': return <RegistroLezioni user={user} />;
      case 'pagamenti': return <Pagamenti />;
      case 'dettaglio_pagamenti': return <DettaglioPagamenti />;
      case 'finanza': return <RiepilogoFinanziario />;
      
      default: return <div className="p-10 text-center text-gray-500">Seleziona una voce dal menu</div>;
    }
  };

  return (
    <div className="min-h-screen flex bg-accademia-dark text-accademia-text font-sans overflow-hidden">
      
      {/* SIDEBAR (Collapsible) */}
      <aside 
        className={`bg-accademia-card border-r border-gray-800 flex flex-col shadow-2xl z-30 transition-all duration-300 ease-in-out absolute md:relative h-full ${
          isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden'
        }`}
      >
        <div className="p-6 border-b border-gray-800 flex justify-between items-center min-w-[16rem]">
          {/* LOGO SIDEBAR */}
          <div className="flex items-center justify-center w-full pr-2"> 
            <img 
              src={LOGO_URL} 
              alt="Accademia Logo" 
              className="h-auto w-full max-w-[130px] object-contain" 
            />
          </div>

          {/* Close button for mobile */}
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="md:hidden text-gray-400 hover:text-white"
          >
            <ChevronLeft size={24} />
          </button>
        </div>
        
        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar min-w-[16rem]">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest px-3 mb-2 mt-2">Menu</div>
          {menuItems.map((item) => (
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
        </nav>

        {/* Footer Info (Version) */}
        <div className="p-4 border-t border-gray-800 min-w-[16rem] text-center">
            <div className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
                Gestionale v2.0
            </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-accademia-dark relative w-full">
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-gray-900 to-transparent pointer-events-none z-0"></div>
        
        {/* Header Bar (Mobile & Desktop) */}
        <header className="h-16 bg-accademia-card border-b border-gray-800 flex items-center justify-between px-4 z-20 shrink-0 gap-4 relative">
          
          {/* Left: Sidebar Toggle & Mobile Logo */}
          <div className="flex items-center gap-4">
            <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
                <Menu size={24} />
            </button>
            
            <div className="flex flex-col">
                {/* LOGO VISIBILE SE SIDEBAR CHIUSA */}
                <div className="flex items-center gap-3 md:hidden"> 
                {/* Mobile: Logo e Titolo App */}
                <img src={LOGO_URL} alt="Logo" className="h-10 w-auto object-contain" />
                <span className="font-bold text-white text-lg leading-tight">Accademia</span>
                </div>

                {/* Desktop: Titolo Pagina se sidebar aperta, Logo se chiusa */}
                <div className="hidden md:flex items-center gap-4">
                    {!isSidebarOpen && (
                        <img 
                            src={LOGO_URL} 
                            alt="Logo" 
                            className="h-12 w-auto object-contain transition-all duration-300 animate-in fade-in slide-in-from-left-4" 
                        />
                    )}
                    
                    <h1 className="text-xl font-light text-white capitalize tracking-tight border-l border-gray-700 pl-4 ml-2">
                        {menuItems.find(i => i.id === activeView)?.label || 'Dashboard'}
                    </h1>
                </div>
                
                {/* Mobile role badge */}
                <span className="text-[10px] text-accademia-red font-bold uppercase md:hidden mt-0.5">{user.ruolo}</span>
            </div>
          </div>

          {/* CENTER: User Info (Absolute Centered) */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 items-center gap-3 bg-gray-900/50 px-4 py-1.5 rounded-full border border-gray-800/50 backdrop-blur-sm">
              <div className="text-right leading-tight">
                  <div className="text-sm font-medium text-white">{user.nome_esteso}</div>
                  <div className="text-[10px] text-accademia-red uppercase tracking-wider font-bold">
                      {user.ruolo}
                  </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accademia-red to-red-900 flex items-center justify-center text-white font-bold text-sm shadow-md border border-red-800/30">
                  {user.nome_esteso.charAt(0).toUpperCase()}
              </div>
          </div>

          {/* Right: Logout Button */}
          <div className="flex items-center justify-end">
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-red-900/20 hover:border-red-900/30 border border-transparent rounded-lg transition-all"
                title="Disconnetti"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">Esci</span>
              </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 z-10 custom-scrollbar relative w-full">
            {/* Overlay for mobile when sidebar is open */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                ></div>
            )}

            <div className="max-w-[1800px] mx-auto h-full flex flex-col">
                <div className="flex-1 bg-accademia-card border border-gray-800 rounded-xl shadow-2xl relative overflow-hidden flex flex-col h-full">
                    {renderContent()}
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}