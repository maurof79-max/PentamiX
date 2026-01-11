import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, Euro, Printer, Save, ChevronUp, ChevronDown, Filter } from 'lucide-react';
// Assicurati che il percorso sia corretto
import { generateReceiptPDF } from '../utils/pdfGenerator';

import { 
  MESI_COMPLETE as MESI, // Rinominiamo per non rompere il codice esistente
  ANNI_ACCADEMICI_LIST as ANNI_ACCADEMICI, 
  getCurrentAcademicYear, 
  getAcademicYearFromDate 
} from '../utils/constants';

export default function Pagamenti() {
  const [pagamenti, setPagamenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alunni, setAlunni] = useState([]);
  const [docenti, setDocenti] = useState([]);
  
  // Stati per filtri e ordinamento
  const [filters, setFilters] = useState({ alunno_id: '', mese: '' });
  const [selectedAnno, setSelectedAnno] = useState(getCurrentAcademicYear());
  const [sortConfig, setSortConfig] = useState({ key: 'data_pagamento', direction: 'desc' });

  const [showModal, setShowModal] = useState(false);
  const [editingPay, setEditingPay] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: a } = await supabase.from('alunni').select('id, nome').order('nome');
      const { data: d } = await supabase.from('docenti').select('id, nome').order('nome');
      setAlunni(a || []);
      setDocenti(d || []);
      // loadPagamenti viene chiamato dal useEffect sotto quando cambia selectedAnno
    };
    fetchData();
  }, []);

  useEffect(() => { loadPagamenti(); }, [filters, selectedAnno]);

  const loadPagamenti = async () => {
    setLoading(true);
    let query = supabase
      .from('pagamenti')
      .select(`
        id, data_pagamento, importo, mese_riferimento, tipologia, note, anno_accademico,
        alunni(id, nome),
        docenti(id, nome)
      `)
      .eq('anno_accademico', selectedAnno); // Filtro per Anno Accademico

    if (filters.alunno_id) query = query.eq('alunno_id', filters.alunno_id);
    if (filters.mese) query = query.eq('mese_riferimento', filters.mese);

    const { data, error } = await query;
    if (error) console.error(error);
    else setPagamenti(data || []);
    setLoading(false);
  };

  // --- LOGICA ORDINAMENTO ---
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedPagamenti = [...pagamenti].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let valA = a;
    let valB = b;

    // Gestione proprietà nidificate (es. alunni.nome)
    const keys = sortConfig.key.split('.');
    keys.forEach(k => {
        valA = valA ? valA[k] : '';
        valB = valB ? valB[k] : '';
    });

    // Gestione stringhe case-insensitive
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30"></div>; // Placeholder
    return sortConfig.direction === 'asc' 
        ? <ChevronUp size={16} className="ml-1 text-accademia-red" /> 
        : <ChevronDown size={16} className="ml-1 text-accademia-red" />;
  };

  const handleOpenModal = (pay = null) => {
    setEditingPay(pay);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare definitivamente questo pagamento?")) return;
    const { error } = await supabase.from('pagamenti').delete().eq('id', id);
    if (error) alert("Errore eliminazione: " + error.message);
    else loadPagamenti();
  };

  const handlePrint = async (payment) => {
    await generateReceiptPDF({
        alunno_nome: payment.alunni?.nome || 'Alunno Sconosciuto',
        tipologia: payment.tipologia,
        mese_rif: payment.mese_riferimento,
        aa: payment.anno_accademico,
        importo: payment.importo,
        data_pagamento: new Date(payment.data_pagamento).toLocaleDateString('it-IT'),
        note: payment.note,
        receipt_number: `P-${payment.id}`
    });
  };

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      {/* HEADER */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-xl font-light text-white flex items-center gap-2">
            <Euro className="text-accademia-red"/> Registro Pagamenti
          </h2>

          <div className="flex items-center gap-3">
            {/* Selettore Anno Header */}
            <div className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2 border border-gray-700">
                <Filter size={14} className="text-gray-400"/>
                <select 
                    value={selectedAnno}
                    onChange={(e) => setSelectedAnno(e.target.value)}
                    className="bg-transparent text-white text-sm font-bold focus:outline-none cursor-pointer"
                >
                    {ANNI_ACCADEMICI.map(anno => (
                        <option key={anno} value={anno} className="bg-gray-800 text-white">{anno}</option>
                    ))}
                </select>
            </div>

            <button 
                onClick={() => handleOpenModal(null)}
                className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm transition-colors"
            >
                <Plus size={16} /> Registra
            </button>
          </div>
        </div>
        
        {/* FILTRI EXTRA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select 
            className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none"
            value={filters.alunno_id}
            onChange={(e) => setFilters({...filters, alunno_id: e.target.value})}
          >
            <option value="">Tutti gli Alunni</option>
            {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <select 
            className="bg-accademia-input border border-gray-700 text-white text-sm rounded px-3 py-2 focus:border-accademia-red focus:outline-none"
            value={filters.mese}
            onChange={(e) => setFilters({...filters, mese: e.target.value})}
          >
            <option value="">Tutti i Mesi</option>
            {MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* TABELLA */}
      <div className="flex-1 overflow-auto p-0 custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-sm z-10 select-none">
            <tr>
              <th 
                className="px-6 py-3 font-semibold cursor-pointer hover:text-white group transition-colors"
                onClick={() => handleSort('data_pagamento')}
              >
                <div className="flex items-center">Data {getSortIcon('data_pagamento')}</div>
              </th>
              <th 
                className="px-6 py-3 font-semibold cursor-pointer hover:text-white group transition-colors"
                onClick={() => handleSort('alunni.nome')}
              >
                <div className="flex items-center">Alunno {getSortIcon('alunni.nome')}</div>
              </th>
              <th 
                className="px-6 py-3 font-semibold cursor-pointer hover:text-white group transition-colors"
                onClick={() => handleSort('tipologia')}
              >
                <div className="flex items-center">Tipologia {getSortIcon('tipologia')}</div>
              </th>
              <th 
                className="px-6 py-3 font-semibold cursor-pointer hover:text-white group transition-colors"
                onClick={() => handleSort('mese_riferimento')}
              >
                <div className="flex items-center">Mese Rif. {getSortIcon('mese_riferimento')}</div>
              </th>
              <th 
                className="px-6 py-3 font-semibold text-right cursor-pointer hover:text-white group transition-colors"
                onClick={() => handleSort('importo')}
              >
                <div className="flex items-center justify-end">Importo {getSortIcon('importo')}</div>
              </th>
              <th className="px-6 py-3 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sortedPagamenti.map(p => {
              const meseLabel = MESI.find(m => m.val === p.mese_riferimento)?.label || '-';
              return (
                <tr key={p.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-3 font-mono text-gray-300">
                    {new Date(p.data_pagamento).toLocaleDateString('it-IT')}
                  </td>
                  <td className="px-6 py-3 text-white font-medium">{p.alunni?.nome}</td>
                  <td className="px-6 py-3 text-gray-400">{p.tipologia}</td>
                  <td className="px-6 py-3 text-gray-400">{p.tipologia === 'Iscrizione' ? 'N/A' : meseLabel}</td>
                  <td className="px-6 py-3 text-right font-mono text-green-400 font-bold">€ {p.importo}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2 opacity-80 hover:opacity-100 transition-opacity">
                      <button onClick={() => handlePrint(p)} className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-green-400 transition-colors" title="Stampa Ricevuta"><Printer size={16}/></button>
                      <button onClick={() => handleOpenModal(p)} className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-blue-400 transition-colors" title="Modifica"><Edit2 size={16}/></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 bg-gray-700 hover:bg-red-900/50 rounded text-red-400 transition-colors" title="Elimina"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODALE DI REGISTRAZIONE/MODIFICA */}
      {showModal && (
        <ModalPagamento 
          payment={editingPay} 
          alunni={alunni} 
          docenti={docenti}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); loadPagamenti(); }}
        />
      )}
    </div>
  );
}

// --- COMPONENTE MODALE ---
function ModalPagamento({ payment, alunni, docenti, onClose, onSave }) {
  const [formData, setFormData] = useState({
    id: payment?.id || null,
    alunno_id: payment?.alunni?.id || '',
    docente_id: payment?.docenti?.id || '',
    importo: payment?.importo || '',
    data_pagamento: payment?.data_pagamento ? payment.data_pagamento.slice(0,10) : new Date().toISOString().slice(0,10),
    tipologia: payment?.tipologia || 'Lezioni',
    mese_riferimento: payment?.mese_riferimento || (new Date().getMonth() + 1),
    note: payment?.note || ''
  });

  const [isPrinting, setIsPrinting] = useState(false);

  const handleSubmit = async (e, shouldPrint = false) => {
    e.preventDefault();
    try {
      if (shouldPrint) setIsPrinting(true);

      // Calcola automaticamente l'anno accademico in base alla data di pagamento selezionata
      const annoCalc = getAcademicYearFromDate(formData.data_pagamento);

      const payload = {
        alunno_id: formData.alunno_id,
        docente_id: formData.docente_id || null,
        importo: parseFloat(formData.importo),
        data_pagamento: formData.data_pagamento,
        mese_riferimento: parseInt(formData.mese_riferimento),
        anno_accademico: annoCalc, 
        tipologia: formData.tipologia,
        note: formData.note
      };

      if (!payload.alunno_id) throw new Error("Seleziona un alunno");

      let paymentId = formData.id;
      if (formData.id) {
        const { error } = await supabase.from('pagamenti').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('pagamenti').insert([payload]).select().single();
        if (error) throw error;
        paymentId = data.id; 
      }
      
      if (shouldPrint) {
         const aluNome = alunni.find(a => a.id == formData.alunno_id)?.nome || 'Allievo';
         await generateReceiptPDF({
             alunno_nome: aluNome,
             tipologia: payload.tipologia,
             mese_rif: payload.mese_riferimento,
             aa: payload.anno_accademico,
             importo: payload.importo,
             data_pagamento: new Date(payload.data_pagamento).toLocaleDateString('it-IT'),
             note: payload.note,
             receipt_number: paymentId ? `P-${paymentId}` : 'ND'
         });
      }

      onSave();
    } catch(err) {
      alert("Errore: " + err.message);
    } finally {
        setIsPrinting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between mb-4">
          <h3 className="text-xl font-bold text-white">{formData.id ? 'Modifica Pagamento' : 'Nuovo Pagamento'}</h3>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
        </div>

        <form id="payForm" className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Alunno</label>
            <select 
              value={formData.alunno_id} 
              onChange={e => setFormData({...formData, alunno_id: e.target.value})}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              required
            >
              <option value="">-- Seleziona Alunno --</option>
              {alunni.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Tipologia</label>
              <select 
                value={formData.tipologia} 
                onChange={e => setFormData({...formData, tipologia: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
              >
                <option value="Lezioni">Lezioni</option>
                <option value="Iscrizione">Iscrizione</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Importo (€)</label>
              <input 
                type="number" 
                step="0.5"
                value={formData.importo}
                onChange={e => setFormData({...formData, importo: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Data</label>
              <input 
                type="date" 
                value={formData.data_pagamento}
                onChange={e => setFormData({...formData, data_pagamento: e.target.value})}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Mese Rif.</label>
              <select 
                value={formData.mese_riferimento} 
                onChange={e => setFormData({...formData, mese_riferimento: e.target.value})}
                disabled={formData.tipologia === 'Iscrizione'}
                className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none disabled:opacity-50"
              >
                {MESI.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Docente (Opzionale)</label>
            <select 
              value={formData.docente_id} 
              onChange={e => setFormData({...formData, docente_id: e.target.value})}
              className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"
            >
              <option value="">-- Nessuno --</option>
              {docenti.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Note</label>
            <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} rows="2" className="w-full bg-accademia-input border border-gray-700 rounded-lg p-2.5 text-white focus:border-accademia-red focus:outline-none"></textarea>
          </div>
        </form>

        <div className="pt-4 mt-4 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Annulla</button>
          
          <button 
            onClick={(e) => handleSubmit(e, true)}
            disabled={isPrinting}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2"
          >
            <Printer size={16}/> {isPrinting ? 'Stampa...' : 'Salva & Stampa'}
          </button>

          <button 
            onClick={(e) => handleSubmit(e, false)}
            className="px-6 py-2 bg-accademia-red hover:bg-red-700 text-white rounded-lg font-bold shadow-lg flex items-center gap-2"
          >
            <Save size={16}/> Salva
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}