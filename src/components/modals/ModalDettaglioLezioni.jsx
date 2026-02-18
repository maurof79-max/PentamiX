import { createPortal } from 'react-dom';
import { X, Calendar, User, Tag, Euro } from 'lucide-react';

// Funzione helper per formattare i numeri con il punto delle migliaia (Locale IT)
const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0.00';
    return amount.toLocaleString('it-IT', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
};

export default function ModalDettaglioLezioni({ isOpen, onClose, dettagli, alunnoNome, meseNome }) {
    if (!isOpen) return null;

    const totaleDovuto = dettagli.reduce((acc, item) => {
        let costo = 0;
        if (item.is_virtual) {
            costo = item.costo_calcolato; // Negativo per gli sconti
        } else {
            costo = item.costo;
        }
        return acc + costo;
    }, 0);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="bg-accademia-card border border-gray-700 w-full max-w-2xl rounded-xl p-6 shadow-2xl relative transition-all duration-300 max-h-[90vh] flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="flex justify-between mb-4 pb-2 border-b border-gray-800 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            Dettaglio Mensile
                        </h3>
                        <p className="text-gray-400 text-sm mt-1">{alunnoNome} - {meseNome}</p>
                    </div>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-white"/></button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-400 uppercase">
                            <tr>
                                <th className="p-2"><Calendar size={14} className="inline mr-1"/> Data</th>
                                <th className="p-2"><Tag size={14} className="inline mr-1"/> Descrizione</th>
                                <th className="p-2"><User size={14} className="inline mr-1"/> Docente</th>
                                <th className="p-2 text-right"><Euro size={14} className="inline mr-1"/> Importo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {dettagli.map((item, index) => {
                                const isSconto = item.is_virtual;
                                const textColor = isSconto ? 'text-green-400' : 'text-white';
                                const amount = isSconto ? item.costo_calcolato : item.costo;

                                return (
                                    <tr key={item.id || `item-${index}`} className={`font-mono ${isSconto ? 'bg-green-900/10' : ''}`}>
                                        <td className="p-2">{new Date(item.data_lezione).toLocaleDateString('it-IT')}</td>
                                        <td className={`p-2 font-sans ${isSconto ? 'italic' : ''}`}>
                                            {isSconto ? item.descrizione_sconto : item.tipi_lezioni?.tipo}
                                        </td>
                                        <td className="p-2 font-sans">{item.docenteNome || '-'}</td>
                                        <td className={`p-2 text-right ${textColor} font-bold`}>
                                            {isSconto ? '' : '+'} {formatAmount(amount)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* FOOTER */}
                <div className="flex justify-end pt-4 border-t border-gray-800 mt-4 shrink-0">
                    <div className="text-right">
                        <p className="text-gray-400 text-sm">Totale Dovuto per il mese</p>
                        <p className="text-2xl font-bold text-white">€ {formatAmount(totaleDovuto)}</p>
                    </div>
                </div>

            </div>
        </div>, document.body
    );
}
