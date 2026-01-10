import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, Plus, X, Check, Save, Users } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function AlunniList({ userRole, userEmail }) {
  const [alunni, setAlunni] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [docenteId, setDocenteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlunno, setEditingAlunno] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ 
    isOpen: false, 
    type: 'danger',
    title: '',
    message: '',
    confirmText: 'Conferma',
    onConfirm: null,
    showCancel: true
  });

  // Recupera l'ID del docente associato all'utente loggato (se docente)
  useEffect(() => {
    const fetchDocenteId = async () => {
      if (userRole === 'Docente' && userEmail) {
        const { data } = await supabase
          .from('utenti')
          .select('id_collegato')
          .eq('email', userEmail)
          .eq('ruolo', 'Docente')
          .single();
        
        if (data?.id_collegato) {
          setDocenteId(data.id_collegato);
        }
      }
    };
    fetchDocenteId();
  }, [userRole, userEmail]);

  const fetchAlunni = async () => {
    setLoading(true);
    
    let alunniData;
    
    if (userRole === 'Docente' && docenteId) {
      const { data: assocData } = await supabase
        .from('associazioni')
        .select('alunno_id, alunni(*)')
        .eq('docente_id', docenteId);
      
      alunniData = assocData?.map(a => a.alunni).filter(Boolean) || [];
    } else {
      const { data } = await supabase
        .from('alunni')
        .select('*')
        .order('nome');
      
      alunniData = data || [];
    }
    
    const { data: assocData } = await supabase
      .from('associazioni')
      .select('alunno_id, docenti(nome)');
    
    const mapDocenti = {};
    assocData?.forEach(a => {
      if (!mapDocenti[a.alunno_id]) mapDocenti[a.alunno_id] = [];
      if (a.docenti) mapDocenti[a.alunno_id].push(a.docenti.nome);
    });

    const merged = alunniData.map(a => ({
      ...a,
      docentiNomi: mapDocenti[a.id]?.join(', ') || ''
    }));

    setAlunni(merged);
    setLoading(false);
  };

  const fetchDocenti = async () => {
    const { data } = await supabase
      .from('docenti')
      .select('id, nome')
      .eq('stato', 'Attivo')
      .order('nome');
    
    setDocenti(data || []);
  };

  useEffect(() => {
    if (userRole === 'Docente' && !docenteId) return;
    fetchAlunni();
    fetchDocenti();
  }, [userRole, docenteId]);

  const handleOpenModal = (alunno = null) => {
    setEditingAlunno(alunno);
    setShowModal(true);
  };

  const handleDeleteClick = async (alunno) => {
    // Verifica se ci sono lezioni associate
    const { data: lezioni, error } = await supabase
      .from('registro')
      .select('id')
      .eq('alunno_id', alunno.id)
      .limit(1);

    if (error) {
      console.error("Errore verifica lezioni:", error);
      setConfirmDialog({
        isOpen: true,
        type: 'danger',
        title: 'Errore',
        message: 'Si è verificato un errore durante la verifica. Riprova.',
        confirmText: 'OK',
        showCancel: false,
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    if (lezioni && lezioni.length > 0) {
      // Ci sono lezioni: imposta come Non Attivo
      setConfirmDialog({
        isOpen: true,
        type: 'warning',
        title: 'Impossibile Eliminare',
        message: `L'alunno "${alunno.nome}" ha lezioni registrate nel sistema.\n\nNon può essere eliminato, ma verrà impostato come "Non Attivo".`,
        confirmText: 'Imposta Non Attivo',
        cancelText: 'Annulla',
        showCancel: true,
        onConfirm: async () => {
          const { error: updateError } = await supabase
            .from('alunni')
            .update({ stato: 'Non Attivo' })
            .eq('id', alunno.id);

          if (updateError) {
            console.error("Errore aggiornamento stato:", updateError);
            setConfirmDialog({
              isOpen: true,
              type: 'danger',
              title: 'Errore',
              message: 'Errore durante l\'aggiornamento dello stato.',
              confirmText: 'OK',
              showCancel: false,
              onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
            });
          } else {
            fetchAlunni();
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        }
      });
    } else {
      // Nessuna lezione: elimina
      setConfirmDialog({
        isOpen: true,
        type: 'danger',
        title: 'Elimina Alunno',
        message: `Sei sicuro di voler eliminare l'alunno "${alunno.nome}"?\n\nQuesta azione non può essere annullata.`,
        confirmText: 'Elimina',
        cancelText: 'Annulla',
        showCancel: true,
        onConfirm: async () => {
          const { error: deleteError } = await supabase
            .from('alunni')
            .delete()
            .eq('id', alunno.id);

          if (deleteError) {
            console.error("Errore eliminazione:", deleteError);
            setConfirmDialog({
              isOpen: true,
              type: 'danger',
              title: 'Errore',
              message: 'Errore durante l\'eliminazione: ' + deleteError.message,
              confirmText: 'OK',
              showCancel: false,
              onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
            });
          } else {
            fetchAlunni();
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        }
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Caricamento alunni...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0 bg-gray-900/20">
        <div className="text-sm text-gray-400">
          {userRole === 'Docente' && (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-accademia-red rounded-full animate-pulse"></span>
              Visualizzi solo i tuoi alunni
            </span>
          )}
        </div>
        <button 
          onClick={() => handleOpenModal(null)}
          className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
        >
          <Plus size={16} /> Nuovo Alunno
        </button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        {alunni.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Nessun alunno {userRole === 'Docente' ? 'associato' : 'presente'}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900/80 text-gray-400 uppercase text-xs sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-6 py-4 font-semibold shadow-sm">Nome</th>
                <th className="px-6 py-4 font-semibold shadow-sm">Contatti</th>
                {userRole !== 'Docente' && (
                  <th className="px-6 py-4 font-semibold shadow-sm">Docenti Associati</th>
                )}
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
                  {userRole !== 'Docente' && (
                    <td className="px-6 py-4 text-gray-300 text-xs">
                      {al.docentiNomi ? (
                        <span className="bg-gray-800 px-2 py-1 rounded text-gray-300 border border-gray-700">
                          {al.docentiNomi}
                        </span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                  )}
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
                        onClick={() => handleDeleteClick(al)} 
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
        )}
      </div>

      {showModal && (
        <ModalAlunno 
          alunno={editingAlunno} 
          docenti={docenti}
          userRole={userRole}
          docenteId={docenteId}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchAlunni(); }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        type={confirmDialog.type}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        showCancel={confirmDialog.showCancel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// COMPONENTE MODALE - IDENTICO A PRIMA
function ModalAlunno({ alunno, docenti, userRole, docenteId, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: alunno?.id || null,
    nome: alunno?.nome || '',
    email: alunno?.email || '',
    cellulare: alunno?.cellulare || '',
    stato: alunno?.stato || 'Attivo',
    note: alunno?.note || '',
    selectedDocenti: []
  });

  const [existingDocenti, setExistingDocenti] = useState([]);
  const [loadingAssociations, setLoadingAssociations] = useState(false);

  useEffect(() => {
    if (alunno?.id) {
      const loadAssoc = async () => {
        setLoadingAssociations(true);
        try {
          const { data, error } = await supabase
            .from('associazioni')
            .select('docente_id, docenti(nome)')
            .eq('alunno_id', alunno.id);
          
          if (error) {
            console.error("Errore caricamento associazioni:", error);
            return;
          }
          
          if (data) {
            const docentiIds = data.map(d => d.docente_id);
            const docentiNomi = data.map(d => d.docenti?.nome).filter(Boolean);
            
            setFormData(prev => ({ 
              ...prev, 
              selectedDocenti: docentiIds
            }));
            
            if (userRole === 'Docente') {
              setExistingDocenti(docentiNomi);
            }
          }
        } catch (err) {
          console.error("Errore:", err);
        } finally {
          setLoadingAssociations(false);
        }
      };
      loadAssoc();
    } else if (userRole === 'Docente' && docenteId) {
      setFormData(prev => ({
        ...prev,
        selectedDocenti: [docenteId]
      }));
    }
  }, [alunno, userRole, docenteId]);

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
        const { error } = await supabase.from('alunni').update(payload).eq('id', newId);
        if (error) throw error;
      } else {
        newId = 'A' + Date.now();
        const { error } = await supabase.from('alunni').insert([{ ...payload, id: newId }]);
        if (error) throw error;
      }

      if (newId && userRole !== 'Docente') {
        await supabase.from('associazioni').delete().eq('alunno_id', newId);
        
        if (formData.selectedDocenti.length > 0) {
          const assocPayload = formData.selectedDocenti.map(did => ({
            alunno_id: newId,
            docente_id: did
          }));
          const { error } = await supabase.from('associazioni').insert(assocPayload);
          if (error) throw error;
        }
      } else if (newId && userRole === 'Docente' && !formData.id) {
        const { error } = await supabase.from('associazioni').insert([{
          alunno_id: newId,
          docente_id: docenteId
        }]);
        if (error) throw error;
      }
      
      onSave();
    } catch(err) {
      console.error("Errore salvataggio:", err);
      alert("Errore durante il salvataggio: " + err.message);
    }
  };

  const canEditAssociations = userRole !== 'Docente';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex justify-between mb-4 pb-4 border-b border-gray-800">
          <h3 className="text-xl font-bold text-white">
            {formData.id ? 'Modifica Alunno' : 'Nuovo Alunno'}
          </h3>
          <button onClick={onClose}>
            <X className="text-gray-400 hover:text-white transition-colors"/>
          </button>
        </div>

        <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
          <form id="formAlunno" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                  Nome
                </label>
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
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                  Stato
                </label>
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
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                  Email
                </label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" 
                  placeholder="email@esempio.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                  Cellulare
                </label>
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
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                Note
              </label>
              <textarea 
                value={formData.note} 
                onChange={e => setFormData({...formData, note: e.target.value})} 
                className="w-full bg-accademia-input border border-gray-700 rounded p-2.5 text-white focus:border-accademia-red focus:outline-none" 
                rows="2"
              ></textarea>
            </div>

            <div className="border-t border-gray-800 pt-4">
              <label className="block text-sm font-bold text-accademia-red mb-3 uppercase tracking-wider">
                {canEditAssociations ? 'Docenti Associati' : 'Associazione Docente'}
              </label>
              
              {canEditAssociations ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                  {docenti.map(d => {
                    const isSelected = formData.selectedDocenti.includes(d.id);
                    
                    return (
                      <label 
                        key={d.id} 
                        className={`flex items-center gap-3 p-2 border rounded-lg transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-accademia-red/10 border-accademia-red text-white' 
                            : 'border-gray-800 hover:bg-gray-800 text-gray-400'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-accademia-red border-accademia-red' 
                            : 'border-gray-600'
                        }`}>
                          {isSelected && (
                            <Check size={12} className="text-white" strokeWidth={4}/>
                          )}
                        </div>
                        
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleDocente(d.id)}
                          className="hidden"
                        />
                        <span className="text-sm font-medium truncate select-none">
                          {d.nome}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : formData.id ? (
                <div className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg">
                  {loadingAssociations ? (
                    <div className="text-center text-gray-400 py-2">Caricamento...</div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Users size={20} className="text-gray-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white mb-2">
                          Docenti Associati
                        </p>
                        {existingDocenti.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {existingDocenti.map((nome, idx) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-accademia-red/10 border border-accademia-red/30 rounded-full text-xs font-medium text-gray-300"
                              >
                                {nome}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">Nessun docente associato</p>
                        )}
                        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                          Solo gli amministratori e gestori possono modificare le associazioni con i docenti.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-gradient-to-r from-blue-900/20 to-accademia-red/10 border border-blue-800/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-accademia-red/20 border border-accademia-red/50 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={20} className="text-accademia-red" strokeWidth={3}/>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">
                        Associazione Automatica
                      </p>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Il nuovo alunno sarà automaticamente associato a te come docente. 
                        Solo gli amministratori e gestori possono modificare le associazioni con altri docenti.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="pt-4 border-t border-gray-800 mt-4 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Annulla
          </button>
          <button 
            type="submit" 
            form="formAlunno" 
            className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg transition-all flex items-center gap-2"
          >
            <Save size={18}/> Salva
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
