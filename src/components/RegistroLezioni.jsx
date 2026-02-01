import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
    Plus, X, Edit2, Trash2, Search, ArrowUpDown, AlertTriangle, 
    Users, User, Loader2, Printer, CheckSquare, Square 
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

// --- IMPORT PDF GENERATOR ---
import { generateRegistroPDF } from '../utils/pdfGenerator';

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
    docente_id: user.ruolo === 'Docente' ? (user.id_collegato || '') : '',
    alunno_id: '',
    tipo_lezione_id: '', 
    mese: new Date().getMonth() + 1,
    anno: currentGlobalYear || getCurrentAcademicYear()
  });
  
  const [sortConfig, setSortConfig] = useState({ key: 'data_lezione', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false); 
  const [editingLezione, setEditingLezione] = useState(null);
  
  const [confirmDialog, setConfirmDialog] = useState({ 
    isOpen: false, type: 'danger', title: '', message: '', confirmText: 'Conferma', onConfirm: null, showCancel: true
  });

  // --- 1. Carica Anni (con Deduplicazione) ---
  useEffect(() => {
    const fetchYears = async () => {
        try {
            const { data } = await supabase.from('anni_accademici').select('anno').order('anno', {ascending:false});
            if(data && data.length > 0) {
                // FIX DUPLICATI: Usiamo un Map per rimuovere anni duplicati visivamente
                const uniqueYears = Array.from(new Map(data.map(item => [item.anno, item])).values());
                setActiveYears(uniqueYears);
            } else {
                setActiveYears([{anno: '2024/2025'}, {anno: '2025/2026'}]); 
            }
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

  // --- 3. Carica Risorse (Docenti/Alunni per i FILTRI) ---
  useEffect(() => {
    const fetchResources = async () => {
      // Docenti (Solo se non è docente)
      if (user.ruolo !== 'Docente') {
        let queryDoc = supabase.from('docenti').select('id, nome, cognome, strumento, school_id').order('cognome');
        
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
          if (user.id_collegato) {
              const { data: assocData } = await supabase
                .from('associazioni')
                .select('alunni(id, nome, cognome)')
                .eq('docente_id', user.id_collegato);
              
              alunniList = assocData?.map(a => a.alunni).filter(Boolean) || [];
          }
      } else {
          let queryAlunni = supabase.from('alunni').select('id, nome, cognome').eq('stato', 'Attivo');
          
          if (user.school_id) {
              queryAlunni = queryAlunni.eq('school_id', user.school_id);
          }

          const { data: a } = await queryAlunni;
          alunniList = a || [];
      }

      alunniList.sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''));
      setAlunni(alunniList);
      
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
      if (!startYear || !endYear) throw new Error("Formato anno non valido");

      const startDate = `${startYear}-09-01`;
      const endDate = `${endYear}-08-31`;

      let query = supabase
        .from('registro')
        .select(`
          id, data_lezione, convalidato, anno_accademico, contabilizza_docente, tipo_lezione_id,
          docenti!inner ( id, nome, cognome, school_id ),
          alunni ( id, nome, cognome ),
          tipi_lezioni ( id, tipo, modalita ) 
        `)
        .gte('data_lezione', startDate)
        .lte('data_lezione', endDate);

      // --- FILTRI RUOLO E SCUOLA ---
      if (user.ruolo === 'Docente') {
          if (!user.id_collegato) {
              console.warn("Utente Docente senza id_collegato. Impossibile caricare lezioni.");
              setLezioni([]);
              setLoading(false);
              return;
          }
          query = query.eq('docente_id', user.id_collegato);
      } else {
          if (filters.docente_id) {
              query = query.eq('docente_id', filters.docente_id);
          }
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
        console.error("Errore registro fetchLezioni:", err); 
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

  // --- DELETE LOGIC ---
  const handleDeleteClick = async (row) => {
    const hasPermission = await checkPermission(row.anno_accademico);
    if (!hasPermission) return;

    const isCollettiva = row.tipi_lezioni?.modalita === 'Collettiva';
    
    const executeDelete = async (mode) => {
        try {
            if (mode === 'ALL') {
                const { error } = await supabase
                    .from('registro')
                    .delete()
                    .eq('docente_id', row.docenti.id)
                    .eq('data_lezione', row.data_lezione)
                    .eq('tipo_lezione_id', row.tipo_lezione_id);

                if (error) throw error;
            } else {
                if (row.contabilizza_docente && isCollettiva) {
                    const { data: siblings } = await supabase
                        .from('registro')
                        .select('id')
                        .eq('docente_id', row.docenti.id)
                        .eq('data_lezione', row.data_lezione)
                        .eq('tipo_lezione_id', row.tipo_lezione_id)
                        .neq('id', row.id)
                        .limit(1);

                    if (siblings && siblings.length > 0) {
                        const { error: updateError } = await supabase
                            .from('registro')
                            .update({ contabilizza_docente: true })
                            .eq('id', siblings[0].id);
                        if (updateError) throw updateError;
                    }
                }
                const { error } = await supabase.from('registro').delete().eq('id', row.id);
                if (error) throw error;
            }

            fetchLezioni();
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
            alert("Errore eliminazione: " + err.message);
        }
    };

    if (isCollettiva) {
        const { count } = await supabase
            .from('registro')
            .select('*', { count: 'exact', head: true })
            .eq('docente_id', row.docenti.id)
            .eq('data_lezione', row.data_lezione)
            .eq('tipo_lezione_id', row.tipo_lezione_id);
        
        if (count > 1) {
            setConfirmDialog({
                isOpen: true,
                type: 'warning',
                title: 'Eliminazione Lezione di Gruppo',
                message: `Questa è una lezione di gruppo con ${count} partecipanti.\n\nCome vuoi procedere?`,
                confirmText: 'Elimina TUTTI',
                cancelText: 'Solo questo Alunno',
                showCancel: true,
                onConfirm: () => executeDelete('ALL'),
                onCancel: () => executeDelete('SINGLE') 
            });
            return;
        }
    }

    setConfirmDialog({
        isOpen: true,
        type: 'danger',
        title: 'Elimina Lezione',
        message: `Sei sicuro di voler eliminare questa lezione?\n\nAlunno: ${row.alunni?.cognome} ${row.alunni?.nome}`,
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        showCancel: true,
        onConfirm: () => executeDelete('SINGLE'),
        onCancel: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
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
          
          <div className="flex gap-2">
            {/* --- PULSANTE EXPORT (Solo Admin/Gestore) --- */}
            {user.ruolo !== 'Docente' && (
                <button 
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm border border-gray-600"
                  title="Esporta Registro (PDF)"
                >
                  <Printer size={16} /> <span className="hidden sm:inline">Esporta</span>
                </button>
            )}

            {(user.ruolo !== 'Docente' || filters.anno === getCurrentAcademicYear()) && (
                <button 
                  onClick={handleNewLezione}
                  className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-colors shadow-sm"
                >
                  <Plus size={16} /> Nuova Lezione
                </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Selettore Anno con key unica */}
          {user.ruolo !== 'Docente' && (
              <select 
                name="anno" 
                value={filters.anno} 
                onChange={(e) => setFilters({...filters, anno: e.target.value})} 
                className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 font-bold focus:border-accademia-red focus:outline-none"
              >
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
              <th className="px-6 py-3 text-center">Modalità</th> 
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('docente')}>Docente <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('alunno')}>Alunno <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 cursor-pointer hover:text-white" onClick={()=>handleSort('tipo')}>Lezione <ArrowUpDown size={12} className="inline"/></th>
              <th className="px-6 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? <tr><td colSpan="6" className="p-8 text-center text-gray-500">Caricamento...</td></tr> : 
             sortedLezioni.length === 0 ? <tr><td colSpan="6" className="p-8 text-center text-gray-500">Nessuna lezione trovata.</td></tr> :
             sortedLezioni.map(row => (
                <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-3 font-mono text-gray-300">{new Date(row.data_lezione).toLocaleDateString('it-IT')}</td>
                  
                  <td className="px-6 py-3 text-center">
                    {row.tipi_lezioni?.modalita === 'Collettiva' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                            <Users size={12} /> Gruppo
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 opacity-70">
                            <User size={12} /> Singolo
                        </span>
                    )}
                  </td>

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

      {/* --- MODALE EXPORT PDF (NUOVO) --- */}
      {showExportModal && (
          <ModalExportRegistro 
            docenti={docenti} 
            anno={filters.anno}
            user={user}
            onClose={() => setShowExportModal(false)}
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
        onCancel={confirmDialog.onCancel} 
      />
    </div>
  );
}

// --- MODALE INSERIMENTO/MODIFICA (INVARIATA) ---
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
  const [isCollettiva, setIsCollettiva] = useState(false);
  const [selectedAlunniIds, setSelectedAlunniIds] = useState([]);
  const [lessonModes, setLessonModes] = useState({});
  
  const [filteredAlunni, setFilteredAlunni] = useState([]);
  const [loadingAlunni, setLoadingAlunni] = useState(false);

  // 1. CARICAMENTO ALUNNI FILTRATI PER DOCENTE
  useEffect(() => {
    const fetchAlunniByDocente = async () => {
        if (!formData.docente_id) {
            setFilteredAlunni([]);
            return;
        }

        if (user.ruolo === 'Docente') {
            setFilteredAlunni(alunni);
            return;
        }

        setLoadingAlunni(true);
        const { data } = await supabase
            .from('associazioni')
            .select('alunni(id, nome, cognome)')
            .eq('docente_id', formData.docente_id);

        if (data) {
            const mapped = data.map(item => item.alunni).filter(Boolean);
            mapped.sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''));
            setFilteredAlunni(mapped);
        } else {
            setFilteredAlunni([]);
        }
        setLoadingAlunni(false);
    };

    fetchAlunniByDocente();
  }, [formData.docente_id, alunni, user.ruolo]);


  // 2. FILTRA TARIFFE & CHECK MODALITA'
  useEffect(() => {
    const filterTariffeByDocente = async () => {
      if (!formData.docente_id) {
        setFilteredTariffe([]);
        return;
      }
      setLoadingTariffe(true);
      
      const { data: competenze, error } = await supabase
        .from('docenti_tipi_lezioni')
        .select(`tipi_lezioni ( tipo, modalita )`)
        .eq('docente_id', formData.docente_id);

      if (error) {
        setFilteredTariffe(tariffe); 
      } else {
        const allowedTypes = competenze?.map(c => c.tipi_lezioni?.tipo) || [];
        const modesMap = {};
        competenze?.forEach(c => {
            if(c.tipi_lezioni) {
                modesMap[c.tipi_lezioni.tipo] = c.tipi_lezioni.modalita || 'Individuale';
            }
        });
        setLessonModes(modesMap);

        const filtered = tariffe.filter(t => allowedTypes.includes(t.tipo_lezione));
        setFilteredTariffe(filtered);
      }
      setLoadingTariffe(false);
    };

    if (!formData.id) {
        filterTariffeByDocente();
    } else {
        if (lezione?.tipi_lezioni?.modalita === 'Collettiva') {
            setIsCollettiva(true);
        }
    }
  }, [formData.docente_id, tariffe, formData.id]);

  const handleTipoChange = (e) => {
      const selectedId = e.target.value;
      setFormData({...formData, tipo_lezione_id: selectedId});
      
      const tariffa = tariffe.find(t => String(t.id) === String(selectedId));
      if (tariffa) {
          const mode = lessonModes[tariffa.tipo_lezione];
          setIsCollettiva(mode === 'Collettiva');
          setSelectedAlunniIds([]);
          setFormData(prev => ({ ...prev, alunno_id: '', tipo_lezione_id: selectedId }));
      } else {
          setIsCollettiva(false);
      }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      let tipoLezioneId = formData.tipo_lezione_id;

      if (!formData.id) {
        if (!formData.tipo_lezione_id) return alert("Seleziona un tipo di lezione");

        if (isCollettiva && selectedAlunniIds.length === 0) return alert("Seleziona almeno un alunno per la lezione di gruppo.");
        if (!isCollettiva && !formData.alunno_id) return alert("Seleziona un alunno.");
        
        const tariffaSelezionata = tariffe.find(t => String(t.id) === String(formData.tipo_lezione_id));
        if (!tariffaSelezionata) return alert("Errore: tariffa non trovata.");

        // FIX: Rimosso controllo su 'costo' perché non esiste nella tabella tipi_lezioni
        const { data: existingTipo, error: searchError } = await supabase
          .from('tipi_lezioni')
          .select('id')
          .eq('tipo', tariffaSelezionata.tipo_lezione)
          .eq('school_id', user.school_id)
          .maybeSingle();

        if (searchError && searchError.code !== 'PGRST116') throw searchError;

        if (existingTipo) {
          tipoLezioneId = existingTipo.id;
        } else {
          const newTipoId = 'TL' + Date.now();
          // FIX: Rimosso inserimento 'costo'
          const { error: insertTipoError } = await supabase
            .from('tipi_lezioni')
            .insert([{
              id: newTipoId,
              tipo: tariffaSelezionata.tipo_lezione,
              durata_minuti: 60,
              modalita: isCollettiva ? 'Collettiva' : 'Individuale', 
              school_id: user.school_id
            }]);

          if (insertTipoError) throw insertTipoError;
          tipoLezioneId = newTipoId;
        }
      } else {
          tipoLezioneId = lezione.tipo_lezione_id;
      }

      const basePayload = {
        docente_id: formData.docente_id,
        tipo_lezione_id: tipoLezioneId,
        data_lezione: formData.data_lezione,
        anno_accademico: anno, 
        convalidato: false
      };

      if (formData.id) {
        // --- MODIFICA ---
        if (isCollettiva) {
            const oldData = lezione.data_lezione.slice(0, 10);
            const newData = formData.data_lezione;

            if (oldData !== newData) {
                const confirmUpdate = window.confirm(`Hai modificato la data della lezione.\nVuoi spostare TUTTI i partecipanti di questo gruppo al ${new Date(newData).toLocaleDateString()}?`);
                
                if (confirmUpdate) {
                    const { error } = await supabase
                        .from('registro')
                        .update({ data_lezione: newData })
                        .eq('docente_id', lezione.docenti.id)
                        .eq('data_lezione', lezione.data_lezione) 
                        .eq('tipo_lezione_id', lezione.tipo_lezione_id);
                    if (error) throw error;
                } else {
                   const { error } = await supabase.from('registro').update({ ...basePayload, alunno_id: formData.alunno_id }).eq('id', formData.id);
                   if (error) throw error;
                }
            } else {
                 const { error } = await supabase.from('registro').update({ ...basePayload, alunno_id: formData.alunno_id }).eq('id', formData.id);
                 if (error) throw error;
            }
        } else {
            const { error } = await supabase.from('registro').update({ ...basePayload, alunno_id: formData.alunno_id }).eq('id', formData.id);
            if (error) throw error;
        }

      } else {
        // --- NUOVO ---
        if (isCollettiva) {
            const rowsToInsert = selectedAlunniIds.map((alunnoId, index) => ({
                id: crypto.randomUUID(), 
                ...basePayload,
                alunno_id: alunnoId,
                contabilizza_docente: index === 0 ? true : false 
            }));

            const { error } = await supabase.from('registro').insert(rowsToInsert);
            if (error) throw error;

        } else {
            const newId = crypto.randomUUID();
            const { error } = await supabase.from('registro').insert([{ 
                id: newId, 
                ...basePayload, 
                alunno_id: formData.alunno_id,
                contabilizza_docente: true 
            }]);
            if (error) throw error;
        }
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
                    setIsCollettiva(false);
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
          
          {/* SELEZIONE TIPO LEZIONE */}
          <div>
            <label className="block text-xs text-gray-400 uppercase mb-1">
              Tipo Lezione {!formData.id && `(Tariffa ${anno})`}
            </label>
            {!formData.id ? (
              <>
                <select 
                  value={formData.tipo_lezione_id} 
                  onChange={handleTipoChange} 
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
              <div className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-gray-400 cursor-not-allowed flex justify-between items-center">
                <span>{lezione?.tipi_lezioni?.tipo || 'N/A'}</span>
                {isCollettiva && <span className="text-yellow-500 text-xs flex items-center gap-1"><Users size={12}/> Gruppo</span>}
              </div>
            )}
          </div>

          {/* SELEZIONE ALUNNO / ALUNNI */}
          <div>
            <label className="block text-xs text-gray-400 uppercase mb-1 flex items-center justify-between">
                <span>{isCollettiva && !formData.id ? 'Partecipanti (Lezione di Gruppo)' : 'Alunno'}</span>
                {isCollettiva && !formData.id && <span className="text-[10px] text-yellow-500 flex items-center gap-1"><Users size={10}/> Seleziona multipli</span>}
                {loadingAlunni && <Loader2 size={12} className="animate-spin text-gray-400"/>}
            </label>
            
            {/* USO filteredAlunni INVECE DI alunni */}
            {!isCollettiva || formData.id ? (
                <select 
                    value={formData.alunno_id} 
                    onChange={e=>setFormData({...formData,alunno_id:e.target.value})} 
                    className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
                    required
                    disabled={!formData.docente_id || loadingAlunni}
                >
                    <option value="">
                        {!formData.docente_id ? "Seleziona prima un docente..." : "Seleziona..."}
                    </option>
                    {filteredAlunni.map(a=><option key={a.id} value={a.id}>{a.cognome} {a.nome}</option>)}
                </select>
            ) : (
                <div className="bg-accademia-input border border-gray-700 rounded p-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredAlunni.length === 0 ? <span className="text-gray-500 text-sm">Nessun alunno associato</span> : 
                     filteredAlunni.map(a => (
                        <label key={a.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-700 rounded cursor-pointer transition-colors">
                            <input 
                                type="checkbox"
                                checked={selectedAlunniIds.includes(a.id)}
                                onChange={(e) => {
                                    if(e.target.checked) setSelectedAlunniIds([...selectedAlunniIds, a.id]);
                                    else setSelectedAlunniIds(selectedAlunniIds.filter(id => id !== a.id));
                                }}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-accademia-red focus:ring-accademia-red"
                            />
                            <span className={`text-sm ${selectedAlunniIds.includes(a.id) ? 'text-white font-bold' : 'text-gray-300'}`}>
                                {a.cognome} {a.nome}
                            </span>
                        </label>
                    ))}
                </div>
            )}
            
            {isCollettiva && !formData.id && (
                <div className="text-right text-[10px] text-gray-400 mt-1">
                    Selezionati: {selectedAlunniIds.length}
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
              {isCollettiva && selectedAlunniIds.length > 1 && !formData.id ? `Registra ${selectedAlunniIds.length} Lezioni` : 'Salva Lezione'}
            </button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}

// --- NUOVO: MODALE EXPORT REGISTRO ---
function ModalExportRegistro({ docenti, anno, user, onClose }) {
    const [selectedMonths, setSelectedMonths] = useState(MESI.map(m => m.val)); // Default tutti
    const [selectedDocenti, setSelectedDocenti] = useState(docenti.map(d => d.id)); // Default tutti
    const [loading, setLoading] = useState(false);

    const toggleMonth = (val) => {
        if (selectedMonths.includes(val)) setSelectedMonths(selectedMonths.filter(m => m !== val));
        else setSelectedMonths([...selectedMonths, val]);
    };

    const toggleDocente = (id) => {
        if (selectedDocenti.includes(id)) setSelectedDocenti(selectedDocenti.filter(d => d !== id));
        else setSelectedDocenti([...selectedDocenti, id]);
    };

    const toggleAllMonths = () => {
        if (selectedMonths.length === MESI.length) setSelectedMonths([]);
        else setSelectedMonths(MESI.map(m => m.val));
    };

    const toggleAllDocenti = () => {
        if (selectedDocenti.length === docenti.length) setSelectedDocenti([]);
        else setSelectedDocenti(docenti.map(d => d.id));
    };

    const handleExport = async () => {
        if (selectedMonths.length === 0) return alert("Seleziona almeno un mese.");
        if (selectedDocenti.length === 0) return alert("Seleziona almeno un docente.");

        setLoading(true);
        try {
            const [startYear, endYear] = anno.split('/').map(Number);
            const startDate = `${startYear}-09-01`;
            const endDate = `${endYear}-08-31`;

            let query = supabase
                .from('registro')
                .select(`
                    id, data_lezione, convalidato,
                    docenti!inner ( id, nome, cognome, strumento, school_id ),
                    alunni ( nome, cognome ),
                    tipi_lezioni ( tipo, durata_minuti )
                `)
                .gte('data_lezione', startDate)
                .lte('data_lezione', endDate)
                .in('docente_id', selectedDocenti)
                .eq('docenti.school_id', user.school_id);

            const { data, error } = await query;
            if (error) throw error;

            // Filtro ulteriore per mesi
            const filteredData = data.filter(r => {
                const m = new Date(r.data_lezione).getMonth() + 1;
                return selectedMonths.includes(m);
            });

            if (filteredData.length === 0) {
                alert("Nessuna lezione trovata con i filtri selezionati.");
            } else {
                // Info Scuola per il PDF
                const schoolInfo = {
                    name: user.scuole?.nome || 'Accademia Musicale',
                    logo: user.scuole?.logo_url || null
                };
                
                // Creiamo l'array delle etichette dei mesi selezionati per l'intestazione
                // Ordiniamo i mesi selezionati secondo l'ordine definito in MESI
                const selectedLabels = MESI
                    .filter(m => selectedMonths.includes(m.val))
                    .map(m => m.label);

                await generateRegistroPDF(schoolInfo, { anno }, filteredData, selectedLabels);
            }
            onClose();

        } catch (err) {
            console.error(err);
            alert("Errore esportazione: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh]">
                <div className="flex justify-between mb-4 shrink-0">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><Printer size={20}/> Esporta Registro Lezioni</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                    
                    {/* SELEZIONE MESI */}
                    <div className="bg-gray-900/30 p-4 rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-accademia-red uppercase">1. Seleziona Mesi</h4>
                            <button onClick={toggleAllMonths} className="text-xs text-blue-400 hover:text-white flex items-center gap-1">
                                {selectedMonths.length === MESI.length ? <CheckSquare size={14}/> : <Square size={14}/>} 
                                {selectedMonths.length === MESI.length ? 'Deseleziona Tutti' : 'Seleziona Tutti'}
                            </button>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {MESI.map(m => (
                                <button 
                                    key={m.val} 
                                    onClick={() => toggleMonth(m.val)}
                                    className={`text-xs p-2 rounded border transition-all ${
                                        selectedMonths.includes(m.val) 
                                        ? 'bg-accademia-red text-white border-red-600' 
                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* SELEZIONE DOCENTI */}
                    <div className="bg-gray-900/30 p-4 rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-accademia-red uppercase">2. Seleziona Docenti</h4>
                            <button onClick={toggleAllDocenti} className="text-xs text-blue-400 hover:text-white flex items-center gap-1">
                                {selectedDocenti.length === docenti.length ? <CheckSquare size={14}/> : <Square size={14}/>} 
                                {selectedDocenti.length === docenti.length ? 'Deseleziona Tutti' : 'Seleziona Tutti'}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {docenti.map(d => (
                                <button 
                                    key={d.id} 
                                    onClick={() => toggleDocente(d.id)}
                                    className={`text-xs p-2 rounded border text-left truncate transition-all ${
                                        selectedDocenti.includes(d.id) 
                                        ? 'bg-blue-900/40 text-blue-100 border-blue-700' 
                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                    }`}
                                >
                                    {d.nome_completo}
                                </button>
                            ))}
                        </div>
                    </div>

                </div>

                <div className="pt-4 mt-4 border-t border-gray-800 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Annulla</button>
                    <button 
                        onClick={handleExport} 
                        disabled={loading}
                        className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg disabled:opacity-50"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin"/> : <Printer size={18}/>}
                        {loading ? 'Generazione PDF...' : 'Scarica PDF'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}