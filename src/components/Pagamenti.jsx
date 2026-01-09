import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import { Plus, X, Edit2, Trash2, DollarSign, Printer } from 'lucide-react';
import html2pdf from 'html2pdf.js';

const MESI = [
  { val: 0, label: 'ISCR' },
  { val: 9, label: 'Settembre' }, { val: 10, label: 'Ottobre' }, { val: 11, label: 'Novembre' }, 
  { val: 12, label: 'Dicembre' }, { val: 1, label: 'Gennaio' }, { val: 2, label: 'Febbraio' }, 
  { val: 3, label: 'Marzo' }, { val: 4, label: 'Aprile' }, { val: 5, label: 'Maggio' }, 
  { val: 6, label: 'Giugno' }, { val: 7, label: 'Luglio' }
];

export default function Pagamenti() {
  const [pagamenti, setPagamenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alunni, setAlunni] = useState([]);
  const [docenti, setDocenti] = useState([]);
  
  const [filters, setFilters] = useState({ alunno_id: '', mese: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingPay, setEditingPay] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: a } = await supabase.from('alunni').select('id, nome').order('nome');
      const { data: d } = await supabase.from('docenti').select('id, nome').order('nome');
      setAlunni(a || []);
      setDocenti(d || []);
      loadPagamenti();
    };
    fetchData();
  }, []);

  useEffect(() => { loadPagamenti(); }, [filters]);

  const loadPagamenti = async () => {
    setLoading(true);
    let query = supabase
      .from('pagamenti')
      .select(`
        id, data_pagamento, importo, mese_riferimento, tipologia, note, anno_accademico,
        alunni(id, nome),
        docenti(id, nome)
      `)
      .order('data_pagamento', { ascending: false });

    if (filters.alunno_id) query = query.eq('alunno_id', filters.alunno_id);
    if (filters.mese) query = query.eq('mese_riferimento', filters.mese);

    const { data, error } = await query;
    if (error) console.error(error);
    else setPagamenti(data || []);
    setLoading(false);
  };

  const handleOpenModal = (pay = null) => {
    setEditingPay(pay);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare pagamento?")) return;
    await supabase.from('pagamenti').delete().eq('id', id);
    loadPagamenti();
  };

  // Funzione Stampa Ricevuta
  const handlePrint = (p) => {
    // 1. Creazione elemento HTML temporaneo per il PDF
    const element = document.createElement('div');
    element.innerHTML = `
    <div style="padding: 40px; font-family: Arial, sans-serif; color: #000; background: #fff; width: 210mm; min-height: 297mm; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #b30000; text-transform: uppercase; margin: 0;">Ricevuta di Pagamento</h1>
            <p style="font-size: 14px; color: #666; margin-top: 5px;">Accademia della Musica</p>
        </div>
        <div style="margin-bottom: 40px; border-top: 2px solid #b30000; padding-top: 20px;">
            <p><strong>Ricevuto da:</strong> ${p.alunni?.nome}</p>
            <p><strong>Data:</strong> ${new Date(p.data_pagamento).toLocaleDateString('it-IT')}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 15px; border: 1px solid #ddd; font-weight: bold;">Descrizione</td>
                <td style="padding: 15px; border: 1px solid #ddd; font-weight: bold; text-align: right;">Importo</td>
            </tr>
            <tr>
                <td style="padding: 15px; border: 1px solid #ddd;">
                    ${p.tipologia} 
                    ${p.mese_riferimento && p.mese_riferimento != 0 ? ` - Mese: ${MESI.find(m => m.val === p.mese_riferimento)?.label}` : ''}
                    <br><span style="font-size: 12px; color: #666;">A.A. ${p.anno_accademico || ''}</span>
                    ${p.note ? `<br><span style="font-size: 12px; color: #888;">Note: ${p.note}</span>` : ''}
                </td>
                <td style="padding: 15px; border: 1px solid #ddd; text-align: right; font-size: 18px;">
                    € ${parseFloat(p.importo).toFixed(2)}
                </td>
            </tr>
        </table>
        <div style="text-align: center; margin-top: 80px; font-size: 12px; color: #888;">
            <p>Documento non valido ai fini fiscali</p>
            <div style="margin-top: 40px; border-top: 1px solid #000; width: 200px; display: inline-block; padding-top: 5px;">Firma</div>
        </div>
    </div>
    `;

    // 2. Opzioni PDF
    const opt = {
      margin: 0,
      filename: `Ricevuta_${p.alunni?.nome.replace(/\s+/g,'_')}_${p.data_pagamento}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // 3. Generazione (Uso diretto della variabile importata)
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="flex flex-col h-full bg-accademia-card border border-gray-800 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-gray-800 bg-gray-900/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-xl font-light text-white flex items-center gap-2">
            <DollarSign className="text-accademia-red"/> Registro Pagamenti
          </h2>
          <button 
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-2 bg-accademia-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm shadow-sm"
          >
            <Plus size={16} /> Registra
          </button>
        </div>
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

      <div className="flex-1 overflow-auto p-0 custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 uppercase text-xs sticky top-0 backdrop-blur-sm z-10">
            <tr>
              <th className="px-6 py-3 font-semibold">Data</th>
              <th className="px-6 py-3 font-semibold">Alunno</th>
              <th className="px-6 py-3 font-semibold">Tipologia</th>
              <th className="px-6 py-3 font-semibold">Mese Rif.</th>
              <th className="px-6 py-3 font-semibold text-right">Importo</th>
              <th className="px-6 py-3 font-semibold text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {pagamenti.map(p => {
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
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handlePrint(p)} className="p-1.5 hover:bg-gray-700 rounded text-green-400 transition-colors" title="Stampa Ricevuta"><Printer size={16}/></button>
                      <button onClick={() => handleOpenModal(p)} className="p-1.5 hover:bg-gray-700 rounded text-blue-400 transition-colors" title="Modifica"><Edit2 size={16}/></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-gray-700 rounded text-red-400 transition-colors" title="Elimina"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
      if(shouldPrint) setIsPrinting(true);

      const payload = {
        alunno_id: formData.alunno_id,
        docente_id: formData.docente_id || null,
        importo: parseFloat(formData.importo),
        data_pagamento: formData.data_pagamento,
        mese_riferimento: parseInt(formData.mese_riferimento),
        anno_accademico: '2025/2026', 
        tipologia: formData.tipologia,
        note: formData.note
      };

      if (formData.id) {
        await supabase.from('pagamenti').update(payload).eq('id', formData.id);
      } else {
        await supabase.from('pagamenti').insert([payload]);
      }
      
      if(shouldPrint) {
         // Recupera nome alunno per la stampa se necessario
         const aluNome = alunni.find(a => a.id === formData.alunno_id)?.nome || '';
         await printReceipt({
             alunno_nome: aluNome,
             ...payload
         });
      }

      onSave();
    } catch(err) {
      alert("Errore: " + err.message);
    } finally {
        setIsPrinting(false);
    }
  };
  
  // Replicazione funzione stampa interna per la modale
  const printReceipt = async (r) => {
    const element = document.createElement('div');
    element.innerHTML = `
    <div style="padding: 40px; font-family: Arial, sans-serif; color: #000; background: #fff; width: 210mm; min-height: 297mm; box-sizing: border-box;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #b30000; text-transform: uppercase; margin: 0;">Ricevuta di Pagamento</h1>
            <p style="font-size: 14px; color: #666; margin-top: 5px;">Accademia della Musica</p>
        </div>
        <div style="margin-bottom: 40px; border-top: 2px solid #b30000; padding-top: 20px;">
            <p><strong>Ricevuto da:</strong> ${r.alunno_nome}</p>
            <p><strong>Data:</strong> ${new Date(r.data_pagamento).toLocaleDateString('it-IT')}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 15px; border: 1px solid #ddd; font-weight: bold;">Descrizione</td>
                <td style="padding: 15px; border: 1px solid #ddd; font-weight: bold; text-align: right;">Importo</td>
            </tr>
            <tr>
                <td style="padding: 15px; border: 1px solid #ddd;">
                    ${r.tipologia} 
                    ${r.mese_riferimento && r.mese_riferimento != 0 ? ` - Mese: ${MESI.find(m => m.val === r.mese_riferimento)?.label}` : ''}
                    <br><span style="font-size: 12px; color: #666;">A.A. ${r.anno_accademico || ''}</span>
                    ${r.note ? `<br><span style="font-size: 12px; color: #888;">Note: ${r.note}</span>` : ''}
                </td>
                <td style="padding: 15px; border: 1px solid #ddd; text-align: right; font-size: 18px;">
                    € ${parseFloat(r.importo).toFixed(2)}
                </td>
            </tr>
        </table>
        <div style="text-align: center; margin-top: 80px; font-size: 12px; color: #888;">
            <p>Documento non valido ai fini fiscali</p>
            <div style="margin-top: 40px; border-top: 1px solid #000; width: 200px; display: inline-block; padding-top: 5px;">Firma</div>
        </div>
    </div>
    `;

    const opt = {
      margin: 0,
      filename: `Ricevuta_${r.alunno_nome}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
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
              <option value="">Seleziona...</option>
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

          {/* Docente Opzionale (per tracciare chi ha incassato o a chi si riferisce) */}
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