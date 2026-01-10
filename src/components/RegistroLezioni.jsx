import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, Search, ArrowUpDown, AlertTriangle } from 'lucide-react';

const MESI = [
  { val: 9, label: 'Settembre' }, { val: 10, label: 'Ottobre' }, { val: 11, label: 'Novembre' }, 
  { val: 12, label: 'Dicembre' }, { val: 1, label: 'Gennaio' }, { val: 2, label: 'Febbraio' }, 
  { val: 3, label: 'Marzo' }, { val: 4, label: 'Aprile' }, { val: 5, label: 'Maggio' }, 
  { val: 6, label: 'Giugno' }, { val: 7, label: 'Luglio' }
];

// Helper per anno corrente
const getCurrentAcademicYear = () => {
    const today = new Date();
    const month = today.getMonth() + 1; 
    const year = today.getFullYear();
    if (month >= 9) return `${year}/${year + 1}`;
    return `${year - 1}/${year}`;
};

export default function RegistroLezioni({ user, currentGlobalYear }) {
  const [lezioni, setLezioni] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeYears, setActiveYears] = useState([]); 
  
  const [docenti, setDocenti] = useState([]);
  const [alunni, setAlunni] = useState([]);
  
  // Usiamo 'tariffe' per la selezione nel form, ma visualizziamo 'tipi_lezioni' storico
  const [tariffeAnno, setTariffeAnno] = useState([]); 

  // Inizializza filtri
  const [filters, setFilters] = useState({
    docente_id: user.ruolo === 'Docente' ? user.id_collegato : '',
    alunno_id: '',
    tipo_lezione_id: '', 
    mese: new Date().getMonth() + 1,
    anno: currentGlobalYear || getCurrentAcademicYear()
  });
  
  const [sortConfig, setSortConfig] = useState({ key: 'data_lezione', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [editingLezione, setEditingLezione] = useState(null);

  // --- 1. Carica Anni ---
  useEffect(() => {
    const fetchYears = async () => {
        try {
            const { data } = await supabase.from('anni_accademici').select('anno').order('anno', {ascending:false});
            if(data && data.length > 0) setActiveYears(data);
            else setActiveYears([{anno: '2024/2025'}, {anno: '2025/2026'}]); 
        } catch (e) {
            console.warn("Tabella anni mancante", e);
        }
    };
    if (user.ruolo !== 'Docente') fetchYears();
  }, [user.ruolo]);

  // --- 2. Sync Anno ---
  useEffect(() => {
    if (currentGlobalYear && filters.anno !== currentGlobalYear) {
         if (user.ruolo === 'Docente' || !filters.anno) {
            setFilters(prev => ({ ...prev, anno: currentGlobalYear }));
         }
    }
  }, [currentGlobalYear, user.ruolo]);

  // --- 3. Carica Risorse ---
  useEffect(() => {
    const fetchResources = async () => {
      // Docenti
      if (user.ruolo !== 'Docente') {
        const { data: d } = await supabase.from('docenti').select('id, nome').order('nome');
        setDocenti(d || []);
      }
      // Alunni
      const { data: a } = await supabase.from('alunni').select('id, nome').order('nome');
      setAlunni(a || []);
      
      // Tariffe per il FORM (nuovi inserimenti)
      if (filters.anno) {
          const { data: t } = await supabase
            .from('tariffe')
            .select('id, tipo_lezione, costo')
            .eq('anno_accademico', filters.anno)
            .order('tipo_lezione');
          setTariffeAnno(t || []);
      }
    };
    fetchResources();
  }, [filters.anno, user]);

  // --- 4. Fetch Lezioni ---
  const fetchLezioni = async () => {
    if (!filters.anno) return; 
    setLoading(true);
    try {
      // Calcolo date per sicurezza
      const [startYear, endYear] = filters.anno.split('/').map(Number);
      const startDate = `${startYear}-09-01`;
      const endDate = `${endYear}-08-31`;

      /* IMPORTANTE: Qui sotto uso 'tipi_lezioni' perché è la tabella usata in RiepilogoFinanziario.
         Se hai migrato la FK su 'tariffe', cambia 'tipi_lezioni ( tipo )' in 'tariffe ( tipo_lezione )'.
         Se usi 'tipi_lezioni', assicurati che la colonna da visualizzare sia 'tipo' o 'tipo_lezione'.
      */
      let query = supabase
        .from('registro')
        .select(`
          id, data_lezione, convalidato, anno_accademico,
          docenti ( id, nome ),
          alunni ( id, nome ),
          tipi_lezioni ( tipo, costo )
        `)
        .gte('data_lezione', startDate)
        .lte('data_lezione', endDate);

      if (user.ruolo === 'Docente') query = query.eq('docente_id', user.id_collegato);
      else if (filters.docente_id) query = query.eq('docente_id', filters.docente_id);

      if (filters.alunno_id) query = query.eq('alunno_id', filters.alunno_id);
      
      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];
      if (filters.mese) {
        filteredData = filteredData.filter(r => (new Date(r.data_lezione).getMonth() + 1) == filters.mese);
      }
      setLezioni(filteredData);
    } catch (err) { 
        console.error("Errore registro:", err); 
        alert("Errore caricamento lezioni. Controlla la console.");
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => { fetchLezioni(); }, [filters]);

  const checkPermission = (targetAnno) => {
      const annoToCheck = targetAnno || filters.anno;
      if (user.ruolo === 'Docente') {
          if (annoToCheck !== getCurrentAcademicYear()) {
              alert("Non puoi modificare lezioni di anni passati.");
              return false;
          }
          return true;
      }
      if (user.ruolo === 'Gestore' && annoToCheck !== getCurrentAcademicYear()) {
          return confirm(`Stai modificando lo storico ${annoToCheck}. Continuare?`);
      }
      return true; 
  };

  // --- CRUD ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedLezioni = [...lezioni].sort((a, b) => {
    let valA, valB;
    switch(sortConfig.key) {
        case 'data_lezione': valA = new Date(a.data_lezione); valB = new Date(b.data_lezione); break;
        case 'docente': valA = a.docenti?.nome?.toLowerCase()||''; valB = b.docenti?.nome?.toLowerCase()||''; break;
        case 'alunno': valA = a.alunni?.nome?.toLowerCase()||''; valB = b.alunni?.nome?.toLowerCase()||''; break;
        // Adattato per tipi_lezioni.tipo oppure tariffe.tipo_lezione
        case 'tipo': valA = (a.tipi_lezioni?.tipo || a.tariffe?.tipo_lezione || '').toLowerCase(); 
                     valB = (b.tipi_lezioni?.tipo || b.tariffe?.tipo_lezione || '').toLowerCase(); break;
        default: return 0;
    }
    return (valA < valB ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
  });

  const handleDelete = async (row) => {
    if(!checkPermission(row.anno_accademico)) return;
    if(!confirm("Eliminare questa lezione?")) return;
    const { error } = await supabase.from('registro').delete().eq('id', row.id);
    if(!error) fetchLezioni();
  };

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      
      <div className="p-4 border-b border-gray-800 space-y-4 bg-gray-900/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-light text-white flex items-center gap-2">
            <Search className="text-accademia-red" size={20}/> Registro Lezioni
          </h2>
          
          {(user.ruolo !== 'Docente' || filters.anno === getCurrentAcademicYear()) && (
              <button 
                onClick={() => { setEditingLezione(null); setShowModal(true); }}
                className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm"
              >
                <Plus size={16} /> Nuova Lezione
              </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Selettore Anno */}
          {user.ruolo !== 'Docente' && (
              <select name="anno" value={filters.anno} onChange={(e) => setFilters({...filters, anno: e.target.value})} className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 font-bold focus:border-accademia-red focus:outline-none">
                  {activeYears.map(y => <option key={y.anno} value={y.anno}>{y.anno}</option>)}
                  {activeYears.length === 0 && <option value={getCurrentAcademicYear()}>{getCurrentAcademicYear()}</option>}
              </select>
          )}
          
          {user.ruolo !== 'Docente' && (
            <select name="docente_id" value={filters.docente_id} onChange={(e) => setFilters({...filters, docente_id:e.target.value})} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
              <option value="">Tutti i Docenti</option>
              {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          )}
          <select name="alunno_id" value={filters.alunno_id} onChange={(e) => setFilters({...filters, alunno_id:e.target.value})} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
            <option value="">Tutti gli Alunni</option>
            {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <select name="mese" value={filters.mese} onChange={(e) => setFilters({...filters, mese:e.target.value})} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
            <option value="">Tutti i Mesi</option>
            {MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>
        
        {filters.anno !== getCurrentAcademicYear() && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 p-2 rounded text-xs text-yellow-500 flex items-center gap-2">
                <AlertTriangle size={14}/> Modalità Archivio: {filters.anno}
            </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-0 custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-sm z-10">
            <tr>
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('data_lezione')}>Data <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('docente')}>Docente <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('alunno')}>Alunno <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('tipo')}>Lezione <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? <tr><td colSpan="5" className="p-8 text-center text-gray-500">Caricamento...</td></tr> : 
             sortedLezioni.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-gray-500">Nessuna lezione trovata.</td></tr> :
             sortedLezioni.map(row => (
                <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-3 font-mono text-gray-300">{new Date(row.data_lezione).toLocaleDateString('it-IT')}</td>
                  <td className="px-6 py-3 text-white">{row.docenti?.nome}</td>
                  <td className="px-6 py-3 font-medium text-white">{row.alunni?.nome}</td>
                  {/* Fallback visualizzazione tipo lezione */}
                  <td className="px-6 py-3 text-gray-400">
                      {row.tipi_lezioni?.tipo || row.tariffe?.tipo_lezione || '-'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { if(checkPermission(row.anno_accademico)) { setEditingLezione(row); setShowModal(true); } }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                      <button onClick={() => handleDelete(row)} className="p-1.5 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ModalRegistro 
          lezione={editingLezione} 
          docenti={docenti}
          alunni={alunni}
          tariffe={tariffeAnno}
          user={user}
          anno={filters.anno} 
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchLezioni(); }}
        />
      )}
    </div>
  );
}

// --- MODALE ---
function ModalRegistro({ lezione, docenti, alunni, tariffe, user, anno, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: lezione?.id || null,
    docente_id: lezione?.docenti?.id || (user.ruolo === 'Docente' ? user.id_collegato : ''),
    alunno_id: lezione?.alunni?.id || '',
    // Se modifichi una vecchia lezione con FK su tipi_lezioni, questo campo potrebbe essere problematico
    // Qui assumiamo che tu stia inserendo nuovi dati collegati a 'tariffe'
    tipo_lezione_id: lezione?.tipo_lezione_id || '', 
    data_lezione: lezione?.data_lezione ? lezione.data_lezione.slice(0, 10) : new Date().toISOString().slice(0, 10)
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        docente_id: formData.docente_id,
        alunno_id: formData.alunno_id,
        // Se la colonna sul DB si chiama ancora 'tipo_lezione_id' e punta a 'tipi_lezioni', 
        // assicurati che 'tariffe' abbia ID compatibili o che tu abbia aggiornato la FK
        tipo_lezione_id: formData.tipo_lezione_id, 
        data_lezione: formData.data_lezione,
        anno_accademico: anno, 
        convalidato: false
      };

      if (formData.id) await supabase.from('registro').update(payload).eq('id', formData.id);
      else await supabase.from('registro').insert([payload]);
      
      onSave();
    } catch(err) { alert("Errore: " + err.message); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6">
        <div className="flex justify-between mb-4"><h3 className="text-lg font-bold text-white">{formData.id?'Modifica':'Nuova'} Lezione ({anno})</h3><button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {user.ruolo !== 'Docente' && (
            <div><label className="block text-xs text-gray-400 uppercase">Docente</label><select value={formData.docente_id} onChange={e=>setFormData({...formData,docente_id:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required><option value="">Seleziona...</option>{docenti.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select></div>
          )}
          <div><label className="block text-xs text-gray-400 uppercase">Alunno</label><select value={formData.alunno_id} onChange={e=>setFormData({...formData,alunno_id:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required><option value="">Seleziona...</option>{alunni.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
          
          {/* Selezione Tariffa */}
          <div>
            <label className="block text-xs text-gray-400 uppercase">Tipo Lezione (Tariffa {anno})</label>
            <select value={formData.tipo_lezione_id} onChange={e=>setFormData({...formData,tipo_lezione_id:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required>
                <option value="">Seleziona...</option>
                {tariffe.map(t=><option key={t.id} value={t.id}>{t.tipo_lezione} (€ {t.costo})</option>)}
            </select>
            {tariffe.length === 0 && <p className="text-xs text-red-400 mt-1">Nessuna tariffa trovata per l'anno {anno}</p>}
          </div>

          <div><label className="block text-xs text-gray-400 uppercase">Data</label><input type="date" value={formData.data_lezione} onChange={e=>setFormData({...formData,data_lezione:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required/></div>
          <div className="flex justify-end pt-4"><button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold">Salva</button></div>
        </form>
      </div>
    </div>, document.body
  );
}