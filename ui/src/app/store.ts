import { create } from 'zustand';

export type Param = {
  channel: string; // ej: '01'
  param: string;   // ej: 'mix/fader'
  address: string; // ej: '/ch/01/mix/fader'
  color?: number;  // 0-15: color del canal
  fxColor?: number; // 0-15: color del FX (solo para FX Send)
  midiMapping?: { channel: number; cc: number } | null; // Mapeo MIDI: channel 1-16, cc 0-127
  isMacro?: boolean; // true si es un macro
  pageId: string; // ID de la page a la que pertenece
};

export type MacroParam = {
  channel: string;
  param: string;
  address: string;
};

export type Macro = {
  id: string; // UUID único
  name: string;
  params: MacroParam[];
  pageId: string; // ID de la page a la que pertenece
};

export type Page = {
  id: string; // UUID único
  name: string; // "page 1", "page 2", etc.
};

type State = {
  pages: Page[];
  currentPageId: string | null;
  params: Param[];
  macros: Macro[];
  addParam: (p: Param) => void;
  removeParam: (address: string) => void;
  addMacro: (macro: Macro) => void;
  updateMacro: (id: string, macro: Macro) => void;
  removeMacro: (id: string) => void;
  updateParamColor: (address: string, color: number) => void;
  updateParamFxColor: (address: string, fxColor: number) => void;
  updateParamMidiMapping: (address: string, mapping: { channel: number; cc: number } | null) => void;
  reorderParams: (fromIndex: number, toIndex: number) => void;
  createPage: () => string;
  removePage: (pageId: string) => void;
  setCurrentPage: (pageId: string) => void;
  loadParams: () => void;
  renamePages: () => void;
};

const PARAMS_KEY = 'osc_params';
const MACROS_KEY = 'osc_macros';
const PAGES_KEY = 'osc_pages';
const CURRENT_PAGE_KEY = 'osc_current_page';

export const useParamStore = create<State>((set: any, get: any) => ({
  pages: [],
  currentPageId: null,
  params: [],
  macros: [],
  addParam: (p: Param) => {
    // Verificar si ya existe un mapeo MIDI para este parámetro
    try {
      const { useMidiMappingStore } = require('./midiMappingStore');
      const existingMapping = useMidiMappingStore.getState().getMidiMapping(p.address);
      if (existingMapping) {
        // Si existe un mapeo, incluirlo en el parámetro
        p = { ...p, midiMapping: existingMapping };
      }
    } catch (e) {
      // Ignorar errores si el módulo no está cargado
    }
    
    const params = [...get().params, p];
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  },
  removeParam: (address: string) => {
    const params = get().params.filter((p: Param) => p.address !== address);
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
    
    // También eliminar el mapeo MIDI asociado
    try {
      const { useMidiMappingStore } = require('./midiMappingStore');
      useMidiMappingStore.getState().removeMidiMapping(address);
    } catch (e) {
      // Ignorar errores si el módulo no está cargado
    }
  },
  updateParamColor: (address: string, color: number) => {
    const params = get().params.map((p: Param) =>
      p.address === address ? { ...p, color } : p
    );
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  },
  updateParamFxColor: (address: string, fxColor: number) => {
    const params = get().params.map((p: Param) =>
      p.address === address ? { ...p, fxColor } : p
    );
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  },
  updateParamMidiMapping: (address: string, mapping: { channel: number; cc: number } | null) => {
    const params = get().params.map((p: Param) =>
      p.address === address ? { ...p, midiMapping: mapping } : p
    );
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
    
    // También sincronizar con el store de mapeos MIDI (para EQ y otros)
    // Siempre sincronizar, incluso si es null (para eliminar el mapeo)
    try {
      const { useMidiMappingStore } = require('./midiMappingStore');
      useMidiMappingStore.getState().setMidiMapping(address, mapping);
    } catch (e) {
      // Ignorar errores si el módulo no está cargado
    }
  },
  reorderParams: (fromIndex: number, toIndex: number) => {
    const params = [...get().params];
    const [removed] = params.splice(fromIndex, 1);
    params.splice(toIndex, 0, removed);
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  },
  addMacro: (macro: Macro) => {
    const macros = [...get().macros, macro];
    set({ macros });
    localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
    
    // También agregar como param para mostrarlo en la lista
    const macroParam: Param = {
      channel: macro.name,
      param: 'macro',
      address: `macro:${macro.id}`,
      isMacro: true,
      pageId: macro.pageId,
    };
    get().addParam(macroParam);
  },
  updateMacro: (id: string, macro: Macro) => {
    const macros = get().macros.map((m: Macro) => m.id === id ? macro : m);
    set({ macros });
    localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
    
    // Actualizar el param correspondiente
    const params = get().params.map((p: Param) =>
      p.address === `macro:${id}` ? { ...p, channel: macro.name } : p
    );
    set({ params });
    localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  },
  removeMacro: (id: string) => {
    const macros = get().macros.filter((m: Macro) => m.id !== id);
    set({ macros });
    localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
    
    // También eliminar el param correspondiente
    get().removeParam(`macro:${id}`);
  },
  createPage: () => {
    const pages = get().pages;
    const newPageId = crypto.randomUUID();
    const newPage: Page = {
      id: newPageId,
      name: `page ${pages.length + 1}`,
    };
    const updatedPages = [...pages, newPage];
    set({ pages: updatedPages, currentPageId: newPageId });
    localStorage.setItem(PAGES_KEY, JSON.stringify(updatedPages));
    localStorage.setItem(CURRENT_PAGE_KEY, newPageId);
    return newPageId;
  },
  removePage: (pageId: string) => {
    const pages = get().pages;
    const params = get().params;
    const macros = get().macros;
    
    // Eliminar todos los params de esta page
    const paramsToRemove = params.filter((p: Param) => p.pageId === pageId);
    paramsToRemove.forEach((p: Param) => {
      get().removeParam(p.address);
      // Eliminar mapeos MIDI asociados
      try {
        const { useMidiMappingStore } = require('./midiMappingStore');
        useMidiMappingStore.getState().removeMidiMapping(p.address);
      } catch (e) {
        // Ignorar errores
      }
    });
    
    // Eliminar todos los macros de esta page (y sus params asociados)
    const macrosToRemove = macros.filter((m: Macro) => m.pageId === pageId);
    macrosToRemove.forEach((m: Macro) => {
      get().removeMacro(m.id);
    });
    
    // Eliminar la page
    const updatedPages = pages.filter((p: Page) => p.id !== pageId);
    set({ pages: updatedPages });
    localStorage.setItem(PAGES_KEY, JSON.stringify(updatedPages));
    
    // Si era la page actual, cambiar a la primera disponible
    const currentPageId = get().currentPageId;
    if (currentPageId === pageId) {
      const firstPageId = updatedPages.length > 0 ? updatedPages[0].id : null;
      get().setCurrentPage(firstPageId || '');
    }
    
    // Renombrar pages
    get().renamePages();
  },
  setCurrentPage: (pageId: string) => {
    set({ currentPageId: pageId });
    localStorage.setItem(CURRENT_PAGE_KEY, pageId);
  },
  renamePages: () => {
    const pages = [...get().pages];
    const renamedPages = pages.map((p: Page, index: number) => ({
      ...p,
      name: `page ${index + 1}`,
    }));
    set({ pages: renamedPages });
    localStorage.setItem(PAGES_KEY, JSON.stringify(renamedPages));
  },
  loadParams: () => {
    // Cargar pages primero
    const pagesRaw = localStorage.getItem(PAGES_KEY);
    let pages: Page[] = [];
    if (pagesRaw) {
      pages = JSON.parse(pagesRaw);
    } else {
      // Crear page inicial si no hay ninguna
      const initialPage: Page = {
        id: crypto.randomUUID(),
        name: 'page 1',
      };
      pages = [initialPage];
      localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
    }
    set({ pages });
    
    // Cargar currentPageId
    const currentPageIdRaw = localStorage.getItem(CURRENT_PAGE_KEY);
    let currentPageId = currentPageIdRaw || (pages.length > 0 ? pages[0].id : null);
    // Verificar que la page actual existe
    if (currentPageId && !pages.find((p: Page) => p.id === currentPageId)) {
      currentPageId = pages.length > 0 ? pages[0].id : null;
    }
    set({ currentPageId });
    localStorage.setItem(CURRENT_PAGE_KEY, currentPageId || '');
    
    // Cargar params
    const raw = localStorage.getItem(PARAMS_KEY);
    if (raw) {
      let params = JSON.parse(raw);
      // Migrar params antiguos (sin pageId) a la primera page
      if (pages.length > 0) {
        params = params.map((p: Param) => {
          if (!p.pageId) {
            return { ...p, pageId: pages[0].id };
          }
          return p;
        });
      }
      
      // Verificar y sincronizar mapeos MIDI existentes
      try {
        const { useMidiMappingStore } = require('./midiMappingStore');
        useMidiMappingStore.getState().loadMidiMappings();
        const midiMappings = useMidiMappingStore.getState().midiMappings;
        
        // Sincronizar mapeos: si un param tiene mapeo en localStorage pero no en midiMappings, agregarlo
        // Si un param no tiene mapeo pero existe en midiMappings, cargarlo
        params = params.map((p: Param) => {
          const existingMapping = midiMappings[p.address];
          if (existingMapping && (!p.midiMapping || p.midiMapping.channel !== existingMapping.channel || p.midiMapping.cc !== existingMapping.cc)) {
            // Hay un mapeo en midiMappings que no está en el param, actualizar
            return { ...p, midiMapping: existingMapping };
          } else if (p.midiMapping && (!existingMapping || existingMapping.channel !== p.midiMapping.channel || existingMapping.cc !== p.midiMapping.cc)) {
            // Hay un mapeo en el param que no está en midiMappings, sincronizar
            useMidiMappingStore.getState().setMidiMapping(p.address, p.midiMapping);
          }
          return p;
        });
      } catch (e) {
        // Ignorar errores si el módulo no está cargado
      }
      set({ params });
    }
    
    // Cargar macros
    const macrosRaw = localStorage.getItem(MACROS_KEY);
    if (macrosRaw) {
      let macros = JSON.parse(macrosRaw);
      // Migrar macros antiguos (sin pageId) a la primera page
      if (pages.length > 0) {
        macros = macros.map((m: Macro) => {
          if (!m.pageId) {
            return { ...m, pageId: pages[0].id };
          }
          return m;
        });
        set({ macros });
        localStorage.setItem(MACROS_KEY, JSON.stringify(macros));
      } else {
        set({ macros });
      }
    }
    
    // Renombrar pages para asegurar consistencia
    get().renamePages();
  },
})); 