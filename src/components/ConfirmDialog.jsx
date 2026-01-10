import { createPortal } from 'react-dom';
import { AlertTriangle, X, Info } from 'lucide-react';

export default function ConfirmDialog({ 
  isOpen, 
  title = "Conferma Operazione", 
  message, 
  confirmText = "Conferma", 
  cancelText = "Annulla", 
  onConfirm, 
  onCancel,
  type = "danger", // danger, warning, info
  showCancel = true
}) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: AlertTriangle,
      iconClass: 'bg-red-900/20 border-red-800/50 text-red-400',
      button: 'bg-red-600 hover:bg-red-700'
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'bg-yellow-900/20 border-yellow-800/50 text-yellow-400',
      button: 'bg-yellow-600 hover:bg-yellow-700'
    },
    info: {
      icon: Info,
      iconClass: 'bg-blue-900/20 border-blue-800/50 text-blue-400',
      button: 'bg-blue-600 hover:bg-blue-700'
    }
  };

  const style = typeStyles[type];
  const IconComponent = style.icon;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={showCancel ? onCancel : undefined}
      ></div>

      {/* Dialog */}
      <div className="relative bg-accademia-card border border-gray-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header con icona */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full border flex items-center justify-center shrink-0 ${style.iconClass}`}>
              <IconComponent size={24} strokeWidth={2.5} />
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-bold text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Footer con pulsanti */}
        <div className="px-6 py-4 bg-gray-900/30 border-t border-gray-800 flex justify-end gap-3">
          {showCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-6 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-lg ${style.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
