import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, Eye, Plus, X, Check } from 'lucide-react';

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

  return (
    <div className="p-0 relative">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-800 flex justify-end">
        <button 
          onClick={() => handleOpenModal(null)}
          className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm"
        >
          <Plus size={16} /> Nuovo Alunno
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-semibold">Nome</th>
              <th className="px-6 py-4 font-semibold">Contatti</th>
              <th className="px-6 py-4 font-semibold">Docenti Associati</th>
              <th className="px-6 py-4 font-semibold text-center">Stato</th>
              <th className="px-6 py-4 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {alunni.map(al => (
              <tr key={al.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 font-medium text-white">{al.nome}</td>
                <td className="px-6 py-4 text-gray-400">
                  <div>{al.email}</div>
                  <div className="text-xs text-gray-500">{al.cellulare}</div>
                </td>
                <td className="px-6 py-4 text-gray-300 text-xs">{al.docentiNomi}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs ${al.stato === 'Attivo' ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                    {al.stato}
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button onClick={() => handleOpenModal(al)} className="text-blue-400 hover:bg-gray-700 p-1 rounded"><Edit2 size={16}/></button>
                  <button onClick={() => handleDelete(al.id)} className="text-red-400 hover:bg-gray-700 p-1 rounded"><Trash2 size={16}/></button>
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

  // Carica associazioni esistenti all'apertura
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
        await supabase.from('alunni').update(payload).eq('id', newId);
      } else {
        newId = 'A' + Date.now();
        await supabase.from('alunni').insert([{ ...payload, id: newId }]);
      }

      // Aggiorna associazioni: Cancella tutte e ricrea (metodo brute-force sicuro)
      if (newId) {
        await supabase.from('associazioni').delete().eq('alunno_id', newId);
        
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex justify-between mb-4">
          <h3 className="text-xl font-bold text-white">{formData.id ? 'Modifica Alunno' : 'Nuovo Alunno'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>

        <div className="overflow-y-auto pr-2 custom-scrollbar">
          <form id="formAlunno" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Nome</label>
                <input type="text" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Stato</label>
                <select value={formData.stato} onChange={e => setFormData({...formData, stato: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white">
                  <option value="Attivo">Attivo</option>
                  <option value="Non Attivo">Non Attivo</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Cellulare</label>
                <input type="text" value={formData.cellulare} onChange={e => setFormData({...formData, cellulare: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Note</label>
              <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded p-2 text-white" rows="2"></textarea>
            </div>

            <div className="border-t border-gray-800 pt-4">
              <label className="block text-sm font-bold text-accademia-red mb-3">Docenti Associati</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {docenti.map(d => (
                  <label key={d.id} className="flex items-center gap-2 p-2 border border-gray-800 rounded hover:bg-gray-800 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.selectedDocenti.includes(d.id)}
                      onChange={() => toggleDocente(d.id)}
                      className="accent-accademia-red"
                    />
                    <span className="text-sm text-gray-300 truncate">{d.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="pt-4 border-t border-gray-800 mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button>
          <button type="submit" form="formAlunno" className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded font-bold shadow-lg">Salva</button>
        </div>
      </div>
    </div>,
    document.body
  );
}