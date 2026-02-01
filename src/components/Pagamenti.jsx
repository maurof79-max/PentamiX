import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, Search, Trash2, X, Euro, Printer, Filter, List, Eye } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { generateReceiptPDF, generatePaymentsReportPDF } from '../utils/pdfGenerator';
import { MESI_COMPLETE as MESI, ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, getCurrentAcademicYear } from '../utils/constants';

// IMPORT NUOVI
import ModalPagamento from './modals/ModalPagamento';

export default function Pagamenti({ user }) {
  const [pagamenti, setPagamenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMese, setFilterMese] = useState('');
  const [filterAnno, setFilterAnno] = useState(getCurrentAcademicYear());
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [alunni, setAlunni] = useState([]);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, type: 'danger', title: '', message: '', onConfirm: () => {} });
  
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => { fetchAlunni(); }, []);
  useEffect(() => { fetchPagamenti(); }, [filterMese, filterAnno]);

  const fetchAlunni = async () => {
    if (!user) return;
    let query = supabase.from('alunni').select('id, nome, cognome, school_id').eq('stato', 'Attivo');
    if (user.school_id) query = query.eq('school_id', user.school_id);
    const { data } = await query;
    if(data) setAlunni(data.sort((a,b) => (a.cognome || '').localeCompare(b.cognome || '')));
  };

  const fetchPagamenti = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase.from('pagamenti').select(`*, alunni!inner ( id, nome, cognome, school_id ), docenti ( id, nome, cognome )`).eq('anno_accademico', filterAnno).order('data_pagamento', { ascending: false });
      if (user.school_id) query = query.eq('alunni.school_id', user.school_id);
      const { data, error } = await query;
      if (error) throw error;
      let filtered = data || [];
      if (filterMese) filtered = filtered.filter(p => (new Date(p.data_pagamento).getMonth() + 1) === parseInt(filterMese));
      setPagamenti(filtered);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleApriDettaglio = async (pagamento) => {
    setLoading(true);
    try {
        // 1. Recupera le coperture (lezioni saldate)
        const { data: dettagli, error } = await supabase
            .from('dettagli_pagamento')
            .select(`
                importo_coperto,
                registro (
                    id,
                    data_lezione,
                    tipi_lezioni ( tipo )
                )
            `)
            .eq('pagamento_id', pagamento.id);

        if (error) throw error;

        // 2. Recupera le tariffe per avere i costi totali delle lezioni
        const { data: tariffe } = await supabase
            .from('tariffe')
            .select('tipo_lezione, costo')
            .eq('anno_accademico', pagamento.anno_accademico);

        const costiMap = {};
        tariffe?.forEach(t => costiMap[t.tipo_lezione] = t.costo);

        // 3. Arricchisce l'oggetto pagamento con l'elenco lezioni per Modal e PDF
        const pagamentoCompleto = {
            ...pagamento,
            lezioni_dettaglio: dettagli?.map(d => ({
                data: d.registro.data_lezione,
                tipo: d.registro.tipi_lezioni?.tipo || 'Lezione',
                importo_pagato: d.importo_coperto,
                costo_totale: costiMap[d.registro.tipi_lezioni?.tipo] || 0
            })) || []
        };

        setDetailItem(pagamentoCompleto);
        setShowDetailModal(true);
    } catch (err) {
        console.error("Errore recupero dettagli:", err);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmConfig({
      isOpen: true, type: 'danger', title: 'Elimina Pagamento',
      message: 'Sei sicuro? Verranno riaperti i debiti sulle lezioni saldate.',
      showCancel: true,
      onConfirm: async () => {
        try {
            const { data: dettagli } = await supabase.from('dettagli_pagamento').select('registro_id, importo_coperto').eq('pagamento_id', id);
            if (dettagli) {
                for (const det of dettagli) {
                    if (det.registro_id) {
                        const { data: l } = await supabase.from('registro').select('importo_saldato').eq('id', det.registro_id).single();
                        if (l) await supabase.from('registro').update({ importo_saldato: Math.max(0, l.importo_saldato - det.importo_coperto) }).eq('id', det.registro_id);
                    }
                }
            }
            await supabase.from('pagamenti').delete().eq('id', id);
            fetchPagamenti();
            setConfirmConfig(prev => ({...prev, isOpen: false}));
        } catch (e) { alert("Errore: " + e.message); }
      }
    });
  };

  const handlePrintReceipt = async (payment) => {
    // Se non ha già i dettagli (non siamo passati dall'occhiolino), li carichiamo al volo
    let pToPrint = payment;
    if (!payment.lezioni_dettaglio) {
        const { data: dettagli } = await supabase
            .from('dettagli_pagamento')
            .select(`importo_coperto, registro ( data_lezione, tipi_lezioni ( tipo ) )`)
            .eq('pagamento_id', payment.id);
        
        pToPrint = {
            ...payment,
            lezioni_dettaglio: dettagli?.map(d => ({
                data: d.registro.data_lezione,
                tipo: d.registro.tipi_lezioni?.tipo || 'Lezione',
                importo_pagato: d.importo_coperto
            })) || []
        };
    }

    await generateReceiptPDF({
        alunno_nome: `${pToPrint.alunni?.cognome} ${pToPrint.alunni?.nome}`,
        tipologia: pToPrint.tipologia, 
        aa: pToPrint.anno_accademico, 
        importo: pToPrint.importo,
        data_pagamento: new Date(pToPrint.data_pagamento).toLocaleDateString('it-IT'), 
        note: pToPrint.note, 
        receipt_number: `P-${pToPrint.id.slice(0,8)}`,
        lezioni: pToPrint.lezioni_dettaglio // Passiamo l'array al PDF
    });
  };

  const filteredList = pagamenti.filter(p => {
    const search = searchTerm.toLowerCase();
    const nome = `${p.alunni?.cognome} ${p.alunni?.nome}`.toLowerCase();
    return nome.includes(search) || (p.tipologia || '').toLowerCase().includes(search);
  });

  const totalePeriodo = filteredList.reduce((acc, curr) => acc + parseFloat(curr.importo || 0), 0);

  return (
    <div className="h-full flex flex-col bg-accademia-card p-6 overflow-hidden">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
        <div><h2 className="text-2xl font-light text-white flex items-center gap-2"><Euro className="text-accademia-red" /> Registro Pagamenti</h2><p className="text-sm text-gray-400 mt-1">Gestione incassi e allocazione lezioni</p></div>
        <div className="flex flex-wrap gap-2">
            <div className="bg-gray-800 rounded-lg p-2 flex items-center gap-2 border border-gray-700"><span className="text-xs text-gray-500 uppercase font-bold pl-2">Totale:</span><span className="text-lg font-bold text-green-400 pr-2">€ {totalePeriodo.toFixed(2)}</span></div>
            <button onClick={() => setShowPrintModal(true)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 border border-gray-600 transition-colors"><Printer size={18} /> <span className="hidden md:inline">Riepilogo</span></button>
            <button onClick={() => { setEditingItem(null); setShowModal(true); }} className="bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2"><Plus size={18} /> Registra Pagamento</button>
        </div>
      </div>

      <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-2 w-full md:w-auto bg-accademia-input border border-gray-700 rounded-lg px-3 py-2"><Search className="text-gray-500" size={18} /><input type="text" placeholder="Cerca alunno..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent border-none text-white focus:outline-none w-full text-sm"/></div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto items-center">
            <Filter size={16} className="text-gray-500" /><select value={filterMese} onChange={e => setFilterMese(e.target.value)} className="bg-gray-800 text-white text-sm rounded-lg border border-gray-700 px-3 py-2 focus:border-accademia-red focus:outline-none"><option value="">Tutti i mesi</option>{MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}</select><select value={filterAnno} onChange={e => setFilterAnno(e.target.value)} className="bg-gray-800 text-white text-sm rounded-lg border border-gray-700 px-3 py-2 focus:border-accademia-red focus:outline-none">{ANNI_ACCADEMICI.map(a => <option key={a} value={a}>{a}</option>)}</select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-900/30 rounded-xl border border-gray-800">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0 z-10"><tr><th className="p-4 font-semibold">Data</th><th className="p-4 font-semibold">Alunno</th><th className="p-4 font-semibold">Causale</th><th className="p-4 font-semibold">Metodo</th><th className="p-4 font-semibold text-right">Importo</th><th className="p-4 font-semibold text-center">Azioni</th></tr></thead>
            <tbody className="divide-y divide-gray-800 text-sm">
                {filteredList.map(p => (
                    <tr key={p.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="p-4 text-gray-300 font-mono whitespace-nowrap">{new Date(p.data_pagamento).toLocaleDateString('it-IT')}</td>
                        <td className="p-4 text-white font-medium">{p.alunni?.cognome} {p.alunni?.nome}</td>
                        <td className="p-4 text-gray-400"><div className="flex flex-col"><span className="font-bold text-white">{p.tipologia}</span>{p.docenti && <span className="text-[10px] text-gray-500">Doc: {p.docenti.cognome} {p.docenti.nome}</span>}</div></td>
                        <td className="p-4 text-gray-400"><span className="px-2 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs">{p.metodo_pagamento}</span></td>
                        <td className="p-4 text-right text-emerald-400 font-bold whitespace-nowrap">€ {parseFloat(p.importo).toFixed(2)}</td>
                        <td className="p-4 flex justify-center gap-2">
                             <button onClick={() => handleApriDettaglio(p)} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 transition-colors" title="Vedi Dettaglio"><Eye size={16}/></button>
                             <button onClick={() => handlePrintReceipt(p)} className="p-1.5 hover:bg-gray-700 rounded text-green-400 transition-colors" title="Stampa Ricevuta"><Printer size={16}/></button>
                             <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-600 hover:text-white rounded text-red-400 transition-colors" title="Elimina"><Trash2 size={16}/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {showModal && <ModalPagamento item={editingItem} alunni={alunni} user={user} annoCorrente={filterAnno} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchPagamenti(); }} />}
      {showDetailModal && detailItem && <ModalDettagliPagamento payment={detailItem} onClose={() => setShowDetailModal(false)} onPrint={() => handlePrintReceipt(detailItem)} />}
      
      {showPrintModal && <ModalStampaRiepilogo alunni={alunni} user={user} annoCorrente={filterAnno} onClose={() => setShowPrintModal(false)} />}
      <ConfirmDialog isOpen={confirmConfig.isOpen} type={confirmConfig.type} title={confirmConfig.title} message={confirmConfig.message} showCancel={confirmConfig.showCancel} onConfirm={confirmConfig.onConfirm} onCancel={() => setConfirmConfig(prev => ({...prev, isOpen: false}))} />
    </div>
  );
}

function ModalDettagliPagamento({ payment, onClose, onPrint }) {
    const lezioni = payment.lezioni_dettaglio || [];
    
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between mb-4 pb-2 border-b border-gray-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><List size={20}/> Dettaglio Coperture</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>
                
                <div className="mb-4 text-sm text-gray-400">
                    Pagamento di <span className="text-white font-bold">{payment.alunni?.cognome} {payment.alunni?.nome}</span><br/>
                    Data: <span className="text-white">{new Date(payment.data_pagamento).toLocaleDateString('it-IT')}</span> - Importo: <span className="text-green-400 font-bold">€ {payment.importo}</span>
                </div>

                <div className="overflow-y-auto max-h-60 custom-scrollbar space-y-2 mb-4">
                    {lezioni.length === 0 ? (
                        <p className="text-center text-gray-500 py-4 italic">Nessuna lezione specifica collegata (es. Iscrizione o pagamento generico).</p>
                    ) : (
                        lezioni.map((lez, idx) => {
                            const isPartial = lez.costo_totale > 0 && lez.importo_pagato < lez.costo_totale;
                            return (
                                <div key={idx} className={`p-3 rounded border flex justify-between items-center ${isPartial ? 'bg-yellow-900/20 border-yellow-700/50' : 'bg-gray-800/50 border-gray-700'}`}>
                                    <div>
                                        <div className="text-white font-bold text-sm">{lez.tipo}</div>
                                        <div className="text-xs text-gray-400">{new Date(lez.data).toLocaleDateString('it-IT')}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-mono font-bold ${isPartial ? 'text-yellow-400' : 'text-green-400'}`}>€ {lez.importo_pagato}</div>
                                        {isPartial && <div className="text-[10px] text-gray-500">su € {lez.costo_totale}</div>}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex justify-between pt-4 border-t border-gray-800 mt-2">
                    <button onClick={onPrint} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                        <Printer size={18}/> Stampa
                    </button>
                    <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold">Chiudi</button>
                </div>
            </div>
        </div>, document.body
    );
}

function ModalStampaRiepilogo({ alunni, user, annoCorrente, onClose }) {
    const [selectedAlunno, setSelectedAlunno] = useState('');
    const [selectedMesi, setSelectedMesi] = useState([]);
    const [loading, setLoading] = useState(false);

    const toggleMese = (val) => {
        if (selectedMesi.includes(val)) setSelectedMesi(selectedMesi.filter(m => m !== val));
        else setSelectedMesi([...selectedMesi, val]);
    };

    const handlePrint = async () => {
        if (!selectedAlunno) return alert("Seleziona un alunno");
        setLoading(true);
        try {
            let query = supabase.from('pagamenti').select(`*, alunni!inner(nome, cognome)`).eq('alunno_id', selectedAlunno).eq('anno_accademico', annoCorrente);
            const { data, error } = await query;
            if (error) throw error;
            let filteredData = data;
            if (selectedMesi.length > 0) {
                filteredData = data.filter(p => selectedMesi.includes(new Date(p.data_pagamento).getMonth() + 1));
            }
            if (filteredData.length === 0) return alert("Nessun pagamento trovato.");
            const alunnoObj = alunni.find(a => a.id === parseInt(selectedAlunno));
            await generatePaymentsReportPDF({ name: "Accademia della Musica", logo: null }, { alunnoName: `${alunnoObj.cognome} ${alunnoObj.nome}`, anno: annoCorrente, monthsLabels: selectedMesi.length > 0 ? MESI.filter(m => selectedMesi.includes(m.val)).map(m => m.label) : ["Tutto l'anno"] }, filteredData);
            onClose();
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-lg rounded-xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between mb-6 pb-4 border-b border-gray-800"><h3 className="text-xl font-bold text-white flex items-center gap-2"><Printer className="text-accademia-red" /> Stampa Riepilogo Pagamenti</h3><button onClick={onClose}><X className="text-gray-400 hover:text-white" /></button></div>
                <div className="space-y-6">
                    <div><label className="block text-gray-400 text-sm mb-2 font-bold uppercase">1. Seleziona Alunno</label><select value={selectedAlunno} onChange={(e) => setSelectedAlunno(e.target.value)} className="w-full bg-gray-900 text-white rounded-lg border border-gray-700 p-3 focus:border-accademia-red focus:outline-none"><option value="">-- Seleziona --</option>{alunni.map(a => <option key={a.id} value={a.id}>{a.cognome} {a.nome}</option>)}</select></div>
                    <div><label className="block text-gray-400 text-sm mb-2 font-bold uppercase flex justify-between"><span>2. Seleziona Mesi</span><span className="text-xs font-normal text-gray-500 normal-case">(Vuoto = tutto l'anno)</span></label><div className="grid grid-cols-4 gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-800 max-h-48 overflow-y-auto custom-scrollbar">{MESI.filter(m => m.val !== 0).map(m => { const isSelected = selectedMesi.includes(m.val); return (<button key={m.val} onClick={() => toggleMese(m.val)} className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${isSelected ? 'bg-accademia-red text-white border-accademia-red' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}><span className="text-xs font-bold">{m.label}</span></button>);})}</div></div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800"><button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Annulla</button><button onClick={handlePrint} disabled={loading || !selectedAlunno} className={`bg-white text-black hover:bg-gray-200 px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 ${loading || !selectedAlunno ? 'opacity-50 cursor-not-allowed' : ''}`}>{loading ? 'Generazione...' : <><Printer size={18}/> Stampa PDF</>}</button></div>
            </div>
        </div>, document.body
    );
}