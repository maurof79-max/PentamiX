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

export default function RegistroLezioni({ user, currentGlobalYear }) {
  const [lezioni, setLezioni] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeYears, setActiveYears] = useState([]); // Elenco anni disponibili
  
  // Dati per i filtri
  const [docenti, setDocenti] = useState([]);
  const [alunni, setAlunni] = useState([]);
  const [tariffeAnno, setTariffeAnno] = useState([]); // Sostituisce tipiLezioni

  // Stati Filtri
  const [filters, setFilters] = useState({
    docente_id: user.ruolo === 'Docente' ? user.id_collegato : '',
    alunno_id: '',
    tipo_lezione_id: '', // Qui useremo l'ID della tariffa
    mese: new Date().getMonth() + 1,
    anno: currentGlobalYear // Filtro Anno
  });
  
  const [sortConfig, setSortConfig] = useState({ key: 'data_lezione', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [editingLezione, setEditingLezione] = useState(null);

  // --- 1. Carica lista anni disponibili (solo Admin/Gestore) ---
  useEffect(() => {
    const fetchYears = async () => {
        const { data } = await supabase.from('anni_accademici').select('anno').order('anno', {ascending:false});
        if(data) setActiveYears(data);
    };
    if (user.ruolo !== 'Docente') fetchYears();
  }, [user.ruolo]);

  // --- 2. Forza Docente sull'anno corrente ---
  useEffect(() => {
    if (user.ruolo === 'Docente' && currentGlobalYear) {
        setFilters(prev => ({ ...prev, anno: currentGlobalYear }));
    } else if (!filters.anno && currentGlobalYear) {
        setFilters(prev => ({ ...prev, anno: currentGlobalYear }));
    }
  }, [currentGlobalYear, user.ruolo]);

  // --- 3. Carica Risorse (Docenti, Alunni, TARIFFE) ---
  useEffect(() => {
    const fetchResources = async () => {
      // Docenti (se non sono io)
      if (user.ruolo !== 'Docente') {
        const { data: d } = await supabase.from('docenti').select('id, nome').order('nome');
        setDocenti(d || []);
      }
      // Alunni
      const { data: a } = await supabase.from('alunni').select('id, nome').order('nome');
      setAlunni(a || []);
      
      // TARIFFE (Dipendono dall'anno selezionato!)
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
    if (!filters.anno) return; // Aspetta che l'anno sia settato
    setLoading(true);
    try {
      // NOTA: La join su 'tipi_lezioni' potrebbe dover essere aggiornata a 'tariffe' 
      // se hai migrato anche la struttura della tabella registro.
      // Qui assumo che registro.tipo_lezione_id punti ora a tariffe.id
      let query = supabase
        .from('registro')
        .select(`
          id, data_lezione, convalidato, anno_accademico,
          docenti ( id, nome ),
          alunni ( id, nome ),
          tariffe ( id, tipo_lezione ) 
        `)
        .eq('anno_accademico', filters.anno); 

      if (user.ruolo === 'Docente') query = query.eq('docente_id', user.id_collegato);
      else if (filters.docente_id) query = query.eq('docente_id', filters.docente_id);

      if (filters.alunno_id) query = query.eq('alunno_id', filters.alunno_id);
      
      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data;
      if (filters.mese) {
        filteredData = data.filter(r => (new Date(r.data_lezione).getMonth() + 1) == filters.mese);
      }
      setLezioni(filteredData);
    } catch (err) { console.error("Errore registro:", err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLezioni(); }, [filters]);

  // --- SICUREZZA ---
  const checkPermission = (targetAnno) => {
      // 1. Docente: non può mai uscire dall'anno corrente
      if (user.ruolo === 'Docente') {
          if (targetAnno !== currentGlobalYear) {
              alert("Operazione non consentita su anni passati.");
              return false;
          }
          return true;
      }
      // 2. Gestore: Conferma su anni passati
      if (user.ruolo === 'Gestore' && targetAnno !== currentGlobalYear) {
          return confirm(`ATTENZIONE: Stai modificando lo storico dell'anno ${targetAnno}.\nContinuare?`);
      }
      return true; // Admin
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
        case 'tipo': valA = a.tariffe?.tipo_lezione?.toLowerCase()||''; valB = b.tariffe?.tipo_lezione?.toLowerCase()||''; break; // Aggiornato a tariffe
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
          {/* Bottone visibile solo se siamo nell'anno corrente o se Admin/Gestore ha scelto di lavorarci */}
          {(user.ruolo !== 'Docente' || filters.anno === currentGlobalYear) && (
              <button 
                onClick={() => { setEditingLezione(null); setShowModal(true); }}
                className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm"
              >
                <Plus size={16} /> Nuova Lezione
              </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Selettore Anno (Solo Admin/Gestore) */}
          {user.ruolo !== 'Docente' && (
              <select name="anno" value={filters.anno} onChange={(e) => setFilters({...filters, anno: e.target.value})} className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 font-bold focus:border-accademia-red focus:outline-none">
                  {activeYears.map(y => <option key={y.anno} value={y.anno}>{y.anno}</option>)}
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
        
        {/* Avviso se visualizzo anno passato */}
        {filters.anno !== currentGlobalYear && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 p-2 rounded text-xs text-yellow-500 flex items-center gap-2">
                <AlertTriangle size={14}/> Modalità Archivio: Stai visualizzando i dati dell'anno {filters.anno}
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
             sortedLezioni.map(row => (
                <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-3 font-mono text-gray-300">{new Date(row.data_lezione).toLocaleDateString('it-IT')}</td>
                  <td className="px-6 py-3 text-white">{row.docenti?.nome}</td>
                  <td className="px-6 py-3 font-medium text-white">{row.alunni?.nome}</td>
                  <td className="px-6 py-3 text-gray-400">{row.tariffe?.tipo_lezione}</td>
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
          anno={filters.anno} // Passa l'anno contestuale del filtro
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
    tipo_lezione_id: lezione?.tariffe?.id || '', // Ora punta a tariffe.id
    data_lezione: lezione?.data_lezione ? lezione.data_lezione.slice(0, 10) : new Date().toISOString().slice(0, 10)
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        docente_id: formData.docente_id,
        alunno_id: formData.alunno_id,
        tipo_lezione_id: formData.tipo_lezione_id, // FK verso tabella tariffe (da aggiornare in DB se nec)
        data_lezione: formData.data_lezione,
        anno_accademico: anno, // Usa l'anno in cui stiamo lavorando
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
          <div><label className="block text-xs text-gray-400 uppercase">Tipo Lezione</label><select value={formData.tipo_lezione_id} onChange={e=>setFormData({...formData,tipo_lezione_id:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required><option value="">Seleziona...</option>{tariffe.map(t=><option key={t.id} value={t.id}>{t.tipo_lezione}</option>)}</select></div>
          <div><label className="block text-xs text-gray-400 uppercase">Data</label><input type="date" value={formData.data_lezione} onChange={e=>setFormData({...formData,data_lezione:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required/></div>
          <div className="flex justify-end pt-4"><button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold">Salva</button></div>
        </form>
      </div>
    </div>, document.body
  );
}