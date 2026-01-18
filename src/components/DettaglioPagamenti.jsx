import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Users, X, Euro, Filter, ChevronRight, ChevronDown } from 'lucide-react';
import ModalPagamento from './modals/ModalPagamento'; 
import { MESI_COMPLETE as MESI, ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, getCurrentAcademicYear } from '../utils/constants';

export default function DettaglioPagamenti({ user }) {
  const [docenti, setDocenti] = useState([]);
  const [selectedDocenteId, setSelectedDocenteId] = useState('');
  const [selectedAnno, setSelectedAnno] = useState(getCurrentAcademicYear());
  
  const [alunniList, setAlunniList] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [matrix, setMatrix] = useState([]);
  const [quotaIscrizione, setQuotaIscrizione] = useState(0);
  
  const [expandedRows, setExpandedRows] = useState({});
  const [showPayModal, setShowPayModal] = useState(false);
  const [payFormData, setPayFormData] = useState(null); 
  
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState(null); 

  const COLONNE_RENDER = [
      { val: 0, label: 'ISCRIZIONE' },
      ...MESI.filter(m => m.val !== 0) 
  ];

  // 1. Caricamento Iniziale
  useEffect(() => {
    const initData = async () => {
      // Docenti
      let qDoc = supabase.from('docenti').select('id, nome, cognome, school_id, strumento').eq('stato', 'Attivo').order('cognome');
      if (user?.school_id) qDoc = qDoc.eq('school_id', user.school_id);
      
      const { data: doc } = await qDoc;
      if (doc) {
          setDocenti(doc.map(d => ({
              ...d,
              nome_completo: `${d.cognome} ${d.nome} (${d.strumento || '-'})`
          })));
      }

      // Alunni
      let qAlu = supabase.from('alunni').select('id, nome, cognome, school_id').eq('stato', 'Attivo');
      if (user?.school_id) qAlu = qAlu.eq('school_id', user.school_id);
      const { data: alu } = await qAlu;
      if (alu) {
          setAlunniList(alu.sort((a,b) => (a.cognome || '').localeCompare(b.cognome || '')));
      }
    };
    initData();
  }, [user]);

  // 2. Logica Principale (Matrice)
  useEffect(() => {
    if (selectedDocenteId) {
        loadDettagli();
        setExpandedRows({});
    } else {
        setMatrix([]);
    }
  }, [selectedDocenteId, selectedAnno]);

  const loadDettagli = async () => {
    setLoading(true);
    try {
      const [startYear, endYear] = selectedAnno.split('/').map(Number);
      const startDate = `${startYear}-09-01`;
      const endDate = `${endYear}-08-31`;

      // A. Quota Iscrizione
      const { data: docenteInfo } = await supabase.from('docenti').select('school_id').eq('id', selectedDocenteId).single();
      const schoolIdTarget = docenteInfo?.school_id || user?.school_id;

      let qQuota = supabase.from('anni_accademici').select('quota_iscrizione').eq('anno', selectedAnno);
      if (schoolIdTarget) qQuota = qQuota.eq('school_id', schoolIdTarget);
      
      const { data: annoData } = await qQuota.limit(1).maybeSingle();
      const currentQuota = annoData?.quota_iscrizione || 0;
      setQuotaIscrizione(currentQuota);

      // B. Struttura Dati
      const alunniMap = {};
      const createEmptyMonths = () => {
          const m = {};
          COLONNE_RENDER.forEach(col => m[col.val] = { dovuto: 0, pagato: 0 });
          return m;
      };

      // B1. Associazioni
      const { data: assocData } = await supabase.from('associazioni').select('alunno_id, alunni(id, nome, cognome)').eq('docente_id', selectedDocenteId);
      assocData?.forEach(row => {
        if (row.alunni) {
          alunniMap[row.alunno_id] = {
            id: row.alunno_id,
            nome_completo: `${row.alunni.cognome} ${row.alunni.nome}`,
            mesi: createEmptyMonths(),
            tipologie: {},
            totale: { dovuto: 0, pagato: 0 }
          };
        }
      });

      // B2. Registro (Lezioni)
      const { data: lezioniRaw } = await supabase
        .from('registro')
        .select(`alunno_id, data_lezione, importo_saldato, tipi_lezioni ( tipo, costo ), alunni(id, nome, cognome)`)
        .eq('docente_id', selectedDocenteId)
        .gte('data_lezione', startDate)
        .lte('data_lezione', endDate);

      if (lezioniRaw) {
        lezioniRaw.forEach(lez => {
          if (!alunniMap[lez.alunno_id] && lez.alunni) {
             alunniMap[lez.alunno_id] = {
                id: lez.alunno_id,
                nome_completo: `${lez.alunni.cognome} ${lez.alunni.nome}`,
                mesi: createEmptyMonths(),
                tipologie: {},
                totale: { dovuto: 0, pagato: 0 }
             };
          }

          if (alunniMap[lez.alunno_id]) {
            const mese = new Date(lez.data_lezione).getMonth() + 1;
            const tipoLezione = lez.tipi_lezioni?.tipo || 'Altro';
            const costo = lez.tipi_lezioni?.costo || 0;
            const saldato = lez.importo_saldato || 0;

            if (alunniMap[lez.alunno_id].mesi[mese]) {
              alunniMap[lez.alunno_id].mesi[mese].dovuto += costo;
              alunniMap[lez.alunno_id].mesi[mese].pagato += saldato;
            }

            if (!alunniMap[lez.alunno_id].tipologie[tipoLezione]) {
                alunniMap[lez.alunno_id].tipologie[tipoLezione] = { mesi: createEmptyMonths(), totale: {dovuto:0, pagato:0} };
            }
            if (alunniMap[lez.alunno_id].tipologie[tipoLezione].mesi[mese]) {
                alunniMap[lez.alunno_id].tipologie[tipoLezione].mesi[mese].dovuto += costo;
                alunniMap[lez.alunno_id].tipologie[tipoLezione].mesi[mese].pagato += saldato;
            }
          }
        });
      }

      // B3. Pagamenti Iscrizione
      const alunniIds = Object.keys(alunniMap);
      if (alunniIds.length > 0) {
          const { data: pagamentiIscrizione } = await supabase
            .from('pagamenti')
            .select('alunno_id, importo')
            .in('alunno_id', alunniIds)
            .eq('anno_accademico', selectedAnno)
            .eq('tipologia', 'Iscrizione');

          if (pagamentiIscrizione) {
            pagamentiIscrizione.forEach(pay => {
              if (alunniMap[pay.alunno_id]) {
                  if(alunniMap[pay.alunno_id].mesi[0]) alunniMap[pay.alunno_id].mesi[0].pagato += pay.importo;
                  
                  if (!alunniMap[pay.alunno_id].tipologie['Iscrizione']) {
                      alunniMap[pay.alunno_id].tipologie['Iscrizione'] = { mesi: createEmptyMonths(), totale: {dovuto:0, pagato:0} };
                  }
                  alunniMap[pay.alunno_id].tipologie['Iscrizione'].mesi[0].pagato += pay.importo;
              }
            });
          }
      }

      // C. Totali
      Object.values(alunniMap).forEach(alu => {
         if (alu.mesi[0]) alu.mesi[0].dovuto = currentQuota; 
         
         if (alu.tipologie['Iscrizione']) {
             alu.tipologie['Iscrizione'].mesi[0].dovuto = currentQuota;
         } else if (Object.keys(alu.tipologie).length > 0) {
             alu.tipologie['Iscrizione'] = { mesi: createEmptyMonths(), totale: {dovuto:0, pagato:0} };
             alu.tipologie['Iscrizione'].mesi[0].dovuto = currentQuota;
         }

         let totD = 0, totP = 0;
         Object.values(alu.mesi).forEach(m => { totD += m.dovuto; totP += m.pagato; });
         alu.totale = { dovuto: totD, pagato: totP };

         Object.values(alu.tipologie).forEach(tipo => {
             let tD = 0, tP = 0;
             Object.values(tipo.mesi).forEach(m => { tD += m.dovuto; tP += m.pagato; });
             tipo.totale = { dovuto: tD, pagato: tP };
         });
      });

      const result = Object.values(alunniMap).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
      setMatrix(result);

    } catch (err) {
      console.error("Errore dettagli:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPaymentModal = (alunnoRow) => {
    setPayFormData({ alunno_id: alunnoRow.id, docente_id: selectedDocenteId });
    setShowPayModal(true);
  };

  const toggleRow = (alunnoId) => {
      setExpandedRows(prev => ({ ...prev, [alunnoId]: !prev[alunnoId] }));
  };

  // --- GESTIONE CLIC CELLE (SOLO PER RIGA PRINCIPALE) ---
  const handleCellClick = async (alunnoId, mese, tipo) => {
    setDetailData(null); 
    setShowDetailModal(true);
    
    try {
      let items = [];
      let title = "";
      let modalType = "";

      const [startYear, endYear] = selectedAnno.split('/').map(Number);
      const startDate = `${startYear}-09-01`;
      const endDate = `${endYear}-08-31`;
      
      const meseLabel = COLONNE_RENDER.find(m=>m.val===mese)?.label || 'Mese';

      if (tipo === 'dovuto') {
        title = `Lezioni del mese - ${meseLabel}`;
        modalType = 'lezioni';
        
        if (mese === 0) {
             items = [{ data: '-', desc: 'Quota Iscrizione Anno Corrente', importo: quotaIscrizione }];
        } else {
             const { data: lezioni } = await supabase
                .from('registro')
                .select(`data_lezione, tipi_lezioni(tipo, costo)`)
                .eq('docente_id', selectedDocenteId)
                .eq('alunno_id', alunnoId)
                .gte('data_lezione', startDate)
                .lte('data_lezione', endDate)
                .order('data_lezione');
             
             items = (lezioni || [])
                .filter(l => (new Date(l.data_lezione).getMonth() + 1) === mese)
                .map(l => ({
                    data: new Date(l.data_lezione).toLocaleDateString('it-IT'),
                    desc: l.tipi_lezioni?.tipo || 'Lezione',
                    importo: l.tipi_lezioni?.costo || 0
                }));
        }
      } else {
        title = `Pagamenti a Copertura - ${meseLabel}`;
        modalType = 'pagamenti';
        
        if (mese === 0) {
            const { data: pays } = await supabase
                .from('pagamenti')
                .select('data_pagamento, importo, metodo_pagamento, note')
                .eq('alunno_id', alunnoId)
                .eq('anno_accademico', selectedAnno)
                .eq('tipologia', 'Iscrizione');
            
            items = (pays || []).map(p => ({
                data: new Date(p.data_pagamento).toLocaleDateString('it-IT'),
                desc: `Iscrizione (${p.metodo_pagamento})`,
                note: p.note,
                importo: p.importo
            }));
        } else {
            const { data: lezioniDelMese } = await supabase
                .from('registro')
                .select('id, data_lezione')
                .eq('docente_id', selectedDocenteId)
                .eq('alunno_id', alunnoId)
                .gte('data_lezione', startDate)
                .lte('data_lezione', endDate);
            
            const idsLezioni = (lezioniDelMese || [])
                .filter(l => (new Date(l.data_lezione).getMonth() + 1) === mese)
                .map(l => l.id);

            if (idsLezioni.length > 0) {
                const { data: dettagli } = await supabase
                    .from('dettagli_pagamento')
                    .select(`importo_coperto, pagamenti ( data_pagamento, metodo_pagamento, note, tipologia )`)
                    .in('registro_id', idsLezioni);

                items = (dettagli || []).map(d => ({
                    data: new Date(d.pagamenti.data_pagamento).toLocaleDateString('it-IT'),
                    desc: `${d.pagamenti.tipologia} (${d.pagamenti.metodo_pagamento})`,
                    note: d.pagamenti.note,
                    importo: d.importo_coperto
                }));
            }
        }
      }
      setDetailData({ title, items, modalType });
    } catch(e) {
        console.error(e);
        setDetailData({ title: 'Errore', items: [] });
    }
  };

  // --- RENDER CELLA UNIFICATO (CON PARAMETRO isClickable) ---
  const renderCellContent = (cell, alunnoId, meseVal, isClickable = true) => {
      const diff = cell.pagato - cell.dovuto;
      
      // Classi dinamiche: se non è cliccabile, togliamo cursore e hover
      const interactiveClass = isClickable 
        ? "cursor-pointer hover:bg-white/10 transition-colors" 
        : "cursor-default opacity-80"; 

      const handleClick = (type) => {
          if (isClickable) handleCellClick(alunnoId, meseVal, type);
      };

      return (
        <div className="flex flex-col justify-center items-center gap-0.5 w-full h-full text-xs">
            {/* DARE */}
            <div 
                className={`flex justify-between w-full px-1 text-gray-500 rounded ${interactiveClass}`}
                onClick={() => handleClick('dovuto')}
                title={isClickable ? "Clicca per dettaglio lezioni" : ""}
            >
                <span>D:</span> <span className="text-gray-300">€ {cell.dovuto}</span>
            </div>
            
            {/* AVERE */}
            <div 
                className={`flex justify-between w-full px-1 text-gray-500 rounded ${interactiveClass}`}
                onClick={() => handleClick('pagato')}
                title={isClickable ? "Clicca per dettaglio pagamenti" : ""}
            >
                <span>P:</span> <span className="text-white">€ {cell.pagato}</span>
            </div>
            
            {/* DELTA */}
            <div className={`font-bold border-t border-gray-600 w-full text-center ${diff >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>
                € {Math.abs(diff).toFixed(0)}
            </div>
        </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <Users className="text-accademia-red" size={20}/> 
            <h2 className="text-lg font-light text-white">Riepilogo Pagamenti</h2>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1 border border-gray-600">
                <Filter size={14} className="text-gray-400"/>
                <select 
                    value={selectedAnno}
                    onChange={(e) => setSelectedAnno(e.target.value)}
                    className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
                >
                    {ANNI_ACCADEMICI.map(anno => <option key={anno} value={anno} className="bg-gray-800 text-white">{anno}</option>)}
                </select>
            </div>

            <select 
                className="bg-accademia-input border border-gray-700 text-white rounded-lg px-4 py-2 w-full sm:w-64 focus:border-accademia-red focus:outline-none"
                value={selectedDocenteId}
                onChange={(e) => setSelectedDocenteId(e.target.value)}
            >
                <option value="">-- Seleziona Docente --</option>
                {docenti.map(d => <option key={d.id} value={d.id}>{d.nome_completo}</option>)}
            </select>
        </div>
      </div>

      {/* Griglia */}
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
                <th className="p-3 text-left w-72 border-r border-red-800 sticky left-0 bg-accademia-red z-40">Alunno</th>
                {COLONNE_RENDER.map(m => (
                  <th key={m.val} className={`p-2 min-w-[75px] border-r border-red-800 text-xs ${m.val===0 ? 'bg-red-900 border-red-700' : ''}`}>
                      {m.label}
                  </th>
                ))}
                <th className="p-2 min-w-[90px] border-r border-red-800 bg-red-900 text-xs">TOT</th>
                <th className="p-2 w-16 bg-red-900 text-center text-xs">REG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 text-sm">
              {matrix.map(row => {
                  const isExpanded = expandedRows[row.id];
                  const hasDetails = Object.keys(row.tipologie).length > 0;

                  return (
                    <>
                        {/* RIGA PRINCIPALE (CLICCABILE) */}
                        <tr key={row.id} className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700 relative z-20">
                            <td className="p-0 border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 z-10 shadow-r-lg">
                                <div className="flex items-center h-16 px-2 w-full">
                                    {hasDetails && (
                                        <button 
                                            onClick={() => toggleRow(row.id)}
                                            className="mr-2 p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                                        >
                                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                    )}
                                    <span className="font-medium text-white truncate text-left" title={row.nome_completo}>
                                        {row.nome_completo}
                                    </span>
                                </div>
                            </td>
                            
                            {COLONNE_RENDER.map(m => {
                                const cell = row.mesi[m.val] || { dovuto: 0, pagato: 0 };
                                const bgClass = m.val === 0 ? 'bg-yellow-900/10' : '';
                                // TRUE = Cliccabile
                                return (
                                    <td key={m.val} className={`p-1 border-r border-gray-700 align-middle h-16 ${bgClass}`}>
                                        {renderCellContent(cell, row.id, m.val, true)} 
                                    </td>
                                );
                            })}
                            
                            {/* Totale Riga */}
                            <td className="p-2 border-r border-gray-700 bg-gray-900/40 text-center align-middle">
                                <div className="flex flex-col justify-center items-center gap-0.5 w-full h-full text-xs">
                                    <div className="text-gray-400">D: € {row.totale.dovuto}</div>
                                    <div className="text-white">P: € {row.totale.pagato}</div>
                                    <div className={`font-bold border-t border-gray-600 w-full ${row.totale.pagato - row.totale.dovuto >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>
                                        € {Math.abs(row.totale.pagato - row.totale.dovuto).toFixed(0)}
                                    </div>
                                </div>
                            </td>
                            
                            <td className="p-2 bg-gray-900/40 text-center align-middle">
                                <button onClick={() => handleOpenPaymentModal(row)} className="p-2 bg-gray-800 hover:bg-accademia-red text-gray-300 hover:text-white rounded-full transition-colors shadow-sm"><Euro size={16} /></button>
                            </td>
                        </tr>

                        {/* SOTTORIGHE TIPOLOGIA (NON CLICCABILI) */}
                        {isExpanded && Object.entries(row.tipologie).map(([tipo, datiTipo]) => (
                            <tr key={`${row.id}-${tipo}`} className="bg-gray-800/40 border-b border-gray-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                <td className="p-0 border-r border-gray-700/50 sticky left-0 bg-gray-900/90 z-10 shadow-r-lg border-b border-gray-700/50">
                                    <div className="flex items-center h-16 px-2 pl-10 w-full text-xs">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-500 mr-2"></div>
                                        <span className="text-gray-300 italic truncate">{tipo}</span>
                                    </div>
                                </td>
                                {COLONNE_RENDER.map(m => {
                                    const cell = datiTipo.mesi[m.val] || { dovuto: 0, pagato: 0 };
                                    const bgClass = m.val === 0 ? 'bg-yellow-900/5' : '';
                                    // FALSE = Non Cliccabile
                                    return (
                                        <td key={m.val} className={`p-1 border-r border-gray-700/50 align-middle h-16 ${bgClass}`}>
                                            {renderCellContent(cell, row.id, m.val, false)} 
                                        </td>
                                    );
                                })}
                                
                                {/* Totale Sottoriga */}
                                <td className="p-2 border-r border-gray-700/50 bg-gray-900/20 text-center align-middle">
                                    <div className="flex flex-col justify-center items-center gap-0.5 w-full h-full text-xs">
                                        <div className="text-gray-400">D: € {datiTipo.totale.dovuto}</div>
                                        <div className="text-white">P: € {datiTipo.totale.pagato}</div>
                                        <div className={`font-bold border-t border-gray-600 w-full ${datiTipo.totale.pagato - datiTipo.totale.dovuto >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>
                                            € {Math.abs(datiTipo.totale.pagato - datiTipo.totale.dovuto).toFixed(0)}
                                        </div>
                                    </div>
                                </td>
                                <td className="bg-gray-900/20"></td>
                            </tr>
                        ))}
                    </>
                  );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showPayModal && (
        <ModalPagamento 
          item={payFormData} 
          alunni={alunniList} 
          user={user}
          annoCorrente={selectedAnno}
          onClose={() => setShowPayModal(false)}
          onSave={() => { setShowPayModal(false); loadDettagli(); }}
        />
      )}

      {showDetailModal && <ModalDettaglioCella data={detailData} onClose={() => setShowDetailModal(false)} />}
    </div>
  );
}

function ModalDettaglioCella({ data, onClose }) {
    const isPagamento = data?.modalType === 'pagamenti';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className={`px-4 py-3 border-b border-gray-700 flex justify-between items-center ${isPagamento ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isPagamento ? 'text-green-400' : 'text-red-300'}`}>
                        {data ? data.title : 'Dettaglio'}
                    </h3>
                    <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white"/></button>
                </div>
                
                <div className="p-0 max-h-64 overflow-y-auto custom-scrollbar bg-accademia-card">
                    {!data ? <div className="p-4 text-center text-gray-500">Caricamento...</div> : data.items.length === 0 ? <div className="p-4 text-center text-gray-500 text-sm">Nessun dato trovato.</div> : (
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
                                        <td className="px-4 py-2 text-gray-400 text-xs font-mono whitespace-nowrap">{item.data}</td>
                                        <td className="px-4 py-2 text-white font-medium">
                                            {item.desc}
                                            {item.note && <div className="text-[10px] text-gray-500 italic truncate max-w-[150px]">{item.note}</div>}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-mono font-bold ${isPagamento ? 'text-green-400' : 'text-red-400'}`}>
                                            € {item.importo}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                <div className="p-3 border-t border-gray-700 bg-gray-900/30 flex justify-end">
                     <button onClick={onClose} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors">Chiudi</button>
                </div>
            </div>
        </div>,
        document.body
    );
}