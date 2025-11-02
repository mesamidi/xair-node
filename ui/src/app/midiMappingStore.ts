import { create } from 'zustand';

// Store separado para mapeos MIDI de parámetros que no están en la lista principal de params
// (como EQ params que solo aparecen cuando se abre el modal)

type MidiMappingValue = { channel: number; cc: number } | null;

type State = {
  midiMappings: Record<string, MidiMappingValue>; // address -> mapping
  setMidiMapping: (address: string, mapping: MidiMappingValue) => void;
  removeMidiMapping: (address: string) => void;
  getMidiMapping: (address: string) => MidiMappingValue;
  loadMidiMappings: () => void;
};

const MIDI_MAPPINGS_KEY = 'osc_midi_mappings';

export const useMidiMappingStore = create<State>((set: any, get: any) => ({
  midiMappings: {},
  setMidiMapping: (address: string, mapping: MidiMappingValue) => {
    const midiMappings = { ...get().midiMappings };
    if (mapping === null) {
      // Eliminar del objeto si es null
      delete midiMappings[address];
    } else {
      midiMappings[address] = mapping;
    }
    set({ midiMappings });
    localStorage.setItem(MIDI_MAPPINGS_KEY, JSON.stringify(midiMappings));
  },
  removeMidiMapping: (address: string) => {
    const midiMappings = { ...get().midiMappings };
    delete midiMappings[address];
    set({ midiMappings });
    localStorage.setItem(MIDI_MAPPINGS_KEY, JSON.stringify(midiMappings));
  },
  getMidiMapping: (address: string) => {
    return get().midiMappings[address] || null;
  },
  loadMidiMappings: () => {
    const raw = localStorage.getItem(MIDI_MAPPINGS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        set({ midiMappings: parsed });
      } catch (e) {
        console.error('Error loading MIDI mappings:', e);
      }
    }
  },
}));

