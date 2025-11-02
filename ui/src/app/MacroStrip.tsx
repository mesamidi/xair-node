import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from './useSocket';
import { useParamStore } from './store';
import { formatMidiMapping } from './midiUtils';

type Props = {
  macro: { id: string; name: string; params: Array<{ address: string }> };
  address: string; // macro:${macro.id}
  onEdit: () => void;
  isMapping: boolean;
  onMapClick: (address: string) => void;
  onClearMapping: (address: string, e: React.MouseEvent) => void;
  onCancelMapping: (address: string, e: React.MouseEvent) => void;
};

export default function MacroStrip({ 
  macro, 
  address, 
  onEdit, 
  isMapping, 
  onMapClick, 
  onClearMapping, 
  onCancelMapping 
}: Props) {
  const [value, setValue] = useState(0);
  const isDragging = useRef(false);
  const { socket, isConnected } = useSocket();
  const { params } = useParamStore();

  // Obtener el mapeo MIDI del macro
  const macroParam = params.find(p => p.address === address);
  const midiMapping = macroParam?.midiMapping || null;
  const hasMidiMapping = midiMapping !== null && midiMapping !== undefined;

  // Escuchar actualizaciones de valor desde MIDI
  useEffect(() => {
    const handleParamValueUpdate = (e: CustomEvent) => {
      // Si el evento es para este macro (por su address), actualizar el valor
      if (e.detail.address === address && !isDragging.current) {
        setValue(e.detail.value);
      }
    };
    
    window.addEventListener('param-value-update', handleParamValueUpdate as EventListener);
    
    return () => {
      window.removeEventListener('param-value-update', handleParamValueUpdate as EventListener);
    };
  }, [address]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setValue(v);
    isDragging.current = true;
    
    if (socket && isConnected) {
      // Enviar el valor a todos los parámetros del macro
      macro.params.forEach(param => {
        socket.emit('set-param', { address: param.address, value: v });
        // Emitir actualización visual inmediata
        window.dispatchEvent(new CustomEvent('param-value-update', { 
          detail: { address: param.address, value: v } 
        }));
      });
      // También emitir para el macro mismo para feedback visual
      window.dispatchEvent(new CustomEvent('param-value-update', { 
        detail: { address: address, value: v } 
      }));
    }
    
    setTimeout(() => { isDragging.current = false; }, 100);
  };

  return (
    <div className="flex flex-col items-center sm:h-full sm:w-full param-slider-container">
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={value}
        onChange={handleChange}
        className="slider-thick accent-blue-600 w-full ui-slider sm:flex-1 sm:h-full sm:min-h-0"
      />
      <div className="text-xs mt-2 param-value sm:mt-0 sm:flex-shrink-0">{value.toFixed(3)}</div>
      
      {/* Botones Map y Edit */}
      <div className="w-full mt-2 flex-shrink-0 space-y-1">
        {isMapping ? (
          <button
            className="w-full px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-1"
            onClick={(e) => onMapClick(address)}
            title="Click × to cancel mapping, move MIDI control to map"
          >
            <span>{midiMapping ? formatMidiMapping(midiMapping) : 'Map'}</span>
            <span 
              className="hover:text-red-300 cursor-pointer"
              onClick={(e) => onCancelMapping(address, e)}
              title="Cancel mapping"
            >
              ×
            </span>
          </button>
        ) : hasMidiMapping ? (
          <button
            className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
            onClick={(e) => onClearMapping(address, e)}
            title="Click to clear MIDI mapping"
          >
            <span>{midiMapping ? formatMidiMapping(midiMapping) : ''}</span>
            <span>×</span>
          </button>
        ) : (
          <button
            className="w-full px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            onClick={() => onMapClick(address)}
            title="Map to MIDI controller"
          >
            Map
          </button>
        )}
        
        <button
          className="w-full px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          onClick={onEdit}
          title="Edit macro"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

