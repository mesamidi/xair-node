import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from './useSocket';
import { useMidiMappingStore } from './midiMappingStore';
import { useParamStore } from './store';
import { requestMidiAccess, parseMidiMessage, formatMidiMapping } from './midiUtils';

type Props = {
  address: string;
  label: string;
  min?: number;
  max?: number;
  onMappingChange?: () => void; // Callback cuando cambia el mapeo (para refrescar el estado)
  onMappingStateChange?: (isMapping: boolean) => void; // Callback cuando entra/sale del modo mapping
};

export default function VerticalFader({ address, label, min = 0, max = 1, onMappingChange, onMappingStateChange }: Props) {
  const [value, setValue] = useState(0);
  const [isMapping, setIsMapping] = useState(false);
  const isDragging = useRef(false);
  const { socket, isConnected } = useSocket();
  const { getMidiMapping, setMidiMapping, midiMappings } = useMidiMappingStore();
  // Cargar mapeo existente al montar - usar el store directamente para reactividad
  // Al usar midiMappings, el componente se re-renderiza cuando cambia
  const midiMapping = midiMappings[address] || null;
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const mappingHandlerRef = useRef<((event: MIDIMessageEvent) => void) | null>(null);

  useEffect(() => {
    if (!socket) return;

    const subscribe = () => {
      socket.emit('add-param', { address });
    };

    const onUpdate = (msg: { address: string; value: number }) => {
      if (msg.address === address && !isDragging.current) {
        // Usar función de actualización para evitar loops si el valor no cambió realmente
        setValue(prev => {
          if (Math.abs(prev - msg.value) < 0.0001) return prev;
          return msg.value;
        });
      }
    };
    const onSnapshot = (arr: { address: string; value: number }[]) => {
      const found = arr.find(x => x.address === address);
      if (found && !isDragging.current) {
        setValue(prev => {
          if (Math.abs(prev - found.value) < 0.0001) return prev;
          return found.value;
        });
      }
    };

    subscribe();
    socket.on('connect', subscribe);
    socket.on('xr18-update', onUpdate);
    socket.on('snapshot', onSnapshot);

    return () => {
      socket.emit('remove-param', { address });
      socket.off('connect', subscribe);
      socket.off('xr18-update', onUpdate);
      socket.off('snapshot', onSnapshot);
    };
  }, [address, socket, isConnected]);

  // Inicializar MIDI una vez al montar
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.requestMIDIAccess) return;

    requestMidiAccess()
      .then((access) => {
        midiAccessRef.current = access;
        setupInputHandlers(access);
        access.onstatechange = () => setupInputHandlers(access);
      })
      .catch((error) => {
        console.error('[VerticalFader MIDI] Error:', error);
      });
  }, []);

  const setupInputHandlers = (access: MIDIAccess) => {
    access.inputs.forEach((input) => {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        // Si hay mapping activo, manejar primero
        if (mappingHandlerRef.current) {
          mappingHandlerRef.current(event);
          return;
        }

        // Buscar si este parámetro está mapeado
        const parsed = parseMidiMessage(event);
        if (!parsed) return;

        const currentMapping = getMidiMapping(address);
        if (currentMapping && 
            currentMapping.channel === parsed.channel && 
            currentMapping.cc === parsed.cc) {
          if (socket && isConnected) {
            socket.emit('set-param', { address, value: parsed.value });
          }
        }
      };
    });
  };

  // Manejar modo mapping
  useEffect(() => {
    if (!isMapping) {
      mappingHandlerRef.current = null;
      // No llamar onMappingStateChange aquí si ya está en false para evitar loops
      return;
    }

    if (!midiAccessRef.current && typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      requestMidiAccess()
        .then((access) => {
          midiAccessRef.current = access;
          setupMappingHandler(access);
        })
        .catch((error) => {
          console.error('[VerticalFader MIDI] Error:', error);
        });
    } else if (midiAccessRef.current) {
      setupMappingHandler(midiAccessRef.current);
    }

    function setupMappingHandler(access: MIDIAccess) {
      mappingHandlerRef.current = (event: MIDIMessageEvent) => {
        const parsed = parseMidiMessage(event);
        if (!parsed || !isMapping) return;

        const newMapping = {
          channel: parsed.channel,
          cc: parsed.cc,
        };
        setMidiMapping(address, newMapping);
        
        // También sincronizar con el store principal si este parámetro existe como strip
        try {
          const { updateParamMidiMapping } = useParamStore.getState();
          const params = useParamStore.getState().params;
          const existingParam = params.find(p => p.address === address);
          if (existingParam) {
            updateParamMidiMapping(address, newMapping);
          }
        } catch (e) {
          console.error('[VerticalFader] Error al sincronizar con store principal:', e);
        }
        
        // Usar setTimeout para evitar actualizaciones síncronas que causan loops
        if (onMappingChange) {
          setTimeout(() => onMappingChange(), 0);
        }
        // NO salir del modo mapping - el usuario debe presionar ESC
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMapping) {
        setIsMapping(false);
        if (onMappingStateChange) onMappingStateChange(false);
        // Prevenir que el modal se cierre
        e.stopPropagation();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (isMapping) {
        // Si estamos mapeando, cancelar el mapeo y prevenir comportamiento normal
        setIsMapping(false);
        if (onMappingStateChange) onMappingStateChange(false);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Agregar listener de click global cuando está en modo mapping
    if (isMapping) {
      window.addEventListener('click', handleClickOutside, true); // useCapture=true para capturar antes
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside, true);
      mappingHandlerRef.current = null;
    };
  }, [isMapping, address, setMidiMapping, onMappingChange, onMappingStateChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setValue(v);
    isDragging.current = true;
    if (socket && isConnected) {
      socket.emit('set-param', { address, value: v });
    }
    setTimeout(() => { isDragging.current = false; }, 100);
  };

  const handleMapClick = () => {
    setIsMapping(true);
    if (onMappingStateChange) onMappingStateChange(true);
  };

  const handleClearMapping = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMidiMapping(address, null);
    
    // También sincronizar con el store principal si este parámetro existe como strip
    try {
      const { updateParamMidiMapping } = useParamStore.getState();
      const params = useParamStore.getState().params;
      const existingParam = params.find(p => p.address === address);
      if (existingParam) {
        updateParamMidiMapping(address, null);
      }
    } catch (e) {
      console.error('[VerticalFader] Error al sincronizar con store principal:', e);
    }
    
    setIsMapping(false);
    if (onMappingStateChange) onMappingStateChange(false);
    if (onMappingChange) onMappingChange();
  };

  const handleCancelMapping = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMapping(false);
    if (onMappingStateChange) onMappingStateChange(false);
  };

  // Convertir valor 0-1 a dB (-15 a +15)
  const dbValue = ((value - 0.5) * 30).toFixed(1);
  const hasMidiMapping = midiMapping !== null && midiMapping !== undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="relative flex flex-col items-center h-48">
        <input
          type="range"
          min={min}
          max={max}
          step={0.001}
          value={value}
          onChange={handleChange}
          className={`vertical-fader-eq w-12 h-full appearance-none bg-gray-300 dark:bg-gray-600 rounded cursor-pointer ${
            isMapping ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
          } `}
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
          }}
        />
      </div>
      <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
        {parseFloat(dbValue) >= 0 ? '+' : ''}{dbValue} dB
      </div>
      
      {/* Botón Map / Midi Mapping */}
      <div className="w-full mt-1">
        {isMapping ? (
          <button
            className="w-full px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-1"
            onClick={handleMapClick}
            title="Click × to cancel mapping, move MIDI control to map"
          >
            <span>{midiMapping ? formatMidiMapping(midiMapping) : 'Map'}</span>
            <span 
              className="hover:text-red-300 cursor-pointer"
              onClick={handleCancelMapping}
              title="Cancel mapping"
            >
              ×
            </span>
          </button>
        ) : hasMidiMapping ? (
          <button
            className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
            onClick={handleClearMapping}
            title="Click to clear MIDI mapping"
          >
            <span>{formatMidiMapping(midiMapping)}</span>
            <span>×</span>
          </button>
        ) : (
          <button
            className="w-full px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            onClick={handleMapClick}
            title="Map to MIDI controller"
          >
            Map
          </button>
        )}
      </div>
    </div>
  );
}

