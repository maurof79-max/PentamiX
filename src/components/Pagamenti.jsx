import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, Search, Edit2, Trash2, X, Euro, Printer, Filter, List, Eye } from 'lucide-react';
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
  
  // Stato per il nuovo modale di stampa
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
    await generateReceiptPDF({
        alunno_nome: `${payment.alunni?.cognome} ${payment.alunni?.nome}`,
        tipologia: payment.tipologia, aa: payment.anno_accademico, importo: payment.importo,
        data_pagamento: new Date(payment.data_pagamento).toLocaleDateString('it-IT'), note: payment.note, receipt_number: `P-${payment.id}`
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
            
            {/* BOTTONE RIEPILOGO PDF */}
            <button 
                onClick={() => setShowPrintModal(true)} 
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 border border-gray-600 transition-colors"
            >
                <Printer size={18} /> <span className="hidden md:inline">Riepilogo</span>
            </button>

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
                             <button onClick={() => { setDetailItem(p); setShowDetailModal(true); }} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 transition-colors"><Eye size={16}/></button>
                             <button onClick={() => handlePrintReceipt(p)} className="p-1.5 hover:bg-gray-700 rounded text-green-400 transition-colors"><Printer size={16}/></button>
                             <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-600 hover:text-white rounded text-red-400 transition-colors"><Trash2 size={16}/></button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {showModal && <ModalPagamento item={editingItem} alunni={alunni} user={user} annoCorrente={filterAnno} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchPagamenti(); }} />}
      {showDetailModal && detailItem && <ModalDettagliPagamento payment={detailItem} onClose={() => setShowDetailModal(false)} />}
      
      {/* MODALE STAMPA RIEPILOGO */}
      {showPrintModal && (
          <ModalStampaRiepilogo 
              alunni={alunni} 
              user={user} 
              annoCorrente={filterAnno} 
              onClose={() => setShowPrintModal(false)} 
          />
      )}

      <ConfirmDialog isOpen={confirmConfig.isOpen} type={confirmConfig.type} title={confirmConfig.title} message={confirmConfig.message} showCancel={confirmConfig.showCancel} onConfirm={confirmConfig.onConfirm} onCancel={() => setConfirmConfig(prev => ({...prev, isOpen: false}))} />
    </div>
  );
}

function ModalDettagliPagamento({ payment, onClose }) {
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchDetails = async () => {
            if (!payment?.id) return;
            const { data } = await supabase.from('dettagli_pagamento').select(`importo_coperto, registro ( data_lezione, tipi_lezioni ( tipo, costo ) )`).eq('pagamento_id', payment.id);
            if (data) setDetails(data);
            setLoading(false);
        };
        fetchDetails();
    }, [payment]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between mb-4 pb-2 border-b border-gray-800"><h3 className="text-lg font-bold text-white flex items-center gap-2"><List size={20}/> Dettaglio Coperture</h3><button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button></div>
                <div className="mb-4 text-sm text-gray-400">Pagamento del <span className="text-white font-bold">{new Date(payment.data_pagamento).toLocaleDateString('it-IT')}</span> di <span className="text-green-400 font-bold">€ {payment.importo}</span></div>
                <div className="overflow-y-auto max-h-60 custom-scrollbar space-y-2">
                    {loading ? <p className="text-center text-gray-500 py-4">Caricamento...</p> : details.length === 0 ? <p className="text-center text-gray-500 py-4 italic">Nessun dettaglio.</p> : details.map((det, idx) => {
                        const tot = det.registro?.tipi_lezioni?.costo || 0;
                        const isPartial = det.importo_coperto < tot;
                        return (
                            <div key={idx} className={`p-3 rounded border flex justify-between items-center ${isPartial ? 'bg-yellow-900/20 border-yellow-700/50' : 'bg-gray-800/50 border-gray-700'}`}>
                                <div><div className="text-white font-bold text-sm">{det.registro?.tipi_lezioni?.tipo || 'Lezione'}</div><div className="text-xs text-gray-400">{new Date(det.registro?.data_lezione).toLocaleDateString('it-IT')}</div></div>
                                <div className="text-right"><div className={`font-mono font-bold ${isPartial ? 'text-yellow-400' : 'text-green-400'}`}>€ {det.importo_coperto}</div>{isPartial && <div className="text-[10px] text-gray-500">su € {tot}</div>}</div>
                            </div>
                        );
                    })}
                </div>
                <div className="flex justify-end pt-4 border-t border-gray-800 mt-2"><button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold">Chiudi</button></div>
            </div>
        </div>, document.body
    );
}

// COMPONENTE MODALE STAMPA RIEPILOGO
function ModalStampaRiepilogo({ alunni, user, annoCorrente, onClose }) {
    const [selectedAlunno, setSelectedAlunno] = useState('');
    const [selectedMesi, setSelectedMesi] = useState([]);
    const [loading, setLoading] = useState(false);

    // Toggle selezione mese
    const toggleMese = (val) => {
        if (selectedMesi.includes(val)) {
            setSelectedMesi(selectedMesi.filter(m => m !== val));
        } else {
            setSelectedMesi([...selectedMesi, val]);
        }
    };

    const handlePrint = async () => {
        if (!selectedAlunno) {
            alert("Seleziona un alunno");
            return;
        }

        setLoading(true);
        try {
            // 1. Fetch pagamenti specifici
            let query = supabase
                .from('pagamenti')
                .select(`*, alunni!inner(nome, cognome)`)
                .eq('alunno_id', selectedAlunno)
                .eq('anno_accademico', annoCorrente);

            const { data, error } = await query;
            if (error) throw error;

            // 2. Filtra per mesi (se selezionati)
            let filteredData = data;
            if (selectedMesi.length > 0) {
                // Filtra basandosi sul campo data_pagamento
                filteredData = data.filter(p => {
                    const month = new Date(p.data_pagamento).getMonth() + 1; // 1-12
                    return selectedMesi.includes(month);
                });
            }

            if (filteredData.length === 0) {
                alert("Nessun pagamento trovato per i criteri selezionati.");
                setLoading(false);
                return;
            }

            // 3. Prepara etichette
            const alunnoObj = alunni.find(a => a.id === parseInt(selectedAlunno));
            const alunnoName = alunnoObj ? `${alunnoObj.cognome} ${alunnoObj.nome}` : 'Alunno';
            
            // Mappa i valori dei mesi in etichette
            const monthsLabels = selectedMesi.length > 0 
                ? MESI.filter(m => selectedMesi.includes(m.val)).map(m => m.label)
                : ["Tutto l'anno"];

            // 4. Genera PDF
            // Passa l'oggetto schoolInfo (qui simulato o preso da user)
            const schoolInfo = { 
                name: "Accademia della Musica", 
                logo: null // Opzionale: aggiungi URL logo se disponibile in 'user'
            };

            await generatePaymentsReportPDF(
                schoolInfo, 
                { alunnoName, anno: annoCorrente, monthsLabels },
                filteredData
            );
            
            onClose();
        } catch (error) {
            console.error(error);
            alert("Errore durante la generazione: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-lg rounded-xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between mb-6 pb-4 border-b border-gray-800">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Printer className="text-accademia-red" /> Stampa Riepilogo Pagamenti
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white" /></button>
                </div>

                <div className="space-y-6">
                    {/* Selezione Alunno */}
                    <div>
                        <label className="block text-gray-400 text-sm mb-2 font-bold uppercase">1. Seleziona Alunno</label>
                        <select 
                            value={selectedAlunno} 
                            onChange={(e) => setSelectedAlunno(e.target.value)} 
                            className="w-full bg-gray-900 text-white rounded-lg border border-gray-700 p-3 focus:border-accademia-red focus:outline-none"
                        >
                            <option value="">-- Seleziona --</option>
                            {alunni.map(a => (
                                <option key={a.id} value={a.id}>{a.cognome} {a.nome}</option>
                            ))}
                        </select>
                    </div>

                    {/* Selezione Mesi Multipla */}
                    <div>
                        <label className="block text-gray-400 text-sm mb-2 font-bold uppercase flex justify-between">
                            <span>2. Seleziona Mesi</span>
                            <span className="text-xs font-normal text-gray-500 normal-case">(Lascia vuoto per tutto l'anno)</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-800 max-h-48 overflow-y-auto custom-scrollbar">
                            {MESI.filter(m => m.val !== 0).map(m => { 
                                const isSelected = selectedMesi.includes(m.val);
                                return (
                                    <button
                                        key={m.val}
                                        onClick={() => toggleMese(m.val)}
                                        className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
                                            isSelected 
                                            ? 'bg-accademia-red text-white border-accademia-red' 
                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                        }`}
                                    >
                                        <span className="text-xs font-bold">{m.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Annulla</button>
                    <button 
                        onClick={handlePrint} 
                        disabled={loading || !selectedAlunno}
                        className={`bg-white text-black hover:bg-gray-200 px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 ${loading || !selectedAlunno ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Generazione...' : <><Printer size={18}/> Stampa PDF</>}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
}