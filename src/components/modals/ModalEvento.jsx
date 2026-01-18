import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import { X, Trash2, Save } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog'; 

const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export default function ModalEvento({ event, events, docenteId, alunni, schoolId, onClose, onSave }) {
  const [tipiLezioni, setTipiLezioni] = useState([]);
  
  // Stati per i Dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOverlapWarning, setShowOverlapWarning] = useState(false); 

  // Se event ha un id, è modifica.
  const isEdit = !!(event?.id || event?.original_id); 

  const [formData, setFormData] = useState({
    id: event?.id || null,
    giorno: event?.giorno || event?.giorno_settimana || 'Lunedì',
    ora: event?.ora ? event.ora.slice(0,5) : (event?.ora_inizio?.slice(0,5) || '15:00'),
    alunno_id: event?.alunni?.id || '',
    lezione_id: event?.tipi_lezioni?.id || '',
    note: event?.note || ''
  });

  // --- FETCH TIPI LEZIONI ---
  useEffect(() => {
    let mounted = true;

    const fetchTipi = async () => {
        if (!docenteId) return; 

        try {
            // 1. Prendi gli ID abilitati per il docente
            const { data: abilitazioni, error: errAbilitazioni } = await supabase
                .from('docenti_tipi_lezioni')
                .select('tipo_lezione_id')
                .eq('docente_id', docenteId);
            
            if (errAbilitazioni) {
                console.error("Errore fetch abilitazioni:", errAbilitazioni);
                return;
            }

            const idsAbilitati = abilitazioni?.map(a => a.tipo_lezione_id) || [];

            // 2. Se non ha abilitazioni, lista vuota. 
            // IMPORTANTE: Non eseguire .in() con array vuoto, causa errore Supabase.
            if (idsAbilitati.length === 0) {
                if(mounted) setTipiLezioni([]); 
                return; 
            }

            // 3. Carica i dettagli delle lezioni abilitate
            const { data: tipiData, error: errTipi } = await supabase
                .from('tipi_lezioni')
                .select('*')
                .in('id', idsAbilitati) 
                .eq('attivo', true)
                .order('tipo');
            
            if (errTipi) {
                console.error("Errore fetch tipi:", errTipi);
                return;
            }

            if(mounted) setTipiLezioni(tipiData || []);
            
        } catch (error) {
            console.error("Errore generale fetchTipi:", error);
        }
    };
    
    fetchTipi();

    return () => { mounted = false; };
  }, [docenteId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- FUNZIONE CONTROLLO SOVRAPPOSIZIONI ---
  const checkOverlap = (newStart, duration, currentId) => {
    const [hh, mm] = newStart.split(':').map(Number);
    const startMinutes = hh * 60 + mm;
    const endMinutes = startMinutes + duration;

    // Assicurati che events sia un array
    const safeEvents = Array.isArray(events) ? events : [];

    const conflicts = safeEvents.filter(e => {
      if (currentId && e.id === currentId) return false;
      if (e.giorno_settimana !== formData.giorno) return false;

      // Safety check su ora_inizio
      if (!e.ora_inizio) return false;

      const [eh, em] = e.ora_inizio.split(':').map(Number);
      const eStart = eh * 60 + em;
      const eEnd = eStart + (e.durata_minuti || 60);

      return (startMinutes < eEnd && endMinutes > eStart);
    });

    return conflicts.length > 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const selectedTipo = tipiLezioni.find(t => t.id === formData.lezione_id);
      const durata = selectedTipo ? selectedTipo.durata_minuti : 60;

      if (checkOverlap(formData.ora, durata, formData.id)) {
        setShowOverlapWarning(true); 
        return; 
      }

      const payload = {
        docente_id: docenteId,
        giorno_settimana: formData.giorno,
        ora_inizio: formData.ora,
        durata_minuti: durata,
        alunno_id: formData.alunno_id,
        tipo_lezione_id: formData.lezione_id,
        note: formData.note
      };

      if (isEdit) {
        const { error } = await supabase.from('calendario').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('calendario').insert([payload]);
        if (error) throw error;
        
        await supabase.from('associazioni').upsert(
            { docente_id: docenteId, alunno_id: formData.alunno_id }, 
            { onConflict: 'docente_id, alunno_id' }
        );
      }
      onSave();
    } catch (err) {
      alert("Errore salvataggio: " + err.message);
    }
  };

  const handleDeleteConfirm = async () => {
    const { error } = await supabase.from('calendario').delete().eq('id', formData.id);
    if (!error) onSave();
    setShowDeleteConfirm(false);
  };

  // Safe check per alunni
  const safeAlunni = Array.isArray(alunni) ? alunni : [];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <h3 className="text-lg font-bold text-white">
            {isEdit ? 'Modifica Lezione' : 'Nuova Lezione'}
          </h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-white" /></button>
        </div>

        <div className="p-6 space-y-4">
          <form id="evtForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Giorno</label>
              <select name="giorno" value={formData.giorno} onChange={handleChange} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none">
                {DAYS.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ora Inizio</label>
                <input type="time" name="ora" value={formData.ora} onChange={handleChange} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tipo Lezione</label>
                <select name="lezione_id" value={formData.lezione_id} onChange={handleChange} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" required>
                  <option value="">Seleziona...</option>
                  {tipiLezioni.map(t => <option key={t.id} value={t.id}>{t.tipo} ({t.durata_minuti} min)</option>)}
                </select>
                {tipiLezioni.length === 0 && (
                    <p className="text-[10px] text-red-400 mt-1">Nessuna lezione abilitata per questo docente.</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Alunno</label>
              <select name="alunno_id" value={formData.alunno_id} onChange={handleChange} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" required>
                <option value="">Seleziona...</option>
                {safeAlunni.map(a => (
                    <option key={a.id} value={a.id}>
                        {a.cognome} {a.nome}
                    </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Note</label>
              <textarea name="note" value={formData.note} onChange={handleChange} rows="2" className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"></textarea>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex justify-between bg-gray-900/50">
          {isEdit ? (
            <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm font-medium transition-colors">
              <Trash2 size={16} /> Elimina
            </button>
          ) : <div></div>}
          
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">Annulla</button>
            <button type="submit" form="evtForm" className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-lg">
              <Save size={16} /> Salva
            </button>
          </div>
        </div>

        <ConfirmDialog
            isOpen={showDeleteConfirm}
            type="danger"
            title="Elimina Lezione"
            message="Sei sicuro di voler eliminare questa lezione dal calendario?"
            confirmText="Elimina"
            cancelText="Annulla"
            onConfirm={handleDeleteConfirm}
            onCancel={() => setShowDeleteConfirm(false)}
        />

        <ConfirmDialog
            isOpen={showOverlapWarning}
            type="warning"
            title="Sovrapposizione Rilevata"
            message="L'orario selezionato entra in conflitto con un'altra lezione esistente per questo giorno. Verifica l'orario e riprova."
            confirmText="Ho Capito"
            showCancel={false}
            onConfirm={() => setShowOverlapWarning(false)}
        />

      </div>
    </div>,
    document.body
  );
}