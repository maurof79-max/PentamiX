import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, Eye, Plus, X, Check, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function DocentiList({ userRole }) {
  const [docenti, setDocenti] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- NUOVI STATI FILTRI ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStato, setFilterStato] = useState('Attivo'); 
  const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'asc' });

  const [showModal, setShowModal] = useState(false);
  const [editingDocente, setEditingDocente] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ 
    isOpen: false, 
    type: 'danger',
    title: '',
    message: '',
    confirmText: 'Conferma',
    onConfirm: null,
    showCancel: true
  });

  // --- FETCH DATI ---
  const fetchDocenti = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('docenti')
      .select('*')
      .order('nome');
    
    if (error) console.error("Errore caricamento docenti:", error);
    else setDocenti(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocenti();
  }, []);

  // --- LOGICA FILTRO E ORDINAMENTO (NUOVA) ---
  const filteredDocenti = useMemo(() => {
    let result = [...docenti];

    // 1. Filtro Nome e Strumento
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(d => 
        (d.nome && d.nome.toLowerCase().includes(lower)) ||
        (d.email && d.email.toLowerCase().includes(lower)) ||
        (d.strumento && d.strumento.toLowerCase().includes(lower))
      );
    }

    // 2. Filtro Stato
    if (filterStato) {
      result = result.filter(d => d.stato === filterStato);
    }
    
    // 3. Ordinamento
    if (sortConfig.key) {
        result.sort((a, b) => {
          let valA = a[sortConfig.key] || '';
          let valB = b[sortConfig.key] || '';
          
          if (typeof valA === 'string') valA = valA.toLowerCase();
          if (typeof valB === 'string') valB = valB.toLowerCase();
  
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

    return result;
  }, [docenti, searchTerm, filterStato, sortConfig]);

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

  // --- HANDLERS ---
  const handleOpenModal = (docente = null) => {
    setEditingDocente(docente);
    setShowModal(true);
  };

  const handleDeleteClick = async (docente) => {
    // Verifica se ci sono lezioni associate
    const { data: lezioni, error } = await supabase
      .from('registro')
      .select('id')
      .eq('docente_id', docente.id)
      .limit(1);

    if (error) {
      console.error("Errore verifica lezioni:", error);
      return;
    }

    if (lezioni && lezioni.length > 0) {
      // Ci sono lezioni: imposta come Non Attivo
      setConfirmDialog({
        isOpen: true,
        type: 'warning',
        title: 'Impossibile Eliminare',
        message: `Il docente "${docente.nome}" ha lezioni registrate nel sistema.\n\nNon può essere eliminato, ma verrà impostato come "Non Attivo".`,
        confirmText: 'Imposta Non Attivo',
        cancelText: 'Annulla',
        showCancel: true,
        onConfirm: async () => {
          const { error: updateError } = await supabase
            .from('docenti')
            .update({ stato: 'Non Attivo' })
            .eq('id', docente.id);

          if (updateError) {
             alert('Errore durante l\'aggiornamento dello stato.');
          } else {
            fetchDocenti();
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        }
      });
    } else {
      // Nessuna lezione: elimina
      setConfirmDialog({
        isOpen: true,
        type: 'danger',
        title: 'Elimina Docente',
        message: `Sei sicuro di voler eliminare il docente "${docente.nome}"?\n\nQuesta azione non può essere annullata.`,
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        showCancel: true,
        onConfirm: async () => {
          const { error: deleteError } = await supabase
            .from('docenti')
            .delete()
            .eq('id', docente.id);

          if (deleteError) {
             alert('Errore durante l\'eliminazione: ' + deleteError.message);
          } else {
            fetchDocenti();
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        }
      });
    }
  };

  // --- RENDER TABLE ---
  if (loading) return <div className="p-8 text-center text-gray-400">Caricamento anagrafica...</div>;

  return (
    <div className="h-full flex flex-col relative bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      
      {/* HEADER & TOOLBAR (NUOVI FILTRI) */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/20 space-y-4 shrink-0">
         <div className="flex justify-between items-center">
             <div className="text-sm text-gray-400 flex items-center gap-2">
                 <span className="font-bold text-white text-lg">Anagrafica Docenti</span>
                 <span className="bg-gray-800 text-xs px-2 py-0.5 rounded-full border border-gray-700">{filteredDocenti.length}</span>
             </div>
             {userRole === 'Admin' && (
                <button 
                  onClick={() => handleOpenModal(null)}
                  className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm"
                >
                  <Plus size={16} />
                  Nuovo Docente
                </button>
             )}
         </div>

         {/* FILTRI */}
         <div className="flex flex-col sm:flex-row gap-3">
             {/* 1. Cerca */}
             <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                <input 
                    type="text" 
                    placeholder="Cerca per nome, strumento, email..." 
                    value={searchTerm}
                    onChange={(e)=>setSearchTerm(e.target.value)}
                    className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-4 py-2 text-sm focus:border-accademia-red focus:outline-none placeholder-gray-600"
                />
             </div>
             
             {/* 2. Filtro Stato */}
             <div className="relative w-full sm:w-48">
                 <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                 <select 
                    value={filterStato}
                    onChange={(e)=>setFilterStato(e.target.value)}
                    className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-8 py-2 text-sm appearance-none focus:border-accademia-red focus:outline-none cursor-pointer"
                 >
                    <option value="">Tutti gli Stati</option>
                    <option value="Attivo">Attivo</option>
                    <option value="Non Attivo">Non Attivo</option>
                 </select>
             </div>
         </div>
      </div>

      {/* Tabella Scrollabile */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/80 text-gray-400 uppercase text-xs sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-6 py-4 font-semibold shadow-sm cursor-pointer hover:text-white group" onClick={() => handleSort('nome')}>
                  <div className="flex items-center">Nome {getSortIcon('nome')}</div>
              </th>
              <th className="px-6 py-4 font-semibold shadow-sm cursor-pointer hover:text-white group" onClick={() => handleSort('strumento')}>
                  <div className="flex items-center">Strumento {getSortIcon('strumento')}</div>
              </th>
              <th className="px-6 py-4 font-semibold shadow-sm">Contatti</th>
              <th className="px-6 py-4 font-semibold text-center shadow-sm cursor-pointer hover:text-white group" onClick={() => handleSort('stato')}>
                  <div className="flex items-center justify-center">Stato {getSortIcon('stato')}</div>
              </th>
              <th className="px-6 py-4 font-semibold text-right shadow-sm">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filteredDocenti.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-800/30 transition-colors group">
                <td className="px-6 py-4 font-medium text-white">{doc.nome}</td>
                <td className="px-6 py-4 text-gray-300">{doc.strumento}</td>
                <td className="px-6 py-4 text-gray-400">
                  <div className="flex flex-col">
                    <span>{doc.email}</span>
                    <span className="text-xs text-gray-500">{doc.cellulare}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${
                    doc.stato === 'Attivo' 
                      ? 'bg-green-900/20 text-green-400 border-green-900/50' 
                      : 'bg-gray-700/30 text-gray-400 border-gray-700'
                  }`}>
                    {doc.stato}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    {userRole === 'Admin' ? (
                      <>
                        <button 
                          onClick={() => handleOpenModal(doc)}
                          className="p-1.5 hover:bg-gray-700 rounded-md text-blue-400 transition-colors" 
                          title="Modifica"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteClick(doc)}
                          className="p-1.5 hover:bg-gray-700 rounded-md text-red-400 transition-colors" 
                          title="Elimina"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleOpenModal(doc)}
                        className="p-1.5 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors" 
                        title="Vedi Dettagli"
                      >
                        <Eye size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODALE DOCENTE (Completa di tutte le logiche e checkbox) */}
      {showModal && (
        <ModalDocente 
          docente={editingDocente} 
          onClose={() => setShowModal(false)} 
          onSave={() => { setShowModal(false); fetchDocenti(); }}
          readOnly={userRole !== 'Admin'}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        type={confirmDialog.type}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        showCancel={confirmDialog.showCancel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// --- COMPONENTE MODALE INTERNO (Completo) ---
function ModalDocente({ docente, onClose, onSave, readOnly }) {
  const [formData, setFormData] = useState({
    id: docente?.id || '',
    nome: docente?.nome || '',
    strumento: docente?.strumento || '',
    email: docente?.email || '',
    cellulare: docente?.cellulare || '',
    stato: docente?.stato || 'Attivo',
    skill_individuale: docente?.skill_individuale || false,
    skill_teoria: docente?.skill_teoria || false,
    skill_supplenze: docente?.skill_supplenze || false,
    skill_laboratori: docente?.skill_laboratori || false,
    skill_rockpop: docente?.skill_rockpop || false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;

    try {
      if (formData.id) {
        // UPDATE
        const { error } = await supabase
          .from('docenti')
          .update(formData)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        // INSERT
        const newId = 'D' + Date.now().toString().slice(-5);
        const { error } = await supabase
          .from('docenti')
          .insert([{ ...formData, id: newId }]);
        if (error) throw error;
      }
      onSave();
    } catch (err) {
      alert("Errore salvataggio: " + err.message);
    }
  };

  // Contenuto della modale
  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={onClose}
      ></div>

      {/* Finestra Modale */}
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/30">
          <h3 className="text-lg font-bold text-white tracking-wide">
            {readOnly ? 'Dettaglio Docente' : (docente ? 'Modifica Docente' : 'Nuovo Docente')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 overflow-y-auto custom-scrollbar bg-accademia-card">
          <form id="docenteForm" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputGroup label="Nome e Cognome" name="nome" value={formData.nome} onChange={handleChange} readOnly={readOnly} required placeholder="Es. Mario Rossi" />
              <InputGroup label="Strumento" name="strumento" value={formData.strumento} onChange={handleChange} readOnly={readOnly} placeholder="Es. Pianoforte" />
              <InputGroup label="Email" name="email" type="email" value={formData.email} onChange={handleChange} readOnly={readOnly} placeholder="email@esempio.com" />
              <InputGroup label="Cellulare" name="cellulare" value={formData.cellulare} onChange={handleChange} readOnly={readOnly} placeholder="+39..." />
              
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold tracking-wider ml-1">Stato</label>
                <div className="relative">
                  <select 
                    name="stato" 
                    value={formData.stato} 
                    onChange={handleChange}
                    disabled={readOnly}
                    className="w-full bg-accademia-input border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-accademia-red focus:ring-1 focus:ring-accademia-red focus:outline-none disabled:opacity-50 appearance-none"
                  >
                    <option value="Attivo">Attivo</option>
                    <option value="Non Attivo">Non Attivo</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Skills Section */}
            <div className="pt-5 border-t border-gray-800">
              <label className="text-sm text-accademia-red font-bold mb-4 block uppercase tracking-wider">Abilitazioni & Competenze</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Checkbox label="Individuale" name="skill_individuale" checked={formData.skill_individuale} onChange={handleChange} readOnly={readOnly} />
                <Checkbox label="Teoria" name="skill_teoria" checked={formData.skill_teoria} onChange={handleChange} readOnly={readOnly} />
                <Checkbox label="Supplenze" name="skill_supplenze" checked={formData.skill_supplenze} onChange={handleChange} readOnly={readOnly} />
                <Checkbox label="Laboratori" name="skill_laboratori" checked={formData.skill_laboratori} onChange={handleChange} readOnly={readOnly} />
                <Checkbox label="Rock & Pop" name="skill_rockpop" checked={formData.skill_rockpop} onChange={handleChange} readOnly={readOnly} />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-900/30">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Chiudi
          </button>
          {!readOnly && (
            <button 
              type="submit"
              form="docenteForm"
              className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-red-900/20 hover:shadow-red-900/40"
            >
              Salva Modifiche
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// Helpers UI (Reintegrati)
const InputGroup = ({ label, name, type = "text", value, onChange, readOnly, required, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-xs text-gray-400 uppercase font-bold tracking-wider ml-1">{label}</label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      required={required}
      placeholder={placeholder}
      className="w-full bg-accademia-input border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-accademia-red focus:ring-1 focus:ring-accademia-red focus:outline-none read-only:opacity-50 read-only:cursor-not-allowed transition-all"
    />
  </div>
);

const Checkbox = ({ label, name, checked, onChange, readOnly }) => (
  <label className={`flex items-center gap-3 p-3 rounded-lg border border-gray-800 transition-all ${
    readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-800 hover:border-gray-700'
  } ${checked ? 'bg-gray-800/50 border-gray-700' : ''}`}>
    <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${
      checked ? 'bg-accademia-red border-accademia-red' : 'border-gray-600 bg-gray-900'
    }`}>
      {checked && <Check size={14} className="text-white" strokeWidth={3} />}
    </div>
    <input 
      type="checkbox" 
      name={name} 
      checked={checked} 
      onChange={onChange} 
      disabled={readOnly} 
      className="hidden" 
    />
    <span className={`text-sm font-medium ${checked ? 'text-white' : 'text-gray-400'}`}>{label}</span>
  </label>
);