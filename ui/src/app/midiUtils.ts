// Utilidades para manejo de Web MIDI API

export type MidiMapping = {
  channel: number; // 1-16
  cc: number;      // 0-127
} | null;

export function requestMidiAccess(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) {
    throw new Error('Web MIDI API no está disponible en este navegador');
  }
  return navigator.requestMIDIAccess({ sysex: false });
}

export function parseMidiMessage(event: MIDIMessageEvent): { channel: number; cc: number; value: number } | null {
  const data = event.data;
  if (!data || data.length < 3) {
    console.log('[MIDI Parse] Datos insuficientes:', data ? data.length : 'null');
    return null;
  }

  const status = data[0];
  const messageType = status & 0xf0;
  const channel = (status & 0x0f) + 1; // Convertir de 0-15 a 1-16

  console.log(`[MIDI Parse] Status: 0x${status.toString(16)}, MessageType: 0x${messageType.toString(16)}, Channel: ${channel}`);

  // Control Change (CC) - 0xB0 a 0xBF
  if (messageType === 0xb0) {
    const cc = data[1];
    const value = data[2] / 127; // Normalizar a 0-1
    console.log(`[MIDI Parse] Control Change detectado: CC ${cc}, Value ${value.toFixed(3)}`);
    return { channel, cc, value };
  }

  console.log(`[MIDI Parse] No es Control Change (esperado 0xB0-0xBF, recibido 0x${messageType.toString(16)})`);
  return null;
}

export function formatMidiMapping(mapping: MidiMapping): string {
  if (!mapping) return '';
  return `CC${mapping.cc}:${mapping.channel}`;
}

export function midiMappingEquals(a: MidiMapping, b: MidiMapping): boolean {
  if (!a || !b) return a === b;
  return a.channel === b.channel && a.cc === b.cc;
}

