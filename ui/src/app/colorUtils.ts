// Mapeo de colores X-Air (0-15) a clases Tailwind
export const COLOR_NAMES = [
  'OFF',    // 0
  'RD',     // 1
  'GN',     // 2
  'YE',     // 3
  'BL',     // 4
  'MG',     // 5
  'CY',     // 6
  'WH',     // 7
  'OFFi',   // 8
  'RDi',    // 9
  'GNi',    // 10
  'YEi',    // 11
  'BLi',    // 12
  'MGi',    // 13
  'CYi',    // 14
  'WHi',    // 15
] as const;

// Obtener la ruta OSC para consultar el color de un parámetro
export function getColorAddress(address: string): string | null {
  // IMPORTANTE: Verificar FX Send PRIMERO antes de canales regulares
  // FX Send: convertir mixbus a número de FX send
  // Regla: /ch/{n}/mix/07 → /fxsend/1/config/color
  //        /ch/{n}/mix/08 → /fxsend/2/config/color
  //        /ch/{n}/mix/09 → /fxsend/3/config/color
  //        /ch/{n}/mix/10 → /fxsend/4/config/color
  if (address.match(/\/mix\/0[7-9]\/level/) || address.match(/\/mix\/10\/level/)) {
    const match = address.match(/\/mix\/(\d+)\/level/);
    if (match) {
      const mixbusNum = parseInt(match[1], 10);
      // mixbus 7 = FX1, mixbus 8 = FX2, mixbus 9 = FX3, mixbus 10 = FX4
      if (mixbusNum >= 7 && mixbusNum <= 10) {
        const fxNum = mixbusNum - 6; // 7-6=1, 8-6=2, 9-6=3, 10-6=4
        return `/fxsend/${fxNum}/config/color`;
      }
    }
  }
  
  // Canal regular: /ch/01/mix/fader -> /ch/01/config/color
  // (solo si no es FX Send)
  if (address.startsWith('/ch/')) {
    const match = address.match(/^\/ch\/(\d+)\//);
    if (match) {
      return `/ch/${match[1]}/config/color`;
    }
  }
  
  // Bus: /bus/1/mix/fader -> /bus/1/config/color
  if (address.startsWith('/bus/')) {
    const match = address.match(/^\/bus\/(\d+)\//);
    if (match) {
      return `/bus/${match[1]}/config/color`;
    }
  }
  
  // Master: /lr/mix/fader -> /lr/config/color
  if (address.startsWith('/lr/')) {
    return '/lr/config/color';
  }
  
  // 17-18 (rtn/aux): /rtn/aux/mix/fader -> necesitamos obtener el color del canal aux
  if (address.startsWith('/rtn/aux/')) {
    // Para rtn/aux, el color se obtiene de /rtn/aux/config/color según la doc
    return '/rtn/aux/config/color';
  }
  
  return null;
}

// Obtener clases CSS para el color
export function getColorClasses(color: number | undefined): {
  bg?: string;
  border?: string;
  text?: string;
} {
  if (color === undefined) {
    return {};
  }
  
  // Colores sólidos (0-8)
  if (color === 0) {
    // OFF: gris oscuro, texto gris
    return {
      bg: 'bg-gray-800 dark:bg-gray-900',
      text: 'text-gray-400 dark:text-gray-500',
    };
  }
  
  if (color === 1) {
    // RD: rojo sólido
    return { bg: 'bg-red-600', text: 'text-white' };
  }
  
  if (color === 2) {
    // GN: verde sólido
    return { bg: 'bg-green-600', text: 'text-white' };
  }
  
  if (color === 3) {
    // YE: amarillo sólido
    return { bg: 'bg-yellow-500', text: 'text-black' };
  }
  
  if (color === 4) {
    // BL: azul sólido
    return { bg: 'bg-blue-600', text: 'text-white' };
  }
  
  if (color === 5) {
    // MG: magenta sólido
    return { bg: 'bg-pink-600', text: 'text-white' };
  }
  
  if (color === 6) {
    // CY: cyan sólido
    return { bg: 'bg-cyan-500', text: 'text-black' };
  }
  
  if (color === 7) {
    // WH: blanco sólido
    return { bg: 'bg-white', text: 'text-black' };
  }
  
  if (color === 8) {
    // OFFi: gris claro
    return {
      bg: 'bg-gray-300 dark:bg-gray-700',
      text: 'text-black dark:text-white',
    };
  }
  
  // Colores invertidos (9-15): fondo negro, borde y texto de color
  if (color === 9) {
    // RDi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-red-600',
      text: 'text-red-600',
    };
  }
  
  if (color === 10) {
    // GNi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-green-600',
      text: 'text-green-600',
    };
  }
  
  if (color === 11) {
    // YEi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-yellow-500',
      text: 'text-yellow-500',
    };
  }
  
  if (color === 12) {
    // BLi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-blue-600',
      text: 'text-blue-600',
    };
  }
  
  if (color === 13) {
    // MGi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-pink-600',
      text: 'text-pink-600',
    };
  }
  
  if (color === 14) {
    // CYi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-cyan-500',
      text: 'text-cyan-500',
    };
  }
  
  if (color === 15) {
    // WHi
    return {
      bg: 'bg-black dark:bg-gray-950',
      border: 'border-2 border-white',
      text: 'text-white',
    };
  }
  
  return {};
}

// Detectar si un address es un FX Send y obtener el número de FX
// Regla: mix/07 → FX1, mix/08 → FX2, mix/09 → FX3, mix/10 → FX4
export function getFxSendInfo(address: string): { isFxSend: boolean; fxNum?: number } {
  if (address.match(/\/mix\/0[7-9]\/level/) || address.match(/\/mix\/10\/level/)) {
    const match = address.match(/\/mix\/(\d+)\/level/);
    if (match) {
      const mixbusNum = parseInt(match[1], 10);
      // mixbus 7 = FX1, mixbus 8 = FX2, mixbus 9 = FX3, mixbus 10 = FX4
      if (mixbusNum >= 7 && mixbusNum <= 10) {
        const fxNum = mixbusNum - 6; // 7-6=1, 8-6=2, 9-6=3, 10-6=4
        return { isFxSend: true, fxNum };
      }
    }
  }
  return { isFxSend: false };
}

// Obtener la dirección del color del canal para FX Send
export function getChannelColorAddressForFxSend(address: string): string | null {
  // Para FX Send: /ch/01/mix/07/level -> /ch/01/config/color
  if (address.startsWith('/ch/')) {
    const match = address.match(/^\/ch\/(\d+)\//);
    if (match) {
      return `/ch/${match[1]}/config/color`;
    }
  }
  return null;
}

// Obtener clases CSS para stroke (borde) basado en el color
export function getStrokeClasses(color: number | undefined): {
  border?: string;
  text?: string;
} {
  if (color === undefined) {
    return {
      border: 'border border-gray-300 dark:border-gray-700',
      text: 'text-black dark:text-white',
    };
  }
  
  // Para colores sólidos (0-8), aplicar borde del mismo color
  if (color === 0) {
    return {
      border: 'border border-gray-800 dark:border-gray-900',
      text: 'text-gray-800 dark:text-gray-400',
    };
  }
  
  if (color === 1) {
    return { border: 'border-2 border-red-600', text: 'text-red-600' };
  }
  
  if (color === 2) {
    return { border: 'border-2 border-green-600', text: 'text-green-600' };
  }
  
  if (color === 3) {
    return { border: 'border-2 border-yellow-500', text: 'text-yellow-500' };
  }
  
  if (color === 4) {
    return { border: 'border-2 border-blue-600', text: 'text-blue-600' };
  }
  
  if (color === 5) {
    return { border: 'border-2 border-pink-600', text: 'text-pink-600' };
  }
  
  if (color === 6) {
    return { border: 'border-2 border-cyan-500', text: 'text-cyan-500' };
  }
  
  if (color === 7) {
    return { border: 'border-2 border-white', text: 'text-white' };
  }
  
  if (color === 8) {
    return {
      border: 'border border-gray-300 dark:border-gray-700',
      text: 'text-gray-700 dark:text-gray-300',
    };
  }
  
  // Para colores invertidos (9-15), usar el mismo borde que ya tienen definido
  if (color === 9) {
    return { border: 'border-2 border-red-600', text: 'text-red-600' };
  }
  
  if (color === 10) {
    return { border: 'border-2 border-green-600', text: 'text-green-600' };
  }
  
  if (color === 11) {
    return { border: 'border-2 border-yellow-500', text: 'text-yellow-500' };
  }
  
  if (color === 12) {
    return { border: 'border-2 border-blue-600', text: 'text-blue-600' };
  }
  
  if (color === 13) {
    return { border: 'border-2 border-pink-600', text: 'text-pink-600' };
  }
  
  if (color === 14) {
    return { border: 'border-2 border-cyan-500', text: 'text-cyan-500' };
  }
  
  if (color === 15) {
    return { border: 'border-2 border-white', text: 'text-white' };
  }
  
  return {
    border: 'border border-gray-300 dark:border-gray-700',
    text: 'text-black dark:text-white',
  };
}
