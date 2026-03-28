import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

const DeleteModal = ({ isOpen, onClose, onConfirm, title, message, itemName, loading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center sm:px-4">
      {/* Overlay with blur effect */}
      <div 
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[6px] transition-all duration-300 animate-in fade-in"
        onClick={loading ? undefined : onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl border border-gray-100 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          disabled={loading}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 transition-colors duration-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {/* Icon Header */}
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-6">
            <Trash2 className="w-7 h-7 text-red-500 active:scale-95 transition-transform" />
          </div>

          {/* Text Content */}
          <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-3 px-0.5">
            {title || 'Delete Item'}
          </h3>
          <p className="text-base text-gray-500 dark:text-slate-400 leading-relaxed px-0.5">
            {message || 'Are you sure you want to delete'} <span className="font-bold text-gray-900 dark:text-slate-200">"{itemName}"</span>? 
            <br />
            <span className="text-sm opacity-80 mt-2 block">This action is permanent and cannot be reversed.</span>
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mt-10">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-gray-600 dark:text-slate-300 border-2 border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-[0.98]"
            >
              Keep it
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  Confirm Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
