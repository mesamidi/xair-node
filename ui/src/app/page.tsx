"use client";

import React, { useState, useEffect, useRef } from 'react';
import AddParamModal from './AddParamModal';
import BridgeConfigModal from './BridgeConfigModal';
import EqModal from './EqModal';
import FxModal from './FxModal';
import { useParamStore, Param, Macro } from './store';
import ParamStrip from './ParamStrip';
import MacroStrip from './MacroStrip';
import { useSocket } from './useSocket';
import { getColorAddress, getColorClasses, getFxSendInfo, getStrokeClasses, getChannelColorAddressForFxSend } from './colorUtils';
import { requestMidiAccess, parseMidiMessage, formatMidiMapping, type MidiMapping } from './midiUtils';

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [eqModalOpen, setEqModalOpen] = useState(false);
  const [eqModalChannel, setEqModalChannel] = useState<string | null>(null);
  const [fxModalOpen, setFxModalOpen] = useState(false);
  const [fxModalChannel, setFxModalChannel] = useState<string | null>(null);
  const { pages, currentPageId, params, macros, addParam, loadParams, removeParam, addMacro, updateMacro, removeMacro, updateParamColor, updateParamFxColor, updateParamMidiMapping, reorderParams, createPage, removePage, setCurrentPage } = useParamStore();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editingMacro, setEditingMacro] = useState<{ id: string; name: string; items: { channel: string; param: string }[] } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragOverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [mappingAddress, setMappingAddress] = useState<string | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const mappingHandlerRef = useRef<((event: MIDIMessageEvent) => void) | null>(null);
  const { isConnected, socket } = useSocket();

  // Importar el store de mapeos MIDI una vez
  const { useMidiMappingStore } = require('./midiMappingStore');

  useEffect(() => {
    loadParams();
    // Cargar mapeos MIDI al iniciar
    useMidiMappingStore.getState().loadMidiMappings();
  }, [loadParams]);

  // Sincronizar selectedPageId con currentPageId del store
  useEffect(() => {
    if (currentPageId) {
      setSelectedPageId(currentPageId);
    } else if (pages.length > 0) {
      setSelectedPageId(pages[0].id);
      setCurrentPage(pages[0].id);
    }
  }, [currentPageId, pages, setCurrentPage]);

  // Filtrar params y macros por la page actual
  const currentPageParams = params.filter((p: Param) => p.pageId === selectedPageId);
  const currentPageMacros = macros.filter((m: Macro) => m.pageId === selectedPageId);

  // Sincronizar mapeos MIDI del store con los strips principales cuando cambian
  useEffect(() => {
    const unsubscribe = useMidiMappingStore.subscribe((state: { midiMappings: Record<string, { channel: number; cc: number } | null> }) => {
      // Cuando cambian los mapeos MIDI, verificar si alguno corresponde a un strip principal
      const params = useParamStore.getState().params;
      const midiMappings = state.midiMappings;
      
      // Para cada mapeo en el store de mapeos MIDI, verificar si existe un strip correspondiente
      Object.keys(midiMappings).forEach(address => {
        const mapping = midiMappings[address];
        if (!mapping) return; // Ignorar si el mapeo es null
        
        const existingParam = params.find(p => p.address === address);
        
        if (existingParam) {
          // Si el strip existe y el mapeo es diferente, sincronizar
          if (!existingParam.midiMapping || 
              existingParam.midiMapping.channel !== mapping.channel || 
              existingParam.midiMapping.cc !== mapping.cc) {
            updateParamMidiMapping(address, mapping);
          }
        }
      });
      
      // También verificar si hay mapeos en strips que no están en el store de mapeos MIDI
      params.forEach(param => {
        if (param.midiMapping && (!midiMappings[param.address] || 
            midiMappings[param.address]?.channel !== param.midiMapping.channel ||
            midiMappings[param.address]?.cc !== param.midiMapping.cc)) {
          // El strip tiene un mapeo pero no está en el store de mapeos MIDI o es diferente, sincronizar
          useMidiMappingStore.getState().setMidiMapping(param.address, param.midiMapping);
        }
      });
    });
    
    return unsubscribe;
  }, [updateParamMidiMapping]);

  // Inicializar MIDI y manejar mensajes para strips mapeados
  useEffect(() => {
    if (typeof window === 'undefined') {
      console.log('[MIDI] Window no disponible');
      return;
    }

    if (!navigator.requestMIDIAccess) {
      console.warn('[MIDI] Web MIDI API no está disponible en este navegador');
      return;
    }

    console.log('[MIDI] Solicitando acceso MIDI...');
    requestMidiAccess()
      .then((access) => {
        console.log('[MIDI] Acceso MIDI concedido');
        midiAccessRef.current = access;
        
        // Configurar handlers para todos los inputs
        const setupInputHandlers = () => {
          console.log(`[MIDI] Configurando handlers para ${access.inputs.size} input(s)`);
          
          if (access.inputs.size === 0) {
            console.warn('[MIDI] No se detectaron dispositivos MIDI de entrada');
          }

          access.inputs.forEach((input, key) => {
            console.log(`[MIDI] Configurando handler para input: ${input.name} (${input.manufacturer} ${input.state})`);
            
            input.onmidimessage = (event: MIDIMessageEvent) => {
              const data = event.data;
              console.log(`[MIDI] Mensaje recibido de ${input.name}:`, {
                data: Array.from(data || []),
                hex: Array.from(data || []).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
              });

              // Si hay un mapping activo, manejar ese primero
              if (mappingHandlerRef.current) {
                console.log('[MIDI] Redirigiendo a handler de mapping');
                mappingHandlerRef.current(event);
                return;
              }

              // Si no, buscar strips mapeados y aplicar valores
              const parsed = parseMidiMessage(event);
              if (!parsed) {
                console.log('[MIDI] Mensaje no es un Control Change, ignorando');
                return;
              }

              console.log(`[MIDI] Parsed: Channel ${parsed.channel}, CC ${parsed.cc}, Value ${parsed.value.toFixed(3)}`);

              // Buscar en params principales primero
              const currentParams = useParamStore.getState().params;
              const currentMacros = useParamStore.getState().macros;
              let mappedParam = currentParams.find((p: Param) => 
                p.midiMapping && 
                p.midiMapping.channel === parsed.channel && 
                p.midiMapping.cc === parsed.cc
              );

              // Si se encuentra en strips principales, usarlo
              if (mappedParam) {
                console.log(`[MIDI] Encontrado strip mapeado: ${mappedParam.address}`);
                if (socket && isConnected) {
                  // Si es un macro, enviar el valor a todos sus parámetros
                  if (mappedParam.isMacro || mappedParam.address.startsWith('macro:')) {
                    const macroId = mappedParam.address.replace('macro:', '');
                    const macro = currentMacros.find(m => m.id === macroId);
                    if (macro) {
                      macro.params.forEach(param => {
                        socket.emit('set-param', { address: param.address, value: parsed.value });
                        window.dispatchEvent(new CustomEvent('param-value-update', { 
                          detail: { address: param.address, value: parsed.value } 
                        }));
                      });
                      // También emitir para el macro mismo para actualizar su slider
                      window.dispatchEvent(new CustomEvent('param-value-update', { 
                        detail: { address: mappedParam.address, value: parsed.value } 
                      }));
                    }
                  } else {
                    // Parámetro normal
                    socket.emit('set-param', { address: mappedParam.address, value: parsed.value });
                    // Emitir evento personalizado para actualización visual inmediata
                    window.dispatchEvent(new CustomEvent('param-value-update', { 
                      detail: { address: mappedParam.address, value: parsed.value } 
                    }));
                  }
                } else {
                  console.warn('[MIDI] Socket no conectado, no se puede enviar valor');
                }
                return;
              }

              // Si no se encuentra, buscar en el store de mapeos MIDI (para EQ y otros)
              // Siempre obtener el estado más reciente del store
              const midiMappings = useMidiMappingStore.getState().midiMappings;
              const mappedAddress = Object.keys(midiMappings).find(addr => {
                const mapping = midiMappings[addr];
                return mapping && mapping.channel === parsed.channel && mapping.cc === parsed.cc;
              });
              
              if (mappedAddress) {
                console.log(`[MIDI] Encontrado parámetro mapeado (EQ/otros): ${mappedAddress}`);
                if (socket && isConnected) {
                  socket.emit('set-param', { address: mappedAddress, value: parsed.value });
                  // Emitir evento personalizado para actualización visual inmediata
                  window.dispatchEvent(new CustomEvent('param-value-update', { 
                    detail: { address: mappedAddress, value: parsed.value } 
                  }));
                } else {
                  console.warn('[MIDI] Socket no conectado, no se puede enviar valor (parámetro mapeado: ' + mappedAddress + ')');
                }
              } else {
                console.log('[MIDI] No hay strip mapeado para este Channel/CC');
              }
            };
          });
        };

        setupInputHandlers();

        // Escuchar cambios en dispositivos
        access.onstatechange = (event: any) => {
          console.log('[MIDI] Cambio en dispositivo MIDI:', event.port.name, event.port.state);
          setupInputHandlers();
        };
      })
      .catch((error) => {
        console.error('[MIDI] Error al solicitar acceso MIDI:', error);
      });
  }, [socket, isConnected]);

  // Manejar modo mapping
  useEffect(() => {
    if (!mappingAddress) {
      console.log('[MIDI Mapping] Saliendo del modo mapping');
      mappingHandlerRef.current = null;
      return;
    }

    console.log(`[MIDI Mapping] Entrando en modo mapping para: ${mappingAddress}`);

    // Solicitar acceso MIDI si no está disponible
    if (!midiAccessRef.current && typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      console.log('[MIDI Mapping] Solicitando acceso MIDI...');
      requestMidiAccess()
        .then((access) => {
          console.log('[MIDI Mapping] Acceso MIDI obtenido');
          midiAccessRef.current = access;
          setupMappingHandler(access);
        })
        .catch((error) => {
          console.error('[MIDI Mapping] Error al obtener acceso MIDI:', error);
        });
    } else if (midiAccessRef.current) {
      console.log('[MIDI Mapping] Usando acceso MIDI existente');
      setupMappingHandler(midiAccessRef.current);
    } else {
      console.error('[MIDI Mapping] No se puede obtener acceso MIDI');
      console.error('[MIDI Mapping] La Web MIDI API requiere HTTPS o localhost.');
      console.error('[MIDI Mapping] Ejecuta: npm run dev:https (desde /ui)');
      console.error('[MIDI Mapping] Luego accede a https://localhost:3000 o https://tu-ip-local:3000');
    }

    function setupMappingHandler(access: MIDIAccess) {
      console.log(`[MIDI Mapping] Configurando handler de mapping para ${access.inputs.size} input(s)`);
      
      if (access.inputs.size === 0) {
        console.warn('[MIDI Mapping] No hay dispositivos MIDI de entrada disponibles');
      }

      access.inputs.forEach((input, key) => {
        console.log(`[MIDI Mapping] Input disponible: ${input.name} (${input.manufacturer}) - Estado: ${input.state}`);
        
        // Verificar que el input esté en estado 'connected'
        if (input.state !== 'connected') {
          console.warn(`[MIDI Mapping] Input ${input.name} no está conectado (estado: ${input.state})`);
        }
      });

      // Configurar handler para modo mapping
      // Este handler se ejecutará cuando mappingHandlerRef.current esté definido
      mappingHandlerRef.current = (event: MIDIMessageEvent) => {
        const data = event.data;
        console.log(`[MIDI Mapping] Mensaje recibido durante mapping:`, {
          data: Array.from(data || []),
          hex: Array.from(data || []).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
        });

        const parsed = parseMidiMessage(event);
        if (!parsed) {
          console.log('[MIDI Mapping] Mensaje no es un Control Change, ignorando');
          return;
        }

        if (!mappingAddress) {
          console.log('[MIDI Mapping] No hay dirección de mapping, ignorando');
          return;
        }

        console.log(`[MIDI Mapping] Mapeando ${mappingAddress} a Channel ${parsed.channel}, CC ${parsed.cc}`);

        // Mapear el strip (sobreescribir si ya existe)
        const mapping = {
          channel: parsed.channel,
          cc: parsed.cc,
        };
        updateParamMidiMapping(mappingAddress, mapping);

        // También sincronizar con el store de mapeos MIDI para que se refleje en modales
        try {
          useMidiMappingStore.getState().setMidiMapping(mappingAddress, mapping);
        } catch (e) {
          console.error('[MIDI] Error al sincronizar mapeo:', e);
        }

        console.log(`[MIDI Mapping] Mapping completado (permanece en modo mapping hasta ESC)`);
        // NO salir del modo mapping - el usuario debe presionar ESC
      };

      console.log('[MIDI Mapping] Handler configurado, esperando señal MIDI...');
      console.log('[MIDI Mapping] Mueve cualquier control MIDI ahora para mapear');
    }

    // Manejar ESC para cancelar
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mappingAddress) {
        console.log('[MIDI Mapping] Cancelado por ESC');
        setMappingAddress(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      mappingHandlerRef.current = null;
    };
  }, [mappingAddress, updateParamMidiMapping]);

  const handleMapClick = (address: string) => {
    console.log(`[MIDI Mapping] Click en Map para: ${address}`);
    console.log(`[MIDI Mapping] MIDI Access disponible:`, midiAccessRef.current !== null);
    if (midiAccessRef.current) {
      console.log(`[MIDI Mapping] Inputs disponibles:`, midiAccessRef.current.inputs.size);
      midiAccessRef.current.inputs.forEach((input, key) => {
        console.log(`  - ${input.name} (${input.manufacturer}) - Estado: ${input.state}`);
      });
    }
    setMappingAddress(address);
  };

  const handleClearMapping = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateParamMidiMapping(address, null);
    // También eliminar del store de mapeos MIDI (para que se refleje en modales)
    try {
      useMidiMappingStore.getState().removeMidiMapping(address);
    } catch (e) {
      console.error('[MIDI] Error al eliminar mapeo:', e);
    }
    // Si está en modo mapping, salir del modo mapping
    if (mappingAddress === address) {
      setMappingAddress(null);
    }
  };

  const handleCancelMapping = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Cancelar modo mapping sin guardar
    if (mappingAddress === address) {
      setMappingAddress(null);
    }
  };

  // Listener para respuestas de color (se crea una vez cuando socket está listo)
  useEffect(() => {
    if (!socket || !isConnected) return;

    const onColorResponse = (msg: { colorAddress: string; color: number | null }) => {
      if (msg.color === null) {
        console.log(`[Page] Color null recibido, colorAddress: ${msg.colorAddress}`);
        return;
      }
      
      console.log(`[Page] Color recibido: address=${msg.colorAddress}, color=${msg.color}`);
      
      // Obtener params actuales del store dentro del listener
      const currentParams = useParamStore.getState().params;
      const param = currentParams.find((p: Param) => {
        const fxSendInfo = getFxSendInfo(p.address);
        if (fxSendInfo.isFxSend) {
          const channelColorAddress = getChannelColorAddressForFxSend(p.address);
          const fxColorAddress = getColorAddress(p.address);
          return msg.colorAddress === channelColorAddress || msg.colorAddress === fxColorAddress;
        } else {
          const pColorAddress = getColorAddress(p.address);
          return pColorAddress === msg.colorAddress;
        }
      });
      
      if (param && msg.color !== null) {
        const fxSendInfo = getFxSendInfo(param.address);
        if (fxSendInfo.isFxSend) {
          const channelColorAddress = getChannelColorAddressForFxSend(param.address);
          const fxColorAddress = getColorAddress(param.address);
          console.log(`[Page] FX Send encontrado para ${param.address}:`);
          console.log(`  - channelColorAddress: ${channelColorAddress}`);
          console.log(`  - fxColorAddress: ${fxColorAddress}`);
          console.log(`  - msg.colorAddress: ${msg.colorAddress}`);
          
          if (msg.colorAddress === channelColorAddress) {
            console.log(`[Page] ✅ Actualizando COLOR DEL CANAL para ${param.address}: ${msg.color}`);
            updateParamColor(param.address, msg.color);
          } else if (msg.colorAddress === fxColorAddress) {
            console.log(`[Page] ✅ Actualizando COLOR DEL FX para ${param.address}: ${msg.color}`);
            updateParamFxColor(param.address, msg.color);
          } else {
            console.log(`[Page] ⚠️ No match para FX Send`);
          }
        } else {
          console.log(`[Page] ✅ Actualizando COLOR DEL CANAL (normal) para ${param.address}: ${msg.color}`);
          updateParamColor(param.address, msg.color);
        }
      } else {
        console.log(`[Page] ⚠️ Param no encontrado para colorAddress: ${msg.colorAddress}`);
      }
    };

    socket.on('color-response', onColorResponse);

    return () => {
      socket.off('color-response', onColorResponse);
    };
  }, [socket, isConnected, updateParamColor, updateParamFxColor]);

  const handleAdd = (address: string, channel: string, param: string) => {
    if (!selectedPageId) return;
    // Detectar si es un bus o master para asignar el label correcto
    let displayChannel = channel;
    if (channel.startsWith('bus/')) {
      const busNum = channel.match(/bus\/(\d+)/)?.[1];
      displayChannel = busNum ? `Bus ${busNum}` : channel;
    } else if (channel === 'lr') {
      displayChannel = 'Master';
    }
    addParam({ address, channel: displayChannel, param, pageId: selectedPageId });
  };

  const handleSaveMacro = (name: string, items: { channel: string; param: string }[]) => {
    // Función helper para construir la dirección OSC
    const buildAddress = (ch: string, p: string): string => {
      if (ch.startsWith('bus/')) {
        return `/${ch}/mix/fader`;
      } else if (ch === 'lr') {
        return `/${ch}/mix/fader`;
      } else if (ch === 'rtn/aux') {
        if (p === 'mix/fader') {
          return `/rtn/aux/mix/fader`;
        } else {
          return `/rtn/aux/${p}`;
        }
      } else {
        return `/ch/${ch}/${p}`;
      }
    };

    if (editingMacro) {
      // Actualizar macro existente
      const macroParams = items.map(item => ({
        channel: item.channel,
        param: item.param,
        address: buildAddress(item.channel, item.param),
      }));
      const updatedMacro: Macro = {
        id: editingMacro.id,
        name,
        params: macroParams,
        pageId: selectedPageId || '',
      };
      updateMacro(editingMacro.id, updatedMacro);
      setEditingMacro(null);
    } else {
      // Crear nuevo macro
      const macroParams = items.map(item => ({
        channel: item.channel,
        param: item.param,
        address: buildAddress(item.channel, item.param),
      }));
      const newMacro: Macro = {
        id: crypto.randomUUID(),
        name,
        params: macroParams,
        pageId: selectedPageId || '',
      };
      addMacro(newMacro);
    }
  };

  const handleEditMacro = (macroId: string) => {
    const macro = macros.find(m => m.id === macroId);
    if (!macro) return;
    
    const items = macro.params.map(p => ({
      channel: p.channel,
      param: p.param,
    }));
    
    setEditingMacro({
      id: macro.id,
      name: macro.name,
      items,
    });
    setModalOpen(true);
  };

  const handlePageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'create-new') {
      const newPageId = createPage();
      setSelectedPageId(newPageId);
      setCurrentPage(newPageId);
    } else {
      setSelectedPageId(value);
      setCurrentPage(value);
    }
  };

  const handleDeletePage = () => {
    if (!selectedPageId || pages.length <= 1) return;
    if (confirm('Are you sure you want to delete this page and all its controls?')) {
      removePage(selectedPageId);
      // selectedPageId se actualizará automáticamente en el useEffect
    }
  };

  // Polling global cada minuto para actualizar colores
  useEffect(() => {
    if (!socket || !isConnected || currentPageParams.length === 0 || !selectedPageId) return;

    const updateAllColors = () => {
      // Obtener params actuales para asegurar que estamos usando los más recientes
      const currentParams = useParamStore.getState().params.filter((p: Param) => p.pageId === selectedPageId);
      console.log(`[Page] Polling: actualizando colores para ${currentParams.length} params`);
      
      currentParams.forEach((p: Param) => {
        const fxSendInfo = getFxSendInfo(p.address);
        
        if (fxSendInfo.isFxSend) {
          // FX Send: obtener color del canal y color del FX
          const channelColorAddress = getChannelColorAddressForFxSend(p.address);
          const fxColorAddress = getColorAddress(p.address);
          
          console.log(`[Page] Polling FX Send ${p.address}:`);
          console.log(`  - Solicitando color del canal: ${channelColorAddress}`);
          console.log(`  - Solicitando color del FX: ${fxColorAddress}`);
          
          if (channelColorAddress) {
            socket.emit('get-color', { colorAddress: channelColorAddress });
          }
          if (fxColorAddress) {
            socket.emit('get-color', { colorAddress: fxColorAddress });
          }
        } else {
          // Normal: obtener solo el color del canal
          const colorAddress = getColorAddress(p.address);
          if (colorAddress) {
            console.log(`[Page] Polling normal ${p.address}: solicitando color del canal: ${colorAddress}`);
            socket.emit('get-color', { colorAddress });
          }
        }
      });
    };

    // Actualizar inmediatamente y luego cada minuto
    updateAllColors();
    const interval = setInterval(updateAllColors, 60000); // 60 segundos

    return () => {
      clearInterval(interval);
    };
  }, [socket, isConnected, currentPageParams.length, selectedPageId]); // Solo depende de la cantidad de params de la page actual

  return (
    <main className="min-h-screen sm:h-screen">
      <div className="mx-auto min-h-screen sm:h-screen p-6 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold dark:text-white">mixair</h1>
            <button
              onClick={() => setConfigModalOpen(true)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              title={isConnected ? 'Connected - Click to configure' : 'Disconnected - Click to configure'}
            >
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </button>
          </div>
          <div className='flex items-center gap-3'>
          {pages.length > 1 && (
              <button
                className="w-8 h-8 rounded bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-sm"
                onClick={handleDeletePage}
                title="Delete current page"
              >
                🗑️
              </button>
            )}
            <select
              className="border rounded px-3 py-2 dark:bg-slate-700 dark:text-white dark:border-slate-600"
              value={selectedPageId || ''}
              onChange={handlePageChange}
            >
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
              <option value="create-new">+ Create new</option>
            </select>
            <button
              className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center text-2xl font-bold shadow-lg"
              onClick={() => setModalOpen(true)}
              title="Add control"
            >
              +
            </button>
          </div>
        </div>
        <div 
          ref={(el) => {
            // Guardar referencia para altura del contenedor
            if (el) {
              (window as any).__stripContainerHeight = el.offsetHeight;
            }
          }}
          className="flex gap-2 sm:gap-4 param-parent flex-1 sm:h-full relative"
          onDragOver={(e) => {
            // Permitir drag sobre el contenedor padre pero no actualizar dropTarget aquí
            e.preventDefault();
          }}
          onDragLeave={(e) => {
            // Usar relatedTarget para verificar si realmente salimos del contenedor
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            const currentTarget = e.currentTarget as HTMLElement;
            
            // Si relatedTarget es null o está fuera del contenedor, limpiar dropTarget
            if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
              // Usar un pequeño delay para evitar parpadeos al pasar sobre elementos hijos
              if (dragOverTimeoutRef.current) {
                clearTimeout(dragOverTimeoutRef.current);
              }
              dragOverTimeoutRef.current = setTimeout(() => {
                setDropTargetIndex(null);
              }, 50);
            }
          }}
        >
          {/* Área de drop antes del primer strip */}
          {currentPageParams.length > 0 && (
            <div
              className="absolute left-0 top-0 w-4 z-10 sm:h-full"
              style={{ left: '-18px' }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragOverTimeoutRef.current) {
                  clearTimeout(dragOverTimeoutRef.current);
                  dragOverTimeoutRef.current = null;
                }
                if (draggedIndex !== null && draggedIndex !== 0) {
                  setDropTargetIndex(0);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragOverTimeoutRef.current) {
                  clearTimeout(dragOverTimeoutRef.current);
                  dragOverTimeoutRef.current = null;
                }
                if (draggedIndex !== null && dropTargetIndex !== null) {
                  let targetIndex = dropTargetIndex;
                  if (draggedIndex < targetIndex) {
                    targetIndex -= 1;
                  }
                  const maxIndex = currentPageParams.length - 1;
                  targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
                  if (draggedIndex !== targetIndex) {
                    reorderParams(draggedIndex, targetIndex);
                  }
                }
                setDraggedIndex(null);
                setDropTargetIndex(null);
              }}
            />
          )}
          
          {/* Indicador antes del primer strip */}
          {params.length > 0 && dropTargetIndex === 0 && (
            <div 
              className="absolute left-0 top-0 w-3 border-2 border-blue-500 bg-blue-100/20 dark:bg-blue-900/20 rounded pointer-events-none flex-shrink-0 sm:h-full z-20" 
              style={{ 
                left: '-18px',
                top: 0
              }} 
            />
          )}
          
          {currentPageParams.map((p: Param, index: number) => {
            let badge = null;
            if (p.address.startsWith('/bus/')) {
              badge = <small className="inline-block px-2 py-0.5 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200 rounded mb-1">Bus</small>;
            } else if (p.address.startsWith('/lr/')) {
              badge = <small className="inline-block px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 rounded mb-1">Master</small>;
            } else if (p.param === 'mix/fader') {
              badge = <small className="inline-block px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 rounded mb-1">Fader</small>;
            } else if (p.param.startsWith('mix/0') && p.param.endsWith('/level')) {
              // FX Send
              const fxNum = p.param.slice(4, 6);
              badge = <small className="inline-block px-2 py-0.5 text-xs bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200 rounded mb-1">FX {parseInt(fxNum, 10) - 6} Send</small>;
            } else if (p.param.startsWith('eq/')) {
              // EQ parameter
              const eqMatch = p.param.match(/eq\/(\d+)\/g/);
              if (eqMatch) {
                const eqNum = eqMatch[1];
                let eqLabel = '';
                if (eqNum === '1') eqLabel = 'EQ Low';
                else if (eqNum === '2') eqLabel = 'EQ Mid';
                else if (eqNum === '4') eqLabel = 'EQ Hi';
                else eqLabel = `EQ ${eqNum}`;
                badge = <small className="inline-block px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200 rounded mb-1">{eqLabel}</small>;
              }
            } else if (p.isMacro || p.param === 'macro') {
              // Macro
              badge = <small className="inline-block px-2 py-0.5 text-xs bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200 rounded mb-1">Macro</small>;
            }
            // Detectar si es FX Send
            const fxSendInfo = getFxSendInfo(p.address);
            const isFxSend = fxSendInfo.isFxSend;
            
            // Determinar displayName según el tipo
            let displayName: string;
            if (isFxSend && fxSendInfo.fxNum) {
              // FX Send: "FX1-01" (formato compacto)
              if (p.channel.startsWith('Bus') || p.channel === 'Master') {
                // Para buses y master, mantener el nombre completo
                displayName = `FX${fxSendInfo.fxNum}-${p.channel}`;
              } else {
                // Para canales regulares, usar solo el número
                displayName = `FX${fxSendInfo.fxNum}-${p.channel}`;
              }
            } else if (p.param.startsWith('eq/')) {
              // EQ parameter: formato "Low-01", "Mid-01", "Hi-01"
              const eqMatch = p.param.match(/eq\/(\d+)\/g/);
              if (eqMatch) {
                const eqNum = eqMatch[1];
                let eqLabel = '';
                if (eqNum === '1') eqLabel = 'Low';
                else if (eqNum === '2') eqLabel = 'Mid';
                else if (eqNum === '4') eqLabel = 'Hi';
                else eqLabel = eqNum;
                displayName = `${eqLabel}-${p.channel}`;
              } else {
                displayName = `EQ-${p.channel}`;
              }
            } else {
              // Normal: usar el formato estándar
              displayName = p.channel.startsWith('Bus') || p.channel === 'Master' 
                ? p.channel 
                : `Ch ${p.channel}`;
            }
            
            // Formato del tooltip: "Channel 01 - /ch/01/mix/fader"
            const tooltipText = `${displayName} - ${p.address}`;
            
            // Construir clases para el título: siempre usar fondo de color del canal
            const colorClasses = getColorClasses(p.color);
            const titleClasses = [
              'text-xs px-2 py-1 rounded font-medium text-center',
              'block truncate w-full',
              colorClasses.bg || 'bg-gray-100 dark:bg-gray-800',
              colorClasses.border || '',
              colorClasses.text || 'text-black dark:text-white',
              'cursor-move select-none',
            ].filter(Boolean).join(' ');
            
            // Para FX Send, el contenedor tendrá stroke según el color del FX
            const fxStrokeClasses = isFxSend && p.fxColor !== undefined ? getStrokeClasses(p.fxColor) : null;

            // Construir clases del contenedor: stroke para FX Send si tiene fxColor, fondo normal para otros
            const isDragging = draggedIndex === index;
            const isDragOver = draggedIndex !== null && draggedIndex !== index;
            const isMapping = mappingAddress === p.address;
            // Verificar mapeo tanto en el strip como en el store de mapeos MIDI
            const stripMidiMapping = p.midiMapping;
            const storeMidiMapping = useMidiMappingStore.getState().getMidiMapping(p.address);
            const hasMidiMapping = (stripMidiMapping !== null && stripMidiMapping !== undefined) || 
                                   (storeMidiMapping !== null && storeMidiMapping !== undefined);
            // Usar el mapeo del strip si existe, sino el del store
            const effectiveMidiMapping = stripMidiMapping || storeMidiMapping || null;
            const containerClasses = [
              'group relative flex flex-col items-center rounded shadow p-2 param-container transition-opacity sm:h-full',
              isFxSend && fxStrokeClasses?.border 
                ? `bg-white dark:bg-slate-950 ${fxStrokeClasses.border}` 
                : 'bg-white dark:bg-slate-950',
              isDragging ? 'opacity-50' : '',
              isDragOver ? 'opacity-70' : '',
              isMapping ? 'ring-2 ring-blue-500 ring-opacity-50' : '',
              // hasMidiMapping ? 'border-l-4 border-blue-500' : '',
            ].filter(Boolean).join(' ');

            const handleDragStart = (e: React.DragEvent) => {
              setDraggedIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/html', index.toString());
            };

            const handleDragOver = (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              
              // Cancelar cualquier timeout pendiente de dragLeave
              if (dragOverTimeoutRef.current) {
                clearTimeout(dragOverTimeoutRef.current);
                dragOverTimeoutRef.current = null;
              }
              
              if (draggedIndex === null || draggedIndex === index) {
                return;
              }

              // Determinar el índice objetivo: si el mouse está en la mitad izquierda, insertar antes; si en la derecha, después
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const midPoint = rect.left + rect.width / 2;
              const targetIdx = e.clientX < midPoint ? index : index + 1;
              
              setDropTargetIndex(targetIdx);
            };

            const handleDrop = (e: React.DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              
              // Limpiar timeout si existe
              if (dragOverTimeoutRef.current) {
                clearTimeout(dragOverTimeoutRef.current);
                dragOverTimeoutRef.current = null;
              }
              
              if (draggedIndex === null || dropTargetIndex === null) {
                setDraggedIndex(null);
                setDropTargetIndex(null);
                return;
              }
              
              // Calcular el índice objetivo final
              let targetIndex = dropTargetIndex;
              
              // Ajustar el índice objetivo considerando que splice primero remueve y luego inserta
              // Si estamos moviendo desde antes del target, al remover el elemento los índices se desplazan hacia atrás
              if (draggedIndex < targetIndex) {
                targetIndex -= 1;
              }
              
              // Asegurar que el índice esté dentro de los límites válidos
              const maxIndex = currentPageParams.length - 1;
              targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
              
              // Solo reordenar si el índice cambió
              if (draggedIndex !== targetIndex) {
                reorderParams(draggedIndex, targetIndex);
              }
              
              setDraggedIndex(null);
              setDropTargetIndex(null);
            };

            const handleDragEnd = () => {
              // Limpiar timeout si existe
              if (dragOverTimeoutRef.current) {
                clearTimeout(dragOverTimeoutRef.current);
                dragOverTimeoutRef.current = null;
              }
              setDraggedIndex(null);
              setDropTargetIndex(null);
            };

            // Determinar si mostrar el indicador de drop
            // Se muestra después del strip si el target es el siguiente índice
            const showDropIndicatorAfter = dropTargetIndex === index + 1;

            return (
              <div key={p.address} className="relative flex-shrink-0 sm:h-full">
                {/* Indicador de drop después del strip */}
                {showDropIndicatorAfter && (
                  <div 
                    className="absolute right-0 top-0 w-3 border-2 border-blue-500 bg-blue-100/20 dark:bg-blue-900/20 rounded pointer-events-none flex-shrink-0 sm:h-full" 
                    style={{ 
                      right: '-18px',
                      top: 0
                    }} 
                  />
                )}
                
                <div 
                  className={containerClasses}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                <button
                  className="absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 bg-black hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-lg font-bold transition-all opacity-0 group-hover:opacity-100 z-10"
                  style={{ margin: -16 }}
                  onClick={() => removeParam(p.address)}
                  title="Remove"
                >
                  ×
                </button>
                
                <div className="w-full mb-2 param-header flex-shrink-0">
                  <h3 
                    draggable
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    className={`${titleClasses} hover:opacity-80`}
                    style={{ width: 75 }}
                    title={`${tooltipText} - Drag to reorder`}
                  >
                    {displayName}
                  </h3>
                </div>
                {badge && <div className="flex-shrink-0">{badge}</div>}
                <div className="sm:flex-1 sm:flex sm:items-center w-full">
                  {p.isMacro ? (
                    (() => {
                      const macroId = p.address.replace('macro:', '');
                      const macro = currentPageMacros.find(m => m.id === macroId);
                      return macro ? (
                        <MacroStrip 
                          macro={macro}
                          address={p.address}
                          onEdit={() => handleEditMacro(macroId)}
                          isMapping={mappingAddress === p.address}
                          onMapClick={handleMapClick}
                          onClearMapping={handleClearMapping}
                          onCancelMapping={handleCancelMapping}
                        />
                      ) : null;
                    })()
                  ) : (
                    <ParamStrip address={p.address} channel={p.channel} param={p.param} pageId={p.pageId} />
                  )}
                </div>
                
                {/* Botones Map y EQ - solo para parámetros normales, no macros */}
                {!p.isMacro && p.param !== 'macro' && (
                  <div className="w-full mt-2 flex-shrink-0 space-y-1">
                    {isMapping ? (
                      <button
                        className="w-full px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-1"
                        onClick={(e) => handleMapClick(p.address)}
                        title="Click × to cancel mapping, move MIDI control to map"
                      >
                        <span>{effectiveMidiMapping ? formatMidiMapping(effectiveMidiMapping) : 'Map'}</span>
                        <span 
                          className="hover:text-red-300 cursor-pointer"
                          onClick={(e) => handleCancelMapping(p.address, e)}
                          title="Cancel mapping"
                        >
                          ×
                        </span>
                      </button>
                    ) : hasMidiMapping ? (
                      <button
                        className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                        onClick={(e) => handleClearMapping(p.address, e)}
                        title="Click to clear MIDI mapping"
                      >
                        <span>{effectiveMidiMapping ? formatMidiMapping(effectiveMidiMapping) : ''}</span>
                        <span>×</span>
                      </button>
                    ) : (
                      <button
                        className="w-full px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                        onClick={() => handleMapClick(p.address)}
                        title="Map to MIDI controller"
                      >
                        Map
                      </button>
                    )}
                  
                  {/* Botones EQ y FX solo para mix/fader de canales normales */}
                  {p.param === 'mix/fader' && p.address.match(/^\/ch\/\d{2}\/mix\/fader$/) && (
                    <>
                      <button
                        className="w-full px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                        onClick={() => {
                          const match = p.address.match(/^\/ch\/(\d{2})\/mix\/fader$/);
                          if (match) {
                            setEqModalChannel(match[1]);
                            setEqModalOpen(true);
                          }
                        }}
                        title="Open EQ controls"
                      >
                        EQ
                      </button>
                      <button
                        className="w-full px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        onClick={() => {
                          const match = p.address.match(/^\/ch\/(\d{2})\/mix\/fader$/);
                          if (match) {
                            setFxModalChannel(match[1]);
                            setFxModalOpen(true);
                          }
                        }}
                        title="Open FX Send controls"
                      >
                        FX
                      </button>
                    </>
                  )}
                  </div>
                )}
                </div>
                
                {/* Área de drop después del strip */}
                <div
                  className="absolute right-0 top-0 w-4 z-10 sm:h-full"
                  style={{ right: '-18px' }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragOverTimeoutRef.current) {
                      clearTimeout(dragOverTimeoutRef.current);
                      dragOverTimeoutRef.current = null;
                    }
                    if (draggedIndex !== null && draggedIndex !== index) {
                      setDropTargetIndex(index + 1);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragOverTimeoutRef.current) {
                      clearTimeout(dragOverTimeoutRef.current);
                      dragOverTimeoutRef.current = null;
                    }
                    if (draggedIndex !== null && dropTargetIndex !== null) {
                      let targetIndex = dropTargetIndex;
                      if (draggedIndex < targetIndex) {
                        targetIndex -= 1;
                      }
                      const maxIndex = currentPageParams.length - 1;
                      targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
                      if (draggedIndex !== targetIndex) {
                        reorderParams(draggedIndex, targetIndex);
                      }
                    }
                    setDraggedIndex(null);
                    setDropTargetIndex(null);
                  }}
                />
              </div>
            );
          })}
          
          {/* Área de drop después del último strip */}
          {currentPageParams.length > 0 && (
            <div
              className="absolute right-0 top-0 w-4 z-10 sm:h-full"
              style={{ right: '-18px' }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragOverTimeoutRef.current) {
                  clearTimeout(dragOverTimeoutRef.current);
                  dragOverTimeoutRef.current = null;
                }
                const lastIndex = currentPageParams.length - 1;
                if (draggedIndex !== null && draggedIndex !== lastIndex) {
                  setDropTargetIndex(lastIndex + 1);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragOverTimeoutRef.current) {
                  clearTimeout(dragOverTimeoutRef.current);
                  dragOverTimeoutRef.current = null;
                }
                if (draggedIndex !== null && dropTargetIndex !== null) {
                  let targetIndex = dropTargetIndex;
                  if (draggedIndex < targetIndex) {
                    targetIndex -= 1;
                  }
                  const maxIndex = currentPageParams.length - 1;
                  targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
                  if (draggedIndex !== targetIndex) {
                    reorderParams(draggedIndex, targetIndex);
                  }
                }
                setDraggedIndex(null);
                setDropTargetIndex(null);
              }}
            />
          )}
        </div>
      </div>
      <AddParamModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingMacro(null);
        }}
        onAdd={handleAdd}
        onSaveMacro={handleSaveMacro}
        editingMacro={editingMacro}
      />
      <BridgeConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSave={() => setConfigModalOpen(false)}
      />
      <EqModal
        open={eqModalOpen}
        onClose={() => {
          setEqModalOpen(false);
          setEqModalChannel(null);
        }}
        channel={eqModalChannel || '01'}
      />
      <FxModal
        open={fxModalOpen}
        onClose={() => {
          setFxModalOpen(false);
          setFxModalChannel(null);
        }}
        channel={fxModalChannel || '01'}
      />
    </main>
  );
} 