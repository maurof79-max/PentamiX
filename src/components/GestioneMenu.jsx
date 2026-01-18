import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
    RefreshCw, LayoutDashboard, Layers, Plus, X, Save, Trash2, 
    Edit3, FolderOpen, FileText, Shield, Archive, BookOpen 
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

const ROLES = ['Admin', 'Gestore', 'Docente'];

// --- CATALOGO VISTE DI SISTEMA ---
// Icone aggiornate: ReceiptText per Pagamenti, Scale per Finanza, Euro per Compensi
const SYSTEM_VIEWS = [
    { code: 'utenti', label: 'Gestione Utenti', icon: 'Users' },
    { code: 'docenti', label: 'Gestione Docenti', icon: 'GraduationCap' },
    { code: 'alunni', label: 'Gestione Alunni', icon: 'Users' },
    { code: 'catalogo_lezioni', label: 'Catalogo Didattico', icon: 'BookOpen' },
    { code: 'gestione_tariffe', label: 'Tariffe & Anni', icon: 'Archive' },
    { code: 'calendario_personale', label: 'Il Mio Calendario', icon: 'Calendar' },
    { code: 'calendario_docenti', label: 'Calendario Generale', icon: 'Calendar' },
    { code: 'registro_lezioni', label: 'Registro Lezioni', icon: 'BookOpen' },
    { code: 'pagamenti', label: 'Gestione Pagamenti', icon: 'ReceiptText' }, // <--- AGGIORNATO
    { code: 'dettaglio_pagamenti', label: 'Report Pagamenti', icon: 'TableProperties' },
    { code: 'finanza', label: 'Riepilogo Finanziario', icon: 'Scale' },      // <--- AGGIORNATO
    { code: 'compensi-docenti', label: 'Compensi Docenti', icon: 'Euro' },   // <--- AGGIORNATO
    { code: 'configurazioni', label: 'Configurazioni App', icon: 'Settings' },
    { code: 'logs', label: 'Logs Accesso', icon: 'Shield' },
    { code: 'gestione_menu', label: 'Configurazione Menu', icon: 'LayoutDashboard' },
    { code: 'gestione_scuole', label: 'Gestione Sedi', icon: 'Building' },
];

export default function GestioneMenu() {
    const [activeTab, setActiveTab] = useState('moduli'); 
    const [moduli, setModuli] = useState([]);
    const [schede, setSchede] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Stati Modali
    const [showModuloModal, setShowModuloModal] = useState(false);
    const [showSchedaModal, setShowSchedaModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null); 

    const [dialogConfig, setDialogConfig] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => {} });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: modData } = await supabase.from('sys_moduli').select('*').order('ordine');
            setModuli(modData || []);

            const { data: schData } = await supabase.from('sys_schede').select('*').order('ordine');
            setSchede(schData || []);
        } catch (err) {
            console.error("Errore fetch:", err);
            alert("Errore caricamento dati");
        } finally {
            setLoading(false);
        }
    };

    // --- CRUD MODULI ---
    const handleSaveModulo = async (formData) => {
        try {
            if (editingItem) {
                const { error } = await supabase.from('sys_moduli').update(formData).eq('codice', editingItem.codice);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('sys_moduli').insert([formData]);
                if (error) throw error;
            }
            setShowModuloModal(false);
            fetchData();
        } catch (err) {
            alert("Errore salvataggio modulo: " + err.message);
        }
    };

    const handleDeleteModulo = async (codice) => {
        const hasChildren = schede.some(s => s.modulo_codice === codice);
        if (hasChildren) {
            setDialogConfig({
                isOpen: true, type: 'warning', title: 'Attenzione',
                message: `Il modulo "${codice}" non è vuoto. Elimina prima le schede associate.`,
                showCancel: false, onConfirm: () => setDialogConfig(prev => ({...prev, isOpen: false}))
            });
            return;
        }

        setDialogConfig({
            isOpen: true, type: 'danger', title: 'Elimina Modulo',
            message: `Eliminare definitivamente il modulo "${codice}"?`,
            showCancel: true,
            onConfirm: async () => {
                const { error } = await supabase.from('sys_moduli').delete().eq('codice', codice);
                if (!error) fetchData();
                setDialogConfig(prev => ({...prev, isOpen: false}));
            }
        });
    };

    // --- CRUD SCHEDE ---
    const handleSaveScheda = async (formData) => {
        try {
            if (!editingItem) {
                const exists = schede.some(s => s.codice_vista === formData.codice_vista);
                if (exists) throw new Error("Questa vista è già presente nel menu.");
            }

            if (editingItem) {
                const { error } = await supabase.from('sys_schede').update(formData).eq('codice_vista', editingItem.codice_vista);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('sys_schede').insert([formData]);
                if (error) throw error;
            }
            setShowSchedaModal(false);
            fetchData();
        } catch (err) {
            alert("Errore salvataggio scheda: " + err.message);
        }
    };

    const handleDeleteScheda = async (codice_vista) => {
        setDialogConfig({
            isOpen: true, type: 'danger', title: 'Rimuovi Voce Menu',
            message: `Rimuovere "${codice_vista}" dal menu? Potrai riaggiungerla in seguito dal catalogo.`,
            showCancel: true,
            onConfirm: async () => {
                const { error } = await supabase.from('sys_schede').delete().eq('codice_vista', codice_vista);
                if (!error) fetchData();
                setDialogConfig(prev => ({...prev, isOpen: false}));
            }
        });
    };

    // --- RENDER ---
    return (
        <div className="p-6 h-full flex flex-col bg-accademia-dark overflow-hidden relative">
            
            {/* HEADER */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 shrink-0">
                <div>
                    <h2 className="text-xl font-light text-white flex items-center gap-2">
                        <LayoutDashboard className="text-accademia-red" size={24} /> 
                        Configurazione Menu
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Struttura di navigazione dell'applicazione.</p>
                </div>
                <button onClick={fetchData} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* TAB BAR & ACTION BUTTON */}
            <div className="flex justify-between items-center border-b border-gray-800 mb-4 shrink-0">
                {/* TABS A SINISTRA */}
                <div className="flex gap-4">
                    <button onClick={() => setActiveTab('moduli')} className={`pb-3 px-2 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'moduli' ? 'text-white border-accademia-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                        <div className="flex items-center gap-2"><FolderOpen size={16}/> 1. Sezioni</div>
                    </button>
                    <button onClick={() => setActiveTab('schede')} className={`pb-3 px-2 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'schede' ? 'text-white border-accademia-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                        <div className="flex items-center gap-2"><FileText size={16}/> 2. Pagine</div>
                    </button>
                </div>

                {/* BOTTONE AZIONE A DESTRA (FISSO) */}
                <div className="pb-2">
                    {activeTab === 'moduli' ? (
                        <button 
                            onClick={() => { setEditingItem(null); setShowModuloModal(true); }} 
                            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-lg"
                        >
                            <Plus size={16}/> Nuova Sezione
                        </button>
                    ) : (
                        <button 
                            onClick={() => { setEditingItem(null); setShowSchedaModal(true); }} 
                            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-lg"
                        >
                            <Plus size={16}/> Nuova Pagina
                        </button>
                    )}
                </div>
            </div>

            {/* TAB CONTENUTO MODULI */}
            {activeTab === 'moduli' && (
                <div className="flex-1 overflow-auto custom-scrollbar pb-10 animate-in fade-in">
                    <div className="grid gap-3">
                        {moduli.map(m => (
                            <div key={m.codice} className="bg-gray-900/50 border border-gray-800 p-4 rounded-lg flex items-center justify-between group hover:border-gray-600 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-400 font-mono text-xs font-bold border border-gray-700">{m.ordine}</div>
                                    <div><h4 className="text-white font-bold">{m.etichetta}</h4><div className="text-xs text-gray-500 font-mono">{m.codice}</div></div>
                                </div>
                                <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingItem(m); setShowModuloModal(true); }} className="p-2 hover:bg-gray-800 rounded text-blue-400"><Edit3 size={16}/></button>
                                    <button onClick={() => handleDeleteModulo(m.codice)} className="p-2 hover:bg-gray-800 rounded text-red-400"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB CONTENUTO SCHEDE */}
            {activeTab === 'schede' && (
                <div className="flex-1 overflow-auto custom-scrollbar pb-10 animate-in fade-in">
                    <div className="space-y-6">
                        {moduli.map(mod => {
                            const schedeModulo = schede.filter(s => s.modulo_codice === mod.codice).sort((a,b) => a.ordine - b.ordine);
                            return (
                                <div key={mod.codice} className="bg-accademia-card border border-gray-800 rounded-xl overflow-hidden">
                                    <div className="bg-gray-900/80 p-3 border-b border-gray-800 flex items-center gap-2">
                                        <Layers size={16} className="text-gray-400"/>
                                        <span className="text-sm font-bold text-gray-300 uppercase">{mod.etichetta}</span>
                                    </div>
                                    <div className="divide-y divide-gray-800">
                                        {schedeModulo.length === 0 && <div className="p-4 text-center text-xs text-gray-600 italic">Nessuna pagina in questa sezione.</div>}
                                        {schedeModulo.map(sch => (
                                            <div key={sch.codice_vista} className="p-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-[10px] text-gray-500 w-6 text-center">{sch.ordine}</div>
                                                    <div>
                                                        <div className="text-white text-sm font-medium flex items-center gap-2">
                                                            {sch.etichetta}
                                                            {sch.ruoli_ammessi && sch.ruoli_ammessi.length > 0 && (
                                                                <span className="text-[9px] bg-blue-900/30 text-blue-300 border border-blue-900 px-1.5 rounded flex items-center gap-1">
                                                                    <Shield size={8}/> 
                                                                    {sch.ruoli_ammessi.length === ROLES.length ? 'Tutti' : sch.ruoli_ammessi.join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 font-mono">{sch.codice_vista}</div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingItem(sch); setShowSchedaModal(true); }} className="p-1.5 hover:bg-gray-800 rounded text-blue-400"><Edit3 size={14}/></button>
                                                    <button onClick={() => handleDeleteScheda(sch.codice_vista)} className="p-1.5 hover:bg-gray-800 rounded text-red-400"><Trash2 size={14}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* MODALI */}
            {showModuloModal && <ModalEditModulo item={editingItem} onClose={() => setShowModuloModal(false)} onSave={handleSaveModulo} />}
            
            {showSchedaModal && (
                <ModalEditScheda 
                    item={editingItem} 
                    moduli={moduli} 
                    existingCodes={schede.map(s => s.codice_vista)} 
                    onClose={() => setShowSchedaModal(false)} 
                    onSave={handleSaveScheda} 
                />
            )}
            
            <ConfirmDialog {...dialogConfig} />
        </div>
    );
}

// --- MODALE MODULO ---
function ModalEditModulo({ item, onClose, onSave }) {
    const [form, setForm] = useState({ codice: item?.codice || '', etichetta: item?.etichetta || '', ordine: item?.ordine || 10 });
    const isEdit = !!item;
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-4">{isEdit ? 'Modifica' : 'Nuova'} Sezione</h3>
                <div className="space-y-4">
                    <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Codice ID</label><input type="text" disabled={isEdit} value={form.codice} onChange={e => setForm({...form, codice: e.target.value.toUpperCase()})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white font-mono text-sm focus:outline-none" placeholder="ES: AMM"/></div>
                    <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Etichetta</label><input type="text" value={form.etichetta} onChange={e => setForm({...form, etichetta: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none"/></div>
                    <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ordine</label><input type="number" value={form.ordine} onChange={e => setForm({...form, ordine: parseInt(e.target.value)})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:outline-none"/></div>
                    <div className="flex justify-end gap-2 pt-4"><button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Annulla</button><button onClick={() => onSave(form)} className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold text-sm">Salva</button></div>
                </div>
            </div>
        </div>, document.body
    );
}

// --- MODALE SCHEDA ---
function ModalEditScheda({ item, moduli, existingCodes, onClose, onSave }) {
    const isEdit = !!item;
    
    const [form, setForm] = useState({
        codice_vista: item?.codice_vista || '',
        etichetta: item?.etichetta || '',
        modulo_codice: item?.modulo_codice || (moduli[0]?.codice || ''),
        icona: item?.icona || 'Circle',
        ordine: item?.ordine || 10,
        ruoli_ammessi: item?.ruoli_ammessi || [] 
    });

    const toggleRole = (role) => {
        setForm(prev => {
            const currentRoles = prev.ruoli_ammessi || [];
            return currentRoles.includes(role) 
                ? { ...prev, ruoli_ammessi: currentRoles.filter(r => r !== role) } 
                : { ...prev, ruoli_ammessi: [...currentRoles, role] };
        });
    };

    const availableSystemViews = useMemo(() => {
        return SYSTEM_VIEWS.filter(v => !existingCodes.includes(v.code) || v.code === item?.codice_vista);
    }, [existingCodes, item]);

    const handleSystemViewSelect = (code) => {
        const view = SYSTEM_VIEWS.find(v => v.code === code);
        if (view) {
            setForm(prev => ({
                ...prev,
                codice_vista: view.code,
                etichetta: view.label,
                icona: view.icon
            }));
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-4">{isEdit ? 'Modifica' : 'Nuova'} Pagina</h3>
                <div className="space-y-4">
                    
                    {!isEdit && (
                        <div className="bg-blue-900/20 p-3 rounded border border-blue-900/50 mb-4">
                            <label className="block text-xs font-bold text-blue-300 uppercase mb-1">Precompila da Catalogo</label>
                            <select onChange={(e) => handleSystemViewSelect(e.target.value)} className="w-full bg-gray-900 border border-blue-800 rounded p-2 text-white text-sm focus:outline-none disabled:opacity-50" disabled={availableSystemViews.length === 0}>
                                {availableSystemViews.length > 0 ? (
                                    <>
                                        <option value="">-- Seleziona una vista disponibile --</option>
                                        {availableSystemViews.map(v => <option key={v.code} value={v.code}>{v.label}</option>)}
                                    </>
                                ) : <option>Tutte le viste di sistema sono già assegnate</option>}
                            </select>
                        </div>
                    )}

                    <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Codice Vista</label><input type="text" disabled={isEdit} value={form.codice_vista} onChange={e => setForm({...form, codice_vista: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white font-mono text-sm focus:border-accademia-red focus:outline-none disabled:opacity-50"/></div>
                    <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Etichetta Menu</label><input type="text" value={form.etichetta} onChange={e => setForm({...form, etichetta: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none"/></div>
                    <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Modulo</label><select value={form.modulo_codice} onChange={e => setForm({...form, modulo_codice: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none">{moduli.map(m => <option key={m.codice} value={m.codice}>{m.etichetta}</option>)}</select></div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Icona</label><input type="text" value={form.icona} onChange={e => setForm({...form, icona: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none"/></div>
                        <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ordine</label><input type="number" value={form.ordine} onChange={e => setForm({...form, ordine: parseInt(e.target.value)})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none"/></div>
                    </div>

                    <div className="pt-2 border-t border-gray-800">
                        <label className="block text-xs font-bold text-accademia-red uppercase mb-2 flex items-center gap-1"><Shield size={12}/> Permessi Accesso</label>
                        <div className="space-y-2">{ROLES.map(role => {const checked = (form.ruoli_ammessi || []).includes(role); return (<div key={role} onClick={() => toggleRole(role)} className={`flex items-center gap-3 p-2 rounded cursor-pointer border transition-all ${checked ? 'bg-blue-900/20 border-blue-800' : 'bg-gray-900/50 border-gray-800 hover:border-gray-600'}`}><div className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>{checked && <div className="w-2 h-2 bg-white rounded-sm"></div>}</div><span className={`text-sm ${checked ? 'text-white font-bold' : 'text-gray-400'}`}>{role}</span></div>)})}</div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-800">
                        <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Annulla</button>
                        <button onClick={() => onSave(form)} className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-lg">Salva</button>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
}