import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
    Edit2, Trash2, Plus, X, Search, Smartphone, Mail, GraduationCap, 
    Filter, ArrowUpDown, ArrowUp, ArrowDown, MapPin, 
    Building, Check, UserPlus, Users, User, Lock, Eye, Loader2
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function AlunniList({ userRole }) {
  const [alunni, setAlunni] = useState([]);
  const [docenti, setDocenti] = useState([]); 
  const [scuole, setScuole] = useState([]); 
  const [loading, setLoading] = useState(true);

  // Stati Filtri e Ordinamento
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScuola, setFilterScuola] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'cognome', direction: 'asc' });

  // Stati Modale e Utente
  const [showModal, setShowModal] = useState(false);
  const [editingAlunno, setEditingAlunno] = useState(null);
  const [readOnly, setReadOnly] = useState(false); // <--- NUOVO STATO READONLY
  const [currentUser, setCurrentUser] = useState(null);

  // Dialogs
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, type: 'danger', title: '', message: '', onConfirm: null });

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const { data: profile } = await supabase.from('utenti').select('*').eq('id', session.user.id).single();
            setCurrentUser(profile);
            await Promise.all([fetchDocenti(), fetchAlunni(profile)]);
        }

        if (userRole === 'Admin') {
            const { data: sData } = await supabase.from('scuole').select('id, nome').order('nome');
            setScuole(sData || []);
        }
        
        setLoading(false);
    };
    init();
  }, [userRole]);

  const fetchDocenti = async () => {
      const { data } = await supabase
        .from('docenti')
        .select('id, nome, cognome, strumento')
        .eq('stato', 'Attivo')
        .order('cognome');
      setDocenti(data || []);
  };

  const fetchAlunni = async (profile) => {
    // 1. Fetch base (RLS filtra per scuola)
    let query = supabase
      .from('alunni')
      .select(`
        *, 
        scuole(nome),
        associazioni (
            docente_id,
            docenti (id, nome, cognome, strumento)
        )
      `)
      .order('cognome');

    const { data: allAlunni, error } = await query;
    if (error) {
        console.error("Errore fetch alunni:", error);
        return;
    }

    // 2. FILTRO LATO CLIENT PER I DOCENTI
    if (profile?.ruolo === 'Docente' && profile?.id_collegato) {
        const myAlunni = allAlunni.filter(a => 
            a.associazioni && a.associazioni.some(assoc => assoc.docente_id === profile.id_collegato)
        );
        setAlunni(myAlunni);
    } else {
        setAlunni(allAlunni || []);
    }
  };

  // --- LOGICA ORDINAMENTO ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={14} className="ml-1 opacity-30" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="ml-1 text-accademia-red" /> 
      : <ArrowDown size={14} className="ml-1 text-accademia-red" />;
  };

  // --- LOGICA FILTRO E SORT ---
  const processedAlunni = useMemo(() => {
    let result = alunni.filter(a => {
        const fullSearch = `${a.nome} ${a.cognome} ${a.email} ${a.codice_fiscale || ''} ${a.nome_genitore || ''}`.toLowerCase();
        const matchesSearch = fullSearch.includes(searchTerm.toLowerCase());
        const matchesSchool = filterScuola ? a.school_id === filterScuola : true;
        return matchesSearch && matchesSchool;
    });

    if (sortConfig.key) {
        result.sort((a, b) => {
            let valA = a[sortConfig.key] || '';
            let valB = b[sortConfig.key] || '';
            
            if (sortConfig.key === 'cognome') {
                valA = `${a.cognome} ${a.nome}`;
                valB = `${b.cognome} ${b.nome}`;
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return result;
  }, [alunni, searchTerm, filterScuola, sortConfig]);

  const handleDelete = async (alunno) => {
    setConfirmDialog({
        isOpen: true,
        type: 'danger',
        title: 'Elimina Alunno',
        message: `Sei sicuro di voler eliminare l'alunno ${alunno.nome} ${alunno.cognome}?`,
        onConfirm: async () => {
            const { error } = await supabase.from('alunni').delete().eq('id', alunno.id);
            if (error) {
                setDialogConfig({ isOpen: true, type: 'error', title: 'Errore', message: error.message });
            } else {
                fetchAlunni(currentUser);
                setConfirmDialog({ ...confirmDialog, isOpen: false });
            }
        }
    });
  };

  return (
    <div className="h-full flex flex-col bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      
      {/* HEADER & TOOLBAR */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/20 space-y-4 shrink-0">
        <div className="flex justify-between items-center">
             <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 <GraduationCap className="text-accademia-red" size={20}/> Gestione Alunni
                 <span className="bg-gray-800 text-xs px-2 py-0.5 rounded-full border border-gray-700 font-normal ml-2 text-gray-400">
                    {processedAlunni.length}
                 </span>
             </h3>
             <button 
                onClick={() => { setEditingAlunno(null); setReadOnly(false); setShowModal(true); }} // Assicurati di resettare readOnly
                className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
             >
                <Plus size={16} /> Nuovo Alunno
             </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
             <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                <input 
                    type="text" 
                    placeholder="Cerca alunno, genitore, CF..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-4 py-2 text-sm focus:border-accademia-red focus:outline-none"
                />
             </div>
             {userRole === 'Admin' && (
                 <div className="relative w-full sm:w-64">
                    <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                    <select
                        value={filterScuola}
                        onChange={(e) => setFilterScuola(e.target.value)}
                        className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-8 py-2 text-sm appearance-none focus:border-accademia-red focus:outline-none cursor-pointer"
                    >
                        <option value="">Tutte le Scuole</option>
                        {scuole.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                 </div>
             )}
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-md z-10">
                <tr>
                    <th className="px-6 py-4 font-semibold cursor-pointer hover:text-white group" onClick={() => handleSort('cognome')}>
                        <div className="flex items-center">Alunno {getSortIcon('cognome')}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold">Contatti</th>
                    <th className="px-6 py-4 font-semibold">Docenti</th>
                    {userRole === 'Admin' && <th className="px-6 py-4 font-semibold">Scuola</th>}
                    <th className="px-6 py-4 font-semibold text-center cursor-pointer hover:text-white group" onClick={() => handleSort('stato')}>
                        <div className="flex items-center justify-center">Stato {getSortIcon('stato')}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-right">Azioni</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                {processedAlunni.map(alunno => (
                    <tr key={alunno.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                            <div className="font-medium text-white">{alunno.cognome} {alunno.nome}</div>
                            {alunno.indirizzo && (
                                <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin size={10}/> 
                                    {alunno.indirizzo}, {alunno.cap} {alunno.paese}
                                </div>
                            )}
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                            {alunno.email && <div className="flex items-center gap-2"><Mail size={12}/> {alunno.email}</div>}
                            {alunno.cellulare && <div className="flex items-center gap-2 text-xs mt-1"><Smartphone size={12}/> {alunno.cellulare}</div>}
                            {!alunno.email && !alunno.cellulare && <span className="text-gray-600 italic">-</span>}
                        </td>
                        <td className="px-6 py-4">
                            {alunno.associazioni && alunno.associazioni.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                    {alunno.associazioni.map((a, idx) => (
                                        <div key={idx} className="flex items-center gap-1 text-xs text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded-md w-fit border border-blue-900/30">
                                            <User size={10}/>
                                            {a.docenti?.cognome} {a.docenti?.nome}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-gray-600 text-xs italic">Nessun docente</span>
                            )}
                        </td>
                        {userRole === 'Admin' && (
                            <td className="px-6 py-4 text-accademia-red text-xs font-bold uppercase">
                                {alunno.scuole?.nome || '-'}
                            </td>
                        )}
                        <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] border ${
                                alunno.stato === 'Attivo' 
                                ? 'bg-green-900/20 text-green-400 border-green-900' 
                                : 'bg-gray-700/30 text-gray-500 border-gray-700'
                            }`}>
                                {alunno.stato || 'Attivo'}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2">
                                {/* PULSANTE OCCHIOLINO (SOLA LETTURA) */}
                                <button 
                                    onClick={() => { setEditingAlunno(alunno); setReadOnly(true); setShowModal(true); }} 
                                    className="p-1.5 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                                    title="Visualizza Dettagli"
                                >
                                    <Eye size={16}/>
                                </button>

                                <button onClick={() => { setEditingAlunno(alunno); setReadOnly(false); setShowModal(true); }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                                <button onClick={() => handleDelete(alunno)} className="p-1.5 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                             </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {showModal && (
        <ModalAlunno 
            alunno={editingAlunno} 
            readOnly={readOnly} // Passa la prop readOnly
            docentiList={docenti} 
            userRole={userRole}
            currentUser={currentUser}
            scuole={scuole}
            onClose={() => setShowModal(false)}
            onSave={(msg) => { 
                setShowModal(false); 
                fetchAlunni(currentUser); 
                setDialogConfig({ isOpen: true, type: 'success', title: 'Completato', message: msg });
            }}
        />
      )}

      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        type={confirmDialog.type}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
      <ConfirmDialog 
        isOpen={dialogConfig.isOpen}
        type={dialogConfig.type}
        title={dialogConfig.title}
        message={dialogConfig.message}
        showCancel={false}
        confirmText="OK"
        onConfirm={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
      />
    </div>
  );
}

function ModalAlunno({ alunno, docentiList, userRole, currentUser, scuole, onClose, onSave, readOnly }) {
    const isEdit = !!alunno;
    // Forza la tab 'form' se siamo in readOnly
    const [activeTab, setActiveTab] = useState((isEdit || readOnly) ? 'form' : 'search');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [docenteFilter, setDocenteFilter] = useState('');

    const [formData, setFormData] = useState({
        id: alunno?.id || null,
        nome: alunno?.nome || '',
        cognome: alunno?.cognome || '',
        email: alunno?.email || '',
        cellulare: alunno?.cellulare || '',
        stato: alunno?.stato || 'Attivo',
        school_id: alunno?.school_id || '',
        indirizzo: alunno?.indirizzo || '',
        numero_civico: alunno?.numero_civico || '',
        cap: alunno?.cap || '',
        paese: alunno?.paese || '',
        provincia: alunno?.provincia || '',
        nome_genitore: alunno?.nome_genitore || '',
        email_genitore: alunno?.email_genitore || '',
        cellulare_genitore: alunno?.cellulare_genitore || '',
        codice_fiscale: alunno?.codice_fiscale || '',
        selectedDocenti: [] 
    });
    
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isEdit && userRole !== 'Admin') {
            const updates = {};
            if (currentUser?.school_id) updates.school_id = currentUser.school_id;
            if (userRole === 'Docente' && currentUser?.id_collegato) {
                updates.selectedDocenti = [currentUser.id_collegato];
            }
            setFormData(prev => ({ ...prev, ...updates }));
        }

        if (isEdit && alunno.id) {
            const fetchAssociazioni = async () => {
                const { data } = await supabase.from('associazioni').select('docente_id').eq('alunno_id', alunno.id);
                if (data) {
                    setFormData(prev => ({ ...prev, selectedDocenti: data.map(item => item.docente_id) }));
                }
            };
            fetchAssociazioni();
        }
    }, [isEdit, userRole, currentUser, alunno]);

    // --- LOGICA DI RICERCA LIVE (DEBOUNCE) ---
    useEffect(() => {
        const performSearch = async () => {
            if (searchQuery.length < 2) {
                setSearchResults([]);
                setSearchError(null);
                setSearching(false);
                return;
            }

            setSearching(true); 
            setSearchError(null);
            
            try {
                const terms = searchQuery.trim().split(/\s+/);
                let query = supabase.from('alunni').select('*');
                
                if (currentUser?.school_id) {
                    query = query.eq('school_id', currentUser.school_id);
                }

                if (terms.length === 1) {
                    const term = terms[0]; 
                    query = query.or(`nome.ilike.%${term}%,cognome.ilike.%${term}%`);
                } else {
                    const t1 = terms[0]; const t2 = terms[1]; 
                    query = query.or(`and(nome.ilike.%${t1}%,cognome.ilike.%${t2}%),and(nome.ilike.%${t2}%,cognome.ilike.%${t1}%)`);
                }
                
                const { data, error } = await query.limit(10);
                if (error) throw error;
                setSearchResults(data || []);
            } catch (err) { 
                setSearchError(err.message); 
            } finally { 
                setSearching(false); 
            }
        };

        const timeoutId = setTimeout(() => {
            performSearch();
        }, 500);

        return () => clearTimeout(timeoutId);

    }, [searchQuery, currentUser]);

    const handleLoadForEdit = async (alunnoTrovato) => {
        const { data: assocData } = await supabase.from('associazioni').select('docente_id').eq('alunno_id', alunnoTrovato.id);
        let currentDocenti = assocData ? assocData.map(d => d.docente_id) : [];

        if (userRole === 'Docente' && currentUser?.id_collegato && !currentDocenti.includes(currentUser.id_collegato)) {
            currentDocenti.push(currentUser.id_collegato);
        }

        setFormData({
            ...alunnoTrovato,
            email: alunnoTrovato.email || '', cellulare: alunnoTrovato.cellulare || '',
            indirizzo: alunnoTrovato.indirizzo || '', numero_civico: alunnoTrovato.numero_civico || '', cap: alunnoTrovato.cap || '',
            paese: alunnoTrovato.paese || '', provincia: alunnoTrovato.provincia || '',
            nome_genitore: alunnoTrovato.nome_genitore || '', email_genitore: alunnoTrovato.email_genitore || '', cellulare_genitore: alunnoTrovato.cellulare_genitore || '',
            codice_fiscale: alunnoTrovato.codice_fiscale || '',
            selectedDocenti: currentDocenti
        });
        setActiveTab('form');
    };

    const toggleDocente = (docId) => {
        // Se in readOnly, impedisci modifiche
        if (readOnly) return;
        if (userRole === 'Docente') return; 
        setFormData(prev => {
            const isSelected = prev.selectedDocenti.includes(docId);
            if (isSelected) return { ...prev, selectedDocenti: prev.selectedDocenti.filter(id => id !== docId) };
            else return { ...prev, selectedDocenti: [...prev.selectedDocenti, docId] };
        });
    };

    const filteredDocentiList = docentiList.filter(d => 
        `${d.cognome} ${d.nome} ${d.strumento || ''}`.toLowerCase().includes(docenteFilter.toLowerCase())
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Sicurezza: blocca submit se readOnly
        if (readOnly) return;

        setLoading(true);
        try {
            if (userRole === 'Admin' && !formData.school_id) throw new Error("Seleziona una scuola.");

            const payload = {
                nome: formData.nome, cognome: formData.cognome, email: formData.email, cellulare: formData.cellulare,
                stato: formData.stato, school_id: formData.school_id, indirizzo: formData.indirizzo,
                numero_civico: formData.numero_civico, cap: formData.cap, paese: formData.paese,
                provincia: formData.provincia ? formData.provincia.toUpperCase() : '',
                nome_genitore: formData.nome_genitore, email_genitore: formData.email_genitore, cellulare_genitore: formData.cellulare_genitore,
                codice_fiscale: formData.codice_fiscale ? formData.codice_fiscale.toUpperCase() : ''
            };

            let alunnoId = formData.id;

            if (alunnoId) {
                const { error } = await supabase.from('alunni').update(payload).eq('id', alunnoId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('alunni').insert([payload]).select('id').single();
                if (error) throw error;
                alunnoId = data.id;
            }

            await supabase.from('associazioni').delete().eq('alunno_id', alunnoId);
            
            let finalSelectedDocenti = [...formData.selectedDocenti];
            if (userRole === 'Docente' && currentUser?.id_collegato && !finalSelectedDocenti.includes(currentUser.id_collegato)) {
                finalSelectedDocenti.push(currentUser.id_collegato);
            }

            if (finalSelectedDocenti.length > 0) {
                const assocPayload = finalSelectedDocenti.map(docId => ({
                    alunno_id: alunnoId,
                    docente_id: docId
                }));
                const { error: assocError } = await supabase.from('associazioni').insert(assocPayload);
                if (assocError) throw assocError;
            }

            onSave(formData.id ? "Alunno aggiornato." : "Nuovo alunno creato e associato.");
        } catch (err) {
            alert("Errore: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const showDocentiSection = userRole !== 'Docente' || isEdit;
    // Blocca docenti se: è un docente loggato (suo alunno), OPPURE siamo in readOnly
    const isDocentiReadOnly = userRole === 'Docente' || readOnly;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-4xl rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 overflow-y-auto max-h-[90vh]">
                
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {isEdit ? (readOnly ? <Eye size={20}/> : <Edit2 size={20}/>) : <UserPlus size={20}/>}
                        {isEdit ? (readOnly ? 'Dettaglio Alunno' : 'Modifica Scheda Alunno') : 'Gestione Alunno'}
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                {/* Nascondi tab Cerca/Crea se siamo in readOnly (non ha senso cambiare) */}
                {!alunno && !readOnly && (
                    <div className="flex bg-gray-900/50 p-1 rounded-lg mb-6 border border-gray-800">
                        <button onClick={() => setActiveTab('search')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${activeTab === 'search' ? 'bg-gray-800 text-white shadow border border-gray-700' : 'text-gray-400 hover:text-gray-200'}`}>
                            <Search size={16}/> Cerca Esistente
                        </button>
                        <button onClick={() => setActiveTab('form')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${activeTab === 'form' ? 'bg-gray-800 text-white shadow border border-gray-700' : 'text-gray-400 hover:text-gray-200'}`}>
                            <Plus size={16}/> Crea Nuovo
                        </button>
                    </div>
                )}

                {activeTab === 'search' && (
                    <div className="space-y-4">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                            <input 
                                type="text" 
                                placeholder="Inizia a digitare Nome o Cognome..." 
                                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-3 pl-10 pr-12 text-white focus:border-accademia-red focus:outline-none" 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searching && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-pulse flex items-center gap-1">
                                    <Loader2 size={16} className="animate-spin" />
                                </div>
                            )}
                        </div>
                        
                        {searchError && <p className="text-red-400 text-sm">{searchError}</p>}
                        
                        <div className="space-y-2 mt-4 max-h-60 overflow-y-auto custom-scrollbar">
                            {searchResults.length > 0 ? (
                                searchResults.map(res => (
                                    <div key={res.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg flex justify-between items-center hover:border-gray-500 transition-colors">
                                        <div><div className="font-bold text-white">{res.cognome} {res.nome}</div></div>
                                        <button onClick={() => handleLoadForEdit(res)} className="px-3 py-1.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800 text-xs font-bold rounded flex items-center gap-1"><Edit2 size={12}/> Gestisci</button>
                                    </div>
                                ))
                            ) : ( searchQuery.length >= 2 && !searching && <p className="text-center text-gray-500 py-4">Nessun alunno trovato.</p> )}
                        </div>
                    </div>
                )}

                {/* --- TAB FORM (CREAZIONE/MODIFICA/VISUALIZZAZIONE) --- */}
                {activeTab === 'form' && (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        {userRole === 'Admin' && (
                            <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg mb-4">
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase flex items-center gap-1"><Building size={12}/> Scuola</label>
                                <select disabled={readOnly} value={formData.school_id} onChange={e => setFormData({...formData, school_id: e.target.value})} className="w-full bg-accademia-input border border-gray-600 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" required>
                                    <option value="">-- Seleziona Scuola --</option>
                                    {scuole.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-accademia-red uppercase tracking-wider border-b border-gray-800 pb-1">Anagrafica Alunno</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome *</label><input type="text" disabled={readOnly} value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" required /></div>
                                    <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cognome *</label><input type="text" disabled={readOnly} value={formData.cognome} onChange={e => setFormData({...formData, cognome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" required /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cellulare</label><input type="tel" disabled={readOnly} value={formData.cellulare} onChange={e => setFormData({...formData, cellulare: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" /></div>
                                    <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label><input type="email" disabled={readOnly} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" /></div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Stato</label>
                                    <select disabled={readOnly} value={formData.stato} onChange={e => setFormData({...formData, stato: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50">
                                        <option value="Attivo">Attivo</option><option value="Inattivo">Inattivo</option>
                                    </select>
                                </div>
                                <div className="pt-2">
                                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Residenza</label>
                                    <div className="grid grid-cols-4 gap-3 mb-3">
                                        <div className="col-span-3"><input type="text" placeholder="Indirizzo" disabled={readOnly} value={formData.indirizzo} onChange={e => setFormData({...formData, indirizzo: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white text-xs disabled:opacity-50" /></div>
                                        <div><input type="text" placeholder="N. Civ" disabled={readOnly} value={formData.numero_civico} onChange={e => setFormData({...formData, numero_civico: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white text-xs disabled:opacity-50" /></div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div><input type="text" placeholder="Città" disabled={readOnly} value={formData.paese} onChange={e => setFormData({...formData, paese: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white text-xs disabled:opacity-50" /></div>
                                        <div><input type="text" placeholder="CAP" disabled={readOnly} value={formData.cap} onChange={e => setFormData({...formData, cap: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white text-xs disabled:opacity-50" maxLength={5} /></div>
                                        <div><input type="text" placeholder="PR" disabled={readOnly} value={formData.provincia} onChange={e => setFormData({...formData, provincia: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white text-xs uppercase disabled:opacity-50" maxLength={2} /></div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-accademia-red uppercase tracking-wider border-b border-gray-800 pb-1">Genitore / Referente</h4>
                                <div className="bg-gray-900/40 p-3 rounded-lg border border-gray-700/50 space-y-3">
                                    <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome Genitore</label><input type="text" disabled={readOnly} value={formData.nome_genitore} onChange={e => setFormData({...formData, nome_genitore: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" /></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label><input type="email" disabled={readOnly} value={formData.email_genitore} onChange={e => setFormData({...formData, email_genitore: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" /></div>
                                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cellulare</label><input type="tel" disabled={readOnly} value={formData.cellulare_genitore} onChange={e => setFormData({...formData, cellulare_genitore: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" /></div>
                                    </div>
                                </div>

                                <h4 className="text-xs font-bold text-accademia-red uppercase tracking-wider border-b border-gray-800 pb-1 pt-2">Dati Fiscali</h4>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Codice Fiscale</label><input type="text" disabled={readOnly} value={formData.codice_fiscale} onChange={e => setFormData({...formData, codice_fiscale: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none font-mono uppercase disabled:opacity-50" placeholder="Per emissione ricevuta" /></div>
                            </div>
                        </div>

                        {showDocentiSection && (
                            <div className="pt-6 border-t border-gray-800">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        {isDocentiReadOnly ? <Eye size={16} className="text-gray-400"/> : <Users size={16} className="text-accademia-red"/>}
                                        {isDocentiReadOnly ? 'Docenti Associati (Sola Lettura)' : 'Gestione Didattica: Docenti Associati'}
                                    </h4>
                                    {!isDocentiReadOnly && (
                                        <div className="relative">
                                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500"/>
                                            <input 
                                                type="text" 
                                                placeholder="Cerca docente o strumento..." 
                                                value={docenteFilter}
                                                onChange={(e) => setDocenteFilter(e.target.value)}
                                                className="bg-gray-800 border border-gray-700 rounded-md py-1 pl-8 pr-2 text-xs text-white focus:border-accademia-red focus:outline-none w-56"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="bg-gray-900/30 border border-gray-700 rounded-xl p-4">
                                    {docentiList.length === 0 ? (
                                        <div className="text-center text-gray-500 py-4 text-xs">Nessun docente attivo in questa scuola.</div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto custom-scrollbar">
                                            {filteredDocentiList.map(doc => {
                                                const isSelected = formData.selectedDocenti.includes(doc.id);
                                                const isLocked = isDocentiReadOnly;
                                                return (
                                                    <div 
                                                        key={doc.id}
                                                        onClick={() => toggleDocente(doc.id)}
                                                        className={`rounded-lg p-2 border transition-all flex items-center gap-3 select-none ${
                                                            isSelected 
                                                            ? (isLocked ? 'bg-gray-800 border-gray-600' : 'bg-accademia-red/20 border-accademia-red shadow-[0_0_10px_rgba(220,38,38,0.2)] cursor-pointer') 
                                                            : (isLocked ? 'bg-gray-900/50 border-gray-800 opacity-50' : 'bg-gray-800 border-gray-700 hover:border-gray-500 opacity-80 hover:opacity-100 cursor-pointer')
                                                        }`}
                                                    >
                                                        <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                                                            isSelected 
                                                            ? (isLocked ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-accademia-red border-accademia-red text-white')
                                                            : 'bg-gray-900 border-gray-600 text-transparent'
                                                        }`}>
                                                            {isLocked && isSelected ? <Lock size={10} /> : <Check size={14} strokeWidth={4}/>}
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                                                                {doc.cognome} {doc.nome}
                                                            </span>
                                                            <span className={`text-[10px] truncate ${isSelected ? (isLocked ? 'text-gray-400' : 'text-red-200') : 'text-gray-600'}`}>
                                                                {doc.strumento || '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            {filteredDocentiList.length === 0 && (
                                                <div className="col-span-full text-center text-gray-500 text-xs py-2">Nessun docente trovato con questo filtro.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
                                {readOnly ? "Chiudi" : "Annulla"}
                            </button>
                            {!readOnly && (
                                <button type="submit" disabled={loading} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 transition-all flex items-center gap-2">
                                    <Check size={18}/> Salva
                                </button>
                            )}
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body
    );
}