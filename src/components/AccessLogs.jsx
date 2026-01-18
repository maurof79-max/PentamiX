import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
    Shield, RefreshCw, Clock, User, Building, 
    Activity, Loader2, Search, Calendar,
    ArrowUpDown, ArrowUp, ArrowDown, Download,
    ChevronLeft, ChevronRight, BarChart3
} from 'lucide-react';

const AccessLogs = () => {
  // --- STATI DATI ---
  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  // --- STATI PAGINAZIONE ---
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  // --- STATI FILTRI E OPZIONI ---
  const [scuole, setScuole] = useState([]);
  const [filterScuola, setFilterScuola] = useState('');
  const [filterUtente, setFilterUtente] = useState('');
  const [filterData, setFilterData] = useState('');
  const [showChart, setShowChart] = useState(true); // Toggle per mostrare/nascondere grafico
  
  // Stato Ordinamento
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

  // Al caricamento: fetch iniziale e lista scuole
  useEffect(() => {
    fetchScuole();
    fetchChartStats();
  }, []);

  // Al cambio di filtri o pagina: fetch dei log
  useEffect(() => {
    fetchLogs();
  }, [page, filterScuola, filterUtente, filterData, sortConfig]);

  // --- 1. FETCH DATI STATISTICI (PER IL GRAFICO) ---
  const fetchChartStats = async () => {
      try {
          // Prendiamo i log degli ultimi 7 giorni per il grafico
          const today = new Date();
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(today.getDate() - 7);

          const { data } = await supabase
            .from('view_access_logs_completi')
            .select('timestamp')
            .gte('timestamp', sevenDaysAgo.toISOString());

          if (!data) return;

          // Raggruppiamo per giorno
          const stats = {};
          // Inizializza gli ultimi 7 giorni a 0
          for (let i = 6; i >= 0; i--) {
              const d = new Date();
              d.setDate(today.getDate() - i);
              const key = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
              stats[key] = 0;
          }

          data.forEach(log => {
              const dateKey = new Date(log.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
              if (stats[dateKey] !== undefined) {
                  stats[dateKey]++;
              }
          });

          const formattedData = Object.keys(stats).map(key => ({
              name: key,
              accessi: stats[key]
          }));

          setChartData(formattedData);
      } catch (err) {
          console.error("Errore statistiche:", err);
      }
  };

  const fetchScuole = async () => {
    try {
        const { data } = await supabase.from('scuole').select('id, nome').order('nome');
        setScuole(data || []);
    } catch (error) { console.error(error); }
  };

  // --- 2. FETCH LOGS (CON FILTRI SERVER-SIDE E PAGINAZIONE) ---
  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('view_access_logs_completi')
        .select('*', { count: 'exact' }); // Richiediamo il conteggio totale

      // Applicazione Filtri Server-Side
      if (filterScuola) {
          query = query.eq('nome_scuola', filterScuola);
      }
      if (filterData) {
          // Filtro per data esatta (ignora l'ora, cerca tra inizio e fine giornata)
          query = query
            .gte('timestamp', `${filterData}T00:00:00`)
            .lte('timestamp', `${filterData}T23:59:59`);
      }
      if (filterUtente) {
          // Cerca in nome_esteso O email
          query = query.or(`nome_esteso.ilike.%${filterUtente}%,log_email.ilike.%${filterUtente}%`);
      }

      // Ordinamento
      // Nota: Per ordinare su colonne calcolate o complesse lato server, 
      // assicurati che la Vista supporti l'ordinamento.
      const sortColumn = sortConfig.key === 'utente' ? 'nome_esteso' : 
                         sortConfig.key === 'scuola' ? 'nome_scuola' : 'timestamp';
      
      query = query.order(sortColumn, { ascending: sortConfig.direction === 'asc' });

      // Paginazione
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);

    } catch (error) {
      console.error('Errore caricamento log:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- 3. EXPORT EXCEL ---
  const handleExportExcel = async () => {
      setExporting(true);
      try {
        // Scarichiamo TUTTI i dati che corrispondono ai filtri attuali (senza paginazione)
        let query = supabase.from('view_access_logs_completi').select('*');

        if (filterScuola) query = query.eq('nome_scuola', filterScuola);
        if (filterData) query = query.gte('timestamp', `${filterData}T00:00:00`).lte('timestamp', `${filterData}T23:59:59`);
        if (filterUtente) query = query.or(`nome_esteso.ilike.%${filterUtente}%,log_email.ilike.%${filterUtente}%`);
        
        const { data, error } = await query.order('timestamp', { ascending: false });
        if (error) throw error;

        // Formattiamo i dati per Excel
        const rows = data.map(log => ({
            'Data e Ora': new Date(log.timestamp).toLocaleString('it-IT'),
            'Utente': log.nome_esteso || 'Sconosciuto',
            'Email': log.log_email,
            'Ruolo': log.ruolo,
            'Scuola': log.nome_scuola,
            'Attività': log.action
        }));

        // Creazione Foglio
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Log Accessi");

        // Larghezza colonne automatica (approx)
        const wscols = [
            {wch: 20}, {wch: 25}, {wch: 30}, {wch: 15}, {wch: 25}, {wch: 15}
        ];
        worksheet['!cols'] = wscols;

        // Download
        XLSX.writeFile(workbook, `Report_Accessi_${new Date().toISOString().split('T')[0]}.xlsx`);

      } catch (err) {
          alert("Errore durante l'export: " + err.message);
      } finally {
          setExporting(false);
      }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="h-full flex flex-col space-y-4">
      
      {/* SEZIONE SUPERIORE: GRAFICO (Opzionale) */}
      {showChart && (
          <div className="bg-accademia-card border border-gray-800 rounded-xl p-4 shadow-lg animate-in fade-in slide-in-from-top-4">
             <div className="flex justify-between items-center mb-2">
                 <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                     <BarChart3 size={16} className="text-accademia-red"/> Andamento Accessi (Ultimi 7 gg)
                 </h4>
                 <button onClick={() => setShowChart(false)} className="text-xs text-gray-500 hover:text-white">Nascondi</button>
             </div>
             <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }}
                            itemStyle={{ color: '#FCA5A5' }}
                            cursor={{fill: '#374151', opacity: 0.4}}
                        />
                        <Bar dataKey="accessi" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill="rgba(220, 38, 38, 0.7)" />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
             </div>
          </div>
      )}

      <div className="flex-1 flex flex-col bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
        {/* HEADER & FILTERS */}
        <div className="p-4 border-b border-gray-800 bg-gray-900/20 space-y-4 shrink-0">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Shield className="text-accademia-red" size={20}/> Log di Accesso
                        <span className="bg-gray-800 text-xs px-2 py-0.5 rounded-full border border-gray-700 font-normal ml-2 text-gray-400">
                            Totale: {totalCount}
                        </span>
                    </h3>
                    {!showChart && (
                        <button onClick={() => setShowChart(true)} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700 text-gray-400 flex items-center gap-1">
                            <BarChart3 size={12}/> Mostra Grafico
                        </button>
                    )}
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={handleExportExcel}
                        disabled={exporting || loading}
                        className="flex items-center gap-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-800/50 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                        {exporting ? <Loader2 size={16} className="animate-spin"/> : <Download size={16} />} 
                        Export Excel
                    </button>
                    <button 
                        onClick={() => fetchLogs()}
                        disabled={loading}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors border border-gray-700"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />} 
                        Aggiorna
                    </button>
                </div>
            </div>

            {/* BARRA DEI FILTRI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                    <input 
                        type="text" 
                        placeholder="Cerca Utente o Email..." 
                        value={filterUtente}
                        onChange={(e) => { setFilterUtente(e.target.value); setPage(0); }}
                        className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-9 pr-4 py-2 text-sm focus:border-accademia-red focus:outline-none placeholder-gray-600"
                    />
                </div>
                
                <div className="relative">
                    <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                    <select 
                        value={filterScuola}
                        onChange={(e) => { setFilterScuola(e.target.value); setPage(0); }}
                        className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-9 pr-8 py-2 text-sm focus:border-accademia-red focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="">Tutte le Scuole</option>
                        {scuole.map(s => (
                            <option key={s.id} value={s.nome} className="bg-gray-800">
                                {s.nome}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                        <ArrowDown size={12} />
                    </div>
                </div>

                <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                    <input 
                        type="date" 
                        value={filterData}
                        onChange={(e) => { setFilterData(e.target.value); setPage(0); }}
                        className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-9 pr-4 py-2 text-sm focus:border-accademia-red focus:outline-none placeholder-gray-600 appearance-none [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                    />
                    {filterData && (
                        <button 
                            onClick={() => { setFilterData(''); setPage(0); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-accademia-red hover:underline bg-gray-900 px-1"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-md z-10">
                <tr>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('timestamp')}>
                    <div className="flex items-center gap-2">
                        <Clock size={14}/> Data {sortConfig.key === 'timestamp' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-accademia-red"/> : <ArrowDown size={14} className="text-accademia-red"/>)}
                    </div>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('utente')}>
                    <div className="flex items-center gap-2">
                        <User size={14}/> Utente {sortConfig.key === 'utente' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-accademia-red"/> : <ArrowDown size={14} className="text-accademia-red"/>)}
                    </div>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('scuola')}>
                    <div className="flex items-center gap-2">
                        <Building size={14}/> Scuola {sortConfig.key === 'scuola' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-accademia-red"/> : <ArrowDown size={14} className="text-accademia-red"/>)}
                    </div>
                </th>
                <th className="px-6 py-4 font-semibold">
                    <div className="flex items-center gap-2">Ruolo</div>
                </th>
                <th className="px-6 py-4 font-semibold text-center">
                    <div className="flex items-center justify-center gap-2"><Activity size={14}/> Attività</div>
                </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                {loading && logs.length === 0 ? (
                    <tr>
                        <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                            <div className="flex justify-center items-center gap-2">
                                <Loader2 className="animate-spin text-accademia-red" size={20} />
                                Caricamento logs...
                            </div>
                        </td>
                    </tr>
                ) : (
                    logs.map((log) => {
                        return (
                            <tr key={log.log_id || Math.random()} className="hover:bg-gray-800/30 transition-colors">
                                <td className="px-6 py-4 text-gray-300 font-mono text-xs">
                                    {new Date(log.timestamp).toLocaleString('it-IT', {
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-white font-medium text-sm">
                                        {log.nome_esteso || 'Utente Sconosciuto'}
                                    </div>
                                    <div className="text-xs text-gray-500">{log.log_email}</div>
                                </td>
                                <td className="px-6 py-4 text-gray-400 text-xs uppercase font-bold tracking-wide">
                                    {log.nome_scuola || '-'}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300">
                                        {log.ruolo || '-'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-1 inline-flex text-[10px] font-semibold rounded-full border ${
                                        log.action === 'LOGIN' 
                                        ? 'bg-green-900/20 text-green-400 border-green-900' 
                                        : 'bg-blue-900/20 text-blue-400 border-blue-900'
                                    }`}>
                                        {log.action}
                                    </span>
                                </td>
                            </tr>
                        );
                    })
                )}
                
                {!loading && logs.length === 0 && (
                <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-gray-500 italic">
                        Nessun log trovato con i criteri correnti.
                    </td>
                </tr>
                )}
            </tbody>
            </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="border-t border-gray-800 bg-gray-900/30 p-3 flex justify-between items-center shrink-0">
            <div className="text-xs text-gray-500">
                Pagina <span className="text-white font-bold">{page + 1}</span> di <span className="text-white font-bold">{totalPages || 1}</span>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                    className="p-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                <button 
                    onClick={() => setPage(p => (page + 1 < totalPages ? p + 1 : p))}
                    disabled={page + 1 >= totalPages || loading}
                    className="p-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AccessLogs;