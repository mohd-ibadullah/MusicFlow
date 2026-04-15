import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';

const DeleteModal = ({ isOpen, onClose, onConfirm, title, message, itemName, loading }) => {
  if (!isOpen) return null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 flex items-center justify-center px-4"
      style={{ width: '100vw', height: '100dvh', zIndex: 2147483647 }}
    >
      {/* Overlay with blur effect */}
      <div 
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-md transition-all duration-300 animate-in fade-in"
        onClick={loading ? undefined : onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative w-full max-w-md card-admin-alt overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 btn-admin-ghost !p-2"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-7 sm:p-8">
          {/* Icon Header */}
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-5 border border-red-100">
            <Trash2 className="w-6 h-6 text-red-500" />
          </div>

          {/* Text Content */}
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-2">
            {title || 'Delete Item'}
          </h3>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            {message || 'Are you sure you want to delete'} <span className="font-bold text-gray-900">"{itemName}"</span>? 
          </p>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold mt-3">This action is permanent and cannot be reversed.</p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mt-7">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 btn-admin-secondary !py-2.5"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 btn-admin-danger-solid !py-2.5 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin"></div>
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeleteModal;
