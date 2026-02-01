import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient'; 
import { Plus, Edit2, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { MESI_COMPLETE as MESI, ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI } from '../../utils/constants';

export default function ModalPagamento({ item, alunni, user, annoCorrente, onClose, onSave }) {
    // Controllo se è una modifica basandomi sull'esistenza dell'ID
    const isEdit = !!item?.id; 
    
    // Stati Opzioni
    const [optCausali, setOptCausali] = useState([]);
    const [optTipi, setOptTipi] = useState([]);

    const [formData, setFormData] = useState({
        alunno_id: item?.alunno_id || '',
        docente_id: item?.docente_id || '',
        importo: item?.importo || '',
        // Default: Data odierna, ma modificabile
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

    // 0. Carica Opzioni
    useEffect(() => {
        const fetchOpzioni = async () => {
            const { data: c } = await supabase.from('causali_pagamento').select('causale').order('causale');
            if(c) setOptCausali(c);
            const { data: t } = await supabase.from('tipi_pagamento').select('tipo').order('tipo');
            if(t) setOptTipi(t);
        };
        fetchOpzioni();
    }, []);

    // 1. Fetch Docenti associati
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
            if (!user) return; 

            if (isIscrizione && formData.anno_accademico) {
                let query = supabase
                    .from('anni_accademici')
                    .select('quota_iscrizione, school_id')
                    .eq('anno', formData.anno_accademico);

                let targetSchoolId = user.school_id;
                
                if (!targetSchoolId && formData.alunno_id && alunni.length > 0) {
                     const selectedAlunno = alunni.find(a => String(a.id) === String(formData.alunno_id));
                     if (selectedAlunno) targetSchoolId = selectedAlunno.school_id;
                }

                if (targetSchoolId) {
                    query = query.eq('school_id', targetSchoolId);
                }

                const { data } = await query.limit(1).maybeSingle();
                
                if (data && data.quota_iscrizione !== undefined && data.quota_iscrizione !== null) {
                    setStandardIscrizioneFee(data.quota_iscrizione);
                    // Auto-compila solo se è un NUOVO inserimento e il campo è vuoto
                    if (!item?.id && !formData.importo) {
                        setFormData(prev => ({ ...prev, importo: data.quota_iscrizione }));
                    }
                } else {
                    setStandardIscrizioneFee(null); 
                }
            } else {
                setStandardIscrizioneFee(null);
            }
        };
        fetchStandardFee();
    }, [isIscrizione, formData.anno_accademico, formData.alunno_id, isEdit, user, alunni, item?.id]);

    // 3. Fetch Debiti (FIFO) - VERSIONE CORRETTA
    useEffect(() => {
        const fetchUnpaidLessons = async () => {
            // Verifichiamo di avere i dati necessari per la query
            if (isLezioni && formData.alunno_id && formData.anno_accademico) {
                setLoadingDebts(true);
                try {
                    // A. Recuperiamo prima le tariffe dell'anno per conoscere i costi
                    const { data: tariffe } = await supabase
                        .from('tariffe')
                        .select('tipo_lezione, costo')
                        .eq('anno_accademico', formData.anno_accademico);
                    
                    const costiMap = {};
                    tariffe?.forEach(t => {
                        costiMap[t.tipo_lezione] = t.costo;
                    });

                    // B. Fetch lezioni dal registro (rimosso 'costo' dalla select interna)
                    const { data: lezioni, error: lezError } = await supabase
                        .from('registro')
                        .select(`
                            id, 
                            data_lezione, 
                            importo_saldato, 
                            tipi_lezioni!inner ( tipo )
                        `)
                        .eq('alunno_id', formData.alunno_id)
                        .order('data_lezione', { ascending: true });

                    if (lezError) throw lezError;

                    if (lezioni) {
                        let runningTotal = 0;
                        const debts = lezioni
                            .map(l => {
                                // Recuperiamo il costo dalla mappa tariffe usando il nome del tipo lezione
                                const costoEffettivo = costiMap[l.tipi_lezioni?.tipo] || 0;
                                const saldato = l.importo_saldato || 0;
                                const residuo = costoEffettivo - saldato;
                                return { ...l, costo: costoEffettivo, saldato, residuo };
                            })
                            // Filtriamo solo le lezioni non completamente saldate
                            .filter(l => l.residuo > 0.01) 
                            .map(l => {
                                runningTotal += l.residuo; 
                                return { ...l, cumulative: runningTotal };
                            });
                        setUnpaidLessons(debts);
                    }
                } catch (err) {
                    console.error("Errore nel recupero lezioni non pagate:", err);
                } finally {
                    setLoadingDebts(false);
                }
            } else {
                setUnpaidLessons([]);
            }
        };
        fetchUnpaidLessons();
    }, [isLezioni, formData.alunno_id, formData.anno_accademico]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (isIscrizione && standardIscrizioneFee !== null) {
            if (parseFloat(formData.importo) !== parseFloat(standardIscrizioneFee) && !showMismatchWarning) {
                setShowMismatchWarning(true);
                return; 
            }
        }

        const payload = { ...formData };
        if (isIscrizione) { 
            delete payload.docente_id; 
        }
        else if (!payload.docente_id) delete payload.docente_id;

        if (payload.importo === '') delete payload.importo;

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

            // Logica FIFO
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
            console.error(error);
            alert("Errore salvataggio: " + error.message);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-accademia-card border border-gray-700 w-full ${isLezioni && unpaidLessons.length > 0 ? 'max-w-5xl' : 'max-w-lg'} rounded-xl p-6 shadow-2xl relative transition-all duration-300 max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                
                {showMismatchWarning && (
                    <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-6 rounded-xl text-center animate-in fade-in zoom-in-95">
                        <div className="bg-yellow-500/20 p-4 rounded-full mb-4 border border-yellow-500/50">
                            <AlertTriangle size={48} className="text-yellow-500" />
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2">Conferma Importo</h4>
                        <p className="text-gray-300 mb-6 text-sm">
                            Inserito: <span className="text-white font-bold">€ {formData.importo}</span><br/>
                            Standard: <span className="text-green-400 font-bold">€ {standardIscrizioneFee}</span>
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => setShowMismatchWarning(false)} className="px-4 py-2 bg-gray-700 text-white rounded font-bold">Correggi</button>
                            <button onClick={handleSubmit} className="px-4 py-2 bg-yellow-600 text-white rounded font-bold">Conferma</button>
                        </div>
                    </div>
                )}

                {/* HEADER */}
                <div className="flex justify-between mb-4 pb-2 border-b border-gray-800 shrink-0">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {isEdit ? <Edit2 size={20}/> : <Plus size={20}/>} {isEdit ? 'Modifica' : 'Nuovo'} Pagamento
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                {/* BODY */}
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
                                <select 
                                    value={formData.tipologia} 
                                    onChange={e => {
                                        const newVal = e.target.value;
                                        setFormData(p => ({
                                            ...p, 
                                            tipologia: newVal, 
                                            docente_id: newVal === 'Iscrizione' ? '' : p.docente_id 
                                        }));
                                        setShowMismatchWarning(false);
                                    }} 
                                    className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" 
                                    required
                                >
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
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={formData.importo} 
                                        onChange={e => setFormData({...formData, importo: e.target.value})} 
                                        className={`w-full bg-accademia-input border rounded p-2 text-white focus:outline-none font-mono text-right 
                                            ${isIscrizione && standardIscrizioneFee && parseFloat(formData.importo) !== parseFloat(standardIscrizioneFee) 
                                                ? 'border-yellow-500 focus:border-yellow-500 text-yellow-300' 
                                                : 'border-gray-700 focus:border-accademia-red'
                                            }`} 
                                        required 
                                    />
                                    {isIscrizione && standardIscrizioneFee && parseFloat(formData.importo) !== parseFloat(standardIscrizioneFee) && (
                                        <p className="text-[10px] text-yellow-500 mt-1 flex items-center gap-1">
                                            <AlertTriangle size={10} /> Standard: € {standardIscrizioneFee}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Metodo *</label>
                                    <select value={formData.metodo_pagamento} onChange={e => setFormData({...formData, metodo_pagamento: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red" required>
                                        <option value="">-- Seleziona --</option>
                                        {optTipi.map((t, idx) => <option key={idx} value={t.tipo}>{t.tipo}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            {/* RIGA DATA E ANNO ACCADEMICO */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Data Pagamento *</label>
                                    <input 
                                        type="date" 
                                        value={formData.data_pagamento}
                                        onChange={e => setFormData({...formData, data_pagamento: e.target.value})}
                                        className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Anno Accademico</label>
                                    <select value={formData.anno_accademico} onChange={e => setFormData({...formData, anno_accademico: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red">
                                        {ANNI_ACCADEMICI.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Note</label>
                                <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-accademia-red text-sm" rows="2"></textarea>
                            </div>
                        </form>
                    </div>

                    {/* COLONNA LISTA DEBITI */}
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