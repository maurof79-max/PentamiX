import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom'; // Fondamentale per evitare crash
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, Plus, X, Check, Save } from 'lucide-react';

export default function AlunniList({ userRole }) {
  const [alunni, setAlunni] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlunno, setEditingAlunno] = useState(null);

  const fetchAlunni = async () => {
    setLoading(true);
    // Fetch Alunni
    const { data: dataAlunni } = await supabase.from('alunni').select('*').order('nome');
    
    // Fetch Associazioni per mostrare i docenti nella tabella
    const { data: assocData } = await supabase.from('associazioni').select('alunno_id, docenti(nome)');
    
    // Mappa
    const mapDocenti = {};
    assocData?.forEach(a => {
      if(!mapDocenti[a.alunno_id]) mapDocenti[a.alunno_id] = [];
      if(a.docenti) mapDocenti[a.alunno_id].push(a.docenti.nome);
    });

    const merged = dataAlunni?.map(a => ({
      ...a,
      docentiNomi: mapDocenti[a.id]?.join(', ') || ''
    })) || [];

    setAlunni(merged);
    setLoading(false);
  };

  const fetchDocenti = async () => {
    const { data } = await supabase.from('docenti').select('id, nome').eq('stato', 'Attivo').order('nome');
    setDocenti(data || []);
  };

  useEffect(() => {
    fetchAlunni();
    fetchDocenti();
  }, []);

  const handleOpenModal = (alunno = null) => {
    setEditingAlunno(alunno);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare alunno?")) return;
    const { error } = await supabase.from('alunni').delete().eq('id', id);
    if(error) alert(error.message);
    else fetchAlunni();
  };

  // --- RENDER ---
  return (
    <div className="h-full flex flex-col relative">
      {/* Toolbar - Fissa in alto */}
      <div className="p-4 border-b border-gray-800 flex justify-end shrink-0 bg-gray-900/20">
        <button 
          onClick={() => handleOpenModal(null)}
          className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
        >
          <Plus size={16} /> Nuovo Alunno
        </button>
      </div>

      {/* Table Container Scrollabile */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/80 text-gray-400 uppercase text-xs sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-6 py-4 font-semibold shadow-sm">Nome</th>
              <th className="px-6 py-4 font-semibold shadow-sm">Contatti</th>
              <th className="px-6 py-4 font-semibold shadow-sm">Docenti Associati</th>
              <th className="px-6 py-4 font-semibold text-center shadow-sm">Stato</th>
              <th className="px-6 py-4 font-semibold text-right shadow-sm">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {alunni.map(al => (
              <tr key={al.id} className="hover:bg-gray-800/30 transition-colors group">
                <td className="px-6 py-4 font-medium text-white">{al.nome}</td>
                <td className="px-6 py-4 text-gray-400">
                  <div>{al.email}</div>
                  <div className="text-xs text-gray-500">{al.cellulare}</div>
                </td>
                <td className="px-6 py-4 text-gray-300 text-xs">
                    {al.docentiNomi ? (
                        <span className="bg-gray-800 px-2 py-1 rounded text-gray-300 border border-gray-700">
                            {al.docentiNomi}
                        </span>
                    ) : <span className="text-gray-600">-</span>}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${
                    al.stato === 'Attivo' 
                      ? 'bg-green-900/20 text-green-400 border-green-900/50' 
                      : 'bg-gray-700/30 text-gray-400 border-gray-700'
                  }`}>
                    {al.stato}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={() => handleOpenModal(al)} 
                            className="p-1.5 hover:bg-gray-700 rounded-md text-blue-400 transition-colors"
                            title="Modifica"
                        >
                            <Edit2 size={16}/>
                        </button>
                        <button 
                            onClick={() => handleDelete(al.id)} 
                            className="p-1.5 hover:bg-gray-700 rounded-md text-red-400 transition-colors"
                            title="Elimina"
                        >
                            <Trash2 size={16}/>
                        </button>
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ModalAlunno 
          alunno={editingAlunno} 
          docenti={docenti}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchAlunni(); }}
        />
      )}
    </div>
  );
}

// --- COMPONENTE MODALE DEFINITO ESTERNAMENTE ---
function ModalAlunno({ alunno, docenti, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: alunno?.id || null,
    nome: alunno?.nome || '',
    email: alunno?.email || '',
    cellulare: alunno?.cellulare || '',
    stato: alunno?.stato || 'Attivo',
    note: alunno?.note || '',
    selectedDocenti: [] // ID dei docenti selezionati
  });

  // Carica associazioni esistenti all'apertura se in modifica
  useEffect(() => {
    if (alunno?.id) {
      const loadAssoc = async () => {
        const { data } = await supabase.from('associazioni').select('docente_id').eq('alunno_id', alunno.id);
        if (data) setFormData(prev => ({ ...prev, selectedDocenti: data.map(d => d.docente_id) }));
      };
      loadAssoc();
    }
  }, [alunno]);

  const toggleDocente = (docId) => {
    setFormData(prev => {
      const selected = prev.selectedDocenti.includes(docId)
        ? prev.selectedDocenti.filter(id => id !== docId)
        : [...prev.selectedDocenti, docId];
      return { ...prev, selectedDocenti: selected };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        nome: formData.nome,
        email: formData.email,
        cellulare: formData.cellulare,
        stato: formData.stato,
        note: formData.note
      };

      let newId = formData.id;

      if (newId) {
        // UPDATE
        await supabase.from('alunni').update(payload).eq('id', newId);
      } else {
        // INSERT
        newId = 'A' + Date.now();
        await supabase.from('alunni').insert([{ ...payload, id: newId }]);
      }

      // Aggiorna associazioni
      if (newId) {
        // Rimuovi vecchie
        await supabase.from('associazioni').delete().eq('alunno_id', newId);
        
        // Inserisci nuove
        if (formData.selectedDocenti.length > 0) {
          const assocPayload = formData.selectedDocenti.map(did => ({
            alunno_id: newId,
            docente_id: did
          }));
          await supabase.from('associazioni').insert(assocPayload);
        }
      }
      onSave();
    } catch(err) {
      alert("Errore: " + err.message);
    }
  };

  // Renderizza con Portal
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Modale */}
        <div className="flex justify-between mb-4 pb-4 border-b border-gray-800">
          <h3 className="text-xl font-bold text-white">{formData.id ? 'Modifica Alunno' : 'Nuovo Alunno'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white transition-colors"/></button>
        </div>

        {/* Body Modale Scrollabile */}
        <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
          <form id="formAlunno" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Nome</label>
                <input 
                  type="text" 
                  value={formData.nome} 
                  onChange={e => setFormData({...formData, nome: e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" 
                  required 
                  placeholder="Nome e Cognome"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Stato</label>
                <select 
                  value={formData.stato} 
                  onChange={e => setFormData({...formData, stato: e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none"
                >
                  <option value="Attivo">Attivo</option>
                  <option value="Non Attivo">Non Attivo</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Email</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" 
                  placeholder="email@esempio.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Cellulare</label>
                <input 
                  type="text" 
                  value={formData.cellulare} 
                  onChange={e => setFormData({...formData, cellulare: e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" 
                  placeholder="+39..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Note</label>
              <textarea 
                value={formData.note} 
                onChange={e => setFormData({...formData, note: e.target.value})} 
                className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" 
                rows="2"
              ></textarea>
            </div>

            <div className="border-t border-gray-800 pt-4">
              <label className="block text-sm font-bold text-accademia-red mb-3 uppercase tracking-wider">Docenti Associati</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                {docenti.map(d => (
                  <label key={d.id} className={`flex items-center gap-3 p-2 border rounded-lg cursor-pointer transition-all ${
                    formData.selectedDocenti.includes(d.id) 
                      ? 'bg-accademia-red/10 border-accademia-red text-white' 
                      : 'border-gray-800 hover:bg-gray-800 text-gray-400'
                  }`}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      formData.selectedDocenti.includes(d.id) ? 'bg-accademia-red border-accademia-red' : 'border-gray-600'
                    }`}>
                       {formData.selectedDocenti.includes(d.id) && <Check size={12} className="text-white" strokeWidth={4}/>}
                    </div>
                    
                    <input 
                      type="checkbox" 
                      checked={formData.selectedDocenti.includes(d.id)}
                      onChange={() => toggleDocente(d.id)}
                      className="hidden"
                    />
                    <span className="text-sm font-medium truncate select-none">{d.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="pt-4 border-t border-gray-800 mt-4 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Annulla</button>
          <button type="submit" form="formAlunno" className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg transition-all flex items-center gap-2">
            <Save size={18}/> Salva
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}