import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, Eye, Plus, X, Check } from 'lucide-react';

export default function DocentiList({ userRole }) {
  const [docenti, setDocenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDocente, setEditingDocente] = useState(null);

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

  // --- HANDLERS ---
  const handleOpenModal = (docente = null) => {
    setEditingDocente(docente);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare definitivamente questo docente?")) return;
    
    const { error } = await supabase.from('docenti').delete().eq('id', id);
    if (error) alert("Errore eliminazione: " + error.message);
    else fetchDocenti();
  };

  // --- RENDER TABLE ---
  if (loading) return <div className="p-8 text-center text-gray-400">Caricamento anagrafica...</div>;

  return (
    <div className="h-full flex flex-col relative">
      {/* Toolbar - Fissa in alto */}
      {userRole === 'Admin' && (
        <div className="p-4 border-b border-gray-800 flex justify-end shrink-0 bg-gray-900/20">
          <button 
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm"
          >
            <Plus size={16} />
            Nuovo Docente
          </button>
        </div>
      )}

      {/* Tabella Scrollabile */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/80 text-gray-400 uppercase text-xs sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-6 py-4 font-semibold shadow-sm">Nome</th>
              <th className="px-6 py-4 font-semibold shadow-sm">Strumento</th>
              <th className="px-6 py-4 font-semibold shadow-sm">Contatti</th>
              <th className="px-6 py-4 font-semibold text-center shadow-sm">Stato</th>
              <th className="px-6 py-4 font-semibold text-right shadow-sm">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {docenti.map((doc) => (
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
                          onClick={() => handleDelete(doc.id)}
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

      {/* MODALE DOCENTE */}
      {showModal && (
        <ModalDocente 
          docente={editingDocente} 
          onClose={() => setShowModal(false)} 
          onSave={() => { setShowModal(false); fetchDocenti(); }}
          readOnly={userRole !== 'Admin'}
        />
      )}
    </div>
  );
}

// --- COMPONENTE MODALE INTERNO ---
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

// Helpers UI
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