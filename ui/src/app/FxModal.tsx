import React, { useEffect } from 'react';
import VerticalFader from './VerticalFader';

type Props = {
  open: boolean;
  onClose: () => void;
  channel: string; // ej: '01' o '02'
};

export default function FxModal({ open, onClose, channel }: Props) {
  const [, forceUpdate] = React.useState({});
  const refresh = () => forceUpdate({});
  const [isAnyMapping, setIsAnyMapping] = React.useState(false);

  // Construir las direcciones FX - siempre calcularlas, incluso si el modal no está abierto
  // FX sends usan mix/07, mix/08, mix/09, mix/10 según AddParamModal
  const fx1Address = `/ch/${channel}/mix/07/level`;
  const fx2Address = `/ch/${channel}/mix/08/level`;
  const fx3Address = `/ch/${channel}/mix/09/level`;
  const fx4Address = `/ch/${channel}/mix/10/level`;

  // Trackear el estado de mapping de cada fader - hooks deben estar antes del return condicional
  const [mappingStates, setMappingStates] = React.useState({
    [fx1Address]: false,
    [fx2Address]: false,
    [fx3Address]: false,
    [fx4Address]: false,
  });

  // Actualizar isAnyMapping cuando cambie cualquier estado de mapping
  React.useEffect(() => {
    const anyActive = Object.values(mappingStates).some(v => v);
    setIsAnyMapping(anyActive);
  }, [mappingStates]);

  // Reset mapping states cuando el modal se cierra
  React.useEffect(() => {
    if (!open) {
      setMappingStates({
        [fx1Address]: false,
        [fx2Address]: false,
        [fx3Address]: false,
        [fx4Address]: false,
      });
    }
  }, [open, fx1Address, fx2Address, fx3Address, fx4Address]);

  // handleMappingStateChange debe estar antes del return condicional
  const handleMappingStateChange = React.useCallback((address: string, isMapping: boolean) => {
    setMappingStates(prev => {
      // Solo actualizar si realmente cambió el valor
      if (prev[address] === isMapping) return prev;
      return { ...prev, [address]: isMapping };
    });
  }, []);

  // Prevenir clicks en el contenido del modal cuando hay mapping activo
  const handleModalContentClick = React.useCallback((e: React.MouseEvent) => {
    if (isAnyMapping) {
      e.stopPropagation();
    }
  }, [isAnyMapping]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Si hay algún fader en modo mapping, no cerrar el modal
        // El handler de ESC del VerticalFader se encargará de cancelar el mapping
        if (isAnyMapping) {
          return; // Dejar que VerticalFader maneje el ESC
        }
        // Si no hay mapping activo, cerrar el modal normalmente
        onClose();
      }
    };

    const handleBackdropClick = (e: MouseEvent) => {
      // Si hay mapping activo, no cerrar el modal al hacer click fuera
      if (isAnyMapping) {
        return;
      }
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
  }, [open, onClose, isAnyMapping]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 modal-backdrop">
      <div 
        className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 w-auto min-w-80"
        onClick={handleModalContentClick}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold dark:text-white">FX Sends - Channel {channel}</h2>
          <button
            className={`text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none ${
              isAnyMapping ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={isAnyMapping ? undefined : onClose}
            title={isAnyMapping ? 'Exit mapping mode first (ESC)' : 'Close (ESC)'}
            disabled={isAnyMapping}
          >
            ×
          </button>
        </div>
        <div className="flex gap-6 justify-center items-end">
          <VerticalFader 
            address={fx1Address} 
            label="FX 1" 
            onMappingChange={refresh}
            onMappingStateChange={(isMapping) => handleMappingStateChange(fx1Address, isMapping)}
          />
          <VerticalFader 
            address={fx2Address} 
            label="FX 2" 
            onMappingChange={refresh}
            onMappingStateChange={(isMapping) => handleMappingStateChange(fx2Address, isMapping)}
          />
          <VerticalFader 
            address={fx3Address} 
            label="FX 3" 
            onMappingChange={refresh}
            onMappingStateChange={(isMapping) => handleMappingStateChange(fx3Address, isMapping)}
          />
          <VerticalFader 
            address={fx4Address} 
            label="FX 4" 
            onMappingChange={refresh}
            onMappingStateChange={(isMapping) => handleMappingStateChange(fx4Address, isMapping)}
          />
        </div>
        <div className="flex justify-end mt-6">
          <button
            className={`px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white ${
              isAnyMapping ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={isAnyMapping ? undefined : onClose}
            disabled={isAnyMapping}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

