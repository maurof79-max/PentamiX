import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
  Plus, Edit2, Trash2, X, CheckCircle2, XCircle, Building, BookOpen, Users, User, AlertTriangle 
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { getCurrentAcademicYear } from '../utils/constants';

export default function GestioneTipiLezioni({ userRole }) {
  const [scuole, setScuole] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [lezioni, setLezioni] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [tariffePresenti, setTariffePresenti] = useState(new Set()); 
  const currentAnno = getCurrentAcademicYear();

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, type: 'info', title: '', message: '' });

  useEffect(() => {
    const init = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if(!session) return;
        const { data: profile } = await supabase.from('utenti').select('*').eq('id', session.user.id).single();

        let scuoleList = [];
        if (profile.ruolo === 'Admin') {
            const { data } = await supabase.from('scuole').select('id, nome').order('nome');
            scuoleList = data || [];
        } else if (profile.school_id) {
            const { data } = await supabase.from('scuole').select('id, nome').eq('id', profile.school_id);
            scuoleList = data || [];
        }
        setScuole(scuoleList);
        if (scuoleList.length > 0) setSelectedSchool(scuoleList[0].id);
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedSchool) {
        fetchLezioni();
        checkTariffe();
    } else {
        setLezioni([]);
        setTariffePresenti(new Set());
    }
  }, [selectedSchool]);

  const fetchLezioni = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tipi_lezioni')
      // AGGIUNTO colore_hex ALLA SELECT
      .select('id, tipo, durata_minuti, attivo, modalita, colore_hex')
      .eq('school_id', selectedSchool)
      .order('tipo');
    setLezioni(data || []);
    setLoading(false);
  };

  const checkTariffe = async () => {
      if (!selectedSchool) return;

      const { data: tariffe } = await supabase
        .from('tariffe')
        .select('tipo_lezione')
        .eq('school_id', selectedSchool) 
        .eq('anno_accademico', currentAnno);
      
      const tipiCoperti = new Set(tariffe?.map(t => t.tipo_lezione));
      setTariffePresenti(tipiCoperti);
  };

  const handleToggleActive = async (lez) => {
      const newVal = !lez.attivo;
      const { error } = await supabase
        .from('tipi_lezioni')
        .update({ attivo: newVal })
        .eq('id', lez.id);
      
      if(error) alert(error.message);
      else fetchLezioni();
  };

  const handleDelete = async (id) => {
      setDialogConfig({
        isOpen: true,
        type: 'danger',
        title: 'Elimina Tipologia',
        message: 'Se elimini questa tipologia, potresti perdere lo storico delle lezioni passate. Consigliamo di disattivarla invece. Vuoi procedere comunque?',
        showCancel: true,
        confirmText: 'Elimina',
        onConfirm: async () => {
            const { error } = await supabase.from('tipi_lezioni').delete().eq('id', id);
            if(error) alert("Impossibile eliminare (probabilmente è usata in calendario/tariffe): " + error.message);
            else {
                fetchLezioni();
                checkTariffe(); 
            }
            setDialogConfig({ ...dialogConfig, isOpen: false });
        },
        onCancel: () => setDialogConfig({ ...dialogConfig, isOpen: false })
      });
  };

  return (
    <div className="h-full flex flex-col bg-accademia-card p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-2xl font-light text-white flex items-center gap-2">
                <BookOpen className="text-accademia-red"/> Catalogo Didattico
            </h2>
            
            <div className="bg-gray-800/50 p-2 rounded-lg border border-gray-700 flex items-center gap-2">
                <Building size={16} className="text-gray-400"/>
                <select 
                    value={selectedSchool} 
                    onChange={(e) => setSelectedSchool(e.target.value)}
                    className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
                    disabled={scuole.length <= 1}
                >
                    {scuole.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
            </div>
        </div>

        <button 
            onClick={() => { setEditingItem(null); setShowModal(true); }}
            disabled={!selectedSchool}
            className="bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2 disabled:opacity-50"
        >
            <Plus size={18}/> Nuova Tipologia
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-gray-800 rounded-xl bg-gray-900/20 custom-scrollbar">
        <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0 z-10">
                <tr>
                    <th className="px-6 py-4">Nome Lezione</th>
                    <th className="px-6 py-4">Modalità</th>
                    <th className="px-6 py-4">Durata Standard</th>
                    <th className="px-6 py-4 text-center">Stato</th>
                    <th className="px-6 py-4 text-right">Azioni</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                {lezioni.map(l => {
                    const hasTariffa = tariffePresenti.has(l.tipo);

                    return (
                    <tr key={l.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-white relative">
                            <div className="flex items-center gap-3">
                                {/* PALLINO COLORATO INDICATORE */}
                                <div 
                                    className="w-4 h-4 rounded-full shadow-sm border border-gray-700"
                                    style={{ backgroundColor: l.colore_hex || '#dc2626' }}
                                    title={l.colore_hex || 'Colore default'}
                                ></div>
                                
                                {l.tipo}
                                
                                {l.attivo && !hasTariffa && (
                                    <div className="group relative">
                                        <AlertTriangle size={16} className="text-orange-500 animate-pulse cursor-help"/>
                                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-64 bg-black text-orange-500 text-xs p-2 rounded border border-orange-500/50 shadow-xl z-50 hidden group-hover:block leading-tight pointer-events-none">
                                            <strong>Attenzione:</strong> Nessuna tariffa trovata per l'a.a. {currentAnno}.<br/>
                                            Questa lezione non apparirà correttamente nel registro docenti finché non imposti un prezzo in "Gestione Tariffe".
                                        </div>
                                    </div>
                                )}
                            </div>
                        </td>
                        
                        <td className="px-6 py-4 text-gray-300">
                            {l.modalita === 'Collettiva' ? (
                                <span className="flex items-center gap-2 text-yellow-400 text-xs bg-yellow-400/10 px-2 py-1 rounded border border-yellow-400/20 w-fit">
                                    <Users size={12}/> Gruppo
                                </span>
                            ) : (
                                <span className="flex items-center gap-2 text-gray-400 text-xs">
                                    <User size={12}/> Singolo
                                </span>
                            )}
                        </td>

                        <td className="px-6 py-4 text-gray-300">{l.durata_minuti} min</td>
                        <td className="px-6 py-4 text-center">
                            <button 
                                onClick={() => handleToggleActive(l)}
                                className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 mx-auto transition-all ${
                                    l.attivo 
                                    ? 'bg-green-900/20 text-green-400 border-green-800 hover:bg-green-900/40' 
                                    : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700'
                                }`}
                            >
                                {l.attivo ? <><CheckCircle2 size={12}/> Attivo</> : <><XCircle size={12}/> Inattivo</>}
                            </button>
                        </td>
                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button onClick={() => { setEditingItem(l); setShowModal(true); }} className="p-2 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                            <button onClick={() => handleDelete(l.id)} className="p-2 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                        </td>
                    </tr>
                )})}
                {lezioni.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">Nessuna tipologia trovata.</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {showModal && (
          <ModalTipoLezione 
            item={editingItem} 
            schoolId={selectedSchool}
            onClose={() => setShowModal(false)}
            onSave={() => { setShowModal(false); fetchLezioni(); checkTariffe(); }}
          />
      )}
      
      <ConfirmDialog {...dialogConfig} />
    </div>
  );
}

// --- MODALE CREAZIONE/MODIFICA ---
function ModalTipoLezione({ item, schoolId, onClose, onSave }) {
    const [form, setForm] = useState({ 
        tipo: item?.tipo || '', 
        durata_minuti: item?.durata_minuti || 60,
        modalita: item?.modalita || 'Individuale', 
        attivo: item ? item.attivo : true,
        // AGGIUNTO COLORE AL FORM (di base proponiamo un azzurro/blu)
        colore_hex: item?.colore_hex || '#3b82f6' 
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const payload = {
            school_id: schoolId,
            tipo: form.tipo,
            durata_minuti: parseInt(form.durata_minuti),
            modalita: form.modalita,
            attivo: form.attivo,
            // SALVIAMO IL COLORE
            colore_hex: form.colore_hex 
        };

        let error;
        if(item) {
            const { error: err } = await supabase.from('tipi_lezioni').update(payload).eq('id', item.id);
            error = err;
        } else {
            const { error: err } = await supabase.from('tipi_lezioni').insert([payload]);
            error = err;
        }

        if(error) alert("Errore: " + error.message);
        else onSave();
    };

    // Paletta di colori predefiniti veloci (opzionale, ma fa molta scena)
    const presetColors = ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#475569'];

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                
                <div className="flex justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{item ? 'Modifica' : 'Nuova'} Tipologia</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome (es. Pianoforte)</label>
                        <input 
                            type="text" 
                            value={form.tipo} 
                            onChange={e => setForm({...form, tipo: e.target.value})} 
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Durata Standard</label>
                            <input 
                                type="number" 
                                step="5" 
                                value={form.durata_minuti} 
                                onChange={e => setForm({...form, durata_minuti: e.target.value})} 
                                className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
                                required
                            />
                        </div>
                        
                        {/* CAMPO COLORE CON PICKER HTML5 E PRESET */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Colore Griglia</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="color" 
                                    value={form.colore_hex} 
                                    onChange={e => setForm({...form, colore_hex: e.target.value})} 
                                    className="w-10 h-10 p-0.5 bg-accademia-input border border-gray-700 rounded cursor-pointer" 
                                />
                                <span className="text-xs text-gray-400 font-mono uppercase">{form.colore_hex}</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* PALETTE COLORI VELOCI */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {presetColors.map(color => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => setForm({...form, colore_hex: color})}
                                className={`w-6 h-6 rounded-full border-2 transition-all ${form.colore_hex === color ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                                style={{ backgroundColor: color }}
                                title={color}
                            />
                        ))}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase mt-2">Modalità Lezione</label>
                        <div className="flex gap-4 p-2 bg-gray-800/50 border border-gray-700 rounded-lg">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${form.modalita === 'Individuale' ? 'border-accademia-red' : 'border-gray-500'}`}>
                                    {form.modalita === 'Individuale' && <div className="w-2 h-2 rounded-full bg-accademia-red"/>}
                                </div>
                                <input 
                                    type="radio" 
                                    name="modalita"
                                    value="Individuale"
                                    checked={form.modalita === 'Individuale'}
                                    onChange={(e) => setForm({...form, modalita: e.target.value})}
                                    className="hidden"
                                />
                                <span className={`text-sm ${form.modalita === 'Individuale' ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                    Individuale
                                </span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${form.modalita === 'Collettiva' ? 'border-accademia-red' : 'border-gray-500'}`}>
                                    {form.modalita === 'Collettiva' && <div className="w-2 h-2 rounded-full bg-accademia-red"/>}
                                </div>
                                <input 
                                    type="radio" 
                                    name="modalita"
                                    value="Collettiva"
                                    checked={form.modalita === 'Collettiva'}
                                    onChange={(e) => setForm({...form, modalita: e.target.value})}
                                    className="hidden"
                                />
                                <span className={`text-sm ${form.modalita === 'Collettiva' ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                    Collettiva
                                </span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Stato</label>
                        <select 
                            value={form.attivo.toString()} 
                            onChange={e => setForm({...form, attivo: e.target.value === 'true'})} 
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none"
                        >
                            <option value="true">Attivo (Visibile)</option>
                            <option value="false">Non Attivo (Archiviato)</option>
                        </select>
                    </div>

                    <div className="flex justify-end pt-4 gap-2 border-t border-gray-800 mt-2">
                         <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Annulla</button>
                        <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Salva</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}