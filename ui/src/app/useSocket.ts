import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const BRIDGE_IP_KEY = 'osc_bridge_ip';

// Obtener la IP del bridge: intenta detectarla automáticamente o usa localStorage
function getBridgeUrl(): string {
  // Si estamos en el mismo host (dev o producción misma máquina), usa hostname
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(BRIDGE_IP_KEY);
    // Detectar protocolo: si el frontend está en HTTPS, usar HTTPS para el bridge
    const protocol = window.location.protocol; // 'http:' o 'https:'
    const useHttps = protocol === 'https:';
    
    if (saved) {
      return `${protocol}//${saved}:4000`;
    }
    
    // En desarrollo, si Next.js y bridge están en la misma máquina
    // usa localhost. En producción, necesitarán configurar la IP.
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//localhost:4000`;
    }
    
    // Si no, asume que el bridge está en la misma IP que el servidor web
    return `${protocol}//${hostname}:4000`;
  }
  return 'http://localhost:4000';
}

let socketInstance: Socket | null = null;
let connectionListeners: Set<(connected: boolean) => void> = new Set();

function getSocket(): Socket {
  if (!socketInstance) {
    const url = getBridgeUrl();
    socketInstance = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected to bridge');
      connectionListeners.forEach(cb => cb(true));
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected from bridge');
      connectionListeners.forEach(cb => cb(false));
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`[Socket] Reconnected after ${attemptNumber} attempts`);
      connectionListeners.forEach(cb => cb(true));
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[Socket] Reconnection attempt ${attemptNumber}`);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });
  }
  return socketInstance;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Actualizar estado inicial
    setIsConnected(socket.connected);

    // Registrar listener
    const listener = (connected: boolean) => setIsConnected(connected);
    connectionListeners.add(listener);

    return () => {
      connectionListeners.delete(listener);
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
  };
}

// Función para configurar la IP del bridge manualmente
export function setBridgeIP(ip: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BRIDGE_IP_KEY, ip);
    // Si el socket ya existe, desconectar y crear uno nuevo
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
      // Forzar recreación del socket en el próximo useSocket
    }
  }
}

// Función para obtener la IP guardada
export function getBridgeIP(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(BRIDGE_IP_KEY);
  }
  return null;
}
