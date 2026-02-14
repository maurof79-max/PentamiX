import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
  Edit2, Trash2, Plus, X, Settings, 
  Calendar, Archive, Download, Lock, CheckCircle2, ShieldAlert, Eye, Building, Tags
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function GestioneTariffe({ userRole, config }) {
  // --- STATI ---
  const [scuole, setScuole] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(''); // ID Scuola attiva

  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null); 
  
  const [tariffe, setTariffe] = useState([]);
  const [pacchetti, setPacchetti] = useState([]); // NUOVO STATO PACCHETTI

  const [loading, setLoading] = useState(false);
  
  // Modali
  const [showYearModal, setShowYearModal] = useState(false);
  const [showTariffaModal, setShowTariffaModal] = useState(false);
  const [showPacchettoModal, setShowPacchettoModal] = useState(false); // NUOVO MODALE
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  
  const [editingItem, setEditingItem] = useState(null);
  const [editingPacchetto, setEditingPacchetto] = useState(null); // NUOVO EDITING

  // Dialoghi
  const [dialogConfig, setDialogConfig] = useState({
    isOpen: false, type: 'info', title: '', message: '', showCancel: false, onConfirm: () => {}, onCancel: () => {}
  });

  // --- INIT ---
  useEffect(() => {
    const init = async () => {
        // 1. Recupera utente
        const { data: { session } } = await supabase.auth.getSession();
        if(!session) return;
        const { data: profile } = await supabase.from('utenti').select('*').eq('id', session.user.id).single();

        // 2. Recupera Scuole (Tutte per Admin, Solo propria per altri)
        let scuoleList = [];
        if (profile.ruolo === 'Admin') {
            const { data } = await supabase.from('scuole').select('id, nome, abilita_gestore_tariffe').order('nome');
            scuoleList = data || [];
        } else if (profile.school_id) {
            const { data } = await supabase.from('scuole').select('id, nome, abilita_gestore_tariffe').eq('id', profile.school_id);
            scuoleList = data || [];
        }
        setScuole(scuoleList);
        
        // 3. Seleziona default
        if (scuoleList.length > 0) setSelectedSchool(scuoleList[0].id);
    };
    init();
  }, []);

  // Fetch Anni al cambio Scuola
  useEffect(() => {
    if (selectedSchool) fetchYears();
    else setYears([]);
  }, [selectedSchool]);

  // Fetch Tariffe e Pacchetti al cambio Anno/Scuola
  useEffect(() => {
    if (selectedYear && selectedSchool) {
        fetchTariffe(selectedYear.anno);
        fetchPacchetti(selectedYear.anno); // NUOVA CHIAMATA
    } else {
        setTariffe([]);
        setPacchetti([]);
    }
  }, [selectedYear, selectedSchool]);

  // --- CHIAMATE DB ---
  const fetchYears = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('anni_accademici')
      .select('*')
      .eq('school_id', selectedSchool)
      .order('anno', { ascending: false });
    
    if (data && data.length > 0) {
      setYears(data);
      if (!selectedYear || !data.find(y => y.anno === selectedYear.anno)) {
          const current = data.find(y => y.is_current) || data[0];
          setSelectedYear(current);
      } else {
          const updated = data.find(y => y.anno === selectedYear.anno);
          if(updated) setSelectedYear(updated);
      }
    } else {
        setYears([]);
        setSelectedYear(null);
    }
    setLoading(false);
  };

  const fetchTariffe = async (anno) => {
    const { data } = await supabase
      .from('tariffe')
      .select('*')
      .eq('school_id', selectedSchool)
      .eq('anno_accademico', anno)
      .order('tipo_lezione');
    setTariffe(data || []);
  };

  // NUOVA FUNZIONE FETCH PACCHETTI
  const fetchPacchetti = async (anno) => {
    const { data } = await supabase
      .from('tariffe_pacchetti')
      .select('*')
      .eq('school_id', selectedSchool)
      .eq('anno_accademico', anno)
      .order('id');
    setPacchetti(data || []);
  };

  // --- HANDLERS ---
  const handleCreateYear = async (newAnno) => {
    try {
      if(!selectedSchool) throw new Error("Nessuna scuola selezionata");
      setLoading(true);

      // 1. Crea Anno
      const { error } = await supabase.from('anni_accademici').insert([{
        anno: newAnno,
        school_id: selectedSchool,
        stato: 'Attivo',
        is_current: false, 
        quota_iscrizione: selectedYear?.quota_iscrizione || 30
      }]);
      if (error) throw error;

      // 2. Clona Tariffe anno precedente
      if (tariffe.length > 0) {
        const newTariffe = tariffe.map(t => ({
          anno_accademico: newAnno,
          school_id: selectedSchool,
          tipo_lezione: t.tipo_lezione,
          costo: t.costo
        }));
        await supabase.from('tariffe').insert(newTariffe);
      }
      
      // 3. Clona Pacchetti anno precedente (Opzionale, ma utile)
      if (pacchetti.length > 0) {
        const newPacchetti = pacchetti.map(p => ({
            anno_accademico: newAnno,
            school_id: selectedSchool,
            tipo_lezione_a: p.tipo_lezione_a,
            tipo_lezione_b: p.tipo_lezione_b,
            sconto: p.sconto,
            descrizione: p.descrizione
        }));
        await supabase.from('tariffe_pacchetti').insert(newPacchetti);
      }

      showMessage("Successo", `Anno ${newAnno} creato per la scuola selezionata.`, "success");
      await fetchYears();
      setShowYearModal(false);
    } catch (err) {
      showMessage("Errore Creazione", err.message, "danger");
    } finally {
        setLoading(false);
    }
  };

  const handleSetCurrentYear = (annoTarget) => {
    askConfirm(
        "Modifica Anno Corrente",
        `Vuoi rendere il ${annoTarget} l'anno attivo per questa scuola?`,
        async () => {
            try {
                setLoading(true);
                await supabase.from('anni_accademici')
                    .update({ is_current: false })
                    .eq('school_id', selectedSchool)
                    .neq('anno', 'placeholder');
                
                const { error } = await supabase.from('anni_accademici')
                    .update({ is_current: true })
                    .eq('school_id', selectedSchool)
                    .eq('anno', annoTarget);
                
                if (error) throw error;
                showMessage("Successo", `Anno aggiornato.`);
                fetchYears();
            } catch (err) {
                showMessage("Errore", err.message, "danger");
            } finally {
                setLoading(false);
            }
        }
    );
  };

  const handleUpdateQuota = async (newQuota) => {
    const { error } = await supabase
      .from('anni_accademici')
      .update({ quota_iscrizione: parseFloat(newQuota) })
      .eq('school_id', selectedSchool)
      .eq('anno', selectedYear.anno);
    
    if (!error) {
        setSelectedYear(prev => ({ ...prev, quota_iscrizione: newQuota }));
        setShowQuotaModal(false);
    } else {
        showMessage("Errore", error.message, "danger");
    }
  };

  const handleCloseYear = () => {
    askConfirm(
        "Chiusura Anno Accademico",
        `Sei sicuro di voler CHIUDERE l'anno ${selectedYear.anno}?`,
        async () => {
            const { error } = await supabase
                .from('anni_accademici')
                .update({ stato: 'Concluso' })
                .eq('school_id', selectedSchool)
                .eq('anno', selectedYear.anno);
            
            if (!error) fetchYears();
            else showMessage("Errore", error.message, "danger");
        },
        "danger"
    );
  };

  const handleDeleteTariffa = (id) => {
    if (selectedYear.stato === 'Concluso') return;
    askConfirm("Elimina Tariffa", "Confermi l'eliminazione?", async () => {
        const { error } = await supabase.from('tariffe').delete().eq('id', id);
        if (error) showMessage("Errore", error.message, "danger");
        else fetchTariffe(selectedYear.anno);
    }, "danger");
  };

  // NUOVO HANDLER DELETE PACCHETTO
  const handleDeletePacchetto = (id) => {
    if (selectedYear.stato === 'Concluso') return;
    askConfirm("Elimina Pacchetto", "Confermi l'eliminazione della regola di sconto?", async () => {
        const { error } = await supabase.from('tariffe_pacchetti').delete().eq('id', id);
        if (error) showMessage("Errore", error.message, "danger");
        else fetchPacchetti(selectedYear.anno);
    }, "danger");
  };

  const handleExportData = async () => {
    try {
      setLoading(true);
      const { data: pays } = await supabase
        .from('pagamenti')
        .select(`*, alunni(nome, cognome), docenti(nome, cognome)`)
        .eq('anno_accademico', selectedYear.anno);
      
      if (!pays || pays.length === 0) {
          setLoading(false);
          showMessage("Nessun Dato", "Nessun dato da esportare.", "warning");
          return;
      }

      const headers = ["ID", "Data", "Alunno", "Docente", "Tipologia", "Mese", "Importo", "Note"];
      const rows = pays.map(p => [
          p.id, p.data_pagamento, 
          `${p.alunni?.cognome} ${p.alunni?.nome}`, 
          `${p.docenti?.cognome} ${p.docenti?.nome}`, 
          p.tipologia, p.mese_riferimento || '-', p.importo, `"${p.note || ''}"`
      ]);

      let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Report_${selectedYear.anno.replace('/','-')}_${scuole.find(s=>s.id===selectedSchool)?.nome}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) { showMessage("Errore Export", err.message, "danger"); } finally { setLoading(false); }
  };

  const showMessage = (title, message, type = 'info') => {
    setDialogConfig({ isOpen: true, title, message, type, showCancel: false, onConfirm: () => setDialogConfig(p => ({...p, isOpen:false})), onCancel: () => setDialogConfig(p => ({...p, isOpen:false})) });
  };
  const askConfirm = (title, message, onYes, type = 'warning') => {
    setDialogConfig({ isOpen: true, title, message, type, showCancel: true, onConfirm: () => { onYes(); setDialogConfig(p => ({...p, isOpen:false})); }, onCancel: () => setDialogConfig(p => ({...p, isOpen:false})) });
  };

  const canEdit = () => {
      if (userRole === 'Admin') return true;
      if (!selectedSchool) return false;
      const currentSchoolObj = scuole.find(s => s.id === selectedSchool);
      if (userRole === 'Gestore' && currentSchoolObj?.abilita_gestore_tariffe) {
          return true;
      }
      if (config && config['permessi_tariffe'] && Array.isArray(config['permessi_tariffe'])) {
          return config['permessi_tariffe'].includes(userRole);
      }
      return false;
  };

  const isLocked = selectedYear?.stato === 'Concluso';
  const isEditable = canEdit() && !isLocked;

  return (
    <div className="h-full flex flex-col relative bg-accademia-card">
      
      {/* HEADER */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/40 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        
        <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
             {/* Select Scuola */}
             <div className="bg-gray-800/50 p-2 rounded-lg border border-gray-700 flex items-center gap-2">
                <Building className="text-accademia-red" size={20}/>
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Sede Operativa</span>
                    <select 
                        value={selectedSchool} 
                        onChange={(e) => setSelectedSchool(e.target.value)}
                        className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
                        disabled={scuole.length <= 1}
                    >
                        {scuole.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                </div>
             </div>

             {/* Select Anno */}
             <div className="bg-gray-800/50 p-2 rounded-lg border border-gray-700 flex items-center gap-2">
                <Calendar className="text-accademia-red" size={20}/>
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Anno Accademico</span>
                    {years.length > 0 ? (
                        <select 
                            value={selectedYear?.anno || ''} 
                            onChange={(e) => setSelectedYear(years.find(y => y.anno === e.target.value))}
                            className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
                        >
                            {years.map(y => <option key={y.anno} value={y.anno}>{y.anno}</option>)}
                        </select>
                    ) : (
                        <span className="text-gray-500 text-sm italic px-2">Nessun anno</span>
                    )}
                </div>
             </div>

             {/* Badge */}
             <div className="flex items-center gap-2">
                 {selectedYear?.is_current && (
                     <span className="flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/50 rounded-full text-xs font-bold uppercase tracking-wider">
                        <CheckCircle2 size={14}/> Corrente
                     </span>
                 )}
                 {selectedYear?.stato === 'Concluso' && (
                     <span className="flex items-center gap-1 px-3 py-1 bg-red-900/20 text-red-400 border border-red-900/50 rounded-full text-xs font-bold uppercase tracking-wider">
                        <Lock size={14}/> Concluso
                     </span>
                 )}
                 {!isEditable && selectedSchool && (
                     <span className="text-[10px] text-gray-500 italic flex items-center gap-1 border border-gray-700 rounded px-2 py-0.5">
                         <Eye size={10}/> Solo Lettura
                     </span>
                 )}
             </div>
        </div>

        {/* Azioni */}
        <div className="flex gap-2 w-full sm:w-auto justify-end">
            {canEdit() && selectedYear && !selectedYear?.is_current && selectedYear?.stato !== 'Concluso' && (
                <button 
                   onClick={() => handleSetCurrentYear(selectedYear.anno)}
                   className="px-3 py-2 bg-gray-800 hover:bg-white hover:text-black text-gray-300 border border-gray-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                >
                   Imposta Corrente
                </button>
            )}
            
            {canEdit() && selectedSchool && (
                <button 
                    onClick={() => setShowYearModal(true)}
                    className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors"
                >
                    <Plus size={16}/> Nuovo Anno
                </button>
            )}
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar space-y-8">
         {!selectedYear ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                 <Archive size={48} className="opacity-20"/>
                 <p>Seleziona una scuola e crea un anno accademico.</p>
             </div>
         ) : (
             <>
                 {/* QUOTA */}
                 <section className="bg-gray-900/20 border border-gray-800 rounded-xl p-6 relative overflow-hidden flex justify-between items-center">
                    <div className="absolute top-0 left-0 w-1 h-full bg-accademia-red"></div>
                    <div>
                        <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
                            <Settings size={18} className="text-gray-400"/> Quota Iscrizione
                        </h3>
                        <p className="text-gray-500 text-sm">Quota annuale per l'anno {selectedYear.anno}</p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-3xl font-mono font-bold text-green-400">
                             € {selectedYear.quota_iscrizione}
                        </div>
                        {isEditable ? (
                            <button onClick={() => setShowQuotaModal(true)} className="p-2 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg border border-gray-700"><Edit2 size={18}/></button>
                        ) : <span className="text-gray-600 p-2"><Eye size={18}/></span>}
                    </div>
                 </section>

                 {/* TARIFFE */}
                 <section className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/20">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/40">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Archive size={18} className="text-gray-400"/> Listino Prezzi ({selectedYear.anno})
                        </h3>
                        {isEditable && (
                            <button 
                                onClick={() => { setEditingItem(null); setShowTariffaModal(true); }}
                                className="flex items-center gap-2 text-accademia-red hover:text-red-400 text-sm font-bold uppercase tracking-wider transition-colors"
                            >
                                <Plus size={16}/> Aggiungi Tariffa
                            </button>
                        )}
                    </div>

                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3 font-semibold">Tipologia Lezione</th>
                                <th className="px-6 py-3 font-semibold text-right">Costo Singolo</th>
                                <th className="px-6 py-3 font-semibold text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {tariffe.length === 0 ? (
                                <tr><td colSpan="3" className="p-8 text-center text-gray-500">Nessuna tariffa definita.</td></tr>
                            ) : (
                                tariffe.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 font-medium text-white">{t.tipo_lezione}</td>
                                        <td className="px-6 py-4 text-right font-mono text-green-400 font-bold">€ {t.costo}</td>
                                        <td className="px-6 py-4 text-right">
                                            {isEditable ? (
                                                <div className="flex justify-end gap-2 opacity-60 hover:opacity-100">
                                                    <button onClick={() => { setEditingItem(t); setShowTariffaModal(true); }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                                                    <button onClick={() => handleDeleteTariffa(t.id)} className="p-1.5 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                                                </div>
                                            ) : <div className="flex justify-end opacity-40"><Eye size={16} className="text-gray-500"/></div>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                 </section>

                 {/* NUOVA SEZIONE: PACCHETTI E SCONTI */}
                 <section className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/20">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/40">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Tags size={18} className="text-green-400"/> Pacchetti e Sconti (Combo)
                        </h3>
                        {isEditable && (
                            <button 
                                onClick={() => { setEditingPacchetto(null); setShowPacchettoModal(true); }}
                                className="flex items-center gap-2 text-green-500 hover:text-green-400 text-sm font-bold uppercase tracking-wider transition-colors"
                            >
                                <Plus size={16}/> Aggiungi Pacchetto
                            </button>
                        )}
                    </div>

                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3 font-semibold">Lezione A</th>
                                <th className="px-6 py-3 font-semibold text-center">+</th>
                                <th className="px-6 py-3 font-semibold">Lezione B</th>
                                <th className="px-6 py-3 font-semibold">Descrizione</th>
                                <th className="px-6 py-3 font-semibold text-right">Sconto</th>
                                <th className="px-6 py-3 font-semibold text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {pacchetti.length === 0 ? (
                                <tr><td colSpan="6" className="p-8 text-center text-gray-500 italic">Nessun pacchetto promozionale attivo.</td></tr>
                            ) : (
                                pacchetti.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 font-medium text-white">{p.tipo_lezione_a}</td>
                                        <td className="px-6 py-4 text-center text-gray-500">+</td>
                                        <td className="px-6 py-4 font-medium text-white">{p.tipo_lezione_b}</td>
                                        <td className="px-6 py-4 text-gray-400 italic text-xs">{p.descrizione}</td>
                                        <td className="px-6 py-4 text-right font-mono text-green-400 font-bold">- € {p.sconto}</td>
                                        <td className="px-6 py-4 text-right">
                                            {isEditable ? (
                                                <div className="flex justify-end gap-2 opacity-60 hover:opacity-100">
                                                    <button onClick={() => handleDeletePacchetto(p.id)} className="p-1.5 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                                                </div>
                                            ) : <div className="flex justify-end opacity-40"><Eye size={16} className="text-gray-500"/></div>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                 </section>

                 <div className="mt-8 pt-6 border-t border-gray-800 flex justify-between">
                     <button onClick={handleExportData} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all shadow-sm">
                        <Download size={16}/> Esporta Report
                     </button>
                    {isEditable && (
                        <button onClick={handleCloseYear} className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-lg transition-all">
                            <Lock size={16}/> Chiudi Anno
                        </button>
                    )}
                 </div>
             </>
         )}
      </div>

      {/* MODALI */}
      {showYearModal && (
          <ModalNewYear currentYears={years.map(y => y.anno)} onClose={() => setShowYearModal(false)} onSave={handleCreateYear} />
      )}
      
      {showTariffaModal && (
          <ModalTariffa 
            tariffa={editingItem} 
            anno={selectedYear?.anno} 
            schoolId={selectedSchool}
            onClose={() => setShowTariffaModal(false)} 
            onSave={() => { setShowTariffaModal(false); fetchTariffe(selectedYear.anno); }} 
          />
      )}
      
      {/* NUOVO MODALE PACCHETTO */}
      {showPacchettoModal && (
          <ModalPacchetto 
            pacchetto={editingPacchetto}
            anno={selectedYear?.anno}
            schoolId={selectedSchool}
            onClose={() => setShowPacchettoModal(false)}
            onSave={() => { setShowPacchettoModal(false); fetchPacchetti(selectedYear.anno); }}
          />
      )}

      {showQuotaModal && selectedYear && (
          <ModalQuota currentQuota={selectedYear.quota_iscrizione} onClose={() => setShowQuotaModal(false)} onSave={handleUpdateQuota} />
      )}
      <ConfirmDialog {...dialogConfig} />
    </div>
  );
}

// --- SUB COMPONENTS ---

// NUOVO COMPONENTE MODALE PACCHETTO
function ModalPacchetto({ pacchetto, anno, schoolId, onClose, onSave }) {
    const [formData, setFormData] = useState({ 
        tipo_lezione_a: pacchetto?.tipo_lezione_a || '', 
        tipo_lezione_b: pacchetto?.tipo_lezione_b || '', 
        sconto: pacchetto?.sconto || '',
        descrizione: pacchetto?.descrizione || ''
    });
    const [availableTypes, setAvailableTypes] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchTypes = async () => {
            if(!schoolId) return;
            const { data } = await supabase
                .from('tipi_lezioni')
                .select('*')
                .eq('school_id', schoolId)
                .eq('attivo', true)
                .order('tipo');
            setAvailableTypes(data || []);
        };
        fetchTypes();
    }, [schoolId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!formData.tipo_lezione_a || !formData.tipo_lezione_b || !formData.sconto) { 
            setErrorMsg("Compila tutti i campi obbligatori."); 
            return; 
        }

        const payload = { 
            school_id: schoolId,
            anno_accademico: anno, 
            tipo_lezione_a: formData.tipo_lezione_a,
            tipo_lezione_b: formData.tipo_lezione_b,
            sconto: parseFloat(formData.sconto.toString().replace(',', '.')),
            descrizione: formData.descrizione
        };

        const { error } = await supabase.from('tariffe_pacchetti').insert([payload]);

        if (error) setErrorMsg("Errore DB: " + error.message);
        else onSave();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between mb-4"><h3 className="text-lg font-bold text-white">Nuovo Pacchetto Sconto</h3><button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button></div>
                {errorMsg && <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm flex items-center gap-2"><ShieldAlert size={16}/> {errorMsg}</div>}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Lezione A</label>
                            <select 
                                value={formData.tipo_lezione_a} 
                                onChange={e=>setFormData({...formData, tipo_lezione_a:e.target.value})} 
                                className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red text-xs"
                                required
                            >
                                <option value="">-- Seleziona --</option>
                                {availableTypes.map(t => <option key={t.id} value={t.tipo}>{t.tipo}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Lezione B</label>
                            <select 
                                value={formData.tipo_lezione_b} 
                                onChange={e=>setFormData({...formData, tipo_lezione_b:e.target.value})} 
                                className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red text-xs"
                                required
                            >
                                <option value="">-- Seleziona --</option>
                                {availableTypes.map(t => <option key={t.id} value={t.tipo}>{t.tipo}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Importo Sconto (€)</label>
                        <input type="number" step="0.5" value={formData.sconto} onChange={e=>setFormData({...formData,sconto:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white font-bold focus:outline-none focus:border-accademia-red" required placeholder="Es. 5.00"/>
                        <p className="text-[10px] text-gray-500 mt-1">Valore da sottrarre se entrambe le lezioni sono presenti nella stessa settimana.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Descrizione (Opzionale)</label>
                        <input type="text" value={formData.descrizione} onChange={e=>setFormData({...formData,descrizione:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white text-sm focus:outline-none focus:border-accademia-red" placeholder="Es. Combo Strumento + Teoria"/>
                    </div>
                    
                    <div className="flex justify-end pt-4">
                        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Salva Pacchetto</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}

function ModalTariffa({ tariffa, anno, schoolId, onClose, onSave }) {
    const [formData, setFormData] = useState({ 
        id: tariffa?.id||null, 
        tipo_lezione: tariffa?.tipo_lezione||'', 
        costo: tariffa?.costo||'' 
    });
    const [availableTypes, setAvailableTypes] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchTypes = async () => {
            if(!schoolId) return;
            const { data } = await supabase
                .from('tipi_lezioni')
                .select('*')
                .eq('school_id', schoolId)
                .eq('attivo', true)
                .order('tipo');
            setAvailableTypes(data || []);
        };
        fetchTypes();
    }, [schoolId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!formData.tipo_lezione || !formData.costo) { setErrorMsg("Compila tutti i campi."); return; }

        const payload = { 
            school_id: schoolId,
            anno_accademico: anno, 
            tipo_lezione: formData.tipo_lezione, 
            costo: parseFloat(formData.costo.toString().replace(',', '.')) 
        };

        let res;
        if (formData.id) res = await supabase.from('tariffe').update(payload).eq('id', formData.id);
        else res = await supabase.from('tariffe').insert([payload]);

        if (res.error) setErrorMsg("Errore DB: " + res.error.message);
        else onSave();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between mb-4"><h3 className="text-lg font-bold text-white">{formData.id?'Modifica':'Nuova'} Tariffa</h3><button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button></div>
                {errorMsg && <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm flex items-center gap-2"><ShieldAlert size={16}/> {errorMsg}</div>}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Tipologia Lezione</label>
                        <select 
                            value={formData.tipo_lezione} 
                            onChange={e=>setFormData({...formData, tipo_lezione:e.target.value})} 
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red"
                            required
                        >
                            <option value="">-- Seleziona dal Catalogo --</option>
                            {availableTypes.map(t => (
                                <option key={t.id} value={t.tipo}>{t.tipo} ({t.durata_minuti} min)</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-gray-500 mt-1">Scegli tra le lezioni attive nel catalogo.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Costo per {anno} (€)</label>
                        <input type="number" step="0.5" value={formData.costo} onChange={e=>setFormData({...formData,costo:e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white font-bold focus:outline-none focus:border-accademia-red" required/>
                    </div>
                    
                    <div className="flex justify-end pt-4">
                        <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Salva</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}

function ModalQuota({ currentQuota, onClose, onSave }) {
    const [val, setVal] = useState(currentQuota);
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between mb-4"><h3 className="text-lg font-bold text-white">Modifica Quota</h3><button onClick={onClose}><X className="text-gray-400 hover:text-white" size={20}/></button></div>
                <div className="mb-6"><label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Nuovo importo (€)</label><input type="number" value={val} onChange={e => setVal(e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-3 text-white font-bold text-xl text-center focus:border-accademia-red focus:outline-none"/></div>
                <div className="flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-medium">Annulla</button><button onClick={() => onSave(val)} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg">Salva</button></div>
            </div>
        </div>, document.body
    );
}

function ModalNewYear({ currentYears, onClose, onSave }) {
    const [anno, setAnno] = useState('');
    useEffect(() => {
        if(currentYears.length > 0) {
            const last = currentYears[0];
            const parts = last.split('/');
            if(parts.length === 2) setAnno(`${parseInt(parts[0])+1}/${parseInt(parts[1])+1}`);
        } else setAnno("2025/2026");
    }, [currentYears]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <h3 className="text-xl font-bold text-white mb-4">Nuovo Anno Accademico</h3>
                <input type="text" value={anno} onChange={e=>setAnno(e.target.value)} className="w-full bg-accademia-input border border-gray-700 rounded p-3 text-white font-bold text-center text-lg mb-6 focus:outline-none focus:border-accademia-red" placeholder="YYYY/YYYY"/>
                <div className="flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button><button onClick={()=>onSave(anno)} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold">Crea</button></div>
            </div>
        </div>, document.body
    );
}