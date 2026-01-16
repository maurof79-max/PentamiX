import React from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'; // Aggiungi le icone mancanti

export default function ConfirmDialog({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  title, 
  message, 
  confirmText = "Conferma", 
  cancelText = "Annulla",
  type = "warning", // default
  showCancel = true 
}) {
  if (!isOpen) return null;

  // Mappa delle configurazioni per tipo
  const configs = {
    danger: {
      icon: <AlertTriangle className="w-12 h-12 text-red-500" />,
      bgIcon: "bg-red-500/20",
      button: "bg-red-600 hover:bg-red-700",
      border: "border-red-500/50"
    },
    warning: {
      icon: <AlertTriangle className="w-12 h-12 text-yellow-500" />,
      bgIcon: "bg-yellow-500/20",
      button: "bg-yellow-600 hover:bg-yellow-700",
      border: "border-yellow-500/50"
    },
    success: { // <--- AGGIUNTA FONDAMENTALE
      icon: <CheckCircle className="w-12 h-12 text-green-500" />,
      bgIcon: "bg-green-500/20",
      button: "bg-green-600 hover:bg-green-700",
      border: "border-green-500/50"
    },
    info: {
      icon: <Info className="w-12 h-12 text-blue-500" />,
      bgIcon: "bg-blue-500/20",
      button: "bg-blue-600 hover:bg-blue-700",
      border: "border-blue-500/50"
    }
  };

  // Fallback sicuro: se il tipo passato non esiste, usa 'info'
  const config = configs[type] || configs.info;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`bg-[#1a1a1a] border ${config.border} w-full max-w-md rounded-xl shadow-2xl p-6 transform transition-all scale-100`}>
        
        <div className="flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${config.bgIcon}`}>
            {config.icon}
          </div>
          
          <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
          <p className="text-gray-400 mb-6 whitespace-pre-line">{message}</p>
          
          <div className="flex w-full gap-3 justify-center">
            {showCancel && (
              <button 
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
              >
                {cancelText}
              </button>
            )}
            <button 
              onClick={onConfirm}
              className={`flex-1 px-4 py-2 text-white rounded-lg font-bold shadow-lg transition-all ${config.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}