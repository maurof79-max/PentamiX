import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, Search, ArrowUpDown } from 'lucide-react';

const MESI = [
  { val: 9, label: 'Settembre' }, { val: 10, label: 'Ottobre' }, { val: 11, label: 'Novembre' }, 
  { val: 12, label: 'Dicembre' }, { val: 1, label: 'Gennaio' }, { val: 2, label: 'Febbraio' }, 
  { val: 3, label: 'Marzo' }, { val: 4, label: 'Aprile' }, { val: 5, label: 'Maggio' }, 
  { val: 6, label: 'Giugno' }, { val: 7, label: 'Luglio' }
];

export default function RegistroLezioni({ user }) {
  const [lezioni, setLezioni] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Dati per i filtri
  const [docenti, setDocenti] = useState([]);
  const [alunni, setAlunni] = useState([]);
  const [tipiLezioni, setTipiLezioni] = useState([]);

  // Stati Filtri
  const [filters, setFilters] = useState({
    docente_id: user.ruolo === 'Docente' ? user.id_collegato : '',
    alunno_id: '',
    tipo_lezione_id: '',
    mese: new Date().getMonth() + 1 // Default mese corrente
  });
  
  // Stato Ordinamento
  const [sortConfig, setSortConfig] = useState({ key: 'data_lezione', direction: 'desc' });

  const [showModal, setShowModal] = useState(false);
  const [editingLezione, setEditingLezione] = useState(null);

  // --- INIT ---
  useEffect(() => {
    const fetchCommon = async () => {
      if (user.ruolo !== 'Docente') {
        const { data: d } = await supabase.from('docenti').select('id, nome').order('nome');
        setDocenti(d || []);
      }
      const { data: a } = await supabase.from('alunni').select('id, nome').order('nome');
      setAlunni(a || []);
      const { data: t } = await supabase.from('tipi_lezioni').select('id, tipo').order('tipo');
      setTipiLezioni(t || []);
    };
    fetchCommon();
  }, [user]);

  // --- FETCH LEZIONI ---
  const fetchLezioni = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('registro')
        .select(`
          id, data_lezione, convalidato,
          docenti ( id, nome ),
          alunni ( id, nome ),
          tipi_lezioni ( id, tipo )
        `);
        // L'ordinamento lato server lo facciamo di base sulla data, poi lato client gestiamo il sort dinamico su colonne complesse (nomi)
        // .order('data_lezione', { ascending: false });

      if (user.ruolo === 'Docente') {
        query = query.eq('docente_id', user.id_collegato);
      } else if (filters.docente_id) {
        query = query.eq('docente_id', filters.docente_id);
      }

      if (filters.alunno_id) query = query.eq('alunno_id', filters.alunno_id);
      if (filters.tipo_lezione_id) query = query.eq('tipo_lezione_id', filters.tipo_lezione_id);
      
      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data;
      if (filters.mese) {
        filteredData = data.filter(r => {
          const m = new Date(r.data_lezione).getMonth() + 1;
          return m == filters.mese;
        });
      }

      setLezioni(filteredData);
    } catch (err) {
      console.error("Errore registro:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLezioni();
  }, [filters]);

  // --- ORDINAMENTO ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedLezioni = [...lezioni].sort((a, b) => {
    if (!a || !b) return 0;
    
    let valA, valB;

    // Estrazione valori in base alla chiave
    switch(sortConfig.key) {
        case 'data_lezione':
            valA = new Date(a.data_lezione);
            valB = new Date(b.data_lezione);
            break;
        case 'docente':
            valA = a.docenti?.nome?.toLowerCase() || '';
            valB = b.docenti?.nome?.toLowerCase() || '';
            break;
        case 'alunno':
            valA = a.alunni?.nome?.toLowerCase() || '';
            valB = b.alunni?.nome?.toLowerCase() || '';
            break;
        case 'tipo':
            valA = a.tipi_lezioni?.tipo?.toLowerCase() || '';
            valB = b.tipi_lezioni?.tipo?.toLowerCase() || '';
            break;
        default:
            return 0;
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // --- HANDLERS ---
  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleOpenModal = (lezione = null) => {
    setEditingLezione(lezione);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if(!confirm("Eliminare questa lezione dallo storico?")) return;
    const { error } = await supabase.from('registro').delete().eq('id', id);
    if(error) alert("Errore: " + error.message);
    else fetchLezioni();
  };

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      
      {/* HEADER & FILTRI */}
      <div className="p-4 border-b border-gray-800 space-y-4 bg-gray-900/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-light text-white flex items-center gap-2">
            <Search className="text-accademia-red" size={20}/> Registro Lezioni
          </h2>
          <button 
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm"
          >
            <Plus size={16} /> Nuova Lezione
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {user.ruolo !== 'Docente' && (
            <select name="docente_id" value={filters.docente_id} onChange={handleFilterChange} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
              <option value="">Tutti i Docenti</option>
              {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          )}
          <select name="alunno_id" value={filters.alunno_id} onChange={handleFilterChange} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
            <option value="">Tutti gli Alunni</option>
            {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <select name="tipo_lezione_id" value={filters.tipo_lezione_id} onChange={handleFilterChange} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
            <option value="">Tutti i Tipi</option>
            {tipiLezioni.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
          </select>
          <select name="mese" value={filters.mese} onChange={handleFilterChange} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
            <option value="">Tutti i Mesi</option>
            {MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* TABELLA */}
      <div className="flex-1 overflow-auto p-0 custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-sm z-10">
            <tr>
              <th className="px-6 py-3 font-semibold cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('data_lezione')}>
                <div className="flex items-center gap-1">Data <ArrowUpDown size={12}/></div>
              </th>
              <th className="px-6 py-3 font-semibold cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('docente')}>
                <div className="flex items-center gap-1">Docente <ArrowUpDown size={12}/></div>
              </th>
              <th className="px-6 py-3 font-semibold cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('alunno')}>
                <div className="flex items-center gap-1">Alunno <ArrowUpDown size={12}/></div>
              </th>
              <th className="px-6 py-3 font-semibold cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('tipo')}>
                <div className="flex items-center gap-1">Lezione <ArrowUpDown size={12}/></div>
              </th>
              <th className="px-6 py-3 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan="5" className="p-8 text-center text-gray-500">Caricamento...</td></tr>
            ) : sortedLezioni.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center text-gray-500">Nessuna lezione trovata.</td></tr>
            ) : (
              sortedLezioni.map(row => (
                <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-3 font-mono text-gray-300">
                    {new Date(row.data_lezione).toLocaleDateString('it-IT')}
                  </td>
                  <td className="px-6 py-3 text-white">{row.docenti?.nome}</td>
                  <td className="px-6 py-3 font-medium text-white">{row.alunni?.nome}</td>
                  <td className="px-6 py-3 text-gray-400">{row.tipi_lezioni?.tipo}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenModal(row)} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 transition-colors"><Edit2 size={16}/></button>
                      <button onClick={() => handleDelete(row.id)} className="p-1.5 hover:bg-gray-700 rounded text-red-400 transition-colors"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ModalRegistro 
          lezione={editingLezione} 
          docenti={docenti}
          alunni={alunni}
          tipiLezioni={tipiLezioni}
          user={user}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchLezioni(); }}
        />
      )}
    </div>
  );
}

// --- MODALE INTERNA ---
function ModalRegistro({ lezione, docenti, alunni, tipiLezioni, user, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: lezione?.id || null,
    docente_id: lezione?.docenti?.id || (user.ruolo === 'Docente' ? user.id_collegato : ''),
    alunno_id: lezione?.alunni?.id || '',
    tipo_lezione_id: lezione?.tipi_lezioni?.id || '',
    data_lezione: lezione?.data_lezione ? lezione.data_lezione.slice(0, 10) : new Date().toISOString().slice(0, 10)
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        docente_id: formData.docente_id,
        alunno_id: formData.alunno_id,
        tipo_lezione_id: formData.tipo_lezione_id,
        data_lezione: formData.data_lezione,
        anno_accademico: '2025/2026', 
        convalidato: false
      };

      if (formData.id) {
        const { error } = await supabase.from('registro').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('registro').insert([payload]);
        if (error) throw error;
      }
      onSave();
    } catch(err) {
      alert("Errore: " + err.message);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between mb-4">
            <h3 className="text-lg font-bold text-white">
                {formData.id ? 'Modifica Lezione' : 'Registra Lezione'}
            </h3>
            <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-white"/></button>
        </div>
        
        <form id="regForm" onSubmit={handleSubmit} className="space-y-4">
          {user.ruolo !== 'Docente' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Docente</label>
              <select 
                value={formData.docente_id} 
                onChange={e => setFormData({...formData, docente_id: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
                required
              >
                <option value="">Seleziona...</option>
                {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Alunno</label>
            <select 
              value={formData.alunno_id} 
              onChange={e => setFormData({...formData, alunno_id: e.target.value})}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              required
            >
              <option value="">Seleziona...</option>
              {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Tipo Lezione</label>
            <select 
              value={formData.tipo_lezione_id} 
              onChange={e => setFormData({...formData, tipo_lezione_id: e.target.value})}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              required
            >
              <option value="">Seleziona...</option>
              {tipiLezioni.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Data</label>
            <input 
              type="date" 
              value={formData.data_lezione}
              onChange={e => setFormData({...formData, data_lezione: e.target.value})}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              required
            />
          </div>
        </form>

        <div className="pt-4 mt-4 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">Annulla</button>
          <button type="submit" form="regForm" className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-lg transition-colors">Salva</button>
        </div>
      </div>
    </div>,
    document.body
  );
}