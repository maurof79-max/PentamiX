import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Edit2, Trash2, Plus, X, Check, Save, Users, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function AlunniList({ userRole, userEmail }) {
  const [alunni, setAlunni] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [docenteId, setDocenteId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // --- NUOVI STATI PER FILTRI E ORDINAMENTO ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDocente, setFilterDocente] = useState('');
  const [filterStato, setFilterStato] = useState(''); // '' = Tutti
  const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'asc' });

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
      .select('alunno_id, docenti(id, nome)');
    
    const mapDocentiNomi = {};
    const mapDocentiIds = {}; // Serve per il filtro

    assocData?.forEach(a => {
      if (!mapDocentiNomi[a.alunno_id]) mapDocentiNomi[a.alunno_id] = [];
      if (!mapDocentiIds[a.alunno_id]) mapDocentiIds[a.alunno_id] = [];

      if (a.docenti) {
        mapDocentiNomi[a.alunno_id].push(a.docenti.nome);
        mapDocentiIds[a.alunno_id].push(a.docenti.id);
      }
    });

    const merged = alunniData.map(a => ({
      ...a,
      docentiNomi: mapDocentiNomi[a.id]?.join(', ') || '',
      docentiIds: mapDocentiIds[a.id] || []
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

  // --- LOGICA DI FILTRO E ORDINAMENTO (NUOVA) ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={14} className="ml-1 opacity-30" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="ml-1 text-accademia-red" /> 
      : <ArrowDown size={14} className="ml-1 text-accademia-red" />;
  };

  const filteredAlunni = useMemo(() => {
    let result = [...alunni];

    // 1. Filtro Ricerca
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(a => 
        (a.nome && a.nome.toLowerCase().includes(lower)) ||
        (a.email && a.email.toLowerCase().includes(lower)) ||
        (a.cellulare && a.cellulare.includes(lower))
      );
    }

    // 2. Filtro Docente (Solo Admin/Gestore)
    if (userRole !== 'Docente' && filterDocente) {
      result = result.filter(a => a.docentiIds && a.docentiIds.includes(filterDocente));
    }

    // 3. Filtro Stato
    if (filterStato) {
      result = result.filter(a => a.stato === filterStato);
    }

    // 4. Ordinamento
    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key] || '';
        let valB = b[sortConfig.key] || '';
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [alunni, searchTerm, filterDocente, filterStato, sortConfig, userRole]);


  const handleOpenModal = (alunno = null) => {
    setEditingAlunno(alunno);
    setShowModal(true);
  };

  const handleDeleteClick = async (alunno) => {
    const { data: lezioni, error } = await supabase
      .from('registro')
      .select('id')
      .eq('alunno_id', alunno.id)
      .limit(1);

    if (error) {
      console.error("Errore verifica lezioni:", error);
      return;
    }

    if (lezioni && lezioni.length > 0) {
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
            alert('Errore durante l\'aggiornamento dello stato.');
          } else {
            fetchAlunni();
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        }
      });
    } else {
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
             alert('Errore durante l\'eliminazione: ' + deleteError.message);
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
    <div className="h-full flex flex-col relative bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      
      {/* HEADER & TOOLBAR (NUOVA SEZIONE FILTRI) */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/20 space-y-4 shrink-0">
        <div className="flex justify-between items-center">
            <div className="text-sm text-gray-400">
            {userRole === 'Docente' ? (
                <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-accademia-red rounded-full animate-pulse"></span>
                Visualizzi solo i tuoi alunni ({filteredAlunni.length})
                </span>
            ) : (
                <span className="flex items-center gap-2 font-bold text-white text-lg">
                   <Users size={20} className="text-accademia-red"/> Gestione Alunni 
                   <span className="bg-gray-800 text-xs px-2 py-0.5 rounded-full border border-gray-700 font-normal ml-2">{filteredAlunni.length}</span>
                </span>
            )}
            </div>
            <button 
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
            >
            <Plus size={16} /> Nuovo Alunno
            </button>
        </div>

        {/* --- BARRA DEI FILTRI --- */}
        <div className="flex flex-col sm:flex-row gap-3">
             {/* 1. Cerca */}
             <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                <input 
                    type="text" 
                    placeholder="Cerca nome, email, telefono..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-4 py-2 text-sm focus:border-accademia-red focus:outline-none placeholder-gray-600 transition-colors"
                />
             </div>

             {/* 2. Filtro Stato */}
             <div className="relative w-full sm:w-40">
                 <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                 <select 
                    value={filterStato}
                    onChange={(e) => setFilterStato(e.target.value)}
                    className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-8 py-2 text-sm appearance-none focus:border-accademia-red focus:outline-none cursor-pointer"
                 >
                    <option value="">Tutti gli Stati</option>
                    <option value="Attivo">Attivo</option>
                    <option value="Non Attivo">Non Attivo</option>
                 </select>
             </div>

             {/* 3. Filtro Docente (Solo Admin/Gestore) */}
             {userRole !== 'Docente' && (
                <div className="relative w-full sm:w-64">
                    <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
                    <select
                        value={filterDocente}
                        onChange={(e) => setFilterDocente(e.target.value)}
                        className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-10 pr-8 py-2 text-sm appearance-none focus:border-accademia-red focus:outline-none cursor-pointer"
                    >
                        <option value="">Tutti i Docenti</option>
                        {docenti.map(d => (
                            <option key={d.id} value={d.id}>{d.nome}</option>
                        ))}
                    </select>
                </div>
             )}
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        {filteredAlunni.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <Search size={40} className="opacity-20"/>
            <p>Nessun alunno trovato con i filtri correnti.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900/80 text-gray-400 uppercase text-xs sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-6 py-4 font-semibold shadow-sm cursor-pointer hover:text-white group" onClick={() => handleSort('nome')}>
                   <div className="flex items-center">Nome {getSortIcon('nome')}</div>
                </th>
                <th className="px-6 py-4 font-semibold shadow-sm">Contatti</th>
                {userRole !== 'Docente' && (
                  <th className="px-6 py-4 font-semibold shadow-sm">Docenti Associati</th>
                )}
                <th className="px-6 py-4 font-semibold text-center shadow-sm cursor-pointer hover:text-white group" onClick={() => handleSort('stato')}>
                    <div className="flex items-center justify-center">Stato {getSortIcon('stato')}</div>
                </th>
                <th className="px-6 py-4 font-semibold text-right shadow-sm">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredAlunni.map(al => (
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

// COMPONENTE MODALE (Completo di tutte le logiche e stili originali)
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