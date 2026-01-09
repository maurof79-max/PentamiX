import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, Eye } from 'lucide-react';

export default function TipiLezioni({ userRole }) {
  const [tipi, setTipi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTipo, setEditingTipo] = useState(null);

  // Solo Admin può modificare
  const isReadOnly = userRole !== 'Admin';

  const fetchTipi = async () => {
    setLoading(true);
    const { data } = await supabase.from('tipi_lezioni').select('*').order('tipo');
    setTipi(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTipi(); }, []);

  const handleOpenModal = (tipo = null) => {
    setEditingTipo(tipo);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (isReadOnly) return;
    if (!confirm("Eliminare tipologia?")) return;
    await supabase.from('tipi_lezioni').delete().eq('id', id);
    fetchTipi();
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Caricamento tipologie...</div>;

  return (
    <div className="p-0 relative">
      {!isReadOnly && (
        <div className="p-4 border-b border-gray-800 flex justify-end">
          <button 
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
          >
            <Plus size={16} /> Nuova Tipologia
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-semibold">Tipologia</th>
              <th className="px-6 py-4 font-semibold">Durata</th>
              <th className="px-6 py-4 font-semibold text-right">Costo Standard</th>
              <th className="px-6 py-4 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {tipi.map(t => (
              <tr key={t.id} className="hover:bg-gray-800/30 transition-colors group">
                <td className="px-6 py-4 font-medium text-white">{t.tipo}</td>
                <td className="px-6 py-4 text-gray-400">{t.durata_minuti} min</td>
                <td className="px-6 py-4 text-right text-gray-300">€ {t.costo}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(t)} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 transition-colors" title={isReadOnly ? "Vedi" : "Modifica"}>
                      {isReadOnly ? <Eye size={16}/> : <Edit2 size={16}/>}
                    </button>
                    {!isReadOnly && (
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-gray-700 rounded text-red-400 transition-colors" title="Elimina">
                        <Trash2 size={16}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ModalTipo 
          tipo={editingTipo} 
          readOnly={isReadOnly}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchTipi(); }}
        />
      )}
    </div>
  );
}

function ModalTipo({ tipo, readOnly, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: tipo?.id || null,
    tipo: tipo?.tipo || '',
    durata_minuti: tipo?.durata_minuti || 60,
    costo: tipo?.costo || 0
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(readOnly) return;
    try {
      if (formData.id) {
        await supabase.from('tipi_lezioni').update(formData).eq('id', formData.id);
      } else {
        await supabase.from('tipi_lezioni').insert([{ ...formData, id: 'L' + Date.now() }]);
      }
      onSave();
    } catch(err) { alert(err.message); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white">
            {readOnly ? 'Dettaglio' : (formData.id ? 'Modifica Tipologia' : 'Nuova Tipologia')}
          </h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-white"/></button>
        </div>
        
        <form id="formTipo" onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Nome</label>
            <input 
              type="text" 
              value={formData.tipo} 
              onChange={e => setFormData({...formData, tipo: e.target.value})} 
              disabled={readOnly} 
              placeholder="Es. Individuale (45 min)"
              className="w-full bg-accademia-input border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-accademia-red focus:ring-1 focus:ring-accademia-red focus:outline-none disabled:opacity-50 transition-all placeholder-gray-600" 
              required 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Durata (min)</label>
              <input 
                type="number" 
                value={formData.durata_minuti} 
                onChange={e => setFormData({...formData, durata_minuti: e.target.value})} 
                disabled={readOnly} 
                placeholder="45"
                className="w-full bg-accademia-input border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-accademia-red focus:ring-1 focus:ring-accademia-red focus:outline-none disabled:opacity-50 transition-all placeholder-gray-600" 
                required 
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Costo (€)</label>
              <input 
                type="number" 
                step="0.5" 
                value={formData.costo} 
                onChange={e => setFormData({...formData, costo: e.target.value})} 
                disabled={readOnly} 
                placeholder="25.00"
                className="w-full bg-accademia-input border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:border-accademia-red focus:ring-1 focus:ring-accademia-red focus:outline-none disabled:opacity-50 transition-all placeholder-gray-600" 
                required 
              />
            </div>
          </div>
        </form>

        <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Chiudi
          </button>
          {!readOnly && (
            <button 
              type="submit" 
              form="formTipo" 
              className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-red-900/20 hover:shadow-red-900/40"
            >
              Salva
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}