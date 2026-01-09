import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, RefreshCw, Trash2, Save, Users, Calendar as CalIcon } from 'lucide-react';

// --- COSTANTI CONFIGURAZIONE GRIGLIA ---
const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const START_HOUR = 10;
const END_HOUR = 23;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * (60 / SLOT_MINUTES); // (23-10)*2 = 26 slots

export default function Calendario({ user }) {
  const [events, setEvents] = useState([]);
  const [docenti, setDocenti] = useState([]);
  const [selectedDocenteId, setSelectedDocenteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null); // null = nuovo, obj = modifica

  // --- INIT & DATI ---
  useEffect(() => {
    if (user.ruolo !== 'Docente') {
      const fetchDocenti = async () => {
        const { data } = await supabase.from('docenti').select('id, nome').eq('stato', 'Attivo').order('nome');
        if (data) setDocenti(data);
      };
      fetchDocenti();
    } else {
      setSelectedDocenteId(user.id_collegato);
    }
  }, [user]);

  useEffect(() => {
    if (selectedDocenteId) loadEvents();
    else setEvents([]);
  }, [selectedDocenteId]);

  const loadEvents = async () => {
    if (!selectedDocenteId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calendario')
        .select(`
          id, giorno_settimana, ora_inizio, durata_minuti, note,
          alunni ( id, nome ),
          tipi_lezioni ( id, tipo )
        `)
        .eq('docente_id', selectedDocenteId);

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error("Errore calendario:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGICA POSIZIONAMENTO GRIGLIA ---
  // Calcola riga inizio e span (altezza) basati su ora e durata
  const getEventStyle = (evt) => {
    const [hh, mm] = evt.ora_inizio.split(':').map(Number);
    
    // Calcolo indice slot partenza (0-based)
    const startSlot = (hh - START_HOUR) * 2 + (mm / 30);
    
    // Calcolo quanti slot occupa
    const span = Math.ceil(evt.durata_minuti / 30);

    // CSS Grid Rows (1-based)
    const gridRowStart = startSlot + 1;
    const gridRowEnd = gridRowStart + span;

    // Colore
    let bgColor = 'bg-accademia-red border-red-800'; 
    const tipo = evt.tipi_lezioni?.tipo?.toLowerCase() || '';
    if (tipo.includes('teoria')) bgColor = 'bg-green-700 border-green-800';
    if (tipo.includes('propedeutica')) bgColor = 'bg-yellow-600 border-yellow-700';

    return {
      gridRow: `${gridRowStart} / ${gridRowEnd}`,
      styleClass: bgColor
    };
  };

  // --- HANDLERS ---
  const handleSlotClick = (dayIndex, slotIndex) => {
    if (!selectedDocenteId) return;
    
    // Calcola ora dal click
    const totalMinutes = slotIndex * 30;
    const hh = START_HOUR + Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    const timeString = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;

    setEditingEvent({
      giorno: DAYS[dayIndex],
      ora: timeString,
      durata: 60 // Default 1h
    });
    setShowModal(true);
  };

  const handleEventClick = (e, evt) => {
    e.stopPropagation(); // Evita click slot sottostante
    setEditingEvent(evt);
    setShowModal(true);
  };

  // Generazione etichette orarie
  const timeLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const totalMinutes = i * 30;
      const hh = START_HOUR + Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      labels.push(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`);
    }
    return labels;
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      
      {/* HEADER TOOLBAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 bg-accademia-card p-4 rounded-lg border border-gray-800 shadow-sm shrink-0">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          {user.ruolo !== 'Docente' ? (
            <div className="relative w-full sm:w-72">
              <select
                className="w-full bg-accademia-input border border-gray-700 text-white rounded-md pl-4 pr-10 py-2 appearance-none focus:border-accademia-red focus:outline-none transition-colors"
                value={selectedDocenteId || ''}
                onChange={(e) => setSelectedDocenteId(e.target.value)}
              >
                <option value="">-- Seleziona Docente --</option>
                {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <Users size={16} />
              </div>
            </div>
          ) : (
            <h2 className="text-xl font-light text-white flex items-center gap-2">
              <CalIcon className="text-accademia-red" />
              <span className="font-semibold">Orario Settimanale</span>
            </h2>
          )}

          <button 
            onClick={loadEvents} 
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
            title="Ricarica"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <button
          onClick={() => {
            if(!selectedDocenteId) return alert("Seleziona un docente");
            setEditingEvent(null);
            setShowModal(true);
          }}
          disabled={!selectedDocenteId}
          className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-5 py-2 rounded-md text-sm font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
          Nuova Lezione
        </button>
      </div>

      {/* --- GRIGLIA ORARIO --- */}
      <div className="flex-1 bg-accademia-card border border-gray-800 rounded-xl overflow-auto shadow-2xl relative custom-scrollbar">
        {!selectedDocenteId ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
            <Users size={48} className="opacity-20" />
            <p>Seleziona un docente per visualizzare la griglia.</p>
          </div>
        ) : (
          <div className="min-w-[800px] p-4">
            {/* Header Giorni */}
            <div className="grid grid-cols-[60px_repeat(6,1fr)] gap-px border-b border-gray-700 mb-2 pb-2 sticky top-0 bg-accademia-card z-10">
              <div className="text-center text-xs text-gray-500 font-bold uppercase pt-2">Ora</div>
              {DAYS.map(d => (
                <div key={d} className="text-center text-sm font-bold text-gray-300 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Body Griglia */}
            <div className="grid grid-cols-[60px_repeat(6,1fr)] gap-x-1 relative">
              
              {/* Colonna Orari */}
              <div className="flex flex-col text-right pr-3 text-xs text-gray-500 font-mono pt-[-8px]">
                {timeLabels.map((time, i) => (
                  <div key={i} className="h-12 border-t border-transparent relative -top-3">
                    {time}
                  </div>
                ))}
              </div>

              {/* Colonne Giorni (Background Slots) */}
              {DAYS.map((day, dayIndex) => (
                <div key={day} className="relative border-l border-gray-800/50">
                  {/* Genera Slot Vuoti Cliccabili */}
                  {Array.from({ length: TOTAL_SLOTS }).map((_, slotIndex) => {
                    // Logica per differenziare le righe:
                    // slotIndex 0 = 10:00-10:30 (Bottom 10:30)
                    // slotIndex 1 = 10:30-11:00 (Bottom 11:00)
                    // Se (slotIndex + 1) è pari, è un'ora piena (11:00, 12:00...) -> Bordo solido scuro
                    // Se (slotIndex + 1) è dispari, è una mezz'ora (10:30, 11:30...) -> Bordo tratteggiato leggero
                    const isFullHourLine = (slotIndex + 1) % 2 === 0;
                    const borderClass = isFullHourLine 
                      ? 'border-gray-700' // Bordo ora piena (più visibile)
                      : 'border-gray-800/40 border-dashed'; // Bordo mezz'ora (meno visibile)

                    return (
                      <div 
                        key={slotIndex}
                        onClick={() => handleSlotClick(dayIndex, slotIndex)}
                        className={`h-12 border-b ${borderClass} hover:bg-gray-800/30 transition-colors cursor-pointer`}
                      />
                    );
                  })}

                  {/* Renderizza Eventi per questo giorno SOPRA gli slot */}
                  {events
                    .filter(e => e.giorno_settimana === day)
                    .map(evt => {
                      const { gridRow, styleClass } = getEventStyle(evt);
                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => handleEventClick(e, evt)}
                          className={`absolute w-[94%] left-[3%] rounded px-2 py-1 text-xs cursor-pointer shadow-md hover:brightness-110 transition-all border-l-4 z-10 overflow-hidden flex flex-col justify-center leading-tight ${styleClass}`}
                          style={{ 
                            gridRow, // Fallback
                            // Calcolo Absolute: (SlotPartenza * AltezzaSlot)
                            top: `${((parseInt(evt.ora_inizio.split(':')[0]) - START_HOUR) * 2 + (parseInt(evt.ora_inizio.split(':')[1]) / 30)) * 3}rem`, // 3rem = 12 (h-12)
                            height: `${(evt.durata_minuti / 30) * 3}rem`
                          }}
                        >
                          <div className="font-bold text-white truncate">
                            {evt.alunni?.nome || 'Sconosciuto'}
                          </div>
                          <div className="text-white/80 text-[10px] truncate">
                            {evt.tipi_lezioni?.tipo}
                          </div>
                          <div className="text-white/60 text-[9px] mt-auto truncate">
                            {evt.ora_inizio.slice(0,5)} ({evt.durata_minuti}m)
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modale */}
      {showModal && (
        <ModalEvento
          event={editingEvent}
          docenteId={selectedDocenteId}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); loadEvents(); }}
        />
      )}
    </div>
  );
}

// --- MODALE ---
function ModalEvento({ event, docenteId, onClose, onSave }) {
  const [alunni, setAlunni] = useState([]);
  const [tipiLezioni, setTipiLezioni] = useState([]);
  
  // Se event ha un id, è modifica. Altrimenti è nuovo (event può contenere prefill di data/ora)
  const isEdit = event?.id || event?.original_id; // Check robusto

  const [formData, setFormData] = useState({
    id: event?.id || null,
    giorno: event?.giorno || event?.giorno_settimana || 'Lunedì',
    ora: event?.ora ? event.ora.slice(0,5) : (event?.ora_inizio?.slice(0,5) || '15:00'),
    alunno_id: event?.alunni?.id || '',
    lezione_id: event?.tipi_lezioni?.id || '',
    note: event?.note || ''
  });

  useEffect(() => {
    const fetchData = async () => {
      // 1. Alunni
      const { data: assocData } = await supabase
        .from('associazioni')
        .select('alunni(id, nome)')
        .eq('docente_id', docenteId);
      
      let mappedAlunni = assocData?.map(a => a.alunni).filter(Boolean) || [];
      if (mappedAlunni.length === 0) {
         const { data: allAlunni } = await supabase.from('alunni').select('id, nome').eq('stato', 'Attivo').order('nome');
         mappedAlunni = allAlunni || [];
      }
      setAlunni(mappedAlunni);

      // 2. Tipi Lezioni
      const { data: tipiData } = await supabase.from('tipi_lezioni').select('*').order('tipo');
      setTipiLezioni(tipiData || []);
    };
    fetchData();
  }, [docenteId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const selectedTipo = tipiLezioni.find(t => t.id === formData.lezione_id);
      const durata = selectedTipo ? selectedTipo.durata_minuti : 60;

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
        // Upsert associazione
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

  const handleDelete = async () => {
    if (!confirm("Rimuovere questa lezione?")) return;
    const { error } = await supabase.from('calendario').delete().eq('id', formData.id);
    if (!error) onSave();
  };

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
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Alunno</label>
              <select name="alunno_id" value={formData.alunno_id} onChange={handleChange} className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none" required>
                <option value="">Seleziona...</option>
                {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
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
            <button type="button" onClick={handleDelete} className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm font-medium transition-colors">
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
      </div>
    </div>,
    document.body
  );
}