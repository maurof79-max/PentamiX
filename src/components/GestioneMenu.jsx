import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Save, RefreshCw, LayoutDashboard, Layers, ArrowUp, ArrowDown } from 'lucide-react';

export default function GestioneMenu() {
    const [schede, setSchede] = useState([]);
    const [moduli, setModuli] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Carica Moduli
            const { data: modData } = await supabase.from('sys_moduli').select('*').order('ordine');
            setModuli(modData || []);

            // 2. Carica Schede
            const { data: schData } = await supabase.from('sys_schede').select('*').order('ordine');
            setSchede(schData || []);

        } catch (err) {
            console.error("Errore fetch:", err);
            alert("Errore caricamento dati");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (codice_vista, field, value) => {
        // Aggiornamento ottimistico UI
        setSchede(prev => prev.map(s => 
            s.codice_vista === codice_vista ? { ...s, [field]: value } : s
        ));

        try {
            const { error } = await supabase
                .from('sys_schede')
                .update({ [field]: value })
                .eq('codice_vista', codice_vista);

            if (error) throw error;
        } catch (err) {
            console.error(err);
            alert("Errore salvataggio. Ricarico i dati.");
            fetchData();
        }
    };

    // Raggruppa le schede per modulo per visualizzazione
    const schedeByModulo = (moduloCodice) => {
        return schede
            .filter(s => s.modulo_codice === moduloCodice)
            .sort((a, b) => a.ordine - b.ordine);
    };

    return (
        <div className="p-6 h-full flex flex-col bg-accademia-dark overflow-hidden">
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 shrink-0">
                <div>
                    <h2 className="text-xl font-light text-white flex items-center gap-2">
                        <LayoutDashboard className="text-accademia-red" size={24} /> 
                        Gestione Menu & Moduli
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Organizza le schede spostandole tra i moduli o cambiandone l'ordine.</p>
                </div>
                <button 
                    onClick={fetchData} 
                    className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                >
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar space-y-6 pb-10">
                {moduli.map((modulo) => (
                    <div key={modulo.codice} className="bg-accademia-card border border-gray-800 rounded-xl overflow-hidden animate-in fade-in">
                        {/* Header Modulo */}
                        <div className="bg-gray-900/50 p-3 border-b border-gray-800 flex items-center gap-3">
                            <Layers size={18} className="text-gray-400" />
                            <h3 className="font-bold text-white uppercase tracking-wider text-sm">
                                {modulo.etichetta} 
                                <span className="ml-2 text-[10px] text-gray-600 font-mono lowercase">({modulo.codice})</span>
                            </h3>
                        </div>

                        {/* Lista Schede nel Modulo */}
                        <div className="divide-y divide-gray-800">
                            {schedeByModulo(modulo.codice).map((scheda) => (
                                <div key={scheda.codice_vista} className="p-3 flex flex-col md:flex-row items-center gap-4 hover:bg-gray-800/30 transition-colors group">
                                    
                                    {/* Icona e ID */}
                                    <div className="flex items-center gap-3 w-full md:w-1/4">
                                        <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-accademia-red font-bold text-xs">
                                            {/* Mostriamo solo l'iniziale dell'icona o un placeholder grafico */}
                                            {scheda.icona.substring(0,2)}
                                        </div>
                                        <div>
                                            <div className="font-mono text-[10px] text-gray-500">{scheda.codice_vista}</div>
                                            <div className="text-xs text-gray-400">{scheda.icona}</div>
                                        </div>
                                    </div>

                                    {/* Input Etichetta */}
                                    <div className="w-full md:w-1/3">
                                        <label className="text-[10px] uppercase text-gray-600 font-bold">Etichetta Menu</label>
                                        <input 
                                            type="text" 
                                            value={scheda.etichetta}
                                            onChange={(e) => handleUpdate(scheda.codice_vista, 'etichetta', e.target.value)}
                                            className="w-full bg-transparent border-b border-gray-700 text-white text-sm focus:border-accademia-red focus:outline-none py-1"
                                        />
                                    </div>

                                    {/* Selettore Modulo (Spostamento) */}
                                    <div className="w-full md:w-1/4">
                                        <label className="text-[10px] uppercase text-gray-600 font-bold">Modulo Appartenenza</label>
                                        <select 
                                            value={scheda.modulo_codice}
                                            onChange={(e) => handleUpdate(scheda.codice_vista, 'modulo_codice', e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded px-2 py-1.5 focus:border-accademia-red focus:outline-none"
                                        >
                                            {moduli.map(m => (
                                                <option key={m.codice} value={m.codice}>{m.etichetta}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Ordinamento */}
                                    <div className="w-full md:w-auto flex items-center gap-2">
                                        <label className="md:hidden text-[10px] uppercase text-gray-600 font-bold mr-2">Ordine</label>
                                        <input 
                                            type="number" 
                                            value={scheda.ordine}
                                            onChange={(e) => handleUpdate(scheda.codice_vista, 'ordine', parseInt(e.target.value))}
                                            className="w-16 bg-gray-900 border border-gray-700 text-white text-center text-sm rounded py-1.5 focus:border-accademia-red focus:outline-none"
                                        />
                                    </div>

                                </div>
                            ))}
                            
                            {schedeByModulo(modulo.codice).length === 0 && (
                                <div className="p-4 text-center text-xs text-gray-600 italic">
                                    Nessuna scheda in questo modulo.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}