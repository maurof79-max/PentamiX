import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, Link as LinkIcon, UserPlus } from 'lucide-react';

export default function UtentiList() {
  const [utenti, setUtenti] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // --- FETCH DATI ---
  const fetchUtenti = async () => {
    setLoading(true);
    // Join utenti con docenti per mostrare il nome del docente collegato
    const { data: userData, error } = await supabase
      .from('utenti')
      .select('*, docenti(nome)')
      .order('nome_esteso');
    
    if (error) console.error(error);
    else setUtenti(userData || []);
    setLoading(false);
  };

  const fetchDocenti = async () => {
    const { data } = await supabase.from('docenti').select('id, nome').order('nome');
    setDocenti(data || []);
  };

  useEffect(() => {
    fetchUtenti();
    fetchDocenti();
  }, []);

  // --- HANDLERS ---
  const handleOpenModal = (user = null) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const handleDelete = async (email) => {
    if (!confirm(`Eliminare l'utente ${email}?`)) return;
    const { error } = await supabase.from('utenti').delete().eq('email', email);
    if (error) alert("Errore: " + error.message);
    else fetchUtenti();
  };

  return (
    <div className="p-0 relative">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h3 className="text-lg font-light text-white">Amministrazione Accessi</h3>
        <button 
          onClick={() => handleOpenModal(null)}
          className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
        >
          <UserPlus size={16} /> Nuovo Utente
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-semibold">Nome Utente</th>
              <th className="px-6 py-4 font-semibold">Email (Login)</th>
              <th className="px-6 py-4 font-semibold">Ruolo</th>
              <th className="px-6 py-4 font-semibold">Docente Associato</th>
              <th className="px-6 py-4 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {utenti.map(u => (
              <tr key={u.email} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 font-medium text-white">{u.nome_esteso}</td>
                <td className="px-6 py-4 font-mono text-gray-400 text-xs">{u.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs border ${
                    u.ruolo === 'Admin' ? 'bg-red-900/30 text-red-400 border-red-900' : 
                    u.ruolo === 'Docente' ? 'bg-blue-900/30 text-blue-400 border-blue-900' : 
                    'bg-gray-700 text-gray-300 border-gray-600'
                  }`}>
                    {u.ruolo}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300">
                  {u.docenti ? (
                    <div className="flex items-center gap-1 text-accademia-red">
                      <LinkIcon size={12} /> {u.docenti.nome}
                    </div>
                  ) : <span className="text-gray-600">-</span>}
                </td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button onClick={() => handleOpenModal(u)} className="p-1 hover:bg-gray-700 rounded text-blue-400"><Edit2 size={16}/></button>
                  <button onClick={() => handleDelete(u.email)} className="p-1 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ModalUtente 
          user={editingUser} 
          docenti={docenti}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchUtenti(); }}
        />
      )}
    </div>
  );
}

// Helper per hash SHA-256 (copiato da Login.jsx per coerenza)
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function ModalUtente({ user, docenti, onClose, onSave }) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    nome_esteso: user?.nome_esteso || '',
    ruolo: user?.ruolo || 'Docente',
    id_collegato: user?.id_collegato || '',
    password: '' // Solo per nuovo inserimento o reset
  });

  const isEdit = !!user;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        email: formData.email,
        nome_esteso: formData.nome_esteso,
        ruolo: formData.ruolo,
        id_collegato: formData.ruolo === 'Docente' ? formData.id_collegato : null,
        stato: 'Attivo'
      };

      // Se c'è una password, hashala e aggiungila
      if (formData.password) {
        payload.password = await sha256(formData.password);
      }

      if (isEdit) {
        // Update (non permettiamo cambio email qui per semplicità PK)
        delete payload.email; 
        const { error } = await supabase.from('utenti').update(payload).eq('email', formData.email);
        if (error) throw error;
      } else {
        // Insert
        if (!formData.password) return alert("Password richiesta per nuovi utenti");
        const { error } = await supabase.from('utenti').insert([payload]);
        if (error) throw error;
      }
      onSave();
    } catch(err) {
      alert("Errore: " + err.message);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex justify-between mb-6">
          <h3 className="text-xl font-bold text-white">{isEdit ? 'Modifica Utente' : 'Nuovo Utente'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome e Cognome</label>
            <input 
              type="text" 
              value={formData.nome_esteso} 
              onChange={e => setFormData({...formData, nome_esteso: e.target.value})} 
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" 
              required 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email (Login)</label>
            <input 
              type="email" 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})} 
              disabled={isEdit}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" 
              required 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">
              {isEdit ? 'Nuova Password (lascia vuoto per non cambiare)' : 'Password'}
            </label>
            <input 
              type="password" 
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" 
              required={!isEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Ruolo</label>
              <select 
                value={formData.ruolo} 
                onChange={e => setFormData({...formData, ruolo: e.target.value})} 
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              >
                <option value="Docente">Docente</option>
                <option value="Gestore">Gestore</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>

          {/* Selezione Docente (Solo se ruolo è Docente) */}
          {formData.ruolo === 'Docente' && (
            <div className="p-3 border border-red-900/30 bg-red-900/10 rounded-lg">
              <label className="block text-xs font-bold text-accademia-red mb-1 uppercase">Associa ad Anagrafica</label>
              <select 
                value={formData.id_collegato} 
                onChange={e => setFormData({...formData, id_collegato: e.target.value})} 
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              >
                <option value="">-- Seleziona Docente --</option>
                {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">Collega questo login alla scheda docente per permessi e filtri.</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Annulla</button>
            <button type="submit" className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg">Salva</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}