import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
  Edit2, Trash2, Plus, X, Settings, 
  Calendar, Archive, Download, Lock, CheckCircle2, ShieldAlert, Eye 
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function TipiLezioni({ userRole, config }) {
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null); 
  const [tariffe, setTariffe] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Modali
  const [showYearModal, setShowYearModal] = useState(false);
  const [showTariffaModal, setShowTariffaModal] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Gestione Messaggi (Alert/Confirm sostitutivi)
  const [dialogConfig, setDialogConfig] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    showCancel: false,
    onConfirm: () => {},
    onCancel: () => {}
  });

  // --- HELPER CONFIGURAZIONE ---
  // Verifica se l'utente può modificare in base alla config del DB
  const canEdit = () => {
    // Se la config non è ancora caricata o manca la chiave, fallback su Admin
    if (!config || !config['permessi_tariffe']) return userRole === 'Admin';
    // Verifica se il ruolo è nell'array dei permessi
    return Array.isArray(config['permessi_tariffe']) && config['permessi_tariffe'].includes(userRole);
  };

  // --- HELPER MESSAGGI ---
  const showMessage = (title, message, type = 'info') => {
    setDialogConfig({
        isOpen: true,
        title,
        message,
        type,
        showCancel: false,
        onConfirm: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: () => setDialogConfig(prev => ({ ...prev, isOpen: false }))
    });
  };

  const askConfirm = (title, message, onYes, type = 'warning') => {
    setDialogConfig({
        isOpen: true,
        title,
        message,
        type,
        showCancel: true,
        onConfirm: () => {
            onYes();
            setDialogConfig(prev => ({ ...prev, isOpen: false }));
        },
        onCancel: () => setDialogConfig(prev => ({ ...prev, isOpen: false }))
    });
  };

  useEffect(() => {
    fetchYears();
  }, []);

  useEffect(() => {
    if (selectedYear) fetchTariffe(selectedYear.anno);
  }, [selectedYear]);

  const fetchYears = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('anni_accademici')
      .select('*')
      .order('anno', { ascending: false });
    
    if (data && data.length > 0) {
      setYears(data);
      if (!selectedYear) {
          const current = data.find(y => y.is_current) || data[0];
          setSelectedYear(current);
      } else {
          const updated = data.find(y => y.anno === selectedYear.anno);
          if(updated) setSelectedYear(updated);
      }
    }
    setLoading(false);
  };

  const fetchTariffe = async (anno) => {
    const { data } = await supabase
      .from('tariffe')
      .select('*')
      .eq('anno_accademico', anno)
      .order('tipo_lezione');
    setTariffe(data || []);
  };

  // --- AZIONI ---

  const handleCreateYear = async (newAnno) => {
    try {
      setLoading(true);
      // 1. Crea Anno
      const { error } = await supabase.from('anni_accademici').insert([{
        anno: newAnno,
        stato: 'Attivo',
        is_current: false, 
        quota_iscrizione: selectedYear?.quota_iscrizione || 30
      }]);
      if (error) throw error;

      // 2. Clona Tariffe
      if (tariffe.length > 0) {
        const newTariffe = tariffe.map(t => ({
          anno_accademico: newAnno,
          tipo_lezione: t.tipo_lezione,
          costo: t.costo
        }));
        await supabase.from('tariffe').insert(newTariffe);
      }

      showMessage("Successo", "Nuovo Anno Accademico creato con successo! Listini clonati.", "success");
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
        `Vuoi rendere il ${annoTarget} l'anno accademico CORRENTE?\n\n- Gli insegnanti visualizzeranno e opereranno solo su questo anno.\n- Gli altri anni diventeranno storico.`,
        async () => {
            try {
                setLoading(true);
                await supabase.from('anni_accademici').update({ is_current: false }).neq('anno', 'placeholder');
                const { error } = await supabase.from('anni_accademici').update({ is_current: true }).eq('anno', annoTarget);
                
                if (error) throw error;
                showMessage("Successo", `Anno ${annoTarget} impostato come attivo.`);
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
      .eq('anno', selectedYear.anno);
    
    if (!error) {
        setSelectedYear(prev => ({ ...prev, quota_iscrizione: newQuota }));
        setShowQuotaModal(false);
    } else {
        showMessage("Errore", "Impossibile aggiornare la quota: " + error.message, "danger");
    }
  };

  const handleCloseYear = () => {
    askConfirm(
        "Chiusura Anno Accademico",
        `Sei sicuro di voler CHIUDERE l'anno accademico ${selectedYear.anno}? \nNon sarà più possibile modificare i dati.`,
        async () => {
            const { error } = await supabase
                .from('anni_accademici')
                .update({ stato: 'Concluso' })
                .eq('anno', selectedYear.anno);
            
            if (!error) fetchYears();
            else showMessage("Errore", error.message, "danger");
        },
        "danger"
    );
  };

  const handleDeleteTariffa = (id) => {
    if (selectedYear.stato === 'Concluso') return;
    askConfirm(
        "Elimina Tariffa",
        "Sei sicuro di voler eliminare questa tariffa?",
        async () => {
            const { error } = await supabase.from('tariffe').delete().eq('id', id);
            if (error) showMessage("Errore", "Impossibile eliminare: " + error.message, "danger");
            else fetchTariffe(selectedYear.anno);
        },
        "danger"
    );
  };

  // --- EXPORT DATI ---
  const handleExportData = async () => {
    try {
      setLoading(true);
      const { data: pays } = await supabase
        .from('pagamenti')
        .select(`*, alunni(nome), docenti(nome)`)
        .eq('anno_accademico', selectedYear.anno);

      if (!pays || pays.length === 0) {
          setLoading(false);
          showMessage("Nessun Dato", "Nessun dato da esportare per questo anno.", "warning");
          return;
      }

      const headers = ["ID", "Data", "Alunno", "Docente", "Tipologia", "Mese", "Importo", "Note"];
      const rows = pays.map(p => [
          p.id, p.data_pagamento, p.alunni?.nome, p.docenti?.nome || 'N/A', p.tipologia, p.mese_riferimento || 'N/A', p.importo, `"${p.note || ''}"`
      ]);

      let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Report_${selectedYear.anno.replace('/','-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) { showMessage("Errore Export", err.message, "danger"); } finally { setLoading(false); }
  };

  const isLocked = selectedYear?.stato === 'Concluso';
  
  // LOGICA VISIBILITÀ AVANZATA
  // L'utente può modificare se: ha i permessi da config (canEdit) E l'anno non è chiuso (isLocked)
  const isEditable = canEdit() && !isLocked;

  return (
    <div className="h-full flex flex-col relative bg-accademia-card">
      
      {/* HEADER & SELETTORE ANNO */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/40 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-white font-light text-xl">
                <Calendar className="text-accademia-red"/> 
                <span>Anno Accademico:</span>
             </div>
             
             <select 
                value={selectedYear?.anno || ''} 
                onChange={(e) => setSelectedYear(years.find(y => y.anno === e.target.value))}
                className="bg-accademia-input border border-gray-700 text-white text-lg font-bold rounded px-4 py-1.5 focus:border-accademia-red focus:outline-none"
             >
                {years.map(y => <option key={y.anno} value={y.anno}>{y.anno}</option>)}
             </select>

             {/* Badge Stato */}
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
        </div>

        {/* Pulsanti Header */}
        <div className="flex gap-2">
            {/* Il cambio anno corrente lo lasciamo agli Admin o se abilitato esplicitamente */}
            {canEdit() && !selectedYear?.is_current && selectedYear?.stato !== 'Concluso' && (
                <button 
                   onClick={() => handleSetCurrentYear(selectedYear.anno)}
                   className="flex items-center gap-1 px-3 py-2 bg-gray-800 hover:bg-white hover:text-black text-gray-300 border border-gray-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                >
                   Imposta Corrente
                </button>
            )}
            
            {/* Tasto Nuovo Anno: Visibile solo se modificabile */}
            {isEditable && (
                <button 
                    onClick={() => setShowYearModal(true)}
                    className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors"
                >
                    <Plus size={16}/> Nuovo Anno
                </button>
            )}
        </div>
      </div>

      {/* CONTENUTO SCROLLABILE */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar space-y-8">
         
         {/* BOX QUOTA ISCRIZIONE */}
         <section className="bg-gray-900/20 border border-gray-800 rounded-xl p-6 relative overflow-hidden flex justify-between items-center">
            <div className="absolute top-0 left-0 w-1 h-full bg-accademia-red"></div>
            <div>
                <h3 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
                    <Settings size={18} className="text-gray-400"/> Quota Iscrizione Annuale
                </h3>
                <p className="text-gray-500 text-sm">Costo applicato per l'iscrizione nell'anno {selectedYear?.anno}.</p>
            </div>
            
            {selectedYear && (
                <div className="flex items-center gap-4">
                    <div className="text-3xl font-mono font-bold text-green-400">
                         € {selectedYear.quota_iscrizione}
                    </div>
                    {isEditable ? (
                        <button 
                            onClick={() => setShowQuotaModal(true)}
                            className="p-2 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg transition-colors border border-gray-700"
                        >
                            <Edit2 size={18}/>
                        </button>
                    ) : (
                        <span title="Sola Lettura" className="text-gray-600 p-2">
                            <Eye size={18}/>
                        </span>
                    )}
                </div>
            )}
         </section>

         {/* TABELLA TARIFFE */}
         <section className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/20">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/40">
                <h3 className="text-white font-bold flex items-center gap-2">
                    <Archive size={18} className="text-gray-400"/> Listino Lezioni
                </h3>
                {isEditable && (
                    <button 
                        onClick={() => { setEditingItem(null); setShowTariffaModal(true); }}
                        className="flex items-center gap-2 text-accademia-red hover:text-red-400 text-sm font-bold uppercase tracking-wider transition-colors"
                    >
                        <Plus size={16}/> Aggiungi Lezione
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
                                            <button 
                                                title="Modifica"
                                                onClick={() => { setEditingItem(t); setShowTariffaModal(true); }} 
                                                className="p-1.5 hover:bg-gray-700 rounded text-blue-400"
                                            >
                                                <Edit2 size={16}/>
                                            </button>
                                            <button 
                                                title="Elimina"
                                                onClick={() => handleDeleteTariffa(t.id)} 
                                                className="p-1.5 hover:bg-gray-700 rounded text-red-400"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end opacity-40">
                                            <span title="Sola Lettura" className="p-1.5 text-gray-500 cursor-not-allowed">
                                                <Eye size={16}/>
                                            </span>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
         </section>

         {/* FOOTER INFO */}
         <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4 opacity-80 hover:opacity-100 transition-opacity">
            <div className="text-xs text-gray-500">
                <p className="font-bold text-gray-400 mb-1 uppercase">Area Amministrazione</p>
                L'esportazione scarica tutti i dati finanziari per l'anno {selectedYear?.anno}.
            </div>
            <div className="flex gap-3">
                <button onClick={handleExportData} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all shadow-sm">
                    <Download size={16}/> Esporta Dati
                </button>
                {/* Il tasto Chiudi Anno è critico, quindi solo se isEditable */}
                {isEditable && (
                    <button onClick={handleCloseYear} className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded-lg transition-all">
                        <Lock size={16}/> Chiudi Anno
                    </button>
                )}
            </div>
         </div>
      </div>

      {/* MODALE NUOVO ANNO */}
      {showYearModal && (
          <ModalNewYear 
            currentYears={years.map(y => y.anno)} 
            onClose={() => setShowYearModal(false)} 
            onSave={handleCreateYear} 
          />
      )}

      {/* MODALE TARIFFA */}
      {showTariffaModal && (
          <ModalTariffa 
            tariffa={editingItem} 
            anno={selectedYear?.anno}
            onClose={() => setShowTariffaModal(false)}
            onSave={() => { setShowTariffaModal(false); fetchTariffe(selectedYear.anno); }}
          />
      )}

      {/* MODALE QUOTA */}
      {showQuotaModal && selectedYear && (
          <ModalQuota
            currentQuota={selectedYear.quota_iscrizione}
            onClose={() => setShowQuotaModal(false)}
            onSave={handleUpdateQuota}
          />
      )}

      {/* GESTORE DIALOGHI GLOBALE */}
      <ConfirmDialog
        isOpen={dialogConfig.isOpen}
        type={dialogConfig.type}
        title={dialogConfig.title}
        message={dialogConfig.message}
        onConfirm={dialogConfig.onConfirm}
        onCancel={dialogConfig.onCancel}
        showCancel={dialogConfig.showCancel}
        confirmText="Conferma"
        cancelText="Annulla"
      />
    </div>
  );
}

// --- SOTTO COMPONENTI (Formattazione Standard) ---

function ModalQuota({ currentQuota, onClose, onSave }) {
    const [val, setVal] = useState(currentQuota);
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Modifica Quota</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white" size={20}/></button>
                </div>
                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Nuovo importo (€)</label>
                    <input 
                        type="number" 
                        value={val} 
                        onChange={e => setVal(e.target.value)}
                        className="w-full bg-accademia-input border border-gray-700 rounded p-3 text-white font-bold text-xl text-center focus:border-accademia-red focus:outline-none"
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-medium">Annulla</button>
                    <button onClick={() => onSave(val)} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg">Salva</button>
                </div>
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
            if(parts.length === 2) {
                setAnno(`${parseInt(parts[0])+1}/${parseInt(parts[1])+1}`);
            }
        } else setAnno("2025/2026");
    }, [currentYears]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <h3 className="text-xl font-bold text-white mb-4">Nuovo Anno Accademico</h3>
                <input 
                    type="text" 
                    value={anno} 
                    onChange={e=>setAnno(e.target.value)} 
                    className="w-full bg-accademia-input border border-gray-700 rounded p-3 text-white font-bold text-center text-lg mb-6 focus:outline-none focus:border-accademia-red" 
                    placeholder="YYYY/YYYY"
                />
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button>
                    <button onClick={()=>onSave(anno)} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold">Crea</button>
                </div>
            </div>
        </div>, document.body
    );
}

function ModalTariffa({ tariffa, anno, onClose, onSave }) {
    const [formData, setFormData] = useState({ id: tariffa?.id||null, tipo_lezione: tariffa?.tipo_lezione||'', costo: tariffa?.costo||'' });
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        
        if (!formData.tipo_lezione || !formData.costo) {
            setErrorMsg("Compila tutti i campi.");
            return;
        }

        const payload = { 
            anno_accademico: anno, 
            tipo_lezione: formData.tipo_lezione, 
            costo: parseFloat(formData.costo.toString().replace(',', '.')) 
        };

        let res;
        if (formData.id) res = await supabase.from('tariffe').update(payload).eq('id', formData.id);
        else res = await supabase.from('tariffe').insert([payload]);

        if (res.error) {
            setErrorMsg("Errore DB: " + res.error.message);
        } else {
            onSave();
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{formData.id?'Modifica':'Nuova'} Tariffa</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>
                
                {errorMsg && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm flex items-center gap-2">
                        <ShieldAlert size={16}/> {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome Lezione</label>
                        <input 
                            type="text" 
                            value={formData.tipo_lezione} 
                            onChange={e=>setFormData({...formData,tipo_lezione:e.target.value})} 
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" 
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Costo (€)</label>
                        <input 
                            type="number" 
                            step="0.5" 
                            value={formData.costo} 
                            onChange={e=>setFormData({...formData,costo:e.target.value})} 
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white font-bold focus:outline-none focus:border-accademia-red" 
                            required
                        />
                    </div>
                    <div className="flex justify-end pt-4">
                        <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Salva</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}