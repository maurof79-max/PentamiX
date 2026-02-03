import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Search, User } from 'lucide-react';
import { ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, getCurrentAcademicYear } from '../utils/constants';

const MESI_COLONNE = [
  { label: 'SET', val: 9 }, { label: 'OTT', val: 10 }, { label: 'NOV', val: 11 }, 
  { label: 'DIC', val: 12 }, { label: 'GEN', val: 1 }, { label: 'FEB', val: 2 }, 
  { label: 'MAR', val: 3 }, { label: 'APR', val: 4 }, { label: 'MAG', val: 5 }, 
  { label: 'GIU', val: 6 }, { label: 'LUG', val: 7 }
];

export default function RiepilogoAlunni({ user }) {
  const [alunni, setAlunni] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAnno, setFilterAnno] = useState(getCurrentAcademicYear());

  // Funzione helper per formattare i numeri con il punto delle migliaia (Locale IT)
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0';
    return amount.toLocaleString('it-IT', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  useEffect(() => {
    fetchRiepilogoData();
  }, [filterAnno, user]);

  const fetchRiepilogoData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Get all active students
      let alunniQuery = supabase.from('alunni').select('id, nome, cognome, school_id').eq('stato', 'Attivo');
      if (user.school_id) {
        alunniQuery = alunniQuery.eq('school_id', user.school_id);
      }
      const { data: alunniData, error: alunniError } = await alunniQuery;
      if (alunniError) throw alunniError;

      // 2. Get all lessons (Recuperiamo il NOME del tipo lezione)
      // Nota: 'tipi_lezioni(tipo)' prende il nome (es. "Pianoforte") dalla tabella relazionata
      const { data: lezioniData, error: lezioniError } = await supabase
        .from('registro')
        .select('id, alunno_id, data_lezione, tipi_lezioni(tipo)') 
        .eq('anno_accademico', filterAnno);
      if (lezioniError) throw lezioniError;

      // 3. Get Tariffe
      // Recuperiamo le tariffe basate sul NOME della lezione (come visto in GestioneTariffe.jsx)
      let tariffeQuery = supabase
        .from('tariffe')
        .select('tipo_lezione, costo')
        .eq('anno_accademico', filterAnno);
      
      if (user.school_id) {
        tariffeQuery = tariffeQuery.eq('school_id', user.school_id);
      }

      const { data: tariffeData, error: tariffeError } = await tariffeQuery;
      if (tariffeError) throw tariffeError;

      // Mappa Prezzi: { "Pianoforte": 25.00, "Violino": 30.00 }
      const prezziMap = {};
      if (tariffeData) {
        tariffeData.forEach(t => {
            prezziMap[t.tipo_lezione] = t.costo; 
        });
      }

      // 4. Get all payments and their details
      const { data: pagamentiData, error: pagamentiError } = await supabase
        .from('pagamenti')
        .select('id, alunno_id, importo, tipologia')
        .eq('anno_accademico', filterAnno);
      if (pagamentiError) throw pagamentiError;

      let dettagliPagamentoData = [];
      if (pagamentiData && pagamentiData.length > 0) {
        const paymentIds = pagamentiData.map(p => p.id);
        const { data: dettagliData, error: dettagliError } = await supabase
          .from('dettagli_pagamento')
          .select('pagamento_id, registro_id, importo_coperto')
          .in('pagamento_id', paymentIds);
        if (dettagliError) throw dettagliError;
        dettagliPagamentoData = dettagliData;
      }

      // 5. Get registration fees
      const { data: quoteData, error: quoteError } = await supabase
        .from('anni_accademici')
        .select('quota_iscrizione, school_id')
        .eq('anno', filterAnno);
      if (quoteError) throw quoteError;

      const iscrizioneFeeMap = (quoteData || []).reduce((acc, q) => {
        acc[q.school_id] = q.quota_iscrizione;
        return acc;
      }, {});
      
      // Create a map for quick lesson lookup
      const lezioniMap = (lezioniData || []).reduce((acc, lez) => {
        acc[lez.id] = lez;
        return acc;
      }, {});

      // 6. Process data
      const riepilogo = alunniData.map(alunno => {
        const quotaDovuta = iscrizioneFeeMap[alunno.school_id] || 0;
        
        const riepilogoAlunno = {
          ...alunno,
          iscrizione: { dovuto: quotaDovuta, pagato: 0 },
          mesi: {},
          totale: { dovuto: quotaDovuta, pagato: 0 }
        };

        // Initialize months
        MESI_COLONNE.forEach(m => {
          riepilogoAlunno.mesi[m.val] = { dovuto: 0, pagato: 0 };
        });

        // Get all lessons and payments for the current student
        const alunnoLezioni = lezioniData.filter(l => l.alunno_id === alunno.id);
        const alunnoPagamenti = pagamentiData.filter(p => p.alunno_id === alunno.id);
        
        // A. Calculate 'dovuto' from lessons
        alunnoLezioni.forEach(lezione => {
            const mese = new Date(lezione.data_lezione).getMonth() + 1;
            const nomeLezione = lezione.tipi_lezioni?.tipo; 
            const costo = prezziMap[nomeLezione] || 0;

            if (riepilogoAlunno.mesi[mese]) {
              riepilogoAlunno.mesi[mese].dovuto += costo;
              riepilogoAlunno.totale.dovuto += costo;
            }
        });
        
        // B. Calculate total 'pagato' (for the grand total) and for 'iscrizione'
        alunnoPagamenti.forEach(pagamento => {
            riepilogoAlunno.totale.pagato += pagamento.importo;
            if (pagamento.tipologia && pagamento.tipologia.toLowerCase().includes('iscrizione')) {
                riepilogoAlunno.iscrizione.pagato += pagamento.importo;
            }
        });

        // C. Distribute 'pagato' for lessons across months using details
        // We filter details related to the current student's payments
        const alunnoPaymentIds = alunnoPagamenti.map(p => p.id);
        dettagliPagamentoData
          .filter(d => alunnoPaymentIds.includes(d.pagamento_id))
          .forEach(dettaglio => {
            const lezione = lezioniMap[dettaglio.registro_id];
            // Ensure the lesson exists and belongs to the current student
            if (lezione && lezione.alunno_id === alunno.id) {
              const mese = new Date(lezione.data_lezione).getMonth() + 1;
              if (riepilogoAlunno.mesi[mese]) {
                riepilogoAlunno.mesi[mese].pagato += dettaglio.importo_coperto;
              }
            }
          });

        return riepilogoAlunno;
      });
      
      setAlunni(riepilogo.sort((a,b) => (a.cognome || '').localeCompare(b.cognome || '')));

    } catch (error) {
      console.error("Error fetching riepilogo data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAlunni = alunni.filter(a =>
    `${a.cognome} ${a.nome}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <User className="text-accademia-red" size={20}/> 
            <h2 className="text-lg font-light text-white">Riepilogo Alunni</h2>
        </div>

        <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1 border border-gray-600">
                <Search size={14} className="text-gray-400"/>
                <input 
                    type="text" 
                    placeholder="Cerca alunno..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="bg-transparent text-white text-sm focus:outline-none w-32"
                />
            </div>

            {/* Selettore Anno Accademico */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1 border border-gray-600">
                <select 
                    value={filterAnno}
                    onChange={e => setFilterAnno(e.target.value)}
                    className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
                >
                    {ANNI_ACCADEMICI.map(anno => (
                        <option key={anno} value={anno} className="bg-gray-800 text-white">{anno}</option>
                    ))}
                </select>
            </div>
        </div>
      </div>

      {/* Tabella Scrollabile */}
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        <table className="w-full text-right text-sm border-collapse">
          <thead className="bg-accademia-red text-white sticky top-0 z-30 shadow-md uppercase tracking-wider font-bold">
            <tr>
              <th className="p-3 text-left w-56 border-r border-red-800 sticky left-0 bg-accademia-red z-40 shadow-r-lg text-sm border-b border-red-800">Alunno</th>
              <th className="p-2 min-w-[90px] border-r border-red-800 text-center text-sm border-b border-red-800">Iscrizione</th>
              {MESI_COLONNE.map(m => <th key={m.val} className="p-2 min-w-[90px] border-r border-red-800 text-center text-sm border-b border-red-800">{m.label}</th>)}
              <th className="p-3 w-32 border-l-2 border-red-800 bg-red-900 text-center text-sm border-b border-red-800">TOTALE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 text-sm">
            {loading ? (
                <tr><td colSpan={14} className="p-8 text-center text-gray-500">Caricamento in corso...</td></tr>
            ) : (
              filteredAlunni.map(alunno => {
                const iscrizioneDiff = alunno.iscrizione.pagato - alunno.iscrizione.dovuto;
                const totaleDiff = alunno.totale.pagato - alunno.totale.dovuto;
                const hasIscrizioneData = alunno.iscrizione.dovuto > 0 || alunno.iscrizione.pagato > 0;

                return (
                  <tr key={alunno.id} className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700">
                    <td className="p-3 text-left border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 transition-colors z-10 shadow-r-lg border-b border-gray-700">
                      <div className="font-bold text-white text-sm">{alunno.cognome} {alunno.nome}</div>
                    </td>
                    
                    {/* ISCRIZIONE */}
                    <td className="p-2 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700">
                      {hasIscrizioneData ? (
                        <div className="flex flex-col items-center justify-center h-full gap-0.5 text-xs">
                           <div className="text-gray-400 font-medium">
                                D: <span className="text-gray-300 font-mono">€ {formatAmount(alunno.iscrizione.dovuto)}</span>
                           </div>
                           <div className="text-white font-bold">
                                P: <span className="font-mono">€ {formatAmount(alunno.iscrizione.pagato)}</span>
                           </div>
                           <div className={`w-full text-center border-t border-gray-700 pt-0.5 mt-0.5 font-bold ${iscrizioneDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                             € {formatAmount(Math.abs(iscrizioneDiff))}
                           </div>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center opacity-10 text-gray-600">-</div>
                      )}
                    </td>

                    {/* MESI */}
                    {MESI_COLONNE.map(m => {
                      const meseData = alunno.mesi[m.val] || { dovuto: 0, pagato: 0 };
                      const meseDiff = meseData.pagato - meseData.dovuto;
                      const hasData = meseData.dovuto > 0 || meseData.pagato > 0;
                      return (
                        <td key={m.val} className="p-2 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700">
                           {hasData ? (
                            <div className="flex flex-col items-center justify-center h-full gap-0.5 text-xs">
                               <div className="text-gray-400 font-medium">
                                    D: <span className="text-gray-300 font-mono">€ {formatAmount(meseData.dovuto)}</span>
                               </div>
                               <div className="text-white font-bold">
                                    P: <span className="font-mono">€ {formatAmount(meseData.pagato)}</span>
                               </div>
                               <div className={`w-full text-center border-t border-gray-700 pt-0.5 mt-0.5 font-bold ${meseDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                 € {formatAmount(Math.abs(meseDiff))}
                               </div>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center opacity-10 text-gray-600">-</div>
                          )}
                        </td>
                      );
                    })}

                    {/* TOTALE */}
                    <td className="p-3 bg-gray-900/40 border-l-2 border-gray-700 font-mono align-middle text-center border-b border-gray-700">
                      <div className="flex flex-col gap-1 items-center">
                        <div className="text-xs text-gray-400 font-medium">D: € {formatAmount(alunno.totale.dovuto)}</div>
                        <div className="text-xs text-white font-bold">P: € {formatAmount(alunno.totale.pagato)}</div>
                        <div className={`text-sm font-extrabold border-t border-gray-600 w-full pt-1 mt-1 ${totaleDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          € {formatAmount(Math.abs(totaleDiff))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}