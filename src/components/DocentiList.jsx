import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
    Edit2, Trash2, Plus, X, Search, Smartphone, Mail, Building, 
    Filter, ArrowUpDown, ArrowUp, ArrowDown, MapPin, BookOpen, Check 
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
    // Nota: rimuovi 'cellulare' dalla select se era esplicito, ma con * va bene se la colonna è stata droppata
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
                setDialogConfig({ isOpen: true, type: 'error', title: 'Errore', message: error.message });
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
                onClick={() => { setEditingDocente(null); setShowModal(true); }}
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
                            {/* Usiamo CELLULARE, non telefono */}
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
                                <button onClick={() => { setEditingDocente(docente); setShowModal(true); }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
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
            userRole={userRole}
            currentUser={currentUser}
            scuole={scuole}
            onClose={() => setShowModal(false)}
            onSave={(msg) => { 
                setShowModal(false); 
                fetchDocenti();
                setDialogConfig({ isOpen: true, type: 'success', title: 'Completato', message: msg });
            }}
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

// --- SOSTITUISCI IL COMPONENTE ModalDocente ESISTENTE CON QUESTO ---

function ModalDocente({ docente, schoolId, onClose, onSave }) {
    const isEdit = !!docente;
    const [formData, setFormData] = useState({
        nome: docente?.nome || '',
        cognome: docente?.cognome || '',
        email: docente?.email || '',
        cellulare: docente?.cellulare || '',
        strumento: docente?.strumento || '',
        stato: docente?.stato || 'Attivo',
        school_id: docente?.school_id || schoolId
    });

    // Gestione Abilitazioni Lezioni
    const [availableLezioni, setAvailableLezioni] = useState([]); // Tutte le lezioni della scuola
    const [selectedLezioni, setSelectedLezioni] = useState([]);   // IDs selezionati

    useEffect(() => {
        const loadDatiAccessori = async () => {
            // 1. Carica Catalogo Lezioni della scuola
            const { data: lezData } = await supabase
                .from('tipi_lezioni')
                .select('*')
                .eq('school_id', formData.school_id)
                .eq('attivo', true)
                .order('tipo');
            setAvailableLezioni(lezData || []);

            // 2. Se siamo in edit, carica le lezioni già assegnate al docente
            if (isEdit && docente.id) {
                const { data: assocData } = await supabase
                    .from('docenti_tipi_lezioni')
                    .select('tipo_lezione_id')
                    .eq('docente_id', docente.id);
                
                if (assocData) {
                    setSelectedLezioni(assocData.map(a => a.tipo_lezione_id));
                }
            }
        };
        if(formData.school_id) loadDatiAccessori();
    }, [formData.school_id, isEdit, docente]);

    const toggleLezione = (lezId) => {
        setSelectedLezioni(prev => {
            if (prev.includes(lezId)) return prev.filter(id => id !== lezId);
            return [...prev, lezId];
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 1. Salva/Aggiorna Docente
        let docenteId = docente?.id;
        const payload = { ...formData };

        if (isEdit) {
            const { error } = await supabase.from('docenti').update(payload).eq('id', docenteId);
            if (error) return alert("Errore aggiornamento: " + error.message);
        } else {
            const { data, error } = await supabase.from('docenti').insert([payload]).select().single();
            if (error) return alert("Errore creazione: " + error.message);
            docenteId = data.id;
        }

        // 2. Aggiorna Competenze (Lezioni Abilitate)
        // Strategia: Elimina tutto per questo docente e reinserisci i selezionati (più sicuro e veloce)
        await supabase.from('docenti_tipi_lezioni').delete().eq('docente_id', docenteId);

        if (selectedLezioni.length > 0) {
            const assocPayload = selectedLezioni.map(lezId => ({
                docente_id: docenteId,
                tipo_lezione_id: lezId
            }));
            const { error: assocError } = await supabase.from('docenti_tipi_lezioni').insert(assocPayload);
            if (assocError) console.error("Errore salvataggio competenze", assocError);
        }

        onSave();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                
                <div className="flex justify-between mb-4 border-b border-gray-800 pb-2">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {isEdit ? <Edit2 size={20}/> : <UserPlus size={20}/>} 
                        {isEdit ? 'Modifica Docente' : 'Nuovo Docente'}
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* DATI ANAGRAFICI */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome *</label><input type="text" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cognome *</label><input type="text" value={formData.cognome} onChange={e => setFormData({...formData, cognome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cellulare</label><input type="tel" value={formData.cellulare} onChange={e => setFormData({...formData, cellulare: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Strumento/Materia</label><input type="text" value={formData.strumento} onChange={e => setFormData({...formData, strumento: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" placeholder="Es. Pianoforte" /></div>
                    </div>

                    {/* SEZIONE COMPETENZE / LEZIONI ABILITATE */}
                    <div className="pt-4 border-t border-gray-800">
                        <label className="block text-sm font-bold text-accademia-red uppercase mb-3 flex items-center gap-2">
                            <BookOpen size={16}/> Competenze Didattiche (Lezioni Abilitate)
                        </label>
                        
                        {availableLezioni.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">Nessuna tipologia di lezione attiva in questa scuola.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-900/30 p-4 rounded-xl border border-gray-800 max-h-48 overflow-y-auto custom-scrollbar">
                                {availableLezioni.map(lez => {
                                    const isSelected = selectedLezioni.includes(lez.id);
                                    return (
                                        <div 
                                            key={lez.id} 
                                            onClick={() => toggleLezione(lez.id)}
                                            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all select-none ${
                                                isSelected 
                                                ? 'bg-accademia-red/20 border-accademia-red shadow-[0_0_10px_rgba(220,38,38,0.2)]' 
                                                : 'bg-gray-800/50 border-gray-700 hover:border-gray-500'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                isSelected ? 'bg-accademia-red border-accademia-red' : 'border-gray-500'
                                            }`}>
                                                {isSelected && <Check size={14} className="text-white" strokeWidth={4} />}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                                                    {lez.tipo}
                                                </span>
                                                <span className="text-[10px] text-gray-600">{lez.durata_minuti} min</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <p className="text-[10px] text-gray-500 mt-2">
                            * Seleziona le tipologie di lezione che questo docente può inserire nel calendario.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button>
                        <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Salva Docente</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}