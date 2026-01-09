import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Users, AlertCircle, CheckCircle2, XCircle, Plus, X, Printer, Save, DollarSign, List } from 'lucide-react';
// We need to import html2pdf for receipt printing. 
// Ideally this should be installed via npm: npm install html2pdf.js
// If not available, we can use a CDN link dynamically or assume it's globally available if loaded in index.html.
// For a React app, it's better to import it if installed, or use a dynamic import.
// Assuming 'html2pdf.js' is installed or we use a workaround.
import html2pdf from 'html2pdf.js';

const MESI = [
  { val: 0, label: 'ISCR' },
  { val: 9, label: 'SET' }, { val: 10, label: 'OTT' }, { val: 11, label: 'NOV' }, 
  { val: 12, label: 'DIC' }, { val: 1, label: 'GEN' }, { val: 2, label: 'FEB' }, 
  { val: 3, label: 'MAR' }, { val: 4, label: 'APR' }, { val: 5, label: 'MAG' }, 
  { val: 6, label: 'GIU' }, { val: 7, label: 'LUG' }
];

export default function DettaglioPagamenti() {
  const [docenti, setDocenti] = useState([]);
  const [selectedDocenteId, setSelectedDocenteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [matrix, setMatrix] = useState([]);
  
  // Modali
  const [showPayModal, setShowPayModal] = useState(false);
  const [payFormData, setPayFormData] = useState(null); 
  
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState(null); // { title: '', items: [] }

  useEffect(() => {
    const fetchDocenti = async () => {
      const { data } = await supabase.from('docenti').select('id, nome').eq('stato', 'Attivo').order('nome');
      setDocenti(data || []);
    };
    fetchDocenti();
  }, []);

  useEffect(() => {
    if (selectedDocenteId) loadDettagli();
    else setMatrix([]);
  }, [selectedDocenteId]);

  const loadDettagli = async () => {
    setLoading(true);
    try {
      const { data: assocData } = await supabase
        .from('associazioni')
        .select('alunno_id, alunni(id, nome)')
        .eq('docente_id', selectedDocenteId);
      
      const alunniMap = {};
      assocData?.forEach(row => {
        if (row.alunni) {
          alunniMap[row.alunno_id] = {
            id: row.alunno_id,
            nome: row.alunni.nome,
            mesi: {} 
          };
          MESI.forEach(m => alunniMap[row.alunno_id].mesi[m.val] = { dovuto: 0, pagato: 0 });
        }
      });

      const { data: lezioni } = await supabase
        .from('registro')
        .select(`alunno_id, data_lezione, tipi_lezioni ( costo )`)
        .eq('docente_id', selectedDocenteId);

      if (lezioni) {
        lezioni.forEach(lez => {
          if (alunniMap[lez.alunno_id]) {
            const mese = new Date(lez.data_lezione).getMonth() + 1;
            const costo = lez.tipi_lezioni?.costo || 0;
            if (alunniMap[lez.alunno_id].mesi[mese]) {
              alunniMap[lez.alunno_id].mesi[mese].dovuto += costo;
            }
          }
        });
      }

      const { data: pagamenti } = await supabase
        .from('pagamenti')
        .select('alunno_id, importo, mese_riferimento, tipologia')
        .eq('docente_id', selectedDocenteId);

      if (pagamenti) {
        pagamenti.forEach(pay => {
          if (alunniMap[pay.alunno_id]) {
            let mese = pay.mese_riferimento;
            if (pay.tipologia === 'Iscrizione') mese = 0;

            if (alunniMap[pay.alunno_id].mesi[mese]) {
              alunniMap[pay.alunno_id].mesi[mese].pagato += pay.importo;
            }
          }
        });
      }

      Object.values(alunniMap).forEach(alu => {
         alu.mesi[0].dovuto = 30; 
      });

      const result = Object.values(alunniMap).sort((a, b) => a.nome.localeCompare(b.nome));
      setMatrix(result);

    } catch (err) {
      console.error("Errore dettagli:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPaymentModal = (alunno) => {
    setPayFormData({
      alunno_id: alunno.id,
      alunno_nome: alunno.nome,
      docente_id: selectedDocenteId,
      importo: '',
      data_pagamento: new Date().toISOString().slice(0, 10),
      tipologia: 'Lezioni',
      mese_riferimento: new Date().getMonth() + 1,
      note: ''
    });
    setShowPayModal(true);
  };

  // --- NUOVA FUNZIONE: APRI DETTAGLIO CELLA ---
  const handleCellClick = async (alunnoId, mese, tipo) => {
    // tipo = 'dovuto' | 'pagato'
    setDetailData(null); // Reset
    setShowDetailModal(true);

    try {
      let items = [];
      let title = "";

      if (tipo === 'dovuto') {
        title = `Dettaglio Dovuto - Mese ${MESI.find(m=>m.val===mese)?.label}`;
        if (mese === 0) {
             items = [{ data: '-', desc: 'Quota Iscrizione', importo: 30 }];
        } else {
             // Fetch lezioni del mese
             // Nota: Filtrare per mese su data ISO richiede range o logica post-fetch
             const { data: lezioni } = await supabase
                .from('registro')
                .select(`data_lezione, tipi_lezioni(tipo, costo)`)
                .eq('docente_id', selectedDocenteId)
                .eq('alunno_id', alunnoId)
                .order('data_lezione');
             
             // Filtra mese in JS
             items = (lezioni || [])
                .filter(l => (new Date(l.data_lezione).getMonth() + 1) === mese)
                .map(l => ({
                    data: new Date(l.data_lezione).toLocaleDateString('it-IT'),
                    desc: l.tipi_lezioni?.tipo || 'Lezione',
                    importo: l.tipi_lezioni?.costo || 0
                }));
        }
      } else {
        // PAGATO
        title = `Dettaglio Pagato - Mese ${MESI.find(m=>m.val===mese)?.label}`;
        let query = supabase
            .from('pagamenti')
            .select('data_pagamento, tipologia, importo, note')
            .eq('docente_id', selectedDocenteId)
            .eq('alunno_id', alunnoId);
        
        if (mese === 0) {
            query = query.eq('tipologia', 'Iscrizione');
        } else {
            query = query.eq('mese_riferimento', mese);
        }
        
        const { data: pays } = await query;
        items = (pays || []).map(p => ({
            data: new Date(p.data_pagamento).toLocaleDateString('it-IT'),
            desc: p.tipologia + (p.note ? ` (${p.note})` : ''),
            importo: p.importo
        }));
      }

      setDetailData({ title, items });

    } catch (err) {
      console.error(err);
      setDetailData({ title: 'Errore', items: [] });
    }
  };


  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      
      {/* Header Selezione */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <Users className="text-accademia-red" size={20}/> 
            <h2 className="text-lg font-light text-white">Riepilogo Pagamenti</h2>
        </div>
        
        <select 
          className="bg-accademia-input border border-gray-700 text-white rounded-lg px-4 py-2 w-full sm:w-64 focus:border-accademia-red focus:outline-none transition-colors"
          value={selectedDocenteId}
          onChange={(e) => setSelectedDocenteId(e.target.value)}
        >
          <option value="">-- Seleziona Docente --</option>
          {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      </div>

      {/* Griglia Dati */}
      <div className="flex-1 overflow-auto p-0 custom-scrollbar relative">
        {!selectedDocenteId ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Users size={48} className="opacity-20 mb-2" />
            <p>Seleziona un docente per visualizzare il prospetto.</p>
          </div>
        ) : loading ? (
          <div className="p-10 text-center text-gray-500">Calcolo in corso...</div>
        ) : (
          <table className="w-full text-center text-sm border-collapse border border-gray-700">
            <thead className="bg-accademia-red text-white sticky top-0 z-30 shadow-md uppercase tracking-wider font-bold">
              <tr>
                <th className="p-3 text-left w-56 border-r border-red-800 sticky left-0 bg-accademia-red z-40 shadow-r-lg text-sm border-b border-red-800">Alunno</th>
                {MESI.map(m => (
                  <th key={m.val} className="p-2 min-w-[70px] border-r border-red-800 font-semibold text-xs border-b border-red-800">{m.label}</th>
                ))}
                <th className="p-2 w-16 border-l border-red-800 bg-red-900 text-center text-xs border-b border-red-800">REG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 text-sm">
              {matrix.map(row => (
                <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700">
                  <td className="p-4 text-left font-medium text-white border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 z-10 shadow-r-lg text-sm border-b border-gray-700">
                    {row.nome}
                  </td>
                  
                  {MESI.map(m => {
                    const cell = row.mesi[m.val];
                    const hasActivity = cell.dovuto > 0 || cell.pagato > 0;
                    const diff = cell.pagato - cell.dovuto; 
                    
                    return (
                      <td key={m.val} className="p-1 border-r border-gray-700 align-middle h-20 bg-transparent border-b border-gray-700">
                        {hasActivity ? (
                          <div className="flex flex-col items-center justify-center gap-1 w-full h-full">
                            {/* Dovuto CLICCABILE */}
                            <div 
                                className="flex justify-between w-full px-1 text-base text-gray-500 font-medium cursor-pointer hover:bg-gray-700/50 rounded"
                                onClick={() => handleCellClick(row.id, m.val, 'dovuto')}
                                title="Clicca per dettaglio dovuto"
                            >
                                <span>D: <span className="text-gray-300 font-mono text-base border-b border-dotted border-gray-600">€ {cell.dovuto}</span></span>
                            </div>
                            
                            {/* Pagato CLICCABILE */}
                            <div 
                                className="flex justify-between w-full px-1 text-base text-gray-500 font-medium cursor-pointer hover:bg-gray-700/50 rounded"
                                onClick={() => handleCellClick(row.id, m.val, 'pagato')}
                                title="Clicca per dettaglio pagamenti"
                            >
                                <span>P: <span className="text-white font-mono text-base border-b border-dotted border-gray-600">€ {cell.pagato}</span></span>
                            </div>
                            
                            {/* Differenza (Delta) */}
                            <div className={`w-full text-center border-t border-gray-700 pt-1 font-bold text-base ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                € {Math.abs(diff)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-800">-</span>
                        )}
                      </td>
                    );
                  })}
                  
                  <td className="p-2 border-l border-gray-700 bg-gray-900/40 text-center border-b border-gray-700">
                    <button 
                        onClick={() => handleOpenPaymentModal(row)}
                        className="p-2 bg-gray-800 hover:bg-accademia-red text-gray-300 hover:text-white rounded-full transition-colors shadow-sm"
                        title="Registra Pagamento"
                    >
                        <DollarSign size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODALE DI PAGAMENTO RAPIDO */}
      {showPayModal && (
        <ModalPagamentoRapido 
          data={payFormData} 
          onClose={() => setShowPayModal(false)}
          onSave={() => { setShowPayModal(false); loadDettagli(); }}
        />
      )}

      {/* MODALE DETTAGLIO CELLA */}
      {showDetailModal && (
          <ModalDettaglioCella 
             data={detailData}
             onClose={() => setShowDetailModal(false)}
          />
      )}

    </div>
  );
}

// --- MODALE DETTAGLIO CELLA ---
function ModalDettaglioCella({ data, onClose }) {
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        {data ? data.title : 'Caricamento...'}
                    </h3>
                    <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white"/></button>
                </div>
                
                <div className="p-0 max-h-64 overflow-y-auto custom-scrollbar bg-accademia-card">
                    {!data ? (
                        <div className="p-4 text-center text-gray-500">Caricamento dati...</div>
                    ) : data.items.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">Nessun dettaglio trovato.</div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-2 font-semibold">Data</th>
                                    <th className="px-4 py-2 font-semibold">Descrizione</th>
                                    <th className="px-4 py-2 font-semibold text-right">€</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-800/30">
                                        <td className="px-4 py-2 text-gray-400 text-xs font-mono">{item.data}</td>
                                        <td className="px-4 py-2 text-white font-medium">{item.desc}</td>
                                        <td className="px-4 py-2 text-right font-mono text-green-400">€ {item.importo}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                <div className="p-3 border-t border-gray-700 bg-gray-900/30 flex justify-end">
                     {data && data.items.length > 0 && (
                         <div className="text-xs text-gray-400 mr-auto self-center">
                             Totale: <span className="text-white font-bold">€ {data.items.reduce((acc, i) => acc + i.importo, 0)}</span>
                         </div>
                     )}
                     <button onClick={onClose} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">Chiudi</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// --- MODALE PAGAMENTO (Invariata ma con prop renaming per coerenza) ---
function ModalPagamentoRapido({ data, onClose, onSave }) {
  const [formData, setFormData] = useState({ ...data });
  const [isPrinting, setIsPrinting] = useState(false);

  const handleSubmit = async (e, shouldPrint = false) => {
    e.preventDefault();
    try {
      if (shouldPrint) setIsPrinting(true);

      const payload = {
        alunno_id: formData.alunno_id,
        docente_id: formData.docente_id,
        importo: parseFloat(formData.importo),
        data_pagamento: formData.data_pagamento,
        mese_riferimento: parseInt(formData.mese_riferimento),
        anno_accademico: '2025/2026', 
        tipologia: formData.tipologia,
        note: formData.note
      };

      const { error } = await supabase.from('pagamenti').insert([payload]);
      if (error) throw error;

      if (shouldPrint) {
        await printReceipt({
            alunno_nome: formData.alunno_nome,
            tipologia: formData.tipologia,
            mese_rif: formData.mese_riferimento,
            aa: payload.anno_accademico,
            importo: payload.importo,
            data_pagamento: new Date(payload.data_pagamento).toLocaleDateString('it-IT'),
            note: payload.note
        });
      }

      onSave();
    } catch(err) {
      alert("Errore: " + err.message);
    } finally {
        setIsPrinting(false);
    }
  };

  const printReceipt = async (r) => {
    const element = document.createElement('div');
    element.innerHTML = `
    <div style="padding: 40px; font-family: Arial, sans-serif; color: #000; background: #fff; width: 210mm; min-height: 297mm; box-sizing: border-box; position: relative;">
        <!-- Header: Logo/Titolo a sinistra, Dati a destra -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #b30000; padding-bottom: 20px;">
            <div style="flex: 1;">
                 <h1 style="font-size: 28px; font-weight: bold; color: #b30000; text-transform: uppercase; margin: 0;">Ricevuta</h1>
                 <p style="font-size: 14px; color: #666; margin-top: 5px;">Copia per l'alunno</p>
            </div>
            <div style="text-align: right; font-size: 12px; color: #444; line-height: 1.5;">
                <strong>Accademia della Musica</strong><br>
                Vicolo del Guazzo 2<br>
                29121 Piacenza<br>
                C.F. 91117860337
            </div>
        </div>

        <!-- Info Pagamento -->
        <div style="margin-bottom: 40px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; font-size: 14px; color: #666; width: 150px;">Ricevuto da:</td>
                    <td style="padding: 10px 0; font-size: 18px; font-weight: bold;">${r.alunno_nome}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; font-size: 14px; color: #666;">Data:</td>
                    <td style="padding: 10px 0; font-size: 16px;">${r.data_pagamento}</td>
                </tr>
            </table>
        </div>

        <!-- Dettaglio -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 60px;">
            <thead>
                <tr style="background-color: #f8f8f8; border-bottom: 2px solid #ddd;">
                    <td style="padding: 15px; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Descrizione</td>
                    <td style="padding: 15px; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; text-align: right; width: 150px;">Importo</td>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 20px 15px;">
                        <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">${r.tipologia}</div>
                        <div style="font-size: 14px; color: #666;">
                            ${r.mese_rif && r.mese_rif != 0 ? `Mese di riferimento: ${MESI.find(m => m.val === r.mese_rif)?.label}` : ''}
                            <span style="margin-left: 10px;">(A.A. ${r.aa || ''})</span>
                        </div>
                        ${r.note ? `<div style="font-size: 13px; color: #888; margin-top: 5px; font-style: italic;">Note: ${r.note}</div>` : ''}
                    </td>
                    <td style="padding: 20px 15px; text-align: right; font-size: 20px; font-weight: bold; color: #b30000;">
                        € ${parseFloat(r.importo).toFixed(2)}
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Totale -->
        <div style="text-align: right; margin-bottom: 80px;">
             <div style="display: inline-block; text-align: right;">
                <span style="font-size: 14px; color: #666; margin-right: 20px;">TOTALE RICEVUTO</span>
                <span style="font-size: 24px; font-weight: bold; color: #000;">€ ${parseFloat(r.importo).toFixed(2)}</span>
             </div>
        </div>

        <!-- Footer / Firma -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 100px;">
            <div style="font-size: 10px; color: #888;">
                <p style="margin: 0;">Il presente documento costituisce ricevuta di pagamento.</p>
                <p style="margin: 5px 0 0 0; font-weight: bold;">NON VALIDO AI FINI FISCALI</p>
            </div>
            
            <div style="text-align: center;">
                <div style="margin-bottom: 50px; font-size: 12px; color: #444;">Firma per quietanza</div>
                <div style="border-bottom: 1px solid #000; width: 250px;"></div>
            </div>
        </div>
    </div>
    `;

    const opt = {
      margin: 0,
      filename: `Ricevuta_${r.alunno_nome}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between mb-4">
          <h3 className="text-xl font-bold text-white">{formData.id ? 'Modifica Pagamento' : 'Nuovo Pagamento'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>

        <form id="payForm" className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Alunno</label>
            <select 
              value={formData.alunno_id} 
              onChange={e => setFormData({...formData, alunno_id: e.target.value})}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              required
            >
              <option value="">Seleziona...</option>
              {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Tipologia</label>
              <select 
                value={formData.tipologia} 
                onChange={e => setFormData({...formData, tipologia: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              >
                <option value="Lezioni">Lezioni</option>
                <option value="Iscrizione">Iscrizione</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Importo (€)</label>
              <input 
                type="number" 
                step="0.5"
                value={formData.importo}
                onChange={e => setFormData({...formData, importo: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Data</label>
              <input 
                type="date" 
                value={formData.data_pagamento}
                onChange={e => setFormData({...formData, data_pagamento: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Mese Rif.</label>
              <select 
                value={formData.mese_riferimento} 
                onChange={e => setFormData({...formData, mese_riferimento: e.target.value})}
                disabled={formData.tipologia === 'Iscrizione'}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50"
              >
                {MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Note</label>
            <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} rows="2" className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"></textarea>
          </div>
        </form>

        <div className="pt-4 mt-4 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button>
          
          <button 
            onClick={(e) => handleSubmit(e, true)}
            disabled={isPrinting}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2"
          >
            <Printer size={16}/> {isPrinting ? 'Stampa...' : 'Salva & Stampa'}
          </button>

          <button 
            onClick={(e) => handleSubmit(e, false)}
            className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg flex items-center gap-2"
          >
            <Save size={16}/> Salva
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}