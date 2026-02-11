import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
    Edit2, Trash2, Plus, X, Search, Smartphone, Mail, Building, 
    Filter, ArrowUpDown, ArrowUp, ArrowDown, MapPin, BookOpen, Check, Calendar, Loader2, Eye
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function DocentiList({ userRole }) {
  const [docenti, setDocenti] = useState([]);
  const [scuole, setScuole] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // Stati Filtri e Ordinamento
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScuola, setFilterScuola] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'cognome', direction: 'asc' });

  // Stati Modale
  const [showModal, setShowModal] = useState(false);
  const [editingDocente, setEditingDocente] = useState(null);
  const [readOnly, setReadOnly] = useState(false); // <--- NUOVO STATO
  const [currentUser, setCurrentUser] = useState(null);

  // Dialog
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, type: 'danger', title: '', message: '', onConfirm: null });

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const { data: profile } = await supabase.from('utenti').select('*').eq('id', session.user.id).single();
            setCurrentUser(profile);
        }

        if (userRole === 'Admin') {
            const { data: sData } = await supabase.from('scuole').select('id, nome').order('nome');
            setScuole(sData || []);
        }

        fetchDocenti();
    };
    init();
  }, [userRole]);

  const fetchDocenti = async () => {
    const { data, error } = await supabase
      .from('docenti')
      .select('*, scuole(nome)')
      .order('cognome');
    
    if (error) console.error("Errore fetch docenti:", error);
    else setDocenti(data || []);
    setLoading(false);
  };

  // --- LOGICA ORDINAMENTO ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={14} className="ml-1 opacity-30" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="ml-1 text-accademia-red" /> 
      : <ArrowDown size={14} className="ml-1 text-accademia-red" />;
  };

  // --- LOGICA FILTRO E SORT COMBINATI ---
  const processedDocenti = useMemo(() => {
    // 1. Filtro
    let result = docenti.filter(d => {
        const fullSearch = `${d.nome} ${d.cognome} ${d.email} ${d.codice_fiscale || ''}`.toLowerCase();
        const matchesSearch = fullSearch.includes(searchTerm.toLowerCase());
        const matchesSchool = filterScuola ? d.school_id === filterScuola : true;
        return matchesSearch && matchesSchool;
    });

    // 2. Ordinamento
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
  }, [docenti, searchTerm, filterScuola, sortConfig]);

  const handleDelete = async (docente) => {
    setConfirmDialog({
        isOpen: true,
        type: 'danger',
        title: 'Elimina Docente',
        message: `Sei sicuro di voler eliminare ${docente.nome} ${docente.cognome}?`,
        onConfirm: async () => {
            const { error } = await supabase.from('docenti').delete().eq('id', docente.id);
            if (error) {
                setDialogConfig({ isOpen: true, type: 'danger', title: 'Errore', message: error.message });
            } else {
                fetchDocenti();
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
                 <Building className="text-accademia-red" size={20}/> Gestione Docenti
                 <span className="bg-gray-800 text-xs px-2 py-0.5 rounded-full border border-gray-700 font-normal ml-2 text-gray-400">
                    {processedDocenti.length}
                 </span>
             </h3>
             <button 
                onClick={() => { setEditingDocente(null); setReadOnly(false); setShowModal(true); }}
                className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
             >
                <Plus size={16} /> Nuovo Docente
             </button>
        </div>

        {/* BARRA FILTRI */}
        <div className="flex flex-col sm:flex-row gap-3">
             <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                <input 
                    type="text" 
                    placeholder="Cerca per nome, cognome, email..." 
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
                        {scuole.map(s => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                    </select>
                 </div>
             )}
        </div>
      </div>

      {/* TABELLA DATI */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-md z-10">
                <tr>
                    <th className="px-6 py-4 font-semibold cursor-pointer hover:text-white group" onClick={() => handleSort('cognome')}>
                        <div className="flex items-center">Docente {getSortIcon('cognome')}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold">Contatti</th>
                    <th className="px-6 py-4 font-semibold cursor-pointer hover:text-white group" onClick={() => handleSort('strumento')}>
                        <div className="flex items-center">Strumento {getSortIcon('strumento')}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-center cursor-pointer hover:text-white group" onClick={() => handleSort('stato')}>
                        <div className="flex items-center justify-center">Stato {getSortIcon('stato')}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-right">Azioni</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                {processedDocenti.map(docente => (
                    <tr key={docente.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                            <div className="font-medium text-white">{docente.cognome} {docente.nome}</div>
                            {/* Visualizzazione compatta indirizzo + CAP + Provincia */}
                            {docente.indirizzo && (
                                <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin size={10}/> 
                                    {docente.indirizzo}, {docente.cap} {docente.paese} ({docente.provincia})
                                </div>
                            )}
                        </td>
                        <td className="px-6 py-4 text-gray-400">
                            <div className="flex items-center gap-2"><Mail size={12}/> {docente.email}</div>
                            {docente.cellulare && <div className="flex items-center gap-2 text-xs mt-1"><Smartphone size={12}/> {docente.cellulare}</div>}
                        </td>
                        <td className="px-6 py-4 text-gray-300">
                            {docente.strumento || '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] border ${
                                docente.stato === 'Attivo' 
                                ? 'bg-green-900/20 text-green-400 border-green-900' 
                                : 'bg-gray-700/30 text-gray-500 border-gray-700'
                            }`}>
                                {docente.stato}
                            </span>
                        </td>
                        
                        <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2">
                                {/* PULSANTE OCCHIOLINO */}
                                <button 
                                    onClick={() => { setEditingDocente(docente); setReadOnly(true); setShowModal(true); }} 
                                    className="p-1.5 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                                    title="Visualizza Dettagli"
                                >
                                    <Eye size={16}/>
                                </button>

                                <button onClick={() => { setEditingDocente(docente); setReadOnly(false); setShowModal(true); }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                                <button onClick={() => handleDelete(docente)} className="p-1.5 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                             </div>
                        </td>
                    </tr>
                ))}
                {processedDocenti.length === 0 && (
                    <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">
                            Nessun docente trovato.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>

      {/* MODALE */}
      {showModal && (
        <ModalDocente 
            docente={editingDocente} 
            readOnly={readOnly}
            userRole={userRole}
            currentUser={currentUser}
            scuole={scuole}
            onClose={() => setShowModal(false)}
            onSave={(msg) => { 
                setShowModal(false); 
                fetchDocenti();
                setDialogConfig({ isOpen: true, type: 'success', title: 'Completato', message: msg });
            }}
            setDialogConfig={setDialogConfig}
            setConfirmDialog={setConfirmDialog}
        />
      )}

      {/* Dialogs */}
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

// --- COMPONENTE ModalDocente ---

function ModalDocente({ docente, schoolId, onClose, onSave, readOnly, setDialogConfig, setConfirmDialog }) {
    const isEdit = !!docente;
    const [activeTab, setActiveTab] = useState('anagrafica'); // 'anagrafica' | 'competenze' | 'tariffe'
    
    // Form Dati Anagrafici COMPLETI
    const [formData, setFormData] = useState({
        nome: docente?.nome || '',
        cognome: docente?.cognome || '',
        email: docente?.email || '',
        cellulare: docente?.cellulare || '',
        pec: docente?.pec || '',
        codice_fiscale: docente?.codice_fiscale || '',
        partita_iva: docente?.partita_iva || '',
        indirizzo: docente?.indirizzo || '',
        numero_civico: docente?.numero_civico || '',
        cap: docente?.cap || '',
        paese: docente?.paese || '',
        provincia: docente?.provincia || '',
        strumento: docente?.strumento || '',
        stato: docente?.stato || 'Attivo',
        school_id: docente?.school_id || schoolId
    });

    // Stati per Competenze
    const [availableLezioni, setAvailableLezioni] = useState([]);
    const [selectedLezioni, setSelectedLezioni] = useState([]);

    // Stati per Tariffe
    const [tariffe, setTariffe] = useState([]);
    const [newTariffa, setNewTariffa] = useState({ paga_oraria: '', data_inizio: '' });
    const [loadingTariffe, setLoadingTariffe] = useState(false);

    // Caricamento Dati Iniziali
    useEffect(() => {
        const loadDati = async () => {
            // 1. Carica Catalogo Lezioni della scuola
            if (formData.school_id) {
                const { data: lezData } = await supabase
                    .from('tipi_lezioni')
                    .select('*')
                    .eq('school_id', formData.school_id)
                    .eq('attivo', true)
                    .order('tipo');
                setAvailableLezioni(lezData || []);
            }

            // 2. Se in modifica, carica lezioni assegnate e tariffe
            if (isEdit && docente.id) {
                // Competenze
                const { data: assocData } = await supabase
                    .from('docenti_tipi_lezioni')
                    .select('tipo_lezione_id')
                    .eq('docente_id', docente.id);
                if (assocData) setSelectedLezioni(assocData.map(a => a.tipo_lezione_id));

                // Tariffe
                fetchTariffe();
            }
        };
        loadDati();
    }, [formData.school_id, isEdit, docente]);

    const fetchTariffe = async () => {
        if (!docente?.id) return;
        setLoadingTariffe(true);
        const { data } = await supabase
            .from('docenti_tariffe')
            .select('*')
            .eq('docente_id', docente.id)
            .order('data_inizio', { ascending: false });
        setTariffe(data || []);
        setLoadingTariffe(false);
    };

    const handleAddTariffa = async () => {
        if (!newTariffa.paga_oraria || !newTariffa.data_inizio) {
            return setDialogConfig({ isOpen: true, type: 'warning', title: 'Dati Mancanti', message: 'Inserisci importo e data di inizio validità.' });
        }
        
        const { error } = await supabase.from('docenti_tariffe').insert([{
            docente_id: docente.id, // ID testuale del docente
            paga_oraria: parseFloat(newTariffa.paga_oraria),
            data_inizio: newTariffa.data_inizio
        }]);

        if (error) {
            setDialogConfig({ isOpen: true, type: 'danger', title: 'Errore Inserimento', message: error.message });
        } else {
            setNewTariffa({ paga_oraria: '', data_inizio: '' });
            fetchTariffe();
        }
    };

    const handleDeleteTariffa = async (id) => {
        setConfirmDialog({
            isOpen: true,
            type: 'danger',
            title: 'Elimina Tariffa',
            message: 'Sei sicuro di voler eliminare questa tariffa dallo storico?',
            onConfirm: async () => {
                const { error } = await supabase.from('docenti_tariffe').delete().eq('id', id);
                if (error) {
                    setDialogConfig({ isOpen: true, type: 'danger', title: 'Errore', message: error.message });
                } else {
                    fetchTariffe();
                }
                setConfirmDialog(d => ({ ...d, isOpen: false }));
            }
        });
    };

    const toggleLezione = (lezId) => {
        // Blocca se in sola lettura
        if (readOnly) return;
        setSelectedLezioni(prev => prev.includes(lezId) ? prev.filter(id => id !== lezId) : [...prev, lezId]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 1. Salva Docente
        let docenteId = docente?.id;
        const payload = { ...formData };

        if (isEdit) {
            const { error } = await supabase.from('docenti').update(payload).eq('id', docenteId);
            if (error) {
                setDialogConfig({ isOpen: true, type: 'danger', title: 'Errore Aggiornamento', message: error.message });
                return;
            }
        } else {
            const { data, error } = await supabase.from('docenti').insert([payload]).select().single();
            if (error) {
                setDialogConfig({ isOpen: true, type: 'danger', title: 'Errore Creazione', message: error.message });
                return;
            }
            docenteId = data.id;
        }

        // 2. Salva Competenze
        // Nota: Assicurati che docenti_tipi_lezioni accetti TEXT come docente_id se non l'hai cambiato
        await supabase.from('docenti_tipi_lezioni').delete().eq('docente_id', docenteId);
        if (selectedLezioni.length > 0) {
            const assocPayload = selectedLezioni.map(lezId => ({ docente_id: docenteId, tipo_lezione_id: lezId }));
            await supabase.from('docenti_tipi_lezioni').insert(assocPayload);
        }

        onSave("Docente salvato con successo!");
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-4xl rounded-xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[95vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                
                <div className="flex justify-between items-start mb-6 border-b border-gray-800 pb-4">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            {isEdit ? (readOnly ? <Eye size={20}/> : <Edit2 size={20}/>) : <Plus size={20}/>} 
                            {isEdit ? (readOnly ? 'Dettaglio Docente' : 'Modifica Docente') : 'Nuovo Docente'}
                        </h3>
                        {!readOnly && isEdit && <p className="text-xs text-gray-500 mt-1">Gestisci anagrafica completa, competenze e compensi.</p>}
                    </div>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                {/* TABS HEADER */}
                <div className="flex gap-6 mb-6 border-b border-gray-800">
                    {['anagrafica', 'competenze', 'tariffe'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-3 text-sm font-bold transition-all border-b-2 capitalize ${
                                activeTab === tab 
                                ? 'text-accademia-red border-accademia-red' 
                                : 'text-gray-500 border-transparent hover:text-white'
                            }`}
                        >
                            {tab === 'tariffe' && !isEdit ? <span className="opacity-50 cursor-not-allowed">Compensi & Tariffe</span> : 
                             tab === 'tariffe' ? 'Compensi & Tariffe' : 
                             tab === 'competenze' ? 'Competenze Didattiche' : tab}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit}>
                    
                    {/* TAB: ANAGRAFICA COMPLETA */}
                    {activeTab === 'anagrafica' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-2">
                            
                            {/* Sezione Principale */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome *</label><input type="text" disabled={readOnly} value={formData.nome} onChange={e => handleChange('nome', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" required /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cognome *</label><input type="text" disabled={readOnly} value={formData.cognome} onChange={e => handleChange('cognome', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" required /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Stato</label>
                                    <select disabled={readOnly} value={formData.stato} onChange={e => handleChange('stato', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                                        <option value="Attivo">Attivo</option>
                                        <option value="Inattivo">Inattivo</option>
                                    </select>
                                </div>
                            </div>

                            {/* Contatti e Dati Professionali */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label><input type="email" disabled={readOnly} value={formData.email} onChange={e => handleChange('email', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cellulare</label><input type="tel" disabled={readOnly} value={formData.cellulare} onChange={e => handleChange('cellulare', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">PEC</label><input type="email" disabled={readOnly} value={formData.pec} onChange={e => handleChange('pec', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                            </div>
                            
                            {/* Dati Fiscali */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-900/30 p-3 rounded-lg border border-gray-800">
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Codice Fiscale</label><input type="text" disabled={readOnly} value={formData.codice_fiscale} onChange={e => handleChange('codice_fiscale', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Partita IVA</label><input type="text" disabled={readOnly} value={formData.partita_iva} onChange={e => handleChange('partita_iva', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Strumento</label><input type="text" disabled={readOnly} value={formData.strumento} onChange={e => handleChange('strumento', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" placeholder="Es. Chitarra" /></div>
                            </div>

                            {/* Indirizzo Completo */}
                            <div className="bg-gray-900/30 p-3 rounded-lg border border-gray-800">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Indirizzo di Residenza</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-3"><label className="block text-[10px] text-gray-400 uppercase mb-1">Via / Piazza</label><input type="text" disabled={readOnly} value={formData.indirizzo} onChange={e => handleChange('indirizzo', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                    <div><label className="block text-[10px] text-gray-400 uppercase mb-1">N. Civico</label><input type="text" disabled={readOnly} value={formData.numero_civico} onChange={e => handleChange('numero_civico', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                    <div><label className="block text-[10px] text-gray-400 uppercase mb-1">CAP</label><input type="text" disabled={readOnly} value={formData.cap} onChange={e => handleChange('cap', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                    <div><label className="block text-[10px] text-gray-400 uppercase mb-1">Città / Paese</label><input type="text" disabled={readOnly} value={formData.paese} onChange={e => handleChange('paese', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                    <div><label className="block text-[10px] text-gray-400 uppercase mb-1">Provincia</label><input type="text" disabled={readOnly} value={formData.provincia} onChange={e => handleChange('provincia', e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" /></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: COMPETENZE */}
                    {activeTab === 'competenze' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-400">Seleziona le tipologie di lezione che questo docente è abilitato a svolgere.</p>
                                <span className="text-xs bg-accademia-red/10 text-accademia-red px-2 py-1 rounded border border-accademia-red/20">Selezionate: {selectedLezioni.length}</span>
                            </div>
                            
                            {availableLezioni.length === 0 ? (
                                <p className="text-sm text-yellow-500 bg-yellow-900/10 p-4 rounded border border-yellow-900/30 text-center">Nessuna lezione configurata nella scuola.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                                    {availableLezioni.map(lez => {
                                        const isSelected = selectedLezioni.includes(lez.id);
                                        return (
                                            <div 
                                                key={lez.id} 
                                                onClick={() => toggleLezione(lez.id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all select-none group ${
                                                    isSelected 
                                                    ? 'bg-accademia-red/20 border-accademia-red shadow-md' 
                                                    : 'bg-gray-800/50 border-gray-700'
                                                } ${
                                                    readOnly 
                                                    ? 'cursor-default opacity-80' 
                                                    : 'cursor-pointer hover:border-gray-500 hover:bg-gray-800'
                                                }`}
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-accademia-red border-accademia-red' : 'border-gray-500 group-hover:border-gray-400'}`}>
                                                    {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <span className={`block text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{lez.tipo}</span>
                                                    <span className="text-[10px] text-gray-600 block">{lez.durata_minuti} min</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: TARIFFE */}
                    {activeTab === 'tariffe' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
                             {!isEdit ? (
                                <div className="text-center py-10 text-gray-500">
                                    Salva prima il docente per gestire le tariffe.
                                </div>
                            ) : (
                                <>
                                    {/* Nascondi form aggiunta tariffa se in readOnly */}
                                    {!readOnly && (
                                        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 shadow-lg">
                                            <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                                <Plus size={16} className="text-accademia-red"/> Nuova Tariffa Oraria
                                            </h4>
                                            <div className="flex gap-4 items-end">
                                                <div className="flex-1">
                                                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Paga Oraria (€)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                                                        <input 
                                                            type="number" 
                                                            step="0.50" 
                                                            placeholder="0.00" 
                                                            className="w-full bg-accademia-input border border-gray-600 rounded p-2 pl-7 text-white text-sm focus:border-accademia-red focus:outline-none"
                                                            value={newTariffa.paga_oraria}
                                                            onChange={e => setNewTariffa({...newTariffa, paga_oraria: e.target.value})}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Valida dal</label>
                                                    <input 
                                                        type="date" 
                                                        className="w-full bg-accademia-input border border-gray-600 rounded p-2 text-white text-sm focus:border-accademia-red focus:outline-none"
                                                        value={newTariffa.data_inizio}
                                                        onChange={e => setNewTariffa({...newTariffa, data_inizio: e.target.value})}
                                                    />
                                                </div>
                                                <button 
                                                    type="button" 
                                                    onClick={handleAddTariffa}
                                                    className="bg-green-700 hover:bg-green-600 text-white p-2 rounded-md h-[38px] px-6 font-bold text-sm shadow-md transition-colors"
                                                >
                                                    Aggiungi
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-3 flex items-center gap-1">
                                                <span className="text-accademia-red">*</span> La tariffa sarà applicata a tutte le lezioni svolte a partire dalla data indicata.
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <h4 className="text-sm font-bold text-gray-400 uppercase mb-3 px-1">Storico Tariffe</h4>
                                        {loadingTariffe ? (
                                            <div className="flex items-center gap-2 text-gray-500 text-sm p-4"><Loader2 className="animate-spin" size={16}/> Caricamento...</div>
                                        ) : tariffe.length === 0 ? (
                                            <div className="text-sm text-yellow-500 italic p-4 bg-yellow-900/10 border border-yellow-900/30 rounded text-center">
                                                Nessuna tariffa impostata. <br/>Il compenso calcolato per le lezioni sarà 0 €.
                                            </div>
                                        ) : (
                                            <div className="border border-gray-800 rounded-lg overflow-hidden">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="text-xs text-gray-500 uppercase bg-gray-900">
                                                        <tr>
                                                            <th className="p-3">Data Inizio Validità</th>
                                                            <th className="p-3">Paga Oraria</th>
                                                            {/* Nascondi header azioni se readOnly */}
                                                            {!readOnly && <th className="p-3 text-right">Azioni</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-800 bg-gray-900/20">
                                                        {tariffe.map(t => (
                                                            <tr key={t.id} className="hover:bg-gray-800/50 transition-colors">
                                                                <td className="p-3 text-gray-300">
                                                                    <div className="flex items-center gap-2">
                                                                        <Calendar size={14} className="text-gray-600"/>
                                                                        {new Date(t.data_inizio).toLocaleDateString('it-IT')}
                                                                    </div>
                                                                </td>
                                                                <td className="p-3 text-white font-mono font-bold text-base">
                                                                    € {t.paga_oraria.toFixed(2)}
                                                                </td>
                                                                {/* Nascondi azioni se readOnly */}
                                                                {!readOnly && (
                                                                    <td className="p-3 text-right">
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => handleDeleteTariffa(t.id)}
                                                                            className="text-gray-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-900/20 transition-colors"
                                                                            title="Elimina Tariffa"
                                                                        >
                                                                            <Trash2 size={16}/>
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* FOOTER ACTIONS */}
                    <div className="flex justify-end gap-3 pt-6 border-t border-gray-800 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
                            {readOnly ? "Chiudi" : "Annulla"}
                        </button>
                        
                        {!readOnly && (
                            <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg text-sm transition-all hover:shadow-red-900/20">
                                {isEdit ? 'Salva Modifiche' : 'Crea Docente'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}