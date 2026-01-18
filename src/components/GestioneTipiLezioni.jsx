import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { 
  Plus, Edit2, Trash2, X, Save, CheckCircle2, XCircle, Building, BookOpen 
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function GestioneTipiLezioni({ userRole }) {
  const [scuole, setScuole] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [lezioni, setLezioni] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Modale
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Dialog
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, type: 'info', title: '', message: '' });

  // --- INIT ---
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
    if (selectedSchool) fetchLezioni();
    else setLezioni([]);
  }, [selectedSchool]);

  const fetchLezioni = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tipi_lezioni')
      .select('*')
      .eq('school_id', selectedSchool)
      .order('tipo');
    setLezioni(data || []);
    setLoading(false);
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
      // Nota: La cancellazione fisica potrebbe fallire se ci sono FK. 
      // Meglio suggerire di disattivare, ma implementiamo delete con catch errore.
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
            else fetchLezioni();
            setDialogConfig({ ...dialogConfig, isOpen: false });
        },
        onCancel: () => setDialogConfig({ ...dialogConfig, isOpen: false })
      });
  };

  return (
    <div className="h-full flex flex-col bg-accademia-card p-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-2xl font-light text-white flex items-center gap-2">
                <BookOpen className="text-accademia-red"/> Catalogo Didattico
            </h2>
            
            {/* Selettore Scuola */}
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

      {/* TABELLA */}
      <div className="flex-1 overflow-auto border border-gray-800 rounded-xl bg-gray-900/20 custom-scrollbar">
        <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs sticky top-0">
                <tr>
                    <th className="px-6 py-4">Nome Lezione</th>
                    <th className="px-6 py-4">Durata Standard</th>
                    <th className="px-6 py-4 text-center">Stato</th>
                    <th className="px-6 py-4 text-right">Azioni</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                {lezioni.map(l => (
                    <tr key={l.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-white">{l.tipo}</td>
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
                ))}
                {lezioni.length === 0 && (
                    <tr><td colSpan="4" className="p-8 text-center text-gray-500">Nessuna tipologia trovata.</td></tr>
                )}
            </tbody>
        </table>
      </div>

      {/* MODALE */}
      {showModal && (
          <ModalTipoLezione 
            item={editingItem} 
            schoolId={selectedSchool}
            onClose={() => setShowModal(false)}
            onSave={() => { setShowModal(false); fetchLezioni(); }}
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
        // Se è modifica usa il valore esistente, se è nuovo default true
        attivo: item ? item.attivo : true 
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const payload = {
            school_id: schoolId,
            tipo: form.tipo,
            durata_minuti: parseInt(form.durata_minuti),
            attivo: form.attivo // Passiamo il valore selezionato
        };

        let error;
        if(item) {
            const { error: err } = await supabase.from('tipi_lezioni').update(payload).eq('id', item.id);
            error = err;
        } else {
            // L'ID ora è generato dal DB grazie alla tua modifica SQL
            const { error: err } = await supabase.from('tipi_lezioni').insert([payload]);
            error = err;
        }

        if(error) alert("Errore: " + error.message);
        else onSave();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
                
                <div className="flex justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{item ? 'Modifica' : 'Nuova'} Tipologia</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* CAMPO NOME */}
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

                    {/* CAMPO DURATA */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Durata Standard (minuti)</label>
                        <input 
                            type="number" 
                            step="5" 
                            value={form.durata_minuti} 
                            onChange={e => setForm({...form, durata_minuti: e.target.value})} 
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none" 
                            required
                        />
                    </div>

                    {/* NUOVO CAMPO STATO */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Stato</label>
                        <select 
                            value={form.attivo.toString()} // Convertiamo booleano a stringa per la select HTML
                            onChange={e => setForm({...form, attivo: e.target.value === 'true'})} // Riconvertiamo a booleano
                            className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white focus:border-accademia-red focus:outline-none"
                        >
                            <option value="true">Attivo (Visibile nei listini)</option>
                            <option value="false">Non Attivo (Archiviato)</option>
                        </select>
                    </div>

                    <div className="flex justify-end pt-4 gap-2">
                         <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Annulla</button>
                        <button type="submit" className="bg-accademia-red hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg">Salva</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
}