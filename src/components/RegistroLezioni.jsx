import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, Search, ArrowUpDown, AlertTriangle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

// --- IMPORT CENTRALIZZATO ---
import { 
  MESI_STANDARD as MESI, 
  getCurrentAcademicYear 
} from '../utils/constants';

export default function RegistroLezioni({ user, currentGlobalYear }) {
  const [lezioni, setLezioni] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeYears, setActiveYears] = useState([]); 
  
  const [docenti, setDocenti] = useState([]);
  const [alunni, setAlunni] = useState([]);
  
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
  
  const [confirmDialog, setConfirmDialog] = useState({ 
    isOpen: false, 
    type: 'danger',
    title: '',
    message: '',
    confirmText: 'Conferma',
    onConfirm: null,
    showCancel: true
  });

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

  // --- 3. Carica Risorse (Docenti/Alunni) ---
  useEffect(() => {
    const fetchResources = async () => {
      // Docenti (Solo se non è docente)
      if (user.ruolo !== 'Docente') {
        let queryDoc = supabase.from('docenti').select('id, nome, cognome, school_id').order('cognome');
        
        // FILTRO GESTORE: Carica solo i docenti della scuola assegnata
        if (user.school_id) {
            queryDoc = queryDoc.eq('school_id', user.school_id);
        }

        const { data: d } = await queryDoc;
        const docentiFormatted = d?.map(doc => ({
            ...doc,
            nome_completo: `${doc.cognome} ${doc.nome}`
        })) || [];
        setDocenti(docentiFormatted);
      }

      // Alunni
      let alunniList = [];
      if (user.ruolo === 'Docente') {
          // Docente vede solo i suoi associati
          const { data: assocData } = await supabase
            .from('associazioni')
            .select('alunni(id, nome, cognome)')
            .eq('docente_id', user.id_collegato);
          
          alunniList = assocData?.map(a => a.alunni).filter(Boolean) || [];
      } else {
          // Admin/Gestore
          let queryAlunni = supabase.from('alunni').select('id, nome, cognome').eq('stato', 'Attivo');
          
          // FILTRO GESTORE: Carica solo alunni della scuola assegnata
          if (user.school_id) {
              queryAlunni = queryAlunni.eq('school_id', user.school_id);
          }

          const { data: a } = await queryAlunni;
          alunniList = a || [];
      }

      // Ordinamento per Cognome
      alunniList.sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''));
      setAlunni(alunniList);
      
      // Tariffe per il FORM
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
      const [startYear, endYear] = filters.anno.split('/').map(Number);
      const startDate = `${startYear}-09-01`;
      const endDate = `${endYear}-08-31`;

      // NOTA: Usiamo 'docenti!inner' per poter filtrare sulla tabella collegata (school_id)
      let query = supabase
        .from('registro')
        .select(`
          id, data_lezione, convalidato, anno_accademico,
          docenti!inner ( id, nome, cognome, school_id ),
          alunni ( id, nome, cognome ),
          tipi_lezioni ( tipo, costo )
        `)
        .gte('data_lezione', startDate)
        .lte('data_lezione', endDate);

      if (user.ruolo === 'Docente') {
          query = query.eq('docente_id', user.id_collegato);
      } else {
          if (filters.docente_id) query = query.eq('docente_id', filters.docente_id);
          
          // FILTRO GESTORE: Visualizza solo lezioni di docenti della propria scuola
          if (user.school_id) {
              query = query.eq('docenti.school_id', user.school_id);
          }
      }

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
        setConfirmDialog({
          isOpen: true,
          type: 'danger',
          title: 'Errore',
          message: 'Errore caricamento lezioni. Controlla la console per dettagli.',
          confirmText: 'OK',
          showCancel: false,
          onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        });
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => { fetchLezioni(); }, [filters]);

  const checkPermission = (targetAnno) => {
      const annoToCheck = targetAnno || filters.anno;
      if (user.ruolo === 'Docente') {
          if (annoToCheck !== getCurrentAcademicYear()) {
              setConfirmDialog({
                isOpen: true,
                type: 'warning',
                title: 'Operazione Non Consentita',
                message: 'Non puoi modificare lezioni di anni passati.',
                confirmText: 'OK',
                showCancel: false,
                onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
              });
              return false;
          }
          return true;
      }
      if (user.ruolo === 'Gestore' && annoToCheck !== getCurrentAcademicYear()) {
          return new Promise((resolve) => {
            setConfirmDialog({
              isOpen: true,
              type: 'warning',
              title: 'Modifica Storico',
              message: `Stai modificando lo storico ${annoToCheck}.\n\nSei sicuro di voler continuare?`,
              confirmText: 'Continua',
              cancelText: 'Annulla',
              showCancel: true,
              onConfirm: () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                resolve(true);
              },
              onCancel: () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                resolve(false);
              }
            });
          });
      }
      return true; 
  };

  // --- CRUD & SORTING ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedLezioni = useMemo(() => {
    return [...lezioni].sort((a, b) => {
      let valA, valB;
      switch(sortConfig.key) {
          case 'data_lezione': valA = new Date(a.data_lezione); valB = new Date(b.data_lezione); break;
          case 'docente': 
            valA = (a.docenti?.cognome || a.docenti?.nome || '').toLowerCase(); 
            valB = (b.docenti?.cognome || b.docenti?.nome || '').toLowerCase(); 
            break;
          case 'alunno': 
            valA = (a.alunni?.cognome || a.alunni?.nome || '').toLowerCase(); 
            valB = (b.alunni?.cognome || b.alunni?.nome || '').toLowerCase(); 
            break;
          case 'tipo': 
            valA = (a.tipi_lezioni?.tipo || a.tariffe?.tipo_lezione || '').toLowerCase(); 
            valB = (b.tipi_lezioni?.tipo || b.tariffe?.tipo_lezione || '').toLowerCase(); 
            break;
          default: return 0;
      }
      return (valA < valB ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
  }, [lezioni, sortConfig]);

  const handleDeleteClick = async (row) => {
    const hasPermission = await checkPermission(row.anno_accademico);
    if (!hasPermission) return;

    setConfirmDialog({
      isOpen: true,
      type: 'danger',
      title: 'Elimina Lezione',
      message: `Sei sicuro di voler eliminare questa lezione?\n\nData: ${new Date(row.data_lezione).toLocaleDateString('it-IT')}\nAlunno: ${row.alunni?.cognome} ${row.alunni?.nome}\n\nQuesta azione non può essere annullata.`,
      confirmText: 'Elimina',
      cancelText: 'Annulla',
      showCancel: true,
      onConfirm: async () => {
        const { error } = await supabase.from('registro').delete().eq('id', row.id);
        if (error) {
          setConfirmDialog({
            isOpen: true,
            type: 'danger',
            title: 'Errore',
            message: 'Errore durante l\'eliminazione: ' + error.message,
            confirmText: 'OK',
            showCancel: false,
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
          });
        } else {
          fetchLezioni();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleEditClick = async (row) => {
    const hasPermission = await checkPermission(row.anno_accademico);
    if (hasPermission) {
      setEditingLezione(row);
      setShowModal(true);
    }
  };

  const handleNewLezione = async () => {
    const hasPermission = await checkPermission(filters.anno);
    if (hasPermission) {
      setEditingLezione(null);
      setShowModal(true);
    }
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
                onClick={handleNewLezione}
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
              {docenti.map(d => <option key={d.id} value={d.id}>{d.nome_completo}</option>)}
            </select>
          )}
          <select name="alunno_id" value={filters.alunno_id} onChange={(e) => setFilters({...filters, alunno_id:e.target.value})} className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none">
            <option value="">Tutti gli Alunni</option>
            {alunni.map(a => <option key={a.id} value={a.id}>{a.cognome} {a.nome}</option>)}
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
                  <td className="px-6 py-3 text-white">{row.docenti?.cognome} {row.docenti?.nome}</td>
                  <td className="px-6 py-3 font-medium text-white">{row.alunni?.cognome} {row.alunni?.nome}</td>
                  <td className="px-6 py-3 text-gray-400">
                      {row.tipi_lezioni?.tipo || row.tariffe?.tipo_lezione || '-'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditClick(row)} className="p-1.5 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                      <button onClick={() => handleDeleteClick(row)} className="p-1.5 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
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

// --- MODALE ---
function ModalRegistro({ lezione, docenti, alunni, tariffe, user, anno, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: lezione?.id || null,
    docente_id: lezione?.docenti?.id || (user.ruolo === 'Docente' ? user.id_collegato : ''),
    alunno_id: lezione?.alunni?.id || '',
    tipo_lezione_id: lezione?.tipo_lezione_id || '', 
    data_lezione: lezione?.data_lezione ? lezione.data_lezione.slice(0, 10) : new Date().toISOString().slice(0, 10)
  });

  const [filteredTariffe, setFilteredTariffe] = useState([]);
  const [loadingTariffe, setLoadingTariffe] = useState(false);

  // EFFETTO: Filtra Tariffe in base alle competenze del Docente
  useEffect(() => {
    const filterTariffeByDocente = async () => {
      if (!formData.docente_id) {
        setFilteredTariffe([]);
        return;
      }
      setLoadingTariffe(true);
      
      const { data: competenze, error } = await supabase
        .from('docenti_tipi_lezioni')
        .select(`tipi_lezioni ( tipo )`)
        .eq('docente_id', formData.docente_id);

      if (error) {
        console.error("Errore recupero competenze docente:", error);
        setFilteredTariffe(tariffe); // Fallback: mostra tutto
      } else {
        const allowedTypes = competenze?.map(c => c.tipi_lezioni?.tipo) || [];
        // Filtra le tariffe (tariffe.tipo_lezione deve matchare con tipi_lezioni.tipo)
        const filtered = tariffe.filter(t => allowedTypes.includes(t.tipo_lezione));
        setFilteredTariffe(filtered);
      }
      setLoadingTariffe(false);
    };

    if (!formData.id) {
        filterTariffeByDocente();
    }
  }, [formData.docente_id, tariffe, formData.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      let tipoLezioneId = formData.tipo_lezione_id;

      if (!formData.id) {
        if (!formData.tipo_lezione_id) {
          alert("Seleziona un tipo di lezione");
          return;
        }
        
        const tariffaSelezionata = tariffe.find(t => String(t.id) === String(formData.tipo_lezione_id));
        
        if (!tariffaSelezionata) {
          alert("Errore: tariffa non trovata. Riprova.");
          return;
        }

        // Cerca se esiste già il tipo_lezione nella tabella 'tipi_lezioni' con quel costo
        const { data: existingTipo, error: searchError } = await supabase
          .from('tipi_lezioni')
          .select('id')
          .eq('tipo', tariffaSelezionata.tipo_lezione)
          .eq('costo', tariffaSelezionata.costo)
          .maybeSingle();

        if (searchError && searchError.code !== 'PGRST116') throw searchError;

        if (existingTipo) {
          tipoLezioneId = existingTipo.id;
        } else {
          // Crea nuovo tipo lezione se manca
          const newTipoId = 'TL' + Date.now();
          const { error: insertTipoError } = await supabase
            .from('tipi_lezioni')
            .insert([{
              id: newTipoId,
              tipo: tariffaSelezionata.tipo_lezione,
              costo: tariffaSelezionata.costo,
              durata_minuti: 60,
              school_id: user.school_id
            }]);

          if (insertTipoError) throw insertTipoError;
          tipoLezioneId = newTipoId;
        }
      }

      const payload = {
        docente_id: formData.docente_id,
        alunno_id: formData.alunno_id,
        tipo_lezione_id: tipoLezioneId,
        data_lezione: formData.data_lezione,
        anno_accademico: anno, 
        convalidato: false
      };

      if (formData.id) {
        const { error } = await supabase.from('registro').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        const newId = 'R' + Date.now();
        const { error } = await supabase.from('registro').insert([{ ...payload, id: newId }]);
        if (error) throw error;
      }
      
      onSave();
    } catch(err) { 
      console.error("Errore salvataggio lezione:", err);
      alert("Errore: " + err.message); 
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6">
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{formData.id?'Modifica':'Nuova'} Lezione ({anno})</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* SELEZIONE DOCENTE */}
          {user.ruolo !== 'Docente' && (
            <div>
              <label className="block text-xs text-gray-400 uppercase mb-1">Docente</label>
              <select 
                value={formData.docente_id} 
                onChange={e=>{
                    setFormData({...formData, docente_id:e.target.value, tipo_lezione_id: ''}); 
                }} 
                className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
                required
                disabled={!!formData.id} 
              >
                <option value="">Seleziona...</option>
                {docenti.map(d=><option key={d.id} value={d.id}>{d.nome_completo}</option>)}
              </select>
            </div>
          )}
          
          {/* SELEZIONE ALUNNO */}
          <div>
            <label className="block text-xs text-gray-400 uppercase mb-1">Alunno</label>
            <select 
              value={formData.alunno_id} 
              onChange={e=>setFormData({...formData,alunno_id:e.target.value})} 
              className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
              required
            >
              <option value="">Seleziona...</option>
              {alunni.map(a=><option key={a.id} value={a.id}>{a.cognome} {a.nome}</option>)}
            </select>
          </div>
          
          {/* SELEZIONE TIPO LEZIONE */}
          <div>
            <label className="block text-xs text-gray-400 uppercase mb-1">
              Tipo Lezione {!formData.id && `(Tariffa ${anno})`}
            </label>
            {!formData.id ? (
              <>
                <select 
                  value={formData.tipo_lezione_id} 
                  onChange={e=>setFormData({...formData,tipo_lezione_id:e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
                  required
                  disabled={!formData.docente_id || loadingTariffe}
                >
                  <option value="">
                      {!formData.docente_id ? "Seleziona prima un docente..." : loadingTariffe ? "Caricamento competenze..." : "Seleziona..."}
                  </option>
                  
                  {filteredTariffe.map(t=>(
                    <option key={t.id} value={t.id}>
                      {t.tipo_lezione}
                    </option>
                  ))}
                </select>

                {formData.docente_id && !loadingTariffe && filteredTariffe.length === 0 && (
                  <p className="text-xs text-yellow-500 mt-1 italic">
                    Nessuna tariffa disponibile per le competenze di questo docente nell'anno {anno}.
                  </p>
                )}
              </>
            ) : (
              // IN MODIFICA (READ ONLY)
              <div className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-gray-400 cursor-not-allowed">
                {lezione?.tipi_lezioni?.tipo || 'N/A'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 uppercase mb-1">Data</label>
            <input 
              type="date" 
              value={formData.data_lezione} 
              onChange={e=>setFormData({...formData,data_lezione:e.target.value})} 
              className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
              required
            />
          </div>
          
          <div className="flex justify-end pt-4">
            <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors shadow-lg">
              Salva Lezione
            </button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}