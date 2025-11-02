import React, { useState, useEffect } from 'react';
import { setBridgeIP, getBridgeIP } from './useSocket';

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
};

export default function BridgeConfigModal({ open, onClose, onSave }: Props) {
  const [ip, setIp] = useState('');

  useEffect(() => {
    if (open) {
      const saved = getBridgeIP();
      setIp(saved || window.location.hostname);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleBackdropClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal-backdrop')) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('click', handleBackdropClick);

    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('click', handleBackdropClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    if (ip.trim()) {
      setBridgeIP(ip.trim());
      // Recargar la página para que el socket se reconecte con la nueva IP
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 modal-backdrop">
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4 dark:text-white">Bridge Configuration</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1 dark:text-gray-300">
            Bridge IP Address
          </label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 dark:bg-slate-700 dark:text-white dark:border-slate-600"
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="192.168.1.100"
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
            Enter the IP address where the bridge is running (default: 4000)
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={handleSave}
          >
            Save & Reconnect
          </button>
        </div>
      </div>
    </div>
  );
}
