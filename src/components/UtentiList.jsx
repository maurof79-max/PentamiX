import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@supabase/supabase-js'; 
import { supabase } from '../supabaseClient';
import { X, Edit2, Trash2, Link as LinkIcon, UserPlus, Building } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function UtentiList() {
  const [utenti, setUtenti] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [scuole, setScuole] = useState([]); // <--- Lista Scuole (solo per Admin)
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Dati dell'utente loggato (chi sta facendo l'azione?)
  const [currentUser, setCurrentUser] = useState(null);

  const [successDialog, setSuccessDialog] = useState({ 
    isOpen: false, title: '', message: '' 
  });

  // --- INIT ---
  useEffect(() => {
    const init = async () => {
        setLoading(true);
        
        // 1. Chi sono io?
        const { data: { session } } = await supabase.auth.getSession();
        if(session) {
            const { data: profile } = await supabase.from('utenti').select('*').eq('id', session.user.id).single();
            setCurrentUser(profile);

            // 2. Se sono Admin, carico la lista delle scuole
            if (profile?.ruolo === 'Admin') {
                const { data: scuoleData } = await supabase.from('scuole').select('id, nome').order('nome');
                setScuole(scuoleData || []);
            }
        }
        
        await fetchUtenti();
        await fetchDocenti();
        setLoading(false);
    };
    init();
  }, []);

  const fetchUtenti = async () => {
    // La RLS filtrerà già gli utenti in base alla scuola se non sei Admin.
    // Se sei Admin, vedi tutti.
    const { data: userData, error } = await supabase
      .from('utenti')
      .select('*, docenti(nome), scuole(nome)') // Join anche con scuole
      .order('created_at', { ascending: false });
    
    if (error) console.error("Errore fetch utenti:", error);
    else setUtenti(userData || []);
  };

  const fetchDocenti = async () => {
    const { data } = await supabase.from('docenti').select('id, nome').order('nome');
    setDocenti(data || []);
  };

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
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h3 className="text-lg font-light text-white">Amministrazione Accessi</h3>
        <button 
          onClick={() => handleOpenModal(null)}
          className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
        >
          <UserPlus size={16} /> Nuovo Utente
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar pb-10">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-semibold">Nome Utente</th>
              <th className="px-6 py-4 font-semibold">Email</th>
              {currentUser?.ruolo === 'Admin' && <th className="px-6 py-4 font-semibold">Scuola</th>}
              <th className="px-6 py-4 font-semibold">Ruolo</th>
              <th className="px-6 py-4 font-semibold">Link Anagrafica</th>
              <th className="px-6 py-4 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {utenti.map((u, index) => (
              <tr key={u.id || index} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 font-medium text-white">{u.nome_esteso}</td>
                <td className="px-6 py-4 font-mono text-gray-400 text-xs">{u.email}</td>
                
                {/* Colonna Scuola (Solo per Admin) */}
                {currentUser?.ruolo === 'Admin' && (
                    <td className="px-6 py-4 text-gray-400 text-xs">
                        <div className="flex items-center gap-1">
                            <Building size={12}/> {u.scuole?.nome || 'N.D.'}
                        </div>
                    </td>
                )}

                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs border ${
                    u.ruolo === 'Admin' ? 'bg-red-900/30 text-red-400 border-red-900' : 
                    u.ruolo === 'Gestore' ? 'bg-purple-900/30 text-purple-400 border-purple-900' :
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
          scuole={scuole}           // Passiamo la lista scuole
          currentUser={currentUser} // Passiamo chi sta operando
          onClose={() => setShowModal(false)}
          onSave={(msgTitle, msgBody) => { 
            setShowModal(false); 
            fetchUtenti();
            if (msgTitle) setSuccessDialog({ isOpen: true, title: msgTitle, message: msgBody });
          }}
        />
      )}

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

function ModalUtente({ user, docenti, scuole, currentUser, onClose, onSave }) {
  const isEdit = !!user;

  // Stato Form
  const [formData, setFormData] = useState({
    email: user?.email || '',
    nome_esteso: user?.nome_esteso || '',
    ruolo: user?.ruolo || 'Docente',
    id_collegato: user?.id_collegato || '',
    password: '',
    school_id: user?.school_id || '' // Nuovo campo per la scuola
  });
  
  const [loading, setLoading] = useState(false);

  // Se non sono Admin e sto creando, la scuola è forzata alla mia
  useEffect(() => {
    if (!isEdit && currentUser?.ruolo !== 'Admin' && currentUser?.school_id) {
        setFormData(prev => ({ ...prev, school_id: currentUser.school_id }));
    }
  }, [currentUser, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validazione Scuola Obbligatoria
      if (!formData.school_id) throw new Error("Devi selezionare una scuola di appartenenza.");

      if (isEdit) {
        // UPDATE
        const { error } = await supabase
          .from('utenti')
          .update({
            nome_esteso: formData.nome_esteso,
            ruolo: formData.ruolo,
            id_collegato: formData.ruolo === 'Docente' ? formData.id_collegato : null,
            school_id: formData.school_id // Admin può spostare utente
          })
          .eq('id', user.id);

        if (error) throw error;
        onSave("Utente Modificato", "Dati aggiornati correttamente.");

      } else {
        // CREATE
        if (!formData.password || formData.password.length < 6) throw new Error("La password deve essere di almeno 6 caratteri.");

        // Client Temporaneo
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
        const memoryStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        const tempClient = createClient(supabaseUrl, supabaseKey, {
            auth: { storage: memoryStorage, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { 'x-client-info': 'temp-admin-creation' } }
        });

        // 1. SignUp
        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Errore creazione Auth.");

        // 2. Insert Profilo con school_id
        const { error: profileError } = await supabase
          .from('utenti')
          .insert([{
            id: authData.user.id,
            email: formData.email,
            nome_esteso: formData.nome_esteso,
            ruolo: formData.ruolo,
            stato: 'Attivo',
            id_collegato: formData.ruolo === 'Docente' ? formData.id_collegato : null,
            must_change_password: true,
            school_id: formData.school_id // <--- FONDAMENTALE
          }]);

        if (profileError) throw new Error("Utente Auth creato, ma errore DB Profilo: " + profileError.message);

        onSave("Utente Creato", `Utente creato per la scuola selezionata!\nEmail: ${formData.email}\nPassword: ${formData.password}`);
      }
    } catch(err) {
      alert("Errore: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between mb-6">
          <h3 className="text-xl font-bold text-white">{isEdit ? 'Modifica Profilo' : 'Nuovo Utente'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* SELETTORE SCUOLA (Visibile solo agli Admin) */}
          {currentUser?.ruolo === 'Admin' && (
             <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg">
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase flex items-center gap-1">
                    <Building size={12}/> Scuola di Appartenenza
                </label>
                <select 
                  value={formData.school_id} 
                  onChange={e => setFormData({...formData, school_id: e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-600 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
                  required
                >
                  <option value="">-- Seleziona Scuola --</option>
                  {scuole.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">L'utente vedrà solo i dati di questa scuola.</p>
             </div>
          )}

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