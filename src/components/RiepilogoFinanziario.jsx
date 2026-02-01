import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ClipboardList, Filter } from 'lucide-react';

// --- IMPORT CENTRALIZZATO ---
import { 
  MESI_COMPLETE as MESI, // Include ISCR
  ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI,
  getCurrentAcademicYear 
} from '../utils/constants';

export default function RiepilogoFinanziario() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ dovuto: 0, pagato: 0, diff: 0 });
  const [monthlyTotals, setMonthlyTotals] = useState({});
  const [quotaIscrizione, setQuotaIscrizione] = useState(30);
  
  // Stato per l'anno accademico selezionato
  const [selectedAnno, setSelectedAnno] = useState(getCurrentAcademicYear());

  useEffect(() => {
    // Aggiorna il report ogni volta che cambia l'anno selezionato
    fetchReport(selectedAnno);
  }, [selectedAnno]);

  // Funzione helper per formattare i numeri con il punto delle migliaia (Locale IT)
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0';
    // Usa 'it-IT' per avere il punto come separatore delle migliaia (es. 1.200,50)
    return amount.toLocaleString('it-IT', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
  };

  const fetchReport = async (annoAccademico) => {
    setLoading(true);
    try {
      // Calcola range date per filtrare le lezioni (dal 1 Settembre al 31 Agosto dell'anno successivo)
      const [startYear, endYear] = annoAccademico.split('/').map(Number);
      const startDate = `${startYear}-09-01`;
      const endDate = `${endYear}-08-31`;

      // 1. Fetch Docenti (TUTTI, non solo attivi) per includere quelli con pagamenti
      const { data: docenti, error: docentiError } = await supabase
        .from('docenti')
        .select('id, nome, cognome, strumento, stato')
        .order('cognome');

      if (docentiError) throw new Error(`Errore caricamento docenti: ${docentiError.message}`);

      // 2. Fetch Pagamenti (Filtrati per Anno Accademico)
      const { data: pagamenti, error: pagamentiError } = await supabase
        .from('pagamenti')
        .select('id, alunno_id, importo, tipologia') // Rimosso docente_id, aggiunto alunno_id
        .eq('anno_accademico', annoAccademico);

      if (pagamentiError) throw new Error(`Errore caricamento pagamenti: ${pagamentiError.message}`);

      // 2b. Fetch Dettagli Pagamento
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

      // 3. Fetch Registro Lezioni (Filtrati per data)
      const { data: lezioni, error: lezioniError } = await supabase
        .from('registro')
        .select('id, docente_id, data_lezione, tipo_lezione_id, tipi_lezioni ( id, tipo )')
        .gte('data_lezione', startDate)
        .lte('data_lezione', endDate);
      if (lezioniError) console.warn('Errore fetching lezioni:', lezioniError);

      // 4. Fetch Tariffe Lezioni
      const { data: tariffe, error: tariffeError } = await supabase
        .from('tariffe')
        .select('tipo_lezione, costo')
        .eq('anno_accademico', annoAccademico);
      if (tariffeError) console.warn('Errore fetching tariffe:', tariffeError);
      
      // 5. Fetch Quote Iscrizione per Scuola
      const { data: quoteData, error: quoteError } = await supabase
        .from('anni_accademici')
        .select('quota_iscrizione, school_id')
        .eq('anno', annoAccademico);
      if (quoteError) throw new Error(`Errore caricamento quote iscrizione: ${quoteError.message}`);

      // 6. Fetch Associazioni (Per collegare Alunni <-> Docenti)
      const { data: associazioni, error: associazioniError } = await supabase
        .from('associazioni')
        .select('docente_id, alunno_id');
      if (associazioniError) throw new Error(`Errore caricamento associazioni: ${associazioniError.message}`);

      // 7. Fetch Alunni (per school_id)
      const { data: alunni, error: alunniError } = await supabase
        .from('alunni')
        .select('id, school_id');
      if (alunniError) throw new Error(`Errore caricamento alunni: ${alunniError.message}`);

      // --- ELABORAZIONE DATI ---
      // Crea mapping: schoolId -> quota
      const iscrizioneFeeMap = (quoteData || []).reduce((acc, q) => {
        acc[q.school_id] = q.quota_iscrizione;
        return acc;
      }, {});

      // Crea mapping: alunnoId -> schoolId
      const alunniSchoolMap = (alunni || []).reduce((acc, a) => {
        acc[a.id] = a.school_id;
        return acc;
      }, {});

      // Crea mapping: alunnoId -> [docenteId]
      const alunnoDocenteMap = (associazioni || []).reduce((acc, assoc) => {
        if (!acc[assoc.alunno_id]) {
          acc[assoc.alunno_id] = [];
        }
        acc[assoc.alunno_id].push(assoc.docente_id);
        return acc;
      }, {});
      
      // Crea mapping delle tariffe per accesso rapido
      const tariffeMap = (tariffe || []).reduce((acc, tariffa) => {
        acc[tariffa.tipo_lezione] = tariffa.costo;
        return acc;
      }, {});

      // Crea mapping delle lezioni per accesso rapido
      const lezioniMap = (lezioni || []).reduce((acc, lez) => {
        acc[lez.id] = lez;
        return acc;
      }, {});

      const report = docenti.map(doc => {
        const row = {
          id: doc.id,
          nome: doc.nome,
          cognome: doc.cognome,
          strumento: doc.strumento,
          mesi: {},
          totale: { dovuto: 0, pagato: 0, diff: 0 }
        };
        MESI.forEach(m => row.mesi[m.val] = { dovuto: 0, pagato: 0, diff: 0 });
        return row;
      });

      const docIndex = report.reduce((acc, doc, idx) => {
        acc[doc.id] = idx;
        return acc;
      }, {});

      // A. Calcola DOVUTO LEZIONI
      if (lezioni) {
        lezioni.forEach(lez => {
          const idx = docIndex[lez.docente_id];
          if (idx !== undefined) {
            const mese = new Date(lez.data_lezione).getMonth() + 1;
            const costo = tariffeMap[lez.tipi_lezioni?.tipo] || 0;
            if (!report[idx].mesi[mese]) {
              report[idx].mesi[mese] = { dovuto: 0, pagato: 0, diff: 0 };
            }
            report[idx].mesi[mese].dovuto += costo;
            report[idx].totale.dovuto += costo;
          }
        });
      }

      // B. Calcola DOVUTO ISCRIZIONI
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

      // C. Calcola PAGATO per ISCRIZIONI
      if (pagamenti) {
        const iscrizionePayments = pagamenti.filter(p => p.tipologia === 'Iscrizione');
        iscrizionePayments.forEach(pay => {
          const docentiIds = alunnoDocenteMap[pay.alunno_id] || [];
          docentiIds.forEach(docId => {
            const idx = docIndex[docId];
            if (idx !== undefined) {
              const mese = 0; // Mese Iscrizione
              // Dividi l'importo del pagamento per il numero di docenti associati
              const importoPerDocente = pay.importo / docentiIds.length;

              if (!report[idx].mesi[mese]) {
                report[idx].mesi[mese] = { dovuto: 0, pagato: 0, diff: 0 };
              }
              report[idx].mesi[mese].pagato += importoPerDocente;
              report[idx].totale.pagato += importoPerDocente;
            }
          });
        });
      }

      // D. Calcola PAGATO per LEZIONI (da dettagli_pagamento)
      if (dettagliPagamento) {
        dettagliPagamento.forEach(dettaglio => {
          const lezione = lezioniMap[dettaglio.registro_id];
          if (lezione) {
            const idx = docIndex[lezione.docente_id];
            if (idx !== undefined) {
              const mese = new Date(lezione.data_lezione).getMonth() + 1;
              if (!report[idx].mesi[mese]) {
                report[idx].mesi[mese] = { dovuto: 0, pagato: 0, diff: 0 };
              }
              report[idx].mesi[mese].pagato += dettaglio.importo_coperto;
              report[idx].totale.pagato += dettaglio.importo_coperto;
            }
          }
        });
      }

      // E. Calcola Totali Globali e Mensili
      let globalDovuto = 0;
      let globalPagato = 0;
      const mTotals = {};
      
      // Inizializza i totali mensili con i mesi standard
      MESI.forEach(m => {
        mTotals[m.val] = { dovuto: 0, pagato: 0, diff: 0 };
      });

      report.forEach(doc => {
        // Itera su tutti i mesi effettivamente presenti nel report (inclusi quelli creati dinamicamente)
        Object.keys(doc.mesi).forEach(meseKey => {
          const meseNum = parseInt(meseKey);
          
          // Assicurati che il totale mensile esista
          if (!mTotals[meseNum]) {
            mTotals[meseNum] = { dovuto: 0, pagato: 0, diff: 0 };
          }
          
          // FIX: Assicurati che il mese esista nel docente
          if (!doc.mesi[meseNum]) {
            doc.mesi[meseNum] = { dovuto: 0, pagato: 0, diff: 0 };
          }
          
          doc.mesi[meseNum].diff = doc.mesi[meseNum].pagato - doc.mesi[meseNum].dovuto;
          mTotals[meseNum].dovuto += doc.mesi[meseNum].dovuto;
          mTotals[meseNum].pagato += doc.mesi[meseNum].pagato;
          mTotals[meseNum].diff += doc.mesi[meseNum].diff;
        });
        
        doc.totale.diff = doc.totale.pagato - doc.totale.dovuto;
        globalDovuto += doc.totale.dovuto;
        globalPagato += doc.totale.pagato;
      });

      setTotals({
        dovuto: globalDovuto,
        pagato: globalPagato,
        diff: globalPagato - globalDovuto
      });
      
      setMonthlyTotals(mTotals);
      setReportData(report);

    } catch (err) {
      console.error("Errore report:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
                  Nessun dato trovato per i docenti
                </td>
              </tr>
            ) : (
              reportData.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700">
                  <td className="p-4 text-left border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 transition-colors z-10 shadow-r-lg border-b border-gray-700">
                    {/* MODIFICA: Visualizza Cognome Nome */}
                    <div className="font-bold text-white text-base">{doc.cognome} {doc.nome}</div>
                    <div className="text-sm text-gray-400 font-normal mt-0.5">({doc.strumento || '-'})</div>
                  </td>
                  
                  {MESI.map(m => {
                    const data = doc.mesi[m.val] || { dovuto: 0, pagato: 0, diff: 0 };
                    const hasData = data.dovuto > 0 || data.pagato > 0;
                    return (
                      <td key={m.val} className="p-2 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700">
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
    </div>
  );
}