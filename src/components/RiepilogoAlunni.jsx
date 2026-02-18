import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Search, User, X, Tags, Euro, ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import { ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, getCurrentAcademicYear } from '../utils/constants';
import { calcolaScontiPacchetti } from '../utils/financeManager'; 
import ModalPagamento from './modals/ModalPagamento';

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

  const [expandedRows, setExpandedRows] = useState({});

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState(null); 

  const [showPayModal, setShowPayModal] = useState(false);
  const [payFormData, setPayFormData] = useState(null);

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
      let alunniQuery = supabase.from('alunni').select('id, nome, cognome, school_id').eq('stato', 'Attivo');
      if (user.school_id) alunniQuery = alunniQuery.eq('school_id', user.school_id);
      const { data: alunniData, error: alunniError } = await alunniQuery;
      if (alunniError) throw alunniError;

      const { data: docentiData } = await supabase.from('docenti').select('id, nome, cognome');
      const docentiMap = {};
      if (docentiData) docentiData.forEach(d => docentiMap[d.id] = `${d.cognome} ${d.nome}`);

      const [startYear, endYear] = filterAnno.split('/').map(Number);
      const startDateBuffer = `${startYear}-08-24`; 
      const endDateBuffer = `${endYear}-09-07`;

      const { data: lezioniData, error: lezioniError } = await supabase
        .from('registro')
        .select(`id, alunno_id, docente_id, data_lezione, importo_saldato, tipi_lezioni (tipo), school_id`) 
        .gte('data_lezione', startDateBuffer)
        .lte('data_lezione', endDateBuffer);
      if (lezioniError) throw lezioniError;

      let tariffeQuery = supabase.from('tariffe').select('tipo_lezione, costo').eq('anno_accademico', filterAnno);
      if (user.school_id) tariffeQuery = tariffeQuery.eq('school_id', user.school_id);
      const { data: tariffeData } = await tariffeQuery;
      const prezziMap = {};
      if (tariffeData) tariffeData.forEach(t => prezziMap[t.tipo_lezione] = t.costo);

      let pacchettiQuery = supabase.from('tariffe_pacchetti').select('*').eq('anno_accademico', filterAnno);
      if (user.school_id) pacchettiQuery = pacchettiQuery.eq('school_id', user.school_id);
      const { data: pacchettiData } = await pacchettiQuery;

      const { data: pagamentiData } = await supabase
        .from('pagamenti')
        .select('id, alunno_id, importo, tipologia')
        .eq('anno_accademico', filterAnno);

      let dettagliPagamentoData = [];
      if (pagamentiData && pagamentiData.length > 0) {
        const paymentIds = pagamentiData.map(p => p.id);
        const { data: dettagliData } = await supabase
          .from('dettagli_pagamento')
          .select('pagamento_id, registro_id, importo_coperto')
          .in('pagamento_id', paymentIds);
        dettagliPagamentoData = dettagliData || [];
      }

      const { data: quoteData } = await supabase
        .from('anni_accademici')
        .select('quota_iscrizione, school_id')
        .eq('anno', filterAnno);
      
      const iscrizioneFeeMap = (quoteData || []).reduce((acc, q) => {
        acc[q.school_id] = q.quota_iscrizione;
        return acc;
      }, {});

      const eventiElaborati = calcolaScontiPacchetti(lezioniData || [], pacchettiData || []);

      const riepilogo = alunniData.map(alunno => {
        const quotaDovuta = iscrizioneFeeMap[alunno.school_id] || 0;
        const riepilogoAlunno = {
          ...alunno,
          iscrizione: { dovuto: quotaDovuta, pagato: 0 },
          mesi: {},
          totale: { dovuto: quotaDovuta, pagato: 0 },
          docenti: {} 
        };
        MESI_COLONNE.forEach(m => { riepilogoAlunno.mesi[m.val] = { dovuto: 0, pagato: 0 }; });
        return riepilogoAlunno;
      });

      const riepilogoMap = {};
      riepilogo.forEach(r => riepilogoMap[r.id] = r);

      eventiElaborati.forEach(evento => {
          const alunnoTarget = riepilogoMap[evento.alunno_id];
          if (!alunnoTarget) return;

          const mese = new Date(evento.data_lezione).getMonth() + 1;
          const docenteId = evento.is_virtual ? 'sconti' : (evento.docente_id || 'sconosciuto');
          
          if (!alunnoTarget.docenti[docenteId]) {
              alunnoTarget.docenti[docenteId] = {
                  id: docenteId,
                  nome: docenteId === 'sconti' ? 'Sconti Applicati' : (docentiMap[docenteId] || 'Docente Rimosso'),
                  mesi: {},
                  totale: { dovuto: 0, pagato: 0 }
              };
              MESI_COLONNE.forEach(m => { alunnoTarget.docenti[docenteId].mesi[m.val] = { dovuto: 0, pagato: 0 }; });
          }

          let importoEvento = 0;
          if (evento.is_virtual) {
              importoEvento = evento.costo_calcolato; 
          } else {
              const tipo = evento.tipi_lezioni?.tipo;
              importoEvento = prezziMap[tipo] || 0; 
          }

          if (alunnoTarget.mesi[mese]) {
              alunnoTarget.mesi[mese].dovuto += importoEvento;
              alunnoTarget.totale.dovuto += importoEvento;
          }

          if (alunnoTarget.docenti[docenteId].mesi[mese]) {
              alunnoTarget.docenti[docenteId].mesi[mese].dovuto += importoEvento;
              alunnoTarget.docenti[docenteId].totale.dovuto += importoEvento;
          }
      });

      const lezioniMap = (lezioniData || []).reduce((acc, l) => { acc[l.id] = l; return acc; }, {});

      if (pagamentiData) {
        pagamentiData.forEach(pagamento => {
            const alunnoTarget = riepilogoMap[pagamento.alunno_id];
            if (!alunnoTarget) return;

            alunnoTarget.totale.pagato += pagamento.importo;
            if (pagamento.tipologia && pagamento.tipologia.toLowerCase().includes('iscrizione')) {
                alunnoTarget.iscrizione.pagato += pagamento.importo;
            }
        });
      }

      dettagliPagamentoData.forEach(dettaglio => {
          const lezione = lezioniMap[dettaglio.registro_id];
          if (lezione) {
              const alunnoTarget = riepilogoMap[lezione.alunno_id];
              const docenteId = lezione.docente_id;
              
              if (alunnoTarget) {
                  const mese = new Date(lezione.data_lezione).getMonth() + 1;
                  
                  if (alunnoTarget.mesi[mese]) {
                      alunnoTarget.mesi[mese].pagato += dettaglio.importo_coperto;
                  }
                  
                  if (docenteId && alunnoTarget.docenti[docenteId] && alunnoTarget.docenti[docenteId].mesi[mese]) {
                      alunnoTarget.docenti[docenteId].mesi[mese].pagato += dettaglio.importo_coperto;
                      alunnoTarget.docenti[docenteId].totale.pagato += dettaglio.importo_coperto;
                  }
              }
          }
      });
      
      setAlunni(riepilogo.sort((a,b) => (a.cognome || '').localeCompare(b.cognome || '')));

    } catch (error) {
      console.error("Error fetching riepilogo data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (alunnoId) => {
      setExpandedRows(prev => ({ ...prev, [alunnoId]: !prev[alunnoId] }));
  };

  const handleCellClick = async (alunnoId, mese, tipo, docenteId = null) => {
    setDetailData(null); 
    setShowDetailModal(true);
    
    try {
      let items = [];
      const [startYear, endYear] = filterAnno.split('/').map(Number);
      const yearTarget = mese >= 9 ? startYear : endYear;
      
      const firstDayOfMonth = new Date(yearTarget, mese - 1, 1);
      const lastDayOfMonth = new Date(yearTarget, mese, 0);

      const bufferStart = new Date(firstDayOfMonth);
      bufferStart.setDate(bufferStart.getDate() - 10);
      const startDateStr = bufferStart.toISOString().split('T')[0];

      const bufferEnd = new Date(lastDayOfMonth);
      bufferEnd.setDate(bufferEnd.getDate() + 10);
      const endDateStr = bufferEnd.toISOString().split('T')[0];
      
      const meseLabel = mese === 0 ? 'Iscrizione' : MESI_COLONNE.find(m => m.val === mese)?.label || 'Mese';
      const title = tipo === 'dovuto' ? `Dettaglio Dovuto - ${meseLabel}` : `Dettaglio Pagato - ${meseLabel}`;

      if (tipo === 'dovuto') {
        if (mese === 0) {
            const alunno = alunni.find(a => a.id === alunnoId);
            items = [{ data: '-', desc: 'Quota Iscrizione', importo: alunno.iscrizione.dovuto }];
        } else {
            const { data: tData } = await supabase.from('tariffe').select('tipo_lezione, costo').eq('anno_accademico', filterAnno);
            const mapCosti = {}; tData?.forEach(t => mapCosti[t.tipo_lezione] = t.costo);

            const { data: lezRaw } = await supabase.from('registro')
                .select(`id, alunno_id, docente_id, data_lezione, tipi_lezioni(tipo), school_id`)
                .eq('alunno_id', alunnoId)
                .gte('data_lezione', startDateStr)
                .lte('data_lezione', endDateStr)
                .order('data_lezione');

            const { data: pacchettiRules } = await supabase.from('tariffe_pacchetti').select('*').eq('anno_accademico', filterAnno);
            const processed = calcolaScontiPacchetti(lezRaw || [], pacchettiRules || []);

            items = processed
                .filter(item => {
                    const itemMonth = new Date(item.data_lezione).getMonth() + 1;
                    if (itemMonth !== mese) return false;
                    
                    if (docenteId) {
                        if (docenteId === 'sconti') {
                            return item.is_virtual === true || !item.docente_id;
                        } else {
                            return item.docente_id === docenteId;
                        }
                    }
                    return true;
                })
                .map(l => {
                    if (l.is_virtual) {
                        return {
                            data: new Date(l.data_lezione).toLocaleDateString('it-IT'),
                            desc: l.descrizione_sconto,
                            note: l.dettaglio_settimana,
                            importo: l.costo_calcolato, 
                            is_discount: true
                        };
                    } else {
                        return {
                            data: new Date(l.data_lezione).toLocaleDateString('it-IT'),
                            desc: l.tipi_lezioni?.tipo || 'Lezione',
                            importo: mapCosti[l.tipi_lezioni?.tipo] || 0
                        };
                    }
                });
        }
      } else {
        // CASO PAGATO
        if (mese === 0) {
          const { data: pays } = await supabase.from('pagamenti').select('data_pagamento, importo, metodo_pagamento, note').eq('alunno_id', alunnoId).eq('anno_accademico', filterAnno).eq('tipologia', 'Iscrizione');
          items = (pays || []).map(p => ({ data: new Date(p.data_pagamento).toLocaleDateString('it-IT'), desc: `Iscrizione (${p.metodo_pagamento})`, note: p.note, importo: p.importo }));
        } else {
            if (docenteId === 'sconti') {
                items = [];
            } else {
                const exactStart = firstDayOfMonth.toISOString().split('T')[0];
                const exactEnd = lastDayOfMonth.toISOString().split('T')[0];

                let lezQuery = supabase.from('registro').select('id').eq('alunno_id', alunnoId).gte('data_lezione', exactStart).lte('data_lezione', exactEnd);
                if (docenteId) lezQuery = lezQuery.eq('docente_id', docenteId);
                
                const { data: lezIds } = await lezQuery;
                const ids = lezIds?.map(l => l.id) || [];
                
                if (ids.length > 0) {
                    // Modifica della Query: Ora prendiamo anche i dati della singola lezione coperta!
                    const { data: det } = await supabase
                        .from('dettagli_pagamento')
                        .select(`
                            importo_coperto, 
                            pagamenti(data_pagamento, metodo_pagamento, tipologia, note),
                            registro(data_lezione, tipi_lezioni(tipo))
                        `)
                        .in('registro_id', ids);

                    items = (det || []).map(d => {
                        const datePagamento = new Date(d.pagamenti.data_pagamento).toLocaleDateString('it-IT');
                        const dataLezione = d.registro?.data_lezione ? new Date(d.registro.data_lezione).toLocaleDateString('it-IT') : 'N/D';
                        const tipoLezione = d.registro?.tipi_lezioni?.tipo || 'Lezione';
                        
                        return { 
                            data: datePagamento, 
                            desc: `${d.pagamenti.tipologia} (${d.pagamenti.metodo_pagamento})`, 
                            // Nota personalizzata con dettaglio della lezione saldata
                            note: `Copre lez. del ${dataLezione} (${tipoLezione})${d.pagamenti.note ? ' - ' + d.pagamenti.note : ''}`, 
                            importo: d.importo_coperto 
                        };
                    });
                }
            }
        }
      }
      setDetailData({ title, items, modalType: tipo });
    } catch (e) {
      console.error("Errore dettaglio cella:", e);
      setDetailData({ title: 'Errore', items: [], modalType: tipo });
    }
  };

  const handleOpenPaymentModal = (alunnoId) => {
    setPayFormData({ alunno_id: alunnoId });
    setShowPayModal(true);
  };

  const renderCellContent = (cell, alunnoId, meseVal, isIscrizione = false, docenteId = null) => {
    const diff = cell.pagato - cell.dovuto;
    const hasData = isIscrizione 
        ? cell.dovuto > 0 || cell.pagato > 0
        : Math.abs(cell.dovuto) > 0.01 || cell.pagato > 0;

    if (!hasData) {
        return <div className="h-full flex items-center justify-center opacity-10 text-gray-600">-</div>;
    }

    const interactiveClass = "cursor-pointer hover:bg-white/10 transition-colors rounded px-1 flex justify-between w-full";

    return (
      <div className="flex flex-col items-center justify-center h-full gap-0.5 text-[11px] whitespace-nowrap w-full">
         <div 
             className={`text-gray-400 font-medium ${interactiveClass}`}
             onClick={() => handleCellClick(alunnoId, meseVal, 'dovuto', docenteId)}
         >
              <span>D:</span> <span className="text-gray-300 font-mono">€ {formatAmount(cell.dovuto)}</span>
         </div>
         <div 
             className={`text-white font-bold ${interactiveClass}`}
             onClick={() => handleCellClick(alunnoId, meseVal, 'pagato', docenteId)}
         >
              <span>P:</span> <span className="font-mono">€ {formatAmount(cell.pagato)}</span>
         </div>
         <div className={`w-full text-center border-t border-gray-700 pt-0.5 mt-0.5 font-bold ${diff >= -0.01 ? 'text-green-500' : 'text-red-500'}`}>
           € {formatAmount(Math.abs(diff))}
         </div>
      </div>
    );
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
              <th className="p-3 text-left w-60 border-r border-red-800 sticky left-0 bg-accademia-red z-40 shadow-r-lg text-sm border-b border-red-800">Alunno</th>
              <th className="p-2 min-w-[75px] border-r border-red-800 text-center text-[11px] border-b border-red-800">ISCR.</th>
              {MESI_COLONNE.map(m => <th key={m.val} className="p-2 min-w-[75px] border-r border-red-800 text-center text-[11px] border-b border-red-800">{m.label}</th>)}
              <th className="p-2 w-28 border-l border-red-800 bg-red-900 text-center text-[11px] border-b border-red-800">TOTALE</th>
              <th className="p-2 w-12 border-l border-red-800 bg-red-900 text-center text-[11px] border-b border-red-800">REG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 text-sm">
            {loading ? (
                <tr><td colSpan={15} className="p-8 text-center text-gray-500">Caricamento in corso...</td></tr>
            ) : (
              filteredAlunni.map(alunno => {
                const totaleDiff = alunno.totale.pagato - alunno.totale.dovuto;
                const hasDocenti = Object.keys(alunno.docenti).length > 0;
                const isExpanded = expandedRows[alunno.id];

                return (
                  <Fragment key={alunno.id}>
                    {/* RIGA PRINCIPALE ALUNNO */}
                    <tr className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700 relative z-20 bg-accademia-card">
                        <td className="p-0 border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 transition-colors z-20 shadow-r-lg">
                            <div 
                                className={`flex items-center h-16 px-2 w-full ${hasDocenti ? 'cursor-pointer' : ''}`}
                                onClick={() => hasDocenti && toggleRow(alunno.id)}
                            >
                                {hasDocenti && (
                                    <button className="mr-2 p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                )}
                                <span className="font-bold text-white text-[13px] truncate" title={`${alunno.cognome} ${alunno.nome}`}>{alunno.cognome} {alunno.nome}</span>
                            </div>
                        </td>
                        
                        {/* ISCRIZIONE */}
                        <td className="p-1 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700">
                            {renderCellContent(alunno.iscrizione, alunno.id, 0, true)}
                        </td>

                        {/* MESI */}
                        {MESI_COLONNE.map(m => (
                            <td key={m.val} className="p-1 border-r border-gray-700 align-middle h-16 bg-transparent relative border-b border-gray-700">
                            {renderCellContent(alunno.mesi[m.val] || { dovuto: 0, pagato: 0 }, alunno.id, m.val, false)}
                            </td>
                        ))}

                        {/* TOTALE */}
                        <td className="p-2 bg-gray-900/40 border-l border-gray-700 font-mono align-middle text-center border-b border-gray-700">
                            <div className="flex flex-col gap-0.5 items-center text-[11px] whitespace-nowrap">
                                <div className="text-gray-400 font-medium">D: € {formatAmount(alunno.totale.dovuto)}</div>
                                <div className="text-white font-bold">P: € {formatAmount(alunno.totale.pagato)}</div>
                                <div className={`font-extrabold border-t border-gray-600 w-full pt-0.5 mt-0.5 ${totaleDiff >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>
                                € {formatAmount(Math.abs(totaleDiff))}
                                </div>
                            </div>
                        </td>
                        
                        {/* REGISTRA PAGAMENTO */}
                        <td className="p-1 border-l border-gray-700 bg-gray-900/40 text-center align-middle border-b border-gray-700">
                            <button 
                                onClick={() => handleOpenPaymentModal(alunno.id)} 
                                className="p-1.5 bg-gray-800 hover:bg-accademia-red text-gray-300 rounded-full shadow-sm transition-colors"
                                title="Registra Pagamento"
                            >
                                <Euro size={14} />
                            </button>
                        </td>
                    </tr>

                    {/* SOTTO-RIGHE PER DOCENTE/SCONTI */}
                    {isExpanded && Object.values(alunno.docenti).map(doc => {
                        const isSconto = doc.id === 'sconti';
                        const totaleDiffDoc = doc.totale.pagato - doc.totale.dovuto;

                        return (
                            <tr key={`${alunno.id}-${doc.id}`} className="bg-gray-800/40 border-b border-gray-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                <td className="p-0 border-r border-gray-700/50 sticky left-0 bg-gray-900/90 z-10 h-16 shadow-r-lg">
                                    <div className="flex items-center px-2 pl-10 text-xs text-gray-400 truncate w-full" title={doc.nome}>
                                        {isSconto ? <Tags size={12} className="mr-2 text-green-500/70" /> : <ArrowRight size={12} className="mr-2" />}
                                        <span className={isSconto ? "text-green-500/70 font-medium" : "italic"}>{doc.nome}</span>
                                    </div>
                                </td>
                                
                                {/* Iscrizione è vuota per i docenti */}
                                <td className="p-1 border-r border-gray-700/50 align-middle h-16 bg-transparent relative border-b border-gray-700/50">
                                    <div className="h-full flex items-center justify-center opacity-10 text-gray-600">-</div>
                                </td>

                                {/* MESI DOCENTE */}
                                {MESI_COLONNE.map(m => (
                                    <td key={m.val} className={`p-1 border-r border-gray-700/50 align-middle h-16 bg-transparent relative border-b border-gray-700/50 ${isSconto ? 'bg-green-900/5' : ''}`}>
                                        {renderCellContent(doc.mesi[m.val] || { dovuto: 0, pagato: 0 }, alunno.id, m.val, false, doc.id)}
                                    </td>
                                ))}

                                {/* TOTALE DOCENTE */}
                                <td className="p-2 border-l border-gray-700/50 bg-gray-900/20 font-mono align-middle text-center h-16 border-b border-gray-700/50">
                                    <div className="flex flex-col gap-0.5 items-center text-[11px] whitespace-nowrap opacity-80">
                                        <div className="text-gray-400 font-medium">D: € {formatAmount(doc.totale.dovuto)}</div>
                                        <div className="text-white font-bold">P: € {formatAmount(doc.totale.pagato)}</div>
                                        <div className={`font-extrabold border-t border-gray-600/50 w-full pt-0.5 mt-0.5 ${totaleDiffDoc >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>
                                            € {formatAmount(Math.abs(totaleDiffDoc))}
                                        </div>
                                    </div>
                                </td>
                                
                                <td className="p-1 border-l border-gray-700/50 bg-gray-900/20 text-center align-middle border-b border-gray-700/50"></td>
                            </tr>
                        );
                    })}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showDetailModal && <ModalDettaglioCella data={detailData} onClose={() => setShowDetailModal(false)} />}
      
      {showPayModal && (
          <ModalPagamento 
              item={payFormData} 
              alunni={alunni} 
              user={user} 
              annoCorrente={filterAnno} 
              onClose={() => setShowPayModal(false)} 
              onSave={() => { setShowPayModal(false); fetchRiepilogoData(); }} 
          />
      )}
    </div>
  );
}

function ModalDettaglioCella({ data, onClose }) {
    const isPagamento = data?.modalType === 'pagato';
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className={`px-4 py-3 border-b border-gray-700 flex justify-between items-center ${isPagamento ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isPagamento ? 'text-green-400' : 'text-red-300'}`}>{data ? data.title : 'Dettaglio'}</h3>
                    <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white"/></button>
                </div>
                <div className="p-0 max-h-80 overflow-y-auto custom-scrollbar">
                    {!data ? <div className="p-4 text-center text-gray-500 text-sm">Caricamento...</div> : data.items.length === 0 ? <div className="p-4 text-center text-gray-500 text-sm italic">Nessun dato trovato.</div> : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-800 text-gray-400 text-[10px] uppercase"><tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Descrizione</th><th className="px-4 py-2 text-right">€</th></tr></thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.items.map((item, idx) => (
                                    <tr key={idx} className={`hover:bg-gray-800/30 transition-colors ${item.is_discount ? 'bg-green-900/10' : ''}`}>
                                        <td className="px-4 py-2 text-gray-400 text-xs font-mono">{item.data}</td>
                                        <td className="px-4 py-2 text-white font-medium text-xs">
                                            {item.is_discount && <Tags size={10} className="inline mr-1 text-green-500"/>}
                                            {item.desc}
                                            {item.note && <div className="text-[10px] text-gray-400 italic truncate max-w-[200px] mt-0.5">{item.note}</div>}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-mono font-bold ${isPagamento ? 'text-green-400' : item.is_discount ? 'text-green-400' : 'text-red-400'}`}>
                                            {item.is_discount ? '' : '€ '}{item.importo}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-3 border-t border-gray-700 bg-gray-900/30 flex justify-end">
                     <button onClick={onClose} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors">Chiudi</button>
                </div>
            </div>
        </div>,
        document.body
    );
}