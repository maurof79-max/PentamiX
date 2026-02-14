import { useEffect, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient.js';
import { Users, X, Euro, Filter, ChevronRight, ChevronDown, ArrowRight, Tags, Search } from 'lucide-react';
import ModalPagamento from './modals/ModalPagamento.jsx'; 
import { MESI_COMPLETE as MESI, ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, getCurrentAcademicYear } from '../utils/constants.js';
import { calcolaScontiPacchetti } from '../utils/financeManager.js';

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

  const [searchTerm, setSearchTerm] = useState('');

  // Cache per regole pacchetti
  const [pacchettiRules, setPacchettiRules] = useState([]);

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
      
      // Buffer di 7 giorni per catturare lezioni di settimane a cavallo dell'anno accademico
      const startDateBuffer = `${startYear}-08-24`; 
      const endDateBuffer = `${endYear}-09-07`;

      const { data: docenteInfo } = await supabase.from('docenti').select('school_id').eq('id', selectedDocenteId).single();
      const schoolIdTarget = docenteInfo?.school_id || user?.school_id;

      let qQuota = supabase.from('anni_accademici').select('quota_iscrizione').eq('anno', selectedAnno);
      if (schoolIdTarget) qQuota = qQuota.eq('school_id', schoolIdTarget);
      const { data: annoData } = await qQuota.limit(1).maybeSingle();
      const currentQuota = annoData?.quota_iscrizione || 0;
      setQuotaIscrizione(currentQuota);

      // A. RECUPERO TARIFFE 
      const { data: tariffeData } = await supabase
        .from('tariffe')
        .select('tipo_lezione, costo')
        .eq('anno_accademico', selectedAnno)
        .eq('school_id', schoolIdTarget);
      
      const costiMap = {};
      tariffeData?.forEach(t => {
        costiMap[t.tipo_lezione] = t.costo;
      });

      // B. RECUPERO PACCHETTI (SCONTI)
      const { data: pacchettiData } = await supabase
        .from('tariffe_pacchetti')
        .select('*')
        .eq('anno_accademico', selectedAnno)
        .eq('school_id', schoolIdTarget);
      setPacchettiRules(pacchettiData || []);

      const alunniMap = {};
      const createEmptyMonths = () => {
          const m = {};
          COLONNE_RENDER.forEach(col => m[col.val] = { dovuto: 0, pagato: 0 });
          return m;
      };

      // C. RECUPERO STUDENTI DEL DOCENTE SELEZIONATO
      const { data: assocData } = await supabase
        .from('associazioni')
        .select('alunno_id, alunni(id, nome, cognome)')
        .eq('docente_id', selectedDocenteId);

      const myAlunniIds = [];
      assocData?.forEach(row => {
        if (row.alunni) {
          myAlunniIds.push(row.alunno_id);
          alunniMap[row.alunno_id] = {
            id: row.alunno_id,
            nome_completo: `${row.alunni.cognome} ${row.alunni.nome}`,
            mesi: createEmptyMonths(),
            tipologie: {},
            totale: { dovuto: 0, pagato: 0 }
          };
        }
      });

      // D. RECUPERO LEZIONI (DI TUTTI I DOCENTI PER GLI STUDENTI DEL DOCENTE SELEZIONATO)
      // Necessario per calcolare sconti combo trasversali (es. Strumento con me + Teoria con altro)
      if (myAlunniIds.length > 0) {
          const { data: lezioniRaw, error: lezError } = await supabase
            .from('registro')
            .select(`
                id,
                alunno_id, 
                docente_id,
                data_lezione, 
                importo_saldato, 
                tipi_lezioni!inner ( tipo ), 
                alunni ( id, nome, cognome ),
                school_id
            `)
            .in('alunno_id', myAlunniIds) // Filtra per gli alunni del docente selezionato
            .gte('data_lezione', startDateBuffer)
            .lte('data_lezione', endDateBuffer);

          if (lezError) throw lezError;

          // E. ELABORAZIONE SCONTI (Core Logic)
          // Questa funzione ritorna una lista mista: lezioni originali + righe di sconto virtuali
          const processedEvents = calcolaScontiPacchetti(lezioniRaw || [], pacchettiData || []);

          // F. POPOLAMENTO MATRICE
          processedEvents.forEach(evt => {
            // Filtro visualizzazione: Consideriamo solo eventi pertinenti al docente selezionato
            // 1. Lezioni reali fatte dal docente selezionato
            // 2. Sconti virtuali attribuiti al docente selezionato
            if (evt.docente_id !== selectedDocenteId) return;

            // Assicuriamoci che l'alunno sia nella mappa (dovrebbe esserci da associazioni, ma safety check)
            if (!alunniMap[evt.alunno_id] && evt.alunni) {
                // Caso raro: lezione fatta ma associazione non trovata o rimossa
                alunniMap[evt.alunno_id] = {
                    id: evt.alunno_id,
                    nome_completo: `${evt.alunni.cognome} ${evt.alunni.nome}`,
                    mesi: createEmptyMonths(),
                    tipologie: {},
                    totale: { dovuto: 0, pagato: 0 }
                };
            }

            if (alunniMap[evt.alunno_id]) {
                const mese = new Date(evt.data_lezione).getMonth() + 1;
                
                // Determina costo: se virtuale usa costo_calcolato (negativo), altrimenti da tariffa
                const tipoLezione = evt.tipi_lezioni?.tipo || 'Altro';
                let costo = 0;
                
                if (evt.is_virtual) {
                    costo = evt.costo_calcolato; // Già negativo
                } else {
                    costo = costiMap[tipoLezione] || 0;
                }
                
                const saldato = evt.importo_saldato || 0;

                // Aggiorna totale mese (solo se rientra nei mesi visualizzati dell'anno accademico)
                if (alunniMap[evt.alunno_id].mesi[mese]) {
                    alunniMap[evt.alunno_id].mesi[mese].dovuto += costo;
                    alunniMap[evt.alunno_id].mesi[mese].pagato += saldato;
                }

                // Aggiorna totale tipologia
                if (!alunniMap[evt.alunno_id].tipologie[tipoLezione]) {
                    alunniMap[evt.alunno_id].tipologie[tipoLezione] = { mesi: createEmptyMonths(), totale: {dovuto:0, pagato:0} };
                }
                const tipologiaMese = alunniMap[evt.alunno_id].tipologie[tipoLezione].mesi[mese];
                if (tipologiaMese) {
                    tipologiaMese.dovuto += costo;
                    tipologiaMese.pagato += saldato;
                }
            }
          });
      }

      // G. AGGIUNTA PAGAMENTI ISCRIZIONE
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

      // H. CALCOLO TOTALI FINALI
      Object.values(alunniMap).forEach(alu => {
         if (alu.mesi[0]) alu.mesi[0].dovuto = currentQuota; 
         if (alu.tipologie['Iscrizione']) {
             alu.tipologie['Iscrizione'].mesi[0].dovuto = currentQuota;
         } else if (Object.keys(alu.tipologie).length > 0) {
             alu.tipologie['Iscrizione'] = { mesi: createEmptyMonths(), totale: {dovuto:0, pagato:0} };
             alu.tipologie['Iscrizione'].mesi[0].dovuto = currentQuota;
         }

         let totD = 0, totP = 0;
         Object.values(alu.mesi).forEach(m => { 
             totD += m.dovuto; 
             totP += m.pagato; 
         });
         alu.totale = { dovuto: totD, pagato: totP };

         Object.values(alu.tipologie).forEach(tipo => {
             let tD = 0, tP = 0;
             Object.values(tipo.mesi).forEach(m => { 
                 tD += m.dovuto; 
                 tP += m.pagato; 
             });
             tipo.totale = { dovuto: tD, pagato: tP };
         });
      });

      const result = Object.values(alunniMap).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
      setMatrix(result);

    } catch (err) {
      console.error("Errore caricamento dettagli pagamenti:", err);
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

  // --- LOGICA DETTAGLIO CELLA ---
  const handleCellClick = async (alunnoId, mese, tipo) => {
    setDetailData(null); 
    setShowDetailModal(true);
    
    try {
      let items = [];
      const [startYear, endYear] = selectedAnno.split('/').map(Number);
      
      // Calcolo date buffer per la settimana (Month +/- 7 days)
      const yearTarget = mese >= 9 ? startYear : endYear;
      
      // Calcolo inizio e fine mese esatti
      const firstDayOfMonth = new Date(yearTarget, mese - 1, 1);
      const lastDayOfMonth = new Date(yearTarget, mese, 0);

      // Buffer esteso per catturare lezioni settimanali
      const bufferStart = new Date(firstDayOfMonth);
      bufferStart.setDate(bufferStart.getDate() - 10);
      const startDateStr = bufferStart.toISOString().split('T')[0];

      const bufferEnd = new Date(lastDayOfMonth);
      bufferEnd.setDate(bufferEnd.getDate() + 10);
      const endDateStr = bufferEnd.toISOString().split('T')[0];
      
      const meseLabel = COLONNE_RENDER.find(m => m.val === mese)?.label || 'Mese';
      const title = tipo === 'dovuto' ? `Dettaglio Lezioni - ${meseLabel}` : `Dettaglio Pagamenti - ${meseLabel}`;

      if (tipo === 'dovuto') {
        if (mese === 0) {
          items = [{ data: '-', desc: 'Quota Iscrizione', importo: quotaIscrizione }];
        } else {
            // 1. Recupera Info Scuola/Costi
            const { data: docenteInfo } = await supabase.from('docenti').select('school_id').eq('id', selectedDocenteId).maybeSingle();
            const { data: tData } = await supabase.from('tariffe').select('tipo_lezione, costo').eq('anno_accademico', selectedAnno).eq('school_id', docenteInfo?.school_id || user?.school_id);
            const mapCosti = {}; tData?.forEach(t => mapCosti[t.tipo_lezione] = t.costo);

            // 2. Recupera TUTTE le lezioni dell'alunno nel periodo buffer (per calcolo sconti)
            const { data: lezRaw } = await supabase.from('registro')
                .select(`id, alunno_id, docente_id, data_lezione, tipi_lezioni(tipo), school_id`)
                .eq('alunno_id', alunnoId)
                .gte('data_lezione', startDateStr)
                .lte('data_lezione', endDateStr)
                .order('data_lezione');

            // 3. Applica logica sconti
            const processed = calcolaScontiPacchetti(lezRaw || [], pacchettiRules);

            // 4. Filtra per Mese esatto e Docente selezionato
            items = processed
                .filter(item => {
                    const itemDate = new Date(item.data_lezione);
                    const itemMonth = itemDate.getMonth() + 1;
                    return itemMonth === mese && item.docente_id === selectedDocenteId;
                })
                .map(l => {
                    if (l.is_virtual) {
                        return {
                            data: new Date(l.data_lezione).toLocaleDateString('it-IT'),
                            desc: l.descrizione_sconto,
                            note: l.dettaglio_settimana,
                            importo: l.costo_calcolato, // Negativo
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
        // CASO PAGATO (Rimasto invariato)
        if (mese === 0) {
          const { data: pays } = await supabase.from('pagamenti').select('data_pagamento, importo, metodo_pagamento, note').eq('alunno_id', alunnoId).eq('anno_accademico', selectedAnno).eq('tipologia', 'Iscrizione');
          items = (pays || []).map(p => ({ data: new Date(p.data_pagamento).toLocaleDateString('it-IT'), desc: `Iscrizione (${p.metodo_pagamento})`, note: p.note, importo: p.importo }));
        } else {
          // Ricerca semplice per pagato (non influenzata dai pacchetti)
          // Nota: Qui usiamo il mese esatto
          const exactStart = firstDayOfMonth.toISOString().split('T')[0];
          const exactEnd = lastDayOfMonth.toISOString().split('T')[0];

          const { data: lezIds } = await supabase.from('registro').select('id').eq('docente_id', selectedDocenteId).eq('alunno_id', alunnoId).gte('data_lezione', exactStart).lte('data_lezione', exactEnd);
          const ids = lezIds?.map(l => l.id) || [];
          
          if (ids.length > 0) {
            const { data: det, error: errDet } = await supabase
                .from('dettagli_pagamento')
                .select(`importo_coperto, pagamenti(data_pagamento, metodo_pagamento, tipologia, note)`)
                .in('registro_id', ids);

            if (errDet) throw errDet;

            items = (det || []).map(d => ({ 
                data: new Date(d.pagamenti.data_pagamento).toLocaleDateString('it-IT'), 
                desc: `${d.pagamenti.tipologia} (${d.pagamenti.metodo_pagamento})`, 
                note: d.pagamenti.note, 
                importo: d.importo_coperto 
            }));
          }
        }
      }
      setDetailData({ title, items, modalType: tipo });
    } catch (e) {
      console.error("Errore dettaglio cella:", e);
      setDetailData({ title: 'Errore', items: [], modalType: tipo });
    }
  };

  const renderCellContent = (cell, alunnoId, meseVal, isClickable = true) => {
      const diff = cell.pagato - cell.dovuto;
      const interactiveClass = isClickable 
        ? "cursor-pointer hover:bg-white/10 transition-colors" 
        : "cursor-default opacity-80"; 

      const handleClick = (type) => {
          if (isClickable) handleCellClick(alunnoId, meseVal, type);
      };

      return (
        <div className="flex flex-col justify-center items-center gap-0.5 w-full h-full text-xs">
            <div 
                className={`flex justify-between w-full px-1 text-gray-500 rounded ${interactiveClass}`}
                onClick={() => handleClick('dovuto')}
            >
                <span>D:</span> <span className="text-gray-300">€ {cell.dovuto}</span>
            </div>
            <div 
                className={`flex justify-between w-full px-1 text-gray-500 rounded ${interactiveClass}`}
                onClick={() => handleClick('pagato')}
            >
                <span>P:</span> <span className="text-white">€ {cell.pagato}</span>
            </div>
            <div className={`font-bold border-t border-gray-600 w-full text-center ${diff >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>
                € {Math.abs(diff).toFixed(0)}
            </div>
        </div>
      );
  };

  const filteredMatrix = matrix.filter(row => 
    row.nome_completo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/30 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <Users className="text-accademia-red" size={20}/> 
            <h2 className="text-lg font-light text-white">Riepilogo Pagamenti</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1 border border-gray-600">
                <Search size={14} className="text-gray-400" />
                <input
                    type="text"
                    placeholder="Filtra alunno..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent text-white text-sm focus:outline-none placeholder-gray-500"
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="text-gray-500 hover:text-white">
                        <X size={14} />
                    </button>
                )}
            </div>
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
              {filteredMatrix.map((row) => (
                  <Fragment key={`group-${row.id}`}>
                    <tr className="hover:bg-gray-800/30 transition-colors group border-b border-gray-700 relative z-20">
                      <td className="p-0 border-r border-gray-700 sticky left-0 bg-accademia-card group-hover:bg-gray-800 z-10 shadow-r-lg">
                        <div className="flex items-center h-16 px-2 w-full">
                          {Object.keys(row.tipologie).length > 0 && (
                            <button 
                                onClick={() => toggleRow(row.id)}
                                className="mr-2 p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                            >
                                {expandedRows[row.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          )}
                          <span className="font-medium text-white truncate text-left" title={row.nome_completo}>{row.nome_completo}</span>
                        </div>
                      </td>
                      {COLONNE_RENDER.map((m) => (
                          <td key={`cell-${row.id}-${m.val}`} className={`p-1 border-r border-gray-700 align-middle h-16 ${m.val === 0 ? 'bg-yellow-900/10' : ''}`}>
                            {renderCellContent(row.mesi[m.val] || { dovuto: 0, pagato: 0 }, row.id, m.val, true)}
                          </td>
                      ))}
                      <td className="p-2 border-r border-gray-700 bg-gray-900/40 text-center align-middle">
                        <div className="flex flex-col text-xs">
                          <div className="text-gray-400">D: € {row.totale.dovuto}</div>
                          <div className="text-white">P: € {row.totale.pagato}</div>
                          <div className={`font-bold border-t border-gray-600 ${row.totale.pagato - row.totale.dovuto >= -0.1 ? 'text-green-500' : 'text-red-500'}`}>€ {Math.abs(row.totale.pagato - row.totale.dovuto).toFixed(0)}</div>
                        </div>
                      </td>
                      <td className="p-2 bg-gray-900/40 text-center align-middle">
                        <button onClick={() => handleOpenPaymentModal(row)} className="p-2 bg-gray-800 hover:bg-accademia-red text-gray-300 rounded-full shadow-sm"><Euro size={16} /></button>
                      </td>
                    </tr>
                    {expandedRows[row.id] && Object.entries(row.tipologie).map(([tipo, datiTipo]) => (
                      <tr key={`subrow-${row.id}-${tipo}`} className="bg-gray-800/40 border-b border-gray-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                        <td className="p-0 border-r border-gray-700/50 sticky left-0 bg-gray-900/90 z-10 h-16"><div className="flex items-center px-2 pl-10 text-xs italic text-gray-300 truncate"><ArrowRight size={10} className="mr-1"/> {tipo}</div></td>
                        {COLONNE_RENDER.map((m) => (
                          <td key={`subcell-${row.id}-${tipo}-${m.val}`} className="p-1 border-r border-gray-700/50 align-middle h-16">
                            {renderCellContent(datiTipo.mesi[m.val] || { dovuto: 0, pagato: 0 }, row.id, m.val, false)}
                          </td>
                        ))}
                        <td className="p-2 border-r border-gray-700/50 bg-gray-900/20 text-center align-middle h-16">
                          <div className="flex flex-col text-xs">
                            <div className="text-gray-400">D: € {datiTipo.totale.dovuto}</div>
                            <div className="text-white">P: € {datiTipo.totale.pagato}</div>
                          </div>
                        </td>
                        <td className="bg-gray-900/20"></td>
                      </tr>
                    ))}
                  </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showPayModal && <ModalPagamento item={payFormData} alunni={alunniList} user={user} annoCorrente={selectedAnno} onClose={() => setShowPayModal(false)} onSave={() => { setShowPayModal(false); loadDettagli(); }} />}
      {showDetailModal && <ModalDettaglioCella data={detailData} onClose={() => setShowDetailModal(false)} />}
    </div>
  );
}

function ModalDettaglioCella({ data, onClose }) {
    const isPagamento = data?.modalType === 'pagamenti';
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className={`px-4 py-3 border-b border-gray-700 flex justify-between items-center ${isPagamento ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isPagamento ? 'text-green-400' : 'text-red-300'}`}>{data ? data.title : 'Dettaglio'}</h3>
                    <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-white"/></button>
                </div>
                <div className="p-0 max-h-64 overflow-y-auto custom-scrollbar">
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
                                            {item.note && <div className="text-[10px] text-gray-500 italic truncate max-w-[120px]">{item.note}</div>}
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
                     <button onClick={onClose} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">Chiudi</button>
                </div>
            </div>
        </div>,
        document.body
    );
}