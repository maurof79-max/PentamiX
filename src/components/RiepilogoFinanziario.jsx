import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ClipboardList } from 'lucide-react';

const MESI = [
  { val: 0, label: 'ISCR' },
  { val: 9, label: 'SET' }, { val: 10, label: 'OTT' }, { val: 11, label: 'NOV' }, 
  { val: 12, label: 'DIC' }, { val: 1, label: 'GEN' }, { val: 2, label: 'FEB' }, 
  { val: 3, label: 'MAR' }, { val: 4, label: 'APR' }, { val: 5, label: 'MAG' }, 
  { val: 6, label: 'GIU' }, { val: 7, label: 'LUG' }
];

export default function RiepilogoFinanziario() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ dovuto: 0, pagato: 0, diff: 0 });
  const [monthlyTotals, setMonthlyTotals] = useState({});
  const [quotaIscrizione, setQuotaIscrizione] = useState(30);

  useEffect(() => {
    const init = async () => {
        // Fetch quota prima di tutto
        const { data } = await supabase.from('tipi_lezioni').select('costo').eq('tipo', 'Iscrizione').single();
        if (data) setQuotaIscrizione(data.costo);
        
        fetchReport(data ? data.costo : 30);
    };
    init();
  }, []);

  const fetchReport = async (quotaValue) => {
    setLoading(true);
    try {
      // 1. Fetch Docenti
      const { data: docenti } = await supabase
        .from('docenti')
        .select('id, nome, strumento')
        .eq('stato', 'Attivo')
        .order('nome');

      // 2. Fetch Pagamenti
      const { data: pagamenti } = await supabase
        .from('pagamenti')
        .select('docente_id, importo, mese_riferimento, tipologia');

      // 3. Fetch Registro Lezioni
      const { data: lezioni } = await supabase
        .from('registro')
        .select(`
          docente_id, 
          data_lezione, 
          tipi_lezioni ( costo )
        `);

      // 4. Fetch Associazioni (per conteggio iscritti)
      const { data: associazioni } = await supabase
        .from('associazioni')
        .select('docente_id');

      // --- ELABORAZIONE DATI ---
      const report = docenti.map(doc => {
        const row = {
          id: doc.id,
          nome: doc.nome,
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
            const costo = lez.tipi_lezioni?.costo || 0;
            if (report[idx].mesi[mese]) {
              report[idx].mesi[mese].dovuto += costo;
              report[idx].totale.dovuto += costo;
            }
          }
        });
      }

      // B. Calcola DOVUTO ISCRIZIONI (Base: Associazioni * Quota Dinamica)
      if (associazioni) {
        associazioni.forEach(assoc => {
            const idx = docIndex[assoc.docente_id];
            if (idx !== undefined) {
                // Per ogni alunno associato, aggiungiamo la quota al mese 0 (ISCR)
                if (report[idx].mesi[0]) {
                    report[idx].mesi[0].dovuto += quotaValue;
                    report[idx].totale.dovuto += quotaValue;
                }
            }
        });
      }

      // C. Calcola PAGATO
      if (pagamenti) {
        pagamenti.forEach(pay => {
          const idx = docIndex[pay.docente_id];
          if (idx !== undefined) {
            let mese = pay.mese_riferimento;
            if (pay.tipologia === 'Iscrizione') mese = 0;

            if (report[idx].mesi[mese]) {
              report[idx].mesi[mese].pagato += pay.importo;
              report[idx].totale.pagato += pay.importo;
            }
          }
        });
      }

      // D. Calcola Totali Globali e Mensili
      let globalDovuto = 0;
      let globalPagato = 0;
      const mTotals = {};
      
      MESI.forEach(m => {
        mTotals[m.val] = { dovuto: 0, pagato: 0, diff: 0 };
      });

      report.forEach(doc => {
        MESI.forEach(m => {
          doc.mesi[m.val].diff = doc.mesi[m.val].pagato - doc.mesi[m.val].dovuto;
          mTotals[m.val].dovuto += doc.mesi[m.val].dovuto;
          mTotals[m.val].pagato += doc.mesi[m.val].pagato;
          mTotals[m.val].diff += doc.mesi[m.val].diff;
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
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Elaborazione report finanziario...</div>;

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <ClipboardList className="text-accademia-red" size={20}/> 
            <h2 className="text-lg font-light text-white">Riepilogo Finanziario</h2>
        </div>

        {/* Totali Globali */}
        <div className="flex gap-4 text-xs">
            <div className="flex flex-col items-end">
                <span className="text-gray-500 uppercase font-bold tracking-wider">Dovuto</span>
                <span className="text-gray-300 font-mono text-base">€ {totals.dovuto.toLocaleString()}</span>
            </div>
            <div className="w-px bg-gray-600 h-8 self-center"></div>
            <div className="flex flex-col items-end">
                <span className="text-gray-500 uppercase font-bold tracking-wider">Pagato</span>
                <span className="text-green-400 font-mono text-base">€ {totals.pagato.toLocaleString()}</span>
            </div>
            <div className="w-px bg-gray-600 h-8 self-center"></div>
            <div className="flex flex-col items-end">
                <span className="text-gray-500 uppercase font-bold tracking-wider">Diff</span>
                <span className={`font-mono font-bold text-base ${totals.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    € {Math.abs(totals.diff).toLocaleString()}
                </span>
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
                                <div className="text-sm text-gray-400 font-medium">D: € {mt.dovuto}</div>
                                <div className="text-sm text-white font-bold">P: € {mt.pagato}</div>
                                <div className={`text-base font-extrabold border-t border-gray-600 w-full pt-1 mt-1 ${mt.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    € {Math.abs(mt.diff)}
                                </div>
                            </div>
                        </td>
                    );
                })}
                <td className="p-3 border-l border-gray-600 bg-gray-900/50 text-center border-b border-gray-600">
                    <span className={`text-base font-extrabold ${totals.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                       € {Math.abs(totals.diff)}
                    </span>
                </td>
            </tr>

            {/* RIGHE DOCENTI */}
            {reportData.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700">
                <td className="p-4 text-left border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 transition-colors z-10 shadow-r-lg border-b border-gray-700">
                  <div className="font-bold text-white text-base">{doc.nome}</div>
                  <div className="text-sm text-gray-400 font-normal mt-0.5">({doc.strumento || '-'})</div>
                </td>
                
                {MESI.map(m => {
                  const data = doc.mesi[m.val];
                  const hasData = data.dovuto > 0 || data.pagato > 0;
                  return (
                    <td key={m.val} className="p-2 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700">
                      {hasData ? (
                        <div className="flex flex-col items-center justify-center h-full gap-1">
                           <div className="text-sm text-gray-500 font-medium">
                                D: <span className="text-gray-300 font-mono text-sm">€ {data.dovuto}</span>
                           </div>
                           <div className="text-sm text-white font-bold">
                                P: <span className="text-white font-mono text-sm">€ {data.pagato}</span>
                           </div>
                           <div className={`w-full text-center border-t border-gray-700 pt-1 font-bold text-sm ${data.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                             € {Math.abs(data.diff)}
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
                    <div className="text-sm text-gray-400 font-medium">D: € {doc.totale.dovuto}</div>
                    <div className="text-sm text-white font-bold">P: € {doc.totale.pagato}</div>
                    <div className={`text-base font-extrabold border-t border-gray-600 w-full pt-1 mt-1 ${doc.totale.diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      € {Math.abs(doc.totale.diff)}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}