import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Save, Settings, RefreshCw, Loader2, AlertTriangle, Check } from 'lucide-react';

export default function ConfigurazioniApp() {
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('config_app')
                .select('*')
                .order('chiave');
            
            if (error) throw error;
            setConfigs(data || []);
        } catch (err) {
            console.error("Errore fetch config:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 h-full flex flex-col bg-accademia-dark">
            {/* Header Compatto */}
            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-4">
                <h2 className="text-xl font-light text-white flex items-center gap-2">
                    <Settings className="text-accademia-red" size={20} /> 
                    Configurazioni Globali
                </h2>
                <button 
                    onClick={fetchConfig} 
                    className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                    title="Ricarica dati"
                >
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Gestione Errori */}
            {!loading && error && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-800 text-red-300 rounded text-sm flex items-center gap-2">
                    <AlertTriangle size={16}/> {error}
                </div>
            )}

            {/* Tabella Dati */}
            <div className="flex-1 overflow-auto bg-accademia-card border border-gray-800 rounded-lg shadow-inner">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-900 text-gray-400 text-xs uppercase sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-4 py-3 font-semibold w-1/3">Parametro & Descrizione</th>
                            <th className="px-4 py-3 font-semibold w-1/2">Valore (JSON Array)</th>
                            <th className="px-4 py-3 font-semibold text-center w-[100px]">Salva</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                        {loading ? (
                            <tr>
                                <td colSpan="3" className="p-8 text-center text-gray-500">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="animate-spin" size={20}/> Caricamento...
                                    </div>
                                </td>
                            </tr>
                        ) : configs.length === 0 ? (
                            <tr>
                                <td colSpan="3" className="p-8 text-center text-gray-500">Nessuna configurazione trovata.</td>
                            </tr>
                        ) : (
                            configs.map((conf) => (
                                <ConfigRow key={conf.chiave} conf={conf} />
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="mt-2 text-[10px] text-gray-600 font-mono text-center">
                Modifica i valori JSON con attenzione. Formato richiesto: ["Valore1", "Valore2"]
            </div>
        </div>
    );
}

// Componente Riga Tabella (Gestisce il proprio stato di input e salvataggio)
function ConfigRow({ conf }) {
    const [valStr, setValStr] = useState(JSON.stringify(conf.valore));
    const [status, setStatus] = useState('idle'); // 'idle', 'saving', 'success', 'error'

    const handleSave = async () => {
        setStatus('saving');
        try {
            // Validazione JSON
            let jsonVal;
            try {
                jsonVal = JSON.parse(valStr);
            } catch (e) {
                alert("JSON Non valido! Controlla sintassi.");
                setStatus('error');
                return;
            }

            if (!Array.isArray(jsonVal)) {
                alert("Il valore deve essere un Array [ ... ]");
                setStatus('error');
                return;
            }

            const { error } = await supabase
                .from('config_app')
                .update({ valore: jsonVal })
                .eq('chiave', conf.chiave);

            if (error) throw error;

            setStatus('success');
            setTimeout(() => setStatus('idle'), 2000); // Reset icona dopo 2 sec

        } catch (err) {
            console.error(err);
            alert("Errore salvataggio: " + err.message);
            setStatus('error');
        }
    };

    // Stile del bordo input in base allo stato
    const inputBorderClass = status === 'error' ? 'border-red-500 focus:border-red-500' : 
                             status === 'success' ? 'border-green-500 focus:border-green-500' : 
                             'border-gray-700 focus:border-accademia-red';

    return (
        <tr className="hover:bg-gray-800/30 transition-colors group">
            {/* Colonna Descrizione */}
            <td className="px-4 py-3 align-top">
                <div className="font-mono text-accademia-red font-bold text-sm select-all">
                    {conf.chiave}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 leading-snug">
                    {conf.descrizione}
                </div>
            </td>

            {/* Colonna Input */}
            <td className="px-4 py-3 align-top">
                <input 
                    type="text" 
                    value={valStr}
                    onChange={(e) => {
                        setValStr(e.target.value);
                        if(status !== 'idle') setStatus('idle');
                    }}
                    className={`w-full bg-gray-900 text-white font-mono text-sm px-3 py-1.5 rounded border outline-none transition-all ${inputBorderClass}`}
                    placeholder='["Admin"]'
                />
            </td>

            {/* Colonna Azioni */}
            <td className="px-4 py-3 align-top text-center">
                <button 
                    onClick={handleSave}
                    disabled={status === 'saving'}
                    className={`p-2 rounded-lg transition-all ${
                        status === 'success' ? 'text-green-400 bg-green-900/20' : 
                        status === 'saving' ? 'text-gray-400 cursor-wait' :
                        'text-gray-400 hover:text-white hover:bg-gray-700 bg-gray-800 border border-gray-700'
                    }`}
                >
                    {status === 'saving' ? <Loader2 size={18} className="animate-spin"/> : 
                     status === 'success' ? <Check size={18}/> : 
                     <Save size={18}/>}
                </button>
            </td>
        </tr>
    );
}