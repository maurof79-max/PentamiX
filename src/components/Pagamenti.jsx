import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, Search, Edit2, Trash2, X, Euro, Printer, Filter, AlertTriangle, CheckCircle, ArrowRight, List, Eye } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { generateReceiptPDF } from '../utils/pdfGenerator';
import { MESI_COMPLETE as MESI, ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, getCurrentAcademicYear } from '../utils/constants';

export default function Pagamenti({ user }) {
  const [pagamenti, setPagamenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Stati per le opzioni dinamiche dal DB
  const [optCausali, setOptCausali] = useState([]);
  const [optTipi, setOptTipi] = useState([]);

  // Filtri
  const [filterMese, setFilterMese] = useState('');
  const [filterAnno, setFilterAnno] = useState(getCurrentAcademicYear());
  
  // Modali
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Modale Dettaglio (Nuova)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  
  // Dati per le select
  const [alunni, setAlunni] = useState([]);

  const [confirmConfig, setConfirmConfig] = useState({ 
    isOpen: false, type: 'danger', title: '', message: '', onConfirm: () => {} 
  });

  useEffect(() => {
    fetchAlunni();
    fetchOpzioni(); 
  }, []);

  useEffect(() => {
    fetchPagamenti();
  }, [filterMese, filterAnno]);

  // --- FETCH DATI ---
  const fetchOpzioni = async () => {
    try {
        const { data: dataCausali } = await supabase.from('causali_pagamento').select('causale').order('causale');
        setOptCausali(dataCausali || []);

        const { data: dataTipi } = await supabase.from('tipi_pagamento').select('tipo').order('tipo');
        setOptTipi(dataTipi || []);
    } catch (error) {
        console.error("Errore fetch opzioni", error);
    }
  };

  const fetchAlunni = async () => {
    if (!user) return;
    let query = supabase.from('alunni').select('id, nome, cognome, school_id').eq('stato', 'Attivo');
    
    if (user.school_id) query = query.eq('school_id', user.school_id);

    const { data, error } = await query;
    if (error) console.error("Err alunni", error);
    else {
        const sorted = (data || []).sort((a,b) => (a.cognome || '').localeCompare(b.cognome || ''));
        setAlunni(sorted);
    }
  };

  const fetchPagamenti = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('pagamenti')
        .select(`*, alunni!inner ( id, nome, cognome, school_id ), docenti ( id, nome, cognome )`)
        .eq('anno_accademico', filterAnno)
        .order('data_pagamento', { ascending: false });

      if (filterMese) {
          // Filtro client side successivo o logica custom
      }

      if (user.school_id) query = query.eq('alunni.school_id', user.school_id);

      const { data, error } = await query;
      if (error) throw error;

      let filteredData = data || [];
      if (filterMese) {
          filteredData = filteredData.filter(p => {
              const d = new Date(p.data_pagamento);
              return (d.getMonth() + 1) === parseInt(filterMese);
          });
      }

      setPagamenti(filteredData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmConfig({
      isOpen: true,
      type: 'danger',
      title: 'Elimina Pagamento',
      message: 'Sei sicuro di voler eliminare questo pagamento?\nIl sistema ripristinerà automaticamente il debito sulle lezioni che erano state saldate.',
      showCancel: true,
      onConfirm: async () => {
        try {
            // 1. Rollback debiti
            const { data: dettagli } = await supabase
                .from('dettagli_pagamento')
                .select('registro_id, importo_coperto')
                .eq('pagamento_id', id);

            if (dettagli && dettagli.length > 0) {
                for (const det of dettagli) {
                    if (det.registro_id) {
                        const { data: lezione } = await supabase.from('registro').select('importo_saldato').eq('id', det.registro_id).single();
                        if (lezione) {
                            const nuovoSaldato = Math.max(0, (lezione.importo_saldato || 0) - det.importo_coperto);
                            await supabase.from('registro').update({ importo_saldato: nuovoSaldato }).eq('id', det.registro_id);
                        }
                    }
                }
            }

            // 2. Cancella pagamento
            const { error } = await supabase.from('pagamenti').delete().eq('id', id);
            if (error) throw error;

            fetchPagamenti();
            setConfirmConfig(prev => ({...prev, isOpen: false}));

        } catch (err) {
            alert("Errore eliminazione: " + err.message);
        }
      }
    });
  };

  const handlePrintReceipt = async (payment) => {
    await generateReceiptPDF({
        alunno_nome: `${payment.alunni?.cognome} ${payment.alunni?.nome}`,
        tipologia: payment.tipologia, 
        mese_rif: payment.mese_riferimento,
        aa: payment.anno_accademico,
        importo: payment.importo,
        data_pagamento: new Date(payment.data_pagamento).toLocaleDateString('it-IT'),
        note: payment.note,
        receipt_number: `P-${payment.id}`
    });
  };

  const filteredList = pagamenti.filter(p => {
    const search = searchTerm.toLowerCase();
    const nomeAlunno = `${p.alunni?.cognome} ${p.alunni?.nome}`.toLowerCase();
    return nomeAlunno.includes(search) || (p.tipologia || '').toLowerCase().includes(search);
  });

  const totalePeriodo = filteredList.reduce((acc, curr) => acc + parseFloat(curr.importo || 0), 0);

  return (
    <div className="h-full flex flex-col bg-accademia-card p-6 overflow-hidden">
      {/* HEADER & TOOLBAR */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-light text-white flex items-center gap-2">
            <Euro className="text-accademia-red" /> Registro Pagamenti
          </h2>
          <p className="text-sm text-gray-400 mt-1">Gestione incassi e allocazione lezioni</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <div className="bg-gray-800 rounded-lg p-2 flex items-center gap-2 border border-gray-700">
                <span className="text-xs text-gray-500 uppercase font-bold pl-2">Totale:</span>
                <span className="text-lg font-bold text-green-400 pr-2">€ {totalePeriodo.toFixed(2)}</span>
            </div>
            <button onClick={() => { setEditingItem(null); setShowModal(true); }} className="bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2">
                <Plus size={18} /> Registra Pagamento
            </button>
        </div>
      </div>

      <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-2 w-full md:w-auto bg-accademia-input border border-gray-700 rounded-lg px-3 py-2">
            <Search className="text-gray-500" size={18} />
            <input type="text" placeholder="Cerca alunno..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent border-none text-white focus:outline-none w-full text-sm"/>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto items-center">
            <Filter size={16} className="text-gray-500" />
            <select value={filterMese} onChange={e => setFilterMese(e.target.value)} className="bg-gray-800 text-white text-sm rounded-lg border border-gray-700 px-3 py-2 focus:border-accademia-red focus:outline-none">
                <option value="">Tutti i mesi</option>
                {MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
            <select value={filterAnno} onChange={e => setFilterAnno(e.target.value)} className="bg-gray-800 text-white text-sm rounded-lg border border-gray-700 px-3 py-2 focus:border-accademia-red focus:outline-none">
                {ANNI_ACCADEMICI.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-900/30 rounded-xl border border-gray-800">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0 z-10">
                <tr>
                    <th className="p-4 font-semibold">Data</th>
                    <th className="p-4 font-semibold">Alunno</th>
                    <th className="p-4 font-semibold">Causale</th>
                    <th className="p-4 font-semibold">Metodo</th>
                    <th className="p-4 font-semibold text-right">Importo</th>
                    <th className="p-4 font-semibold text-center">Azioni</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm">
                {filteredList.map(p => (
                    <tr key={p.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="p-4 text-gray-300 font-mono whitespace-nowrap">{new Date(p.data_pagamento).toLocaleDateString('it-IT')}</td>
                        <td className="p-4 text-white font-medium">{p.alunni?.cognome} {p.alunni?.nome}</td>
                        <td className="p-4 text-gray-400">
                            <div className="flex flex-col">
                                <span className="font-bold text-white">{p.tipologia}</span>
                                {p.docenti && <span className="text-[10px] text-gray-500">Doc: {p.docenti.cognome} {p.docenti.nome}</span>}
                            </div>
                        </td>
                        <td className="p-4 text-gray-400">
                            <span className="px-2 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs">{p.metodo_pagamento}</span>
                        </td>
                        <td className="p-4 text-right text-emerald-400 font-bold whitespace-nowrap">€ {parseFloat(p.importo).toFixed(2)}</td>
                        <td className="p-4 flex justify-center gap-2">
                             <button onClick={() => { setDetailItem(p); setShowDetailModal(true); }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 transition-colors" title="Dettaglio Lezioni"><Eye size={16}/></button>
                             <button onClick={() => handlePrintReceipt(p)} className="p-1.5 hover:bg-gray-700 rounded text-green-400 transition-colors" title="Stampa Ricevuta"><Printer size={16}/></button>
                             <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-600 hover:text-white rounded text-red-400 transition-colors"><Trash2 size={16}/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {showModal && (
        <ModalPagamento 
            item={editingItem} 
            alunni={alunni} 
            user={user} 
            optCausali={optCausali}
            optTipi={optTipi}
            annoCorrente={filterAnno}
            onClose={() => setShowModal(false)} 
            onSave={() => { setShowModal(false); fetchPagamenti(); }}
        />
      )}

      {/* NUOVA MODALE DETTAGLIO */}
      {showDetailModal && detailItem && (
        <ModalDettagliPagamento
            payment={detailItem}
            onClose={() => setShowDetailModal(false)}
        />
      )}

      <ConfirmDialog 
        isOpen={confirmConfig.isOpen}
        type={confirmConfig.type}
        title={confirmConfig.title}
        message={confirmConfig.message}
        showCancel={confirmConfig.showCancel}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({...prev, isOpen: false}))}
      />
    </div>
  );
}

// --- MODALE PAGAMENTO (UI FIXED HEIGHT & SCROLL) ---
function ModalPagamento({ item, alunni, user, optCausali, optTipi, annoCorrente, onClose, onSave }) {
    const isEdit = !!item;
    
    const [formData, setFormData] = useState({
        alunno_id: item?.alunno_id || '',
        docente_id: item?.docente_id || '',
        importo: item?.importo || '',
        data_pagamento: item?.data_pagamento ? item.data_pagamento.slice(0,10) : new Date().toISOString().slice(0,10),
        tipologia: item?.tipologia || '', 
        metodo_pagamento: item?.metodo_pagamento || '', 
        anno_accademico: item?.anno_accademico || annoCorrente,
        note: item?.note || ''
    });

    const [availableDocenti, setAvailableDocenti] = useState([]);
    const [standardIscrizioneFee, setStandardIscrizioneFee] = useState(null);
    const [showMismatchWarning, setShowMismatchWarning] = useState(false);
    const [unpaidLessons, setUnpaidLessons] = useState([]);
    const [loadingDebts, setLoadingDebts] = useState(false);

    const isIscrizione = formData.tipologia === 'Iscrizione';
    const isLezioni = formData.tipologia === 'Lezioni';

    // 1. Fetch Docenti
    useEffect(() => {
        const fetchLinkedDocenti = async () => {
            if (!formData.alunno_id) { setAvailableDocenti([]); return; }
            const { data } = await supabase.from('associazioni').select(`docenti (id, nome, cognome, strumento)`).eq('alunno_id', formData.alunno_id);
            if (data) setAvailableDocenti(data.map(d => d.docenti).filter(Boolean).map(d => ({ id: d.id, displayLabel: `${d.cognome} ${d.nome} (${d.strumento || '-'})` })));
        };
        fetchLinkedDocenti();
    }, [formData.alunno_id]);

    // 2. Fetch Costo Iscrizione
    useEffect(() => {
        const fetchStandardFee = async () => {
            if (isIscrizione && formData.anno_accademico) {
                let query = supabase.from('anni_accademici').select('quota_iscrizione, school_id').eq('anno', formData.anno_accademico);
                let targetSchoolId = user.school_id;
                if (!targetSchoolId && formData.alunno_id) {
                     const selectedAlunno = alunni.find(a => a.id === formData.alunno_id);
                     if (selectedAlunno) targetSchoolId = selectedAlunno.school_id;
                }
                if (targetSchoolId) query = query.eq('school_id', targetSchoolId);

                const { data } = await query.maybeSingle();
                if (data && data.quota_iscrizione !== undefined) {
                    setStandardIscrizioneFee(data.quota_iscrizione);
                    if (!isEdit && !formData.importo) setFormData(prev => ({ ...prev, importo: data.quota_iscrizione }));
                } else setStandardIscrizioneFee(null); 
            } else setStandardIscrizioneFee(null);
        };
        fetchStandardFee();
    }, [isIscrizione, formData.anno_accademico, formData.alunno_id, isEdit, user.school_id, alunni]);

    // 3. Fetch Debiti
    useEffect(() => {
        const fetchUnpaidLessons = async () => {
            if (isLezioni && formData.alunno_id) {
                setLoadingDebts(true);
                const { data: lezioni } = await supabase.from('registro')
                    .select(`id, data_lezione, importo_saldato, tipi_lezioni ( costo, tipo )`)
                    .eq('alunno_id', formData.alunno_id)
                    .order('data_lezione', { ascending: true });

                if (lezioni) {
                    let runningTotal = 0;
                    const debts = lezioni
                        .map(l => {
                            const costo = l.tipi_lezioni?.costo || 0;
                            const saldato = l.importo_saldato || 0;
                            const residuo = costo - saldato;
                            return { ...l, costo, saldato, residuo };
                        })
                        .filter(l => l.residuo > 0)
                        .map(l => {
                            runningTotal += l.residuo; 
                            return { ...l, cumulative: runningTotal };
                        });
                    setUnpaidLessons(debts);
                }
                setLoadingDebts(false);
            } else {
                setUnpaidLessons([]);
            }
        };
        fetchUnpaidLessons();
    }, [isLezioni, formData.alunno_id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isIscrizione && standardIscrizioneFee !== null && parseFloat(formData.importo) !== parseFloat(standardIscrizioneFee) && !showMismatchWarning) {
            setShowMismatchWarning(true);
            return; 
        }

        const payload = { ...formData };
        if (isIscrizione) { delete payload.docente_id; }
        else if (!payload.docente_id) delete payload.docente_id;

        try {
            let paymentId = item?.id;
            if (isEdit) {
                const { error } = await supabase.from('pagamenti').update(payload).eq('id', item.id);
                if (error) throw error;
            } else {
                const { data: newPayment, error } = await supabase.from('pagamenti').insert([payload]).select().single();
                if (error) throw error;
                paymentId = newPayment.id;
            }

            // LOGICA FIFO
            if (!isEdit && isLezioni && paymentId && unpaidLessons.length > 0) {
                let budget = parseFloat(payload.importo);
                for (const lesson of unpaidLessons) {
                    if (budget <= 0.01) break; 
                    const amountToPay = Math.min(budget, lesson.residuo);
                    await supabase.from('registro').update({ importo_saldato: lesson.saldato + amountToPay }).eq('id', lesson.id);
                    await supabase.from('dettagli_pagamento').insert([{
                        pagamento_id: paymentId,
                        registro_id: lesson.id,
                        importo_coperto: amountToPay
                    }]);
                    budget -= amountToPay;
                }
            }
            onSave();
        } catch (error) {
            alert("Errore: " + error.message);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-accademia-card border border-gray-700 w-full ${isLezioni && unpaidLessons.length > 0 ? 'max-w-5xl' : 'max-w-lg'} rounded-xl p-6 shadow-2xl relative transition-all duration-300 max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                
                {showMismatchWarning && (
                    <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-6 rounded-xl text-center">
                        <AlertTriangle size={48} className="text-yellow-500 mb-4" />
                        <h4 className="text-xl font-bold text-white mb-2">Conferma Importo</h4>
                        <p className="text-gray-300 mb-6 text-sm">Inserito: € {formData.importo} vs Standard: € {standardIscrizioneFee}</p>
                        <div className="flex gap-4"><button onClick={() => setShowMismatchWarning(false)} className="px-4 py-2 bg-gray-700 text-white rounded">Correggi</button><button onClick={handleSubmit} className="px-4 py-2 bg-yellow-600 text-white rounded">Conferma</button></div>
                    </div>
                )}

                <div className="flex justify-between mb-4 pb-2 border-b border-gray-800 shrink-0">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {isEdit ? <Edit2 size={20}/> : <Plus size={20}/>} {isEdit ? 'Modifica' : 'Nuovo'} Pagamento
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                <div className="flex gap-6 flex-1 overflow-hidden">
                    {/* COLONNA FORM */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <form id="paymentForm" onSubmit={handleSubmit} className="space-y-4 pb-2">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Alunno *</label>
                                <select value={formData.alunno_id} onChange={e => setFormData({...formData, alunno_id: e.target.value, docente_id: ''})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required>
                                    <option value="">Seleziona Alunno...</option>
                                    {alunni.map(a => <option key={a.id} value={a.id}>{a.cognome} {a.nome}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Causale *</label>
                                <select value={formData.tipologia} onChange={e => setFormData(p => ({...p, tipologia: e.target.value, docente_id: e.target.value === 'Iscrizione' ? '' : p.docente_id}))} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required>
                                    <option value="">-- Seleziona --</option>
                                    {optCausali.map((c, idx) => <option key={idx} value={c.causale}>{c.causale}</option>)}
                                </select>
                            </div>

                            {!isIscrizione && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Docente</label>
                                    <select value={formData.docente_id} onChange={e => setFormData({...formData, docente_id: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" disabled={!formData.alunno_id}>
                                        <option value="">Nessun docente specifico</option>
                                        {availableDocenti.map(d => <option key={d.id} value={d.id}>{d.displayLabel}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Importo (€) *</label>
                                    <input type="number" step="0.01" value={formData.importo} onChange={e => setFormData({...formData, importo: e.target.value})} className={`w-full bg-accademia-input border rounded p-2 text-white focus:outline-none font-mono text-right ${isIscrizione && standardIscrizioneFee && parseFloat(formData.importo) !== parseFloat(standardIscrizioneFee) ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 focus:border-accademia-red'}`} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Metodo *</label>
                                    <select value={formData.metodo_pagamento} onChange={e => setFormData({...formData, metodo_pagamento: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required>
                                        <option value="">-- Seleziona --</option>
                                        {optTipi.map((t, idx) => <option key={idx} value={t.tipo}>{t.tipo}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Anno Accademico</label>
                                <select value={formData.anno_accademico} onChange={e => setFormData({...formData, anno_accademico: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red">
                                    {ANNI_ACCADEMICI.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Note</label>
                                <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red text-sm" rows="2"></textarea>
                            </div>
                        </form>
                    </div>

                    {/* COLONNA LISTA DEBITI (CON MIGLIORIA VISUALIZZAZIONE) */}
                    {isLezioni && unpaidLessons.length > 0 && (
                        <div className="w-96 bg-gray-900/50 rounded-lg border border-gray-700 flex flex-col overflow-hidden animate-in slide-in-from-right-4 shrink-0">
                            <div className="p-3 bg-gray-800 border-b border-gray-700 text-xs font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center shrink-0">
                                <span>Lezioni da Saldare</span>
                                <span className="bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full">{unpaidLessons.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                {unpaidLessons.map((lesson) => (
                                    <div 
                                        key={lesson.id} 
                                        onClick={() => setFormData(p => ({ ...p, importo: lesson.cumulative }))}
                                        className="group relative p-3 rounded bg-gray-800/40 hover:bg-accademia-red/10 border border-gray-700/50 hover:border-accademia-red/50 cursor-pointer transition-all"
                                        title="Clicca per pagare fino a qui"
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-white font-mono text-sm">{new Date(lesson.data_lezione).toLocaleDateString('it-IT')}</span>
                                            <span className="text-xs text-gray-400 truncate max-w-[150px]">{lesson.tipi_lezioni?.tipo}</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className="text-xs flex flex-col">
                                                <span className="text-gray-500">Residuo: <span className="text-red-400 font-bold">€ {lesson.residuo}</span></span>
                                                {/* VISUALIZZA SE PARZIALE */}
                                                {lesson.saldato > 0 && (
                                                    <span className="text-yellow-500 font-bold text-[10px] mt-0.5 flex items-center gap-1">
                                                        <AlertTriangle size={10} /> Parziale (Tot: € {lesson.costo})
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-gray-500 uppercase">Tot. Progressivo</div>
                                                <div className="text-green-400 font-bold font-mono text-sm group-hover:scale-110 transition-transform flex items-center gap-1 justify-end">
                                                    € {lesson.cumulative.toFixed(2)}
                                                    <ArrowRight size={12} className="opacity-0 group-hover:opacity-100"/>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-2 bg-gray-800/80 text-[10px] text-gray-500 text-center italic border-t border-gray-700 shrink-0">
                                Clicca su una riga per impostare l'importo totale fino a quella data.
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-800 gap-3 mt-4 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button>
                    <button type="submit" form="paymentForm" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">
                        {isEdit ? 'Salva Modifiche' : 'Registra Pagamento'}
                    </button>
                </div>

            </div>
        </div>, document.body
    );
}

// --- NUOVA MODALE DETTAGLIO PAGAMENTO ---
function ModalDettagliPagamento({ payment, onClose }) {
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!payment?.id) return;
            const { data, error } = await supabase
                .from('dettagli_pagamento')
                .select(`
                    importo_coperto,
                    registro (
                        data_lezione,
                        tipi_lezioni ( tipo, costo )
                    )
                `)
                .eq('pagamento_id', payment.id);
            
            if (!error && data) setDetails(data);
            setLoading(false);
        };
        fetchDetails();
    }, [payment]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between mb-4 pb-2 border-b border-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <List size={20}/> Dettaglio Coperture
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>
                
                <div className="mb-4 text-sm text-gray-400">
                    Pagamento del <span className="text-white font-bold">{new Date(payment.data_pagamento).toLocaleDateString('it-IT')}</span> di <span className="text-green-400 font-bold">€ {payment.importo}</span>
                </div>

                <div className="overflow-y-auto max-h-60 custom-scrollbar space-y-2">
                    {loading ? (
                        <p className="text-center text-gray-500 py-4">Caricamento...</p>
                    ) : details.length === 0 ? (
                        <p className="text-center text-gray-500 py-4 italic">Nessun dettaglio specifico trovato.</p>
                    ) : (
                        details.map((det, idx) => {
                            const costoTotale = det.registro?.tipi_lezioni?.costo || 0;
                            const isPartial = det.importo_coperto < costoTotale;

                            return (
                                <div key={idx} className={`p-3 rounded border flex justify-between items-center ${isPartial ? 'bg-yellow-900/20 border-yellow-700/50' : 'bg-gray-800/50 border-gray-700'}`}>
                                    <div>
                                        <div className="text-white font-bold text-sm">
                                            {det.registro?.tipi_lezioni?.tipo || 'Lezione'}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {new Date(det.registro?.data_lezione).toLocaleDateString('it-IT')}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-mono font-bold ${isPartial ? 'text-yellow-400' : 'text-green-400'}`}>
                                            € {det.importo_coperto}
                                        </div>
                                        {isPartial && (
                                            <div className="text-[10px] text-gray-500">
                                                su € {costoTotale}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                
                <div className="flex justify-end pt-4 border-t border-gray-800 mt-2">
                    <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold">Chiudi</button>
                </div>
            </div>
        </div>, document.body
    );
}