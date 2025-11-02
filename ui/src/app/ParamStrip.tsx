import React, { useEffect, useState, useRef } from 'react';
import type { Param } from './store';
import { useSocket } from './useSocket';
import { getColorAddress, getFxSendInfo, getChannelColorAddressForFxSend } from './colorUtils';
import { useParamStore } from './store';

type Props = Omit<Param, 'pageId'> & { min?: number; max?: number; pageId?: string };

export default function ParamStrip({ address, channel, param, min = 0, max = 1, pageId }: Props) {
  const [value, setValue] = useState(0);
  const isDragging = useRef(false);
  const { socket, isConnected } = useSocket();
  const { updateParamColor, updateParamFxColor } = useParamStore();

  useEffect(() => {
    if (!socket) return;

    // Función para obtener los colores
    const fetchColors = () => {
      if (!socket || !isConnected) return;
      const fxSendInfo = getFxSendInfo(address);
      
      if (fxSendInfo.isFxSend) {
        // FX Send: obtener color del canal y color del FX
        const channelColorAddress = getChannelColorAddressForFxSend(address);
        const fxColorAddress = getColorAddress(address); // Devuelve /fxsend/{n}/config/color
        
        console.log(`[ParamStrip] Solicitando colores para FX Send ${address}:`);
        console.log(`  - Canal: ${channelColorAddress}`);
        console.log(`  - FX: ${fxColorAddress}`);
        
        if (channelColorAddress) {
          socket.emit('get-color', { colorAddress: channelColorAddress, type: 'channel' });
        }
        if (fxColorAddress) {
          socket.emit('get-color', { colorAddress: fxColorAddress, type: 'fx' });
        }
      } else {
        // Normal: obtener solo el color del canal
        const colorAddress = getColorAddress(address);
        if (colorAddress) {
          console.log(`[ParamStrip] Solicitando color del canal para ${address}: ${colorAddress}`);
          socket.emit('get-color', { colorAddress, type: 'channel' });
        }
      }
    };

    const subscribe = () => {
      socket.emit('add-param', { address });
      // Obtener los colores cuando se suscribe
      fetchColors();
    };

    const onUpdate = (msg: { address: string; value: number }) => {
      if (msg.address === address && !isDragging.current) setValue(msg.value);
    };
    const onSnapshot = (arr: { address: string; value: number }[]) => {
      const found = arr.find(x => x.address === address);
      if (found && !isDragging.current) setValue(found.value);
    };

    // Escuchar eventos personalizados para actualización inmediata desde MIDI
    const handleParamValueUpdate = (e: CustomEvent) => {
      if (e.detail.address === address && !isDragging.current) {
        setValue(e.detail.value);
      }
    };
    
    window.addEventListener('param-value-update', handleParamValueUpdate as EventListener);

    const onColorResponse = (msg: { colorAddress: string; color: number | null; type?: string }) => {
      if (msg.color === null) {
        console.log(`[ParamStrip] Color null para ${address}, colorAddress: ${msg.colorAddress}`);
        return;
      }
      
      const fxSendInfo = getFxSendInfo(address);
      if (fxSendInfo.isFxSend) {
        // FX Send: diferenciar entre color del canal y color del FX
        const channelColorAddress = getChannelColorAddressForFxSend(address);
        const fxColorAddress = getColorAddress(address);
        
        console.log(`[ParamStrip] FX Send detectado para ${address}:`);
        console.log(`  - colorAddress recibido: ${msg.colorAddress}`);
        console.log(`  - channelColorAddress esperado: ${channelColorAddress}`);
        console.log(`  - fxColorAddress esperado: ${fxColorAddress}`);
        console.log(`  - color recibido: ${msg.color}`);
        
        if (msg.colorAddress === channelColorAddress) {
          console.log(`[ParamStrip] ✅ Actualizando COLOR DEL CANAL para ${address}: ${msg.color}`);
          updateParamColor(address, msg.color);
        } else if (msg.colorAddress === fxColorAddress) {
          console.log(`[ParamStrip] ✅ Actualizando COLOR DEL FX para ${address}: ${msg.color}`);
          updateParamFxColor(address, msg.color);
        } else {
          console.log(`[ParamStrip] ⚠️ No match: ${msg.colorAddress} no coincide con channel (${channelColorAddress}) ni fx (${fxColorAddress})`);
        }
      } else {
        // Normal: solo actualizar color del canal
        const colorAddress = getColorAddress(address);
        if (msg.colorAddress === colorAddress) {
          console.log(`[ParamStrip] ✅ Actualizando COLOR DEL CANAL (normal) para ${address}: ${msg.color}`);
          updateParamColor(address, msg.color);
        } else {
          console.log(`[ParamStrip] ⚠️ No match para ${address}: recibido ${msg.colorAddress}, esperado ${colorAddress}`);
        }
      }
    };

    // Suscribirse inmediatamente y cuando se reconecta
    subscribe();
    socket.on('connect', subscribe);
    socket.on('xr18-update', onUpdate);
    socket.on('snapshot', onSnapshot);
    socket.on('color-response', onColorResponse);

    return () => {
      socket.emit('remove-param', { address });
      socket.off('connect', subscribe);
      socket.off('xr18-update', onUpdate);
      socket.off('snapshot', onSnapshot);
      socket.off('color-response', onColorResponse);
      window.removeEventListener('param-value-update', handleParamValueUpdate as EventListener);
    };
  }, [address, socket, isConnected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setValue(v);
    isDragging.current = true;
    if (socket && isConnected) {
      socket.emit('set-param', { address, value: v });
    }
    setTimeout(() => { isDragging.current = false; }, 100);
  };

  return (
    <div className="flex flex-col items-center sm:h-full sm:w-full param-slider-container">
      <input
        type="range"
        min={min}
        max={max}
        step={0.001}
        value={value}
        onChange={handleChange}
        className="slider-thick accent-blue-600 w-full ui-slider sm:flex-1 sm:h-full sm:min-h-0"
      />
      <div className="text-xs mt-2 param-value sm:mt-0 sm:flex-shrink-0">{value.toFixed(3)}</div>
    </div>
  );
} 