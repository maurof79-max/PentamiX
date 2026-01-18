import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
  Plus, Search, Edit2, Trash2, X, Phone, Mail, 
  MapPin, User, GraduationCap, UserPlus, BookOpen, Check 
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function DocentiList({ userRole }) {
  const [docenti, setDocenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const [dialogConfig, setDialogConfig] = useState({ 
    isOpen: false, type: 'info', title: '', message: '', onConfirm: () => {} 
  });

  // Gestione Scuole (per Admin)
  const [scuole, setScuole] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');

  useEffect(() => {
    fetchScuole();
  }, []);

  useEffect(() => {
    if (selectedSchool) fetchDocenti();
    else setDocenti([]);
  }, [selectedSchool]);

  const fetchScuole = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data: profile } = await supabase.from('utenti').select('*').eq('id', session.user.id).single();
    
    let scuoleList = [];
    if (profile.ruolo === 'Admin') {
        const { data } = await supabase.from('scuole').select('id, nome').order('nome');
        scuoleList = data || [];
    } else if (profile.school_id) {
        const { data } = await supabase.from('scuole').select('id, nome').eq('id', profile.school_id);
        scuoleList = data || [];
    }
    setScuole(scuoleList);
    if(scuoleList.length > 0) setSelectedSchool(scuoleList[0].id);
  };

  const fetchDocenti = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('docenti')
      .select('*')
      .eq('school_id', selectedSchool)
      .order('cognome', { ascending: true });
      
    if (error) console.error(error);
    else setDocenti(data);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    setDialogConfig({
      isOpen: true,
      type: 'danger',
      title: 'Elimina Docente',
      message: 'Se elimini questo docente, verranno rimossi anche i collegamenti al calendario. Sei sicuro?',
      showCancel: true,
      onConfirm: async () => {
        const { error } = await supabase.from('docenti').delete().eq('id', id);
        if (error) alert("Errore: " + error.message);
        else fetchDocenti();
        setDialogConfig(prev => ({...prev, isOpen: false}));
      }
    });
  };

  const filteredDocenti = docenti.filter(d => 
    (d.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (d.cognome?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-accademia-card p-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
           <h2 className="text-2xl font-light text-white flex items-center gap-2">
             <GraduationCap className="text-accademia-red" /> Gestione Docenti
           </h2>
           <div className="mt-2 flex items-center gap-2">
               <span className="text-xs text-gray-500 uppercase font-bold">Sede:</span>
               <select 
                  value={selectedSchool} 
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
                  disabled={scuole.length <= 1}
               >
                  {scuole.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
               </select>
           </div>
        </div>

        <button 
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          disabled={!selectedSchool}
          className="bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={18} /> Nuovo Docente
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
        <input 
          type="text" 
          placeholder="Cerca per nome o cognome..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-accademia-input border border-gray-700 rounded-xl text-white focus:outline-none focus:border-accademia-red transition-all"
        />
      </div>

      {/* LISTA DOCENTI */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pb-10">
        {filteredDocenti.map(docente => (
          <div key={docente.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-all group relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full`} style={{ backgroundColor: docente.colore }}></div>
            
            <div className="flex justify-between items-start mb-3 pl-3">
               <div>
                  <h3 className="text-lg font-bold text-white">{docente.cognome} {docente.nome}</h3>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">{docente.strumento}</p>
               </div>
               <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingItem(docente); setShowModal(true); }} className="p-2 bg-gray-800 hover:bg-white hover:text-black rounded-lg text-gray-400 transition-colors"><Edit2 size={16}/></button>
                  <button onClick={() => handleDelete(docente.id)} className="p-2 bg-gray-800 hover:bg-red-600 hover:text-white rounded-lg text-red-400 transition-colors"><Trash2 size={16}/></button>
               </div>
            </div>

            <div className="space-y-2 pl-3">
               <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Mail size={14} className="text-gray-600"/> {docente.email || '-'}
               </div>
               <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Phone size={14} className="text-gray-600"/> {docente.telefono || '-'}
               </div>
            </div>
          </div>
        ))}
        {filteredDocenti.length === 0 && !loading && (
           <div className="col-span-full text-center text-gray-500 py-10 italic">Nessun docente trovato.</div>
        )}
      </div>

      {/* MODALE */}
      {showModal && (
        <ModalDocente 
          docente={editingItem} 
          schoolId={selectedSchool}
          onClose={() => setShowModal(false)} 
          onSave={() => { setShowModal(false); fetchDocenti(); }} 
        />
      )}

      <ConfirmDialog 
        isOpen={dialogConfig.isOpen}
        type={dialogConfig.type}
        title={dialogConfig.title}
        message={dialogConfig.message}
        showCancel={dialogConfig.showCancel}
        onConfirm={dialogConfig.onConfirm}
        onCancel={() => setDialogConfig(prev => ({...prev, isOpen: false}))}
      />
    </div>
  );
}

// --- MODALE DOCENTE (Con gestione Competenze) ---
function ModalDocente({ docente, schoolId, onClose, onSave }) {
    const isEdit = !!docente;
    const [formData, setFormData] = useState({
        nome: docente?.nome || '',
        cognome: docente?.cognome || '',
        email: docente?.email || '',
        telefono: docente?.telefono || '',
        strumento: docente?.strumento || '',
        colore: docente?.colore || '#3B82F6',
        stato: docente?.stato || 'Attivo',
        school_id: docente?.school_id || schoolId
    });

    // Gestione Abilitazioni Lezioni
    const [availableLezioni, setAvailableLezioni] = useState([]); 
    const [selectedLezioni, setSelectedLezioni] = useState([]);   

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

            // 2. Se in edit, carica le lezioni assegnate
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
        
        let docenteId = docente?.id;
        const payload = { ...formData };

        // 1. Salva/Aggiorna Docente
        if (isEdit) {
            const { error } = await supabase.from('docenti').update(payload).eq('id', docenteId);
            if (error) return alert("Errore aggiornamento: " + error.message);
        } else {
            const { data, error } = await supabase.from('docenti').insert([payload]).select().single();
            if (error) return alert("Errore creazione: " + error.message);
            docenteId = data.id;
        }

        // 2. Aggiorna Competenze (Delete + Insert Strategy)
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome *</label><input type="text" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Cognome *</label><input type="text" value={formData.cognome} onChange={e => setFormData({...formData, cognome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Telefono</label><input type="tel" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" /></div>
                        <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Strumento/Materia</label><input type="text" value={formData.strumento} onChange={e => setFormData({...formData, strumento: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" placeholder="Es. Pianoforte" /></div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Colore Calendario</label>
                            <div className="flex gap-2 items-center">
                                <input type="color" value={formData.colore} onChange={e => setFormData({...formData, colore: e.target.value})} className="h-9 w-12 bg-transparent border border-gray-700 rounded cursor-pointer" />
                                <span className="text-xs text-gray-500">{formData.colore}</span>
                            </div>
                        </div>
                    </div>

                    {/* SEZIONE COMPETENZE */}
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