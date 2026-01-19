import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { 
    Euro, Calendar, Download, Loader2, FileText, 
    ChevronDown, AlertCircle, TrendingUp, Building 
} from 'lucide-react';
import { MESI_STANDARD, getCurrentAcademicYear } from '../utils/constants';

const CompensiDocenti = ({ user }) => {
    const [loading, setLoading] = useState(true);
    const [datiGrezzi, setDatiGrezzi] = useState([]);
    const [anni, setAnni] = useState([]);
    const [filtroAnno, setFiltroAnno] = useState(getCurrentAcademicYear());
    const [exporting, setExporting] = useState(false);

    // 1. Caricamento Iniziale (Anni Accademici)
    useEffect(() => {
        const fetchAnni = async () => {
            const { data } = await supabase.from('anni_accademici').select('anno').order('anno', { ascending: false });
            if (data && data.length > 0) {
                setAnni(data);
                if (!data.find(a => a.anno === filtroAnno)) {
                    setFiltroAnno(data[0].anno);
                }
            }
        };
        fetchAnni();
    }, []);

    // 2. Caricamento Dati (Compensi)
    useEffect(() => {
        if (filtroAnno && user) fetchCompensi();
    }, [filtroAnno, user]);

    const fetchCompensi = async () => {
        setLoading(true);
        try {
            const [startYear, endYear] = filtroAnno.split('/').map(Number);
            const startDate = `${startYear}-09-01`;
            const endDate = `${endYear}-08-31`;

            let query = supabase
                .from('view_calcolo_compensi')
                .select('*')
                .gte('data_lezione', startDate)
                .lte('data_lezione', endDate)
                // MODIFICA FONDAMENTALE PER LEZIONI COLLETTIVE:
                // Filtra solo la riga "principale" che matura il compenso per il docente.
                // Ignora le righe duplicate create solo per tracciare gli alunni del gruppo.
                .eq('contabilizza_docente', true); 

            // FILTRO PER SCUOLA (Se non è Admin)
            if (user.ruolo !== 'Admin' && user.school_id) {
                query = query.eq('school_id', user.school_id);
            }

            const { data, error } = await query;

            if (error) throw error;
            setDatiGrezzi(data || []);
        } catch (error) {
            console.error("Errore fetch compensi:", error);
        } finally {
            setLoading(false);
        }
    };

    // 3. Elaborazione Dati (Pivot)
    const matriceCompensi = useMemo(() => {
        const mappa = {};

        datiGrezzi.forEach(riga => {
            const docId = riga.docente_id;
            const meseIndex = new Date(riga.data_lezione).getMonth() + 1; // 1-12
            
            if (!mappa[docId]) {
                mappa[docId] = {
                    id: docId,
                    nome: riga.nome,
                    cognome: riga.cognome,
                    mesi: {}, 
                    totaleOre: 0,
                    totaleImporto: 0
                };
            }

            if (!mappa[docId].mesi[meseIndex]) {
                mappa[docId].mesi[meseIndex] = { ore: 0, importo: 0 };
            }

            const oreLezione = (riga.durata_minuti || 0) / 60;
            const importoLezione = riga.importo_compenso || 0;

            mappa[docId].mesi[meseIndex].ore += oreLezione;
            mappa[docId].mesi[meseIndex].importo += importoLezione;
            
            mappa[docId].totaleOre += oreLezione;
            mappa[docId].totaleImporto += importoLezione;
        });

        return Object.values(mappa).sort((a, b) => a.cognome.localeCompare(b.cognome));
    }, [datiGrezzi]);

    // Calcolo Totali Mensili (Per la riga in alto)
    const totaliMensili = useMemo(() => {
        const totali = {};
        let grandTotal = 0;

        MESI_STANDARD.forEach(mese => {
            const sumMese = matriceCompensi.reduce((acc, doc) => acc + (doc.mesi[mese.val]?.importo || 0), 0);
            totali[mese.val] = sumMese;
            grandTotal += sumMese;
        });

        return { mesi: totali, generale: grandTotal };
    }, [matriceCompensi]);

    // 4. Export Excel
    const handleExport = () => {
        setExporting(true);
        try {
            const rows = [];
            const header = ['Docente', ...MESI_STANDARD.map(m => m.label), 'TOTALE ORE', 'TOTALE COMPENSO'];
            rows.push(header);

            matriceCompensi.forEach(doc => {
                const row = [`${doc.cognome} ${doc.nome}`];
                MESI_STANDARD.forEach(mese => {
                    const datiMese = doc.mesi[mese.val];
                    row.push(datiMese ? `${datiMese.ore.toFixed(1)}h (€ ${datiMese.importo.toFixed(2)})` : '-');
                });
                row.push(doc.totaleOre.toFixed(2));
                row.push(`€ ${doc.totaleImporto.toFixed(2)}`);
                rows.push(row);
            });

            // Riga Totali in Excel
            const rowTotali = ['TOTALE MENSILE'];
            MESI_STANDARD.forEach(mese => {
                 rowTotali.push(`€ ${totaliMensili.mesi[mese.val].toFixed(2)}`);
            });
            rowTotali.push('-');
            rowTotali.push(`€ ${totaliMensili.generale.toFixed(2)}`);
            rows.push(rowTotali);

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = [{wch: 25}, ...Array(12).fill({wch: 15}), {wch: 15}, {wch: 20}];
            XLSX.utils.book_append_sheet(wb, ws, "Compensi Docenti");
            XLSX.writeFile(wb, `Compensi_Docenti_${filtroAnno.replace('/', '-')}.xlsx`);

        } catch (error) {
            console.error("Errore export:", error);
            alert("Errore durante l'export");
        } finally {
            setExporting(false);
        }
    };

    const renderCell = (doc, meseVal) => {
        const dati = doc.mesi[meseVal];
        if (!dati) return <span className="text-gray-700 text-xs">-</span>;
        return (
            <div className="flex flex-col items-end justify-center h-full">
                {/* CARATTERE INGRANDITO: text-sm invece di text-xs */}
                <span className="text-sm font-bold text-gray-300">
                    {dati.ore % 1 === 0 ? dati.ore : dati.ore.toFixed(1)}h
                </span>
                {/* COLORE BIANCO: text-white invece di text-accademia-red */}
                <span className="text-sm font-bold text-white font-mono">
                    € {dati.importo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
            
            {/* HEADER AREA */}
            <div className="p-4 border-b border-gray-800 bg-gray-900/20 shrink-0">
                
                {/* TITOLO E COMANDI */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accademia-red/10 rounded-lg border border-accademia-red/20">
                            <Euro className="text-accademia-red" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Compensi Docenti</h2>
                            {/* NOME SCUOLA DINAMICO */}
                            <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
                                <Building size={12}/> 
                                {user?.ruolo === 'Admin' ? 'Amministrazione (Tutte le sedi)' : (user?.scuole?.nome || 'La tua scuola')} 
                                <span className="mx-1">•</span> 
                                {filtroAnno}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <select 
                                value={filtroAnno}
                                onChange={(e) => setFiltroAnno(e.target.value)}
                                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-md pl-9 pr-8 py-2 focus:border-accademia-red focus:outline-none cursor-pointer"
                            >
                                {anni.map(a => <option key={a.anno} value={a.anno}>{a.anno}</option>)}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
                        </div>

                        <button 
                            onClick={handleExport}
                            disabled={loading || exporting || matriceCompensi.length === 0}
                            className="flex items-center gap-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-800/50 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                            {exporting ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
                            <span className="hidden sm:inline">Export</span>
                        </button>
                    </div>
                </div>

                {/* RIGA TOTALI IN ALTO (BARRA ORIZZONTALE) */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 overflow-x-auto custom-scrollbar">
                     <div className="flex items-center justify-between min-w-max gap-6">
                        {/* Etichetta */}
                        <div className="flex items-center gap-2 sticky left-0 bg-gray-800/50 pr-4 border-r border-gray-700">
                             <div className="bg-green-900/20 p-1.5 rounded-full border border-green-800/30">
                                <TrendingUp className="text-green-400" size={16} />
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Totali<br/>Mensili</span>
                        </div>

                        {/* Mesi */}
                        <div className="flex items-center gap-6">
                            {MESI_STANDARD.map(mese => {
                                const val = totaliMensili.mesi[mese.val];
                                return (
                                    <div key={mese.val} className="flex flex-col items-center min-w-[60px]">
                                        <span className="text-[10px] text-gray-500 uppercase mb-1">{mese.label.slice(0,3)}</span>
                                        <span className={`text-sm font-mono font-bold ${val > 0 ? 'text-white' : 'text-gray-600'}`}>
                                            {val > 0 ? `€ ${val.toLocaleString('it-IT', {maximumFractionDigits:0})}` : '-'}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Totale Annuo */}
                        <div className="pl-6 border-l border-gray-700 sticky right-0 bg-gray-800/50">
                             <div className="flex flex-col items-end">
                                <span className="text-[10px] text-accademia-red uppercase font-bold">Totale Annuo</span>
                                <span className="text-xl font-bold text-white font-mono">
                                    € {totaliMensili.generale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                             </div>
                        </div>
                     </div>
                </div>
            </div>

            {/* TABLE CONTENT */}
            <div className="flex-1 overflow-auto custom-scrollbar relative">
                {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-sm z-20">
                        <Loader2 size={40} className="text-accademia-red animate-spin mb-4" />
                        <p className="text-gray-400 text-sm animate-pulse">Calcolo compensi in corso...</p>
                    </div>
                ) : matriceCompensi.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <FileText size={48} className="mb-4 opacity-20" />
                        <p>Nessun dato trovato per l'anno {filtroAnno}</p>
                        <p className="text-xs mt-2">Assicurati di aver impostato le tariffe nelle schede docenti.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900/80 text-gray-400 text-xs uppercase sticky top-0 z-10 backdrop-blur-md shadow-sm">
                            <tr>
                                <th className="p-3 font-semibold border-b border-gray-800 min-w-[200px] sticky left-0 bg-gray-900 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                                    Docente
                                </th>
                                {MESI_STANDARD.map(mese => (
                                    <th key={mese.val} className="p-2 font-semibold text-center border-b border-gray-800 min-w-[80px]">
                                        {mese.label.slice(0, 3)}
                                    </th>
                                ))}
                                <th className="p-3 font-semibold text-right border-b border-gray-800 min-w-[120px] bg-gray-900/90 sticky right-0 z-20 shadow-[-2px_0_5px_rgba(0,0,0,0.3)]">
                                    Totale
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-sm">
                            {matriceCompensi.map(doc => (
                                <tr key={doc.id} className="hover:bg-gray-800/30 transition-colors group">
                                    <td className="p-3 sticky left-0 bg-accademia-card group-hover:bg-gray-800/30 transition-colors border-r border-gray-800 z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-accademia-red font-bold text-xs border border-gray-700">
                                                {doc.nome.charAt(0)}{doc.cognome.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{doc.cognome} {doc.nome}</div>
                                                {doc.totaleImporto === 0 && (
                                                    <div className="text-[10px] text-yellow-500 flex items-center gap-1">
                                                        <AlertCircle size={10} /> Tariffa mancante?
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {MESI_STANDARD.map(mese => (
                                        <td key={mese.val} className="p-2 text-center border-r border-gray-800/30 last:border-r-0">
                                            {renderCell(doc, mese.val)}
                                        </td>
                                    ))}

                                    <td className="p-3 text-right sticky right-0 bg-accademia-card group-hover:bg-gray-800/30 transition-colors border-l border-gray-800 z-10">
                                        <div className="font-bold text-white text-base">
                                            € {doc.totaleImporto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {doc.totaleOre.toFixed(1)} ore
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default CompensiDocenti;