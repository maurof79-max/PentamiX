import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@supabase/supabase-js'; 
import { supabase } from '../supabaseClient';
import { X, Edit2, Trash2, Link as LinkIcon, UserPlus, AlertTriangle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog'; // IMPORTA IL COMPONENTE

export default function UtentiList() {
  const [utenti, setUtenti] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // STATO PER IL MESSAGGIO DI SUCCESSO
  const [successDialog, setSuccessDialog] = useState({ 
    isOpen: false, 
    title: '', 
    message: '' 
  });

  const fetchUtenti = async () => {
    setLoading(true);
    const { data: userData, error } = await supabase
      .from('utenti')
      .select('*, docenti(nome)')
      .order('nome_esteso');
    
    if (error) console.error("Errore fetch utenti:", error);
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

  const handleOpenModal = (user = null) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const handleDelete = async (user) => {
    if (!confirm(`Sei sicuro di voler rimuovere l'accesso a ${user.nome_esteso}?`)) return;
    const { error } = await supabase.from('utenti').delete().eq('id', user.id);
    if (error) alert("Errore durante l'eliminazione: " + error.message);
    else fetchUtenti();
  };

  return (
    <div className="p-0 relative">
      {/* ... Header e Tabella ... */}
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
              <th className="px-6 py-4 font-semibold">Email</th>
              <th className="px-6 py-4 font-semibold">Ruolo</th>
              <th className="px-6 py-4 font-semibold">Docente Associato</th>
              <th className="px-6 py-4 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {utenti.map((u, index) => (
              <tr key={u.id || index} className="hover:bg-gray-800/30 transition-colors">
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
                  <button onClick={() => handleDelete(u)} className="p-1 hover:bg-gray-700 rounded text-red-400"><Trash2 size={16}/></button>
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
          onSave={(msgTitle, msgBody) => { 
            setShowModal(false); 
            fetchUtenti();
            // Se la modale restituisce un messaggio (creazione), mostriamo il dialog
            if (msgTitle) {
                setSuccessDialog({ isOpen: true, title: msgTitle, message: msgBody });
            }
          }}
        />
      )}

      {/* DIALOG DI SUCCESSO */}
      <ConfirmDialog
        isOpen={successDialog.isOpen}
        type="success"
        title={successDialog.title}
        message={successDialog.message}
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setSuccessDialog({ ...successDialog, isOpen: false })}
      />
    </div>
  );
}

function ModalUtente({ user, docenti, onClose, onSave }) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    nome_esteso: user?.nome_esteso || '',
    ruolo: user?.ruolo || 'Docente',
    id_collegato: user?.id_collegato || '',
    password: '' 
  });
  const [loading, setLoading] = useState(false);
  const isEdit = !!user;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEdit) {
        // UPDATE
        const { error } = await supabase
          .from('utenti')
          .update({
            nome_esteso: formData.nome_esteso,
            ruolo: formData.ruolo,
            id_collegato: formData.ruolo === 'Docente' ? formData.id_collegato : null
          })
          .eq('id', user.id);
        if (error) throw error;
        
        onSave("Utente Modificato", "I dati dell'utente sono stati aggiornati correttamente.");

      } else {
        // CREATE
        if (!formData.password || formData.password.length < 6) throw new Error("Password troppo corta.");

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
        
        const memoryStorage = {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };

        const tempClient = createClient(supabaseUrl, supabaseKey, {
            auth: {
                storage: memoryStorage,
                persistSession: false,     // Non salvare sessione
                autoRefreshToken: false,   // Non refreshare token
                detectSessionInUrl: false  // Ignora URL
            },
            // AGGIUNTA: Disabilita i warning globali per questo client isolato
            global: {
                headers: { 'x-client-info': 'temp-admin-creation' } 
            }
        });

        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Errore creazione Auth.");

        const { error: profileError } = await supabase
          .from('utenti')
          .insert([{
            id: authData.user.id,
            email: formData.email,
            nome_esteso: formData.nome_esteso,
            ruolo: formData.ruolo,
            stato: 'Attivo',
            id_collegato: formData.ruolo === 'Docente' ? formData.id_collegato : null,
            must_change_password: true
          }]);

        if (profileError) throw new Error("Utente Auth creato, ma errore DB Profilo: " + profileError.message);

        // Passiamo i dati al parent per mostrarli nel dialog
        onSave(
            "Utente Creato", 
            `Utente creato con successo!\nEmail: ${formData.email}\nPassword Provvisoria: ${formData.password}`
        );
      }
    } catch(err) {
      alert("Errore: " + err.message); // Qui lasciamo alert per gli errori o puoi usare un altro stato
    } finally {
      setLoading(false);
    }
  };

  // ... (Il resto del JSX del Form rimane identico a prima) ...
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between mb-6">
          <h3 className="text-xl font-bold text-white">{isEdit ? 'Modifica Profilo' : 'Nuovo Utente'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Nome e Cognome</label>
            <input type="text" value={formData.nome_esteso} onChange={e => setFormData({...formData, nome_esteso: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" required />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email (Login)</label>
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} disabled={isEdit} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50" required />
          </div>
          {!isEdit && (
            <div className="bg-yellow-900/10 border border-yellow-800/30 p-3 rounded-lg">
                <label className="block text-xs font-bold text-yellow-500 mb-1 uppercase">Password Provvisoria</label>
                <input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-yellow-500 focus:outline-none font-mono" placeholder="Es: Musica2025!" required minLength={6} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Ruolo</label>
              <select value={formData.ruolo} onChange={e => setFormData({...formData, ruolo: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none">
                <option value="Docente">Docente</option>
                <option value="Gestore">Gestore</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
          {formData.ruolo === 'Docente' && (
            <div className="p-3 border border-red-900/30 bg-red-900/10 rounded-lg">
              <label className="block text-xs font-bold text-accademia-red mb-1 uppercase">Associa ad Anagrafica</label>
              <select value={formData.id_collegato} onChange={e => setFormData({...formData, id_collegato: e.target.value})} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none">
                <option value="">-- Seleziona Docente --</option>
                {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Annulla</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg disabled:opacity-50">
              {loading ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}