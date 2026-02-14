import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient.js';
import { ClipboardList, Filter, X, Calendar, Tags, Search } from 'lucide-react';
import { calcolaScontiPacchetti } from '../utils/financeManager.js';

// --- IMPORT CENTRALIZZATO ---
import { 
  MESI_COMPLETE as MESI, // Include ISCR
  ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI,
  getCurrentAcademicYear 
} from '../utils/constants.js';

export default function RiepilogoFinanziario() {
  const [reportData, setReportData] = useState([]);
  const [originalReportData, setOriginalReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ dovuto: 0, pagato: 0, diff: 0 });
  const [monthlyTotals, setMonthlyTotals] = useState({});
  
  // Stato per l'anno accademico selezionato
  const [selectedAnno, setSelectedAnno] = useState(getCurrentAcademicYear());

  // Stato per il modale di dettaglio
  const [selectedCell, setSelectedCell] = useState(null);

  // Stato per il filtro
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Aggiorna il report ogni volta che cambia l'anno selezionato
    fetchReport(selectedAnno);
  }, [selectedAnno]);

  useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const filtered = searchTerm
      ? originalReportData.filter(doc => 
          `${doc.cognome} ${doc.nome}`.toLowerCase().includes(lowerCaseSearchTerm)
        )
      : originalReportData;
    
    setReportData(filtered);
    recalculateTotals(filtered);
  }, [searchTerm, originalReportData]);

  const recalculateTotals = (data) => {
    let globalDovuto = 0;
    let globalPagato = 0;
    const mTotals = {};
    
    MESI.forEach(m => {
      mTotals[m.val] = { dovuto: 0, pagato: 0, diff: 0 };
    });

    data.forEach(doc => {
      Object.keys(doc.mesi).forEach(meseKey => {
        const meseNum = parseInt(meseKey);
        if (mTotals[meseNum]) {
          const meseData = doc.mesi[meseNum];
          if(meseData) {
              mTotals[meseNum].dovuto += meseData.dovuto;
              mTotals[meseNum].pagato += meseData.pagato;
              mTotals[meseNum].diff += meseData.diff;
          }
        }
      });
      globalDovuto += doc.totale.dovuto;
      globalPagato += doc.totale.pagato;
    });

    setTotals({
      dovuto: globalDovuto,
      pagato: globalPagato,
      diff: globalPagato - globalDovuto
    });
    setMonthlyTotals(mTotals);
  };

  // Funzione helper per formattare i numeri con il punto delle migliaia (Locale IT)
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0';
    return amount.toLocaleString('it-IT', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
  };

  const fetchReport = async (annoAccademico) => {
    setLoading(true);
    try {
      const [startYear, endYear] = annoAccademico.split('/').map(Number);
      const startDate = `${startYear}-08-20`;
      const endDate = `${endYear}-09-10`;

      const { data: docenti, error: docentiError } = await supabase
        .from('docenti')
        .select('id, nome, cognome, strumento, stato')
        .order('cognome');
      if (docentiError) throw new Error(`Errore caricamento docenti: ${docentiError.message}`);

      const { data: pagamenti, error: pagamentiError } = await supabase
        .from('pagamenti')
        .select('id, alunno_id, importo, tipologia')
        .eq('anno_accademico', annoAccademico);
      if (pagamentiError) throw new Error(`Errore caricamento pagamenti: ${pagamentiError.message}`);

      const paymentIds = pagamenti.map(p => p.id);
      let dettagliPagamento = [];
      if (paymentIds.length > 0) {
        const { data: dettagliData, error: dettagliError } = await supabase
          .from('dettagli_pagamento')
          .select('pagamento_id, registro_id, importo_coperto')
          .in('pagamento_id', paymentIds);
        if (dettagliError) throw new Error(`Errore caricamento dettagli pagamento: ${dettagliError.message}`);
        dettagliPagamento = dettagliData;
      }

      const { data: lezioni, error: lezioniError } = await supabase
        .from('registro')
        .select(`id, docente_id, data_lezione, tipo_lezione_id, alunno_id, school_id, tipi_lezioni ( id, tipo ), alunni ( nome, cognome )`)
        .gte('data_lezione', startDate)
        .lte('data_lezione', endDate);
      if (lezioniError) console.warn('Errore fetching lezioni:', lezioniError);

      const { data: tariffe, error: tariffeError } = await supabase.from('tariffe').select('tipo_lezione, costo').eq('anno_accademico', annoAccademico);
      if (tariffeError) console.warn('Errore fetching tariffe:', tariffeError);
      
      const { data: pacchetti, error: pacchettiError } = await supabase.from('tariffe_pacchetti').select('*').eq('anno_accademico', annoAccademico);
      if (pacchettiError) console.warn('Errore fetching pacchetti:', pacchettiError);

      const { data: quoteData, error: quoteError } = await supabase.from('anni_accademici').select('quota_iscrizione, school_id').eq('anno', annoAccademico);
      if (quoteError) throw new Error(`Errore caricamento quote iscrizione: ${quoteError.message}`);

      const { data: associazioni, error: associazioniError } = await supabase.from('associazioni').select('docente_id, alunno_id');
      if (associazioniError) throw new Error(`Errore caricamento associazioni: ${associazioniError.message}`);

      const { data: alunni, error: alunniError } = await supabase.from('alunni').select('id, school_id');
      if (alunniError) throw new Error(`Errore caricamento alunni: ${alunniError.message}`);

      const iscrizioneFeeMap = (quoteData || []).reduce((acc, q) => { acc[q.school_id] = q.quota_iscrizione; return acc; }, {});
      const alunniSchoolMap = (alunni || []).reduce((acc, a) => { acc[a.id] = a.school_id; return acc; }, {});
      const alunnoDocenteMap = (associazioni || []).reduce((acc, assoc) => {
        if (!acc[assoc.alunno_id]) acc[assoc.alunno_id] = [];
        acc[assoc.alunno_id].push(assoc.docente_id);
        return acc;
      }, {});
      const tariffeMap = (tariffe || []).reduce((acc, tariffa) => { acc[tariffa.tipo_lezione] = tariffa.costo; return acc; }, {});
      const lezioniMap = (lezioni || []).reduce((acc, lez) => { acc[lez.id] = lez; return acc; }, {});

      const report = docenti.map(doc => {
        const row = { id: doc.id, nome: doc.nome, cognome: doc.cognome, strumento: doc.strumento, mesi: {}, totale: { dovuto: 0, pagato: 0, diff: 0 } };
        MESI.forEach(m => row.mesi[m.val] = { dovuto: 0, pagato: 0, diff: 0, events: [] });
        return row;
      });

      const docIndex = report.reduce((acc, doc, idx) => { acc[doc.id] = idx; return acc; }, {});
      const processedEvents = calcolaScontiPacchetti(lezioni || [], pacchetti || []);

      if (processedEvents) {
        processedEvents.forEach(evt => {
          const idx = docIndex[evt.docente_id];
          if (idx !== undefined) {
            const mese = new Date(evt.data_lezione).getMonth() + 1;
            if (report[idx].mesi[mese]) {
                let costo = evt.is_virtual ? evt.costo_calcolato : (tariffeMap[evt.tipi_lezioni?.tipo] || 0);
                report[idx].mesi[mese].dovuto += costo;
                report[idx].totale.dovuto += costo;
                report[idx].mesi[mese].events.push({ ...evt, importo_calcolato: costo });
            }
          }
        });
      }

      if (associazioni) {
        associazioni.forEach(assoc => {
            const idx = docIndex[assoc.docente_id];
            if (idx !== undefined) {
                const schoolId = alunniSchoolMap[assoc.alunno_id];
                const quota = iscrizioneFeeMap[schoolId] || 0;
                if (report[idx].mesi[0]) {
                    report[idx].mesi[0].dovuto += quota;
                    report[idx].totale.dovuto += quota;
                }
            }
        });
      }

      if (pagamenti) {
        const iscrizionePayments = pagamenti.filter(p => p.tipologia === 'Iscrizione');
        iscrizionePayments.forEach(pay => {
          const docentiIds = alunnoDocenteMap[pay.alunno_id] || [];
          docentiIds.forEach(docId => {
            const idx = docIndex[docId];
            if (idx !== undefined) {
              const importoPerDocente = pay.importo / docentiIds.length;
              if (!report[idx].mesi[0]) report[idx].mesi[0] = { dovuto: 0, pagato: 0, diff: 0, events: [] };
              report[idx].mesi[0].pagato += importoPerDocente;
              report[idx].totale.pagato += importoPerDocente;
            }
          });
        });
      }

      if (dettagliPagamento) {
        dettagliPagamento.forEach(dettaglio => {
          const lezione = lezioniMap[dettaglio.registro_id];
          if (lezione) {
            const idx = docIndex[lezione.docente_id];
            if (idx !== undefined) {
              const mese = new Date(lezione.data_lezione).getMonth() + 1;
              if (!report[idx].mesi[mese]) report[idx].mesi[mese] = { dovuto: 0, pagato: 0, diff: 0, events: [] };
              report[idx].mesi[mese].pagato += dettaglio.importo_coperto;
              report[idx].totale.pagato += dettaglio.importo_coperto;
            }
          }
        });
      }

      report.forEach(doc => {
        Object.keys(doc.mesi).forEach(meseKey => {
          const meseNum = parseInt(meseKey);
          if (doc.mesi[meseNum]) {
            doc.mesi[meseNum].diff = doc.mesi[meseNum].pagato - doc.mesi[meseNum].dovuto;
          }
        });
        doc.totale.diff = doc.totale.pagato - doc.totale.dovuto;
      });

      setOriginalReportData(report);

    } catch (err) {
      console.error("Errore report:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (docente, meseVal, cellData) => {
      if (meseVal === 0 || !cellData.events || cellData.events.length === 0) return;
      setSelectedCell({
          docente: `${docente.cognome} ${docente.nome}`,
          mese: MESI.find(m => m.val === meseVal)?.label || 'Mese',
          events: cellData.events
      });
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Elaborazione report finanziario...</div>;
  if (error) return <div className="p-10 text-center text-red-500">Errore: {error}</div>;

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <ClipboardList className="text-accademia-red" size={20}/> 
            <h2 className="text-lg font-light text-white">Riepilogo Finanziario</h2>
        </div>

        <div className="flex items-center gap-6">
            {/* Filtro per Docente */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1 border border-gray-600">
                <Search size={14} className="text-gray-400"/>
                <input
                    type="text"
                    placeholder="Filtra per docente..."
                    className="bg-transparent text-white text-sm focus:outline-none placeholder-gray-500 w-40"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="text-gray-500 hover:text-white">
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Selettore Anno Accademico */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1 border border-gray-600">
                <Filter size={14} className="text-gray-400"/>
                <select 
                    value={selectedAnno}
                    onChange={(e) => setSelectedAnno(e.target.value)}
                    className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
                >
                    {ANNI_ACCADEMICI.map(anno => (
                        <option key={anno} value={anno} className="bg-gray-800 text-white">{anno}</option>
                    ))}
                </select>
            </div>

            {/* Totali Globali */}
            <div className="flex gap-4 text-xs hidden sm:flex">
                <div className="flex flex-col items-end">
                    <span className="text-gray-500 uppercase font-bold tracking-wider">Dovuto</span>
                    <span className="text-gray-300 font-mono text-base">€ {formatAmount(totals.dovuto)}</span>
                </div>
                <div className="w-px bg-gray-600 h-8 self-center"></div>
                <div className="flex flex-col items-end">
                    <span className="text-gray-500 uppercase font-bold tracking-wider">Pagato</span>
                    <span className="text-green-400 font-mono text-base">€ {formatAmount(totals.pagato)}</span>
                </div>
                <div className="w-px bg-gray-600 h-8 self-center"></div>
                <div className="flex flex-col items-end">
                    <span className="text-gray-500 uppercase font-bold tracking-wider">Diff</span>
                    <span className={`font-mono font-bold text-base ${totals.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        € {formatAmount(Math.abs(totals.diff))}
                    </span>
                </div>
            </div>
        </div>
      </div>

      {/* Tabella Scrollabile */}
      <div className="flex-1 overflow-auto p-0 custom-scrollbar relative">
        <table className="w-full text-right text-sm border-collapse border border-gray-700">
          <thead className="bg-accademia-red text-white sticky top-0 z-30 shadow-md uppercase tracking-wider font-bold">
            <tr>
              <th className="p-3 text-left w-64 border-r border-red-800 sticky left-0 bg-accademia-red z-40 shadow-r-lg text-sm border-b border-red-800">Docente</th>
              {MESI.map(m => (
                <th key={m.val} className="p-2 min-w-[90px] border-r border-red-800 text-center text-sm border-b border-red-800">{m.label}</th>
              ))}
              <th className="p-3 w-32 border-l border-red-800 bg-red-900 text-center text-sm border-b border-red-800">TOTALE</th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-gray-700 text-base">
            
            {/* RIGA TOTALI MENSILI */}
            <tr className="bg-gray-800 font-bold border-b-2 border-gray-600">
                <td className="p-3 text-left border-r border-gray-600 sticky left-0 bg-gray-800 z-20 text-accademia-red uppercase tracking-wider text-sm font-extrabold border-b border-gray-600">
                    TOTALE MESE
                </td>
                {MESI.map(m => {
                    const mt = monthlyTotals[m.val] || { dovuto: 0, pagato: 0, diff: 0 };
                    return (
                        <td key={m.val} className="p-2 border-r border-gray-600 text-center bg-gray-800/50 border-b border-gray-600">
                            <div className="flex flex-col gap-1 items-center">
                                <div className="text-sm text-gray-400 font-medium">D: € {formatAmount(mt.dovuto)}</div>
                                <div className="text-sm text-white font-bold">P: € {formatAmount(mt.pagato)}</div>
                                <div className={`text-base font-extrabold border-t border-gray-600 w-full pt-1 mt-1 ${mt.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    € {formatAmount(Math.abs(mt.diff))}
                                </div>
                            </div>
                        </td>
                    );
                })}
                <td className="p-3 border-l border-gray-600 bg-gray-900/50 text-center border-b border-gray-600">
                    <span className={`text-base font-extrabold ${totals.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                       € {formatAmount(Math.abs(totals.diff))}
                    </span>
                </td>
            </tr>

            {/* RIGHE DOCENTI */}
            {reportData.length === 0 ? (
              <tr>
                <td colSpan={MESI.length + 2} className="p-4 text-center text-gray-500">
                  Nessun docente trovato per la ricerca
                </td>
              </tr>
            ) : (
              reportData.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700">
                  <td className="p-4 text-left border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 transition-colors z-10 shadow-r-lg border-b border-gray-700">
                    <div className="font-bold text-white text-base">{doc.cognome} {doc.nome}</div>
                    <div className="text-sm text-gray-400 font-normal mt-0.5">({doc.strumento || '-'})</div>
                  </td>
                  
                  {MESI.map(m => {
                    const data = doc.mesi[m.val] || { dovuto: 0, pagato: 0, diff: 0, events: [] };
                    const hasData = data.dovuto > 0 || data.pagato > 0;
                    const isClickable = hasData && data.events && data.events.length > 0;

                    return (
                      <td 
                        key={m.val} 
                        className={`p-2 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700 ${isClickable ? 'cursor-pointer hover:bg-white/5' : ''}`}
                        onClick={() => handleCellClick(doc, m.val, data)}
                      >
                        {hasData ? (
                          <div className="flex flex-col items-center justify-center h-full gap-1">
                             <div className="text-sm text-gray-500 font-medium">
                                  D: <span className="text-gray-300 font-mono text-sm">€ {formatAmount(data.dovuto)}</span>
                             </div>
                             <div className="text-sm text-white font-bold">
                                  P: <span className="text-white font-mono text-sm">€ {formatAmount(data.pagato)}</span>
                             </div>
                             <div className={`w-full text-center border-t border-gray-700 pt-1 font-bold text-sm ${data.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                               € {formatAmount(Math.abs(data.diff))}
                             </div>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center opacity-10 text-gray-600">-</div>
                        )}
                      </td>
                    );
                  })}

                  <td className="p-3 bg-gray-900/40 border-l border-gray-700 font-mono align-middle text-center border-b border-gray-700">
                    <div className="flex flex-col gap-1 items-center">
                      <div className="text-sm text-gray-400 font-medium">D: € {formatAmount(doc.totale.dovuto)}</div>
                      <div className="text-sm text-white font-bold">P: € {formatAmount(doc.totale.pagato)}</div>
                      <div className={`text-base font-extrabold border-t border-gray-600 w-full pt-1 mt-1 ${doc.totale.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        € {formatAmount(Math.abs(doc.totale.diff))}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODALE DETTAGLIO */}
      {selectedCell && (
          <ModalDettaglioCella data={selectedCell} onClose={() => setSelectedCell(null)} />
      )}
    </div>
  );
}

// --- SUB COMPONENTI ---

function ModalDettaglioCella({ data, onClose }) {
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Calendar size={18} className="text-accademia-red"/> {data.mese}
                        </h3>
                        <p className="text-sm text-gray-400">{data.docente}</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-full transition-colors"><X className="text-gray-400 hover:text-white"/></button>
                </div>
                
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-800 text-gray-400 uppercase text-xs sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Alunno</th>
                                <th className="px-4 py-3">Descrizione</th>
                                <th className="px-4 py-3 text-right">Importo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {data.events.map((evt, idx) => (
                                <tr key={evt.id || idx} className={`hover:bg-gray-800/30 ${evt.is_virtual ? 'bg-green-900/20' : ''}`}>
                                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                                        {new Date(evt.data_lezione).toLocaleDateString('it-IT')}
                                    </td>
                                    <td className="px-4 py-3 text-white">
                                        {evt.alunni ? `${evt.alunni.cognome} ${evt.alunni.nome}` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                        {evt.is_virtual ? (
                                            <span className="text-green-400 flex items-center gap-2 font-bold text-xs uppercase tracking-wide">
                                                <Tags size={12}/> {evt.descrizione_sconto}
                                                <span className="text-gray-500 font-normal lowercase italic ml-1">({evt.dettaglio_settimana})</span>
                                            </span>
                                        ) : (
                                            <span>{evt.tipi_lezioni?.tipo}</span>
                                        )}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono font-bold ${evt.is_virtual ? 'text-green-400' : 'text-gray-300'}`}>
                                        {evt.is_virtual ? '' : '€ '}{evt.importo_calcolato}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>,
        document.body
    );
}