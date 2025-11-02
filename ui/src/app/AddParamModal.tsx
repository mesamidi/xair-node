import React, { useState } from 'react';

const CHANNELS = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0'));
const SPECIAL_CHANNEL = { label: '17-18', value: 'rtn/aux' };
const BUS_CHANNELS = Array.from({ length: 6 }, (_, i) => ({ label: `Bus ${i + 1}`, value: `bus/${i + 1}` }));
const MASTER_CHANNEL = { label: 'Master', value: 'lr' };
const PARAMS = [
  { label: 'Fader', value: 'mix/fader' },
  { label: 'FX 1 Send', value: 'mix/07/level' },
  { label: 'FX 2 Send', value: 'mix/08/level' },
  { label: 'FX 3 Send', value: 'mix/09/level' },
  { label: 'FX 4 Send', value: 'mix/10/level' },
  { label: 'EQ Low', value: 'eq/1/g' },
  { label: 'EQ Mid', value: 'eq/2/g' },
  { label: 'EQ Hi', value: 'eq/4/g' },
];

type MacroItem = {
  channel: string;
  param: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (address: string, channel: string, param: string) => void;
  onSaveMacro?: (name: string, items: MacroItem[]) => void;
  editingMacro?: { id: string; name: string; items: MacroItem[] } | null;
};

export default function AddParamModal({ open, onClose, onAdd, onSaveMacro, editingMacro }: Props) {
  const [mode, setMode] = useState<'individual' | 'macro'>('individual');
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [param, setParam] = useState(PARAMS[0].value);
  const [macroItems, setMacroItems] = useState<MacroItem[]>([{ channel: CHANNELS[0], param: PARAMS[0].value }]);
  const [macroName, setMacroName] = useState('');

  React.useEffect(() => {
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

  // Resetear estado cuando se cierra el modal o cuando cambia editingMacro
  React.useEffect(() => {
    if (editingMacro) {
      setMode('macro');
      setMacroName(editingMacro.name);
      setMacroItems(editingMacro.items);
    } else if (!open) {
      setMode('individual');
      setChannel(CHANNELS[0]);
      setParam(PARAMS[0].value);
      setMacroItems([{ channel: CHANNELS[0], param: PARAMS[0].value }]);
      setMacroName('');
    }
  }, [open, editingMacro]);

  if (!open) return null;

  // Función helper para construir la dirección OSC
  const buildAddress = (ch: string, p: string): string => {
    const isBusCh = ch.startsWith('bus/');
    const isMasterCh = ch === 'lr';
    
    if (isBusCh) {
      return `/${ch}/mix/fader`;
    } else if (isMasterCh) {
      return `/${ch}/mix/fader`;
    } else if (ch === SPECIAL_CHANNEL.value) {
      if (p === 'mix/fader') {
        return `/${SPECIAL_CHANNEL.value}/mix/fader`;
      } else {
        return `/${SPECIAL_CHANNEL.value}/${p}`;
      }
    } else {
      return `/ch/${ch}/${p}`;
    }
  };

  // Detectar si el canal es un bus o master
  const isBusChannel = channel.startsWith('bus/');
  const isMasterChannel = channel === 'lr';
  const isSpecialChannel = channel === SPECIAL_CHANNEL.value || isBusChannel || isMasterChannel;

  const handleAddMacroItem = () => {
    setMacroItems([...macroItems, { channel: CHANNELS[0], param: PARAMS[0].value }]);
  };

  const handleRemoveMacroItem = (index: number) => {
    setMacroItems(macroItems.filter((_, i) => i !== index));
  };

  const handleUpdateMacroItem = (index: number, field: 'channel' | 'param', value: string) => {
    const updated = [...macroItems];
    updated[index] = { ...updated[index], [field]: value };
    setMacroItems(updated);
  };

  const handleSaveMacro = () => {
    if (!macroName.trim() || macroItems.length === 0 || !onSaveMacro) return;
    onSaveMacro(macroName.trim(), macroItems);
    onClose();
  };

  // Individual mode address
  const address = buildAddress(channel, param);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 modal-backdrop">
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 w-auto min-w-80 max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4 dark:text-white">
          {editingMacro ? 'Edit Macro' : 'Add Control'}
        </h2>
        
        {/* Tipo de agregado - solo si no está editando */}
        {!editingMacro && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Type</label>
            <select
              className="w-full border rounded px-2 py-1 dark:bg-slate-700 dark:text-white dark:border-slate-600"
              value={mode}
              onChange={e => setMode(e.target.value as 'individual' | 'macro')}
            >
              <option value="individual">Individual</option>
              <option value="macro">Macro</option>
            </select>
          </div>
        )}

        {mode === 'individual' ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Channel</label>
              <select
                className="w-full border rounded px-2 py-1 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                value={channel}
                onChange={e => setChannel(e.target.value)}
              >
                {CHANNELS.map(ch => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
                <option value={SPECIAL_CHANNEL.value}>{SPECIAL_CHANNEL.label}</option>
                {BUS_CHANNELS.map(bus => (
                  <option key={bus.value} value={bus.value}>{bus.label}</option>
                ))}
                <option value={MASTER_CHANNEL.value}>{MASTER_CHANNEL.label}</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Parameter</label>
              <select
                className="w-full border rounded px-2 py-1 dark:bg-slate-700 dark:text-white dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                value={param}
                onChange={e => setParam(e.target.value)}
                disabled={isSpecialChannel}
              >
                {PARAMS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {isSpecialChannel && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Parameter not applicable for this channel type</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white"
                onClick={onClose}
              >Cancel</button>
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  let displayChannel = channel;
                  if (channel.startsWith('bus/')) {
                    const busNum = channel.match(/bus\/(\d+)/)?.[1];
                    displayChannel = busNum ? `Bus ${busNum}` : channel;
                  } else if (channel === 'lr') {
                    displayChannel = 'Master';
                  }
                  onAdd(address, displayChannel, param);
                  onClose();
                }}
              >Add</button>
            </div>
          </>
        ) : (
          <>
            {/* Campo de nombre para macro */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Macro Name</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 dark:bg-slate-700 dark:text-white dark:border-slate-600"
                value={macroName}
                onChange={e => setMacroName(e.target.value)}
                placeholder="Enter macro name"
              />
            </div>
            <div className="mb-4 space-y-3">
              {macroItems.map((item, index) => {
                const isBusCh = item.channel.startsWith('bus/');
                const isMasterCh = item.channel === 'lr';
                const isSpecialCh = item.channel === SPECIAL_CHANNEL.value || isBusCh || isMasterCh;

                return (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div>
                        <label className="block text-xs font-medium mb-1 dark:text-gray-300">Channel</label>
                        <select
                          className="w-full border rounded px-2 py-1 text-sm dark:bg-slate-700 dark:text-white dark:border-slate-600"
                          value={item.channel}
                          onChange={e => handleUpdateMacroItem(index, 'channel', e.target.value)}
                        >
                          {CHANNELS.map(ch => (
                            <option key={ch} value={ch}>{ch}</option>
                          ))}
                          <option value={SPECIAL_CHANNEL.value}>{SPECIAL_CHANNEL.label}</option>
                          {BUS_CHANNELS.map(bus => (
                            <option key={bus.value} value={bus.value}>{bus.label}</option>
                          ))}
                          <option value={MASTER_CHANNEL.value}>{MASTER_CHANNEL.label}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 dark:text-gray-300">Parameter</label>
                        <select
                          className="w-full border rounded px-2 py-1 text-sm dark:bg-slate-700 dark:text-white dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          value={item.param}
                          onChange={e => handleUpdateMacroItem(index, 'param', e.target.value)}
                          disabled={isSpecialCh}
                        >
                          {PARAMS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      className="mt-6 w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-lg font-bold flex-shrink-0"
                      onClick={() => handleRemoveMacroItem(index)}
                      title="Remove"
                    >
                      −
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mb-4">
              <button
                type="button"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm underline"
                onClick={handleAddMacroItem}
              >
                + add
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white"
                onClick={onClose}
              >Cancel</button>
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSaveMacro}
                disabled={macroItems.length === 0 || !macroName.trim() || !onSaveMacro}
              >
                {editingMacro ? 'Update' : 'Save'} Macro ({macroItems.length} parameter{macroItems.length !== 1 ? 's' : ''})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 