import { create } from 'zustand';
import { bookTranslationMap } from '../utils/bibleMap';

const cleanText = (t: string) => t.replace(/^\[.*?\]\s*\n/, '').replace(/\s*\([^)]*\)\s*$/, '');

export interface Verse {
  id: number;
  book_id: number;
  book_name: string;
  secondary_book_name?: string;
  chapter: number;
  verse_num: number;
  text: string;
  secondary_text?: string;
}

export interface HistoryItem {
  id: string;
  reference: string;
  text: string;
  subtext?: string;
  timestamp: number;
}


export interface ThemeConfig {
  bgType: 'color' | 'image' | 'video';
  bgValue: string;
  mainFontFamily: string;
  subFontFamily: string;
  mainFontSize: number;
  subFontSize: number;
  fontColor: string;
  textShadow: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  bgBlur: number;
  bgDim: number;
  fontWeight: number;
  padding: number;
  margin: number;
  translationSpacing: number;
  smoothTransitions?: boolean;
  lineHeight?: number;
}

export interface SlideState {
  title?: string;
  text: string;
  subtext?: string;
  contentType?: 'bible' | 'song';
  isBlackout: boolean;
  theme: ThemeConfig;
  playlist?: Verse[];
  slideIndex?: number | null;
}

export interface ItemState {
  verses: Verse[];
  slideIndex: number | null;
  id: number | null;
  title: string;
}

interface StoreState extends SlideState {
  activeTab: 'bibles' | 'songs' | 'history' | 'import';
  setActiveTab: (tab: 'bibles' | 'songs' | 'history' | 'import') => void;

  bibleState: ItemState;
  songState: ItemState;

  setSlideText: (text: string, subtext?: string, title?: string, contentType?: 'bible' | 'song') => void;
  toggleBlackout: () => void;
  setTheme: (theme: Partial<ThemeConfig>) => void;
  setActiveVerses: (verses: Verse[], type?: 'bible' | 'song', id?: number | null, title?: string) => void;
  setActiveSlideIndex: (index: number | null) => void;
  setStateFromEvent: (payload: Partial<StoreState>) => void;
  goToNextSlide: () => void;
  goToPrevSlide: () => void;
  history: HistoryItem[];
  clearHistory: () => void;
}

const defaultTheme: ThemeConfig = {
  bgType: 'color',
  bgValue: '#000000',
  mainFontFamily: 'serif',
  subFontFamily: 'serif',
  mainFontSize: 90,
  subFontSize: 60,
  fontColor: '#ffffff',
  textShadow: '0 4px 12px rgba(0,0,0,0.8)',
  textAlign: 'center',
  bgBlur: 2,
  bgDim: 40,
  fontWeight: 800,
  padding: 0,
  margin: 0,
  translationSpacing: 0,
  lineHeight: 1.2
};

const getSavedTheme = (): ThemeConfig => {
  const saved = localStorage.getItem('veritas_theme');
  if (saved) {
    try {
      return { ...defaultTheme, ...JSON.parse(saved) };
    } catch (e) {
      console.error("Failed to parse saved theme", e);
    }
  }
  return defaultTheme;
};

export const useStore = create<StoreState>((set) => ({
  text: '',
  subtext: '',
  isBlackout: false,
  theme: getSavedTheme(),
  activeTab: 'bibles',
  setActiveTab: (tab) => set({ activeTab: tab }),

  bibleState: {
    verses: [],
    slideIndex: 0,
    id: null,
    title: ''
  },
  songState: {
    verses: [],
    slideIndex: 0,
    id: null,
    title: ''
  },

  history: [],
  clearHistory: () => set({ history: [] }),

  setSlideText: (text, subtext, title, contentType) => set((state) => {
    let newHistory = state.history;
    if (title && text) {
      const isDuplicate = newHistory.length > 0 && newHistory[0].reference === title && newHistory[0].text === text && newHistory[0].subtext === subtext;
      if (!isDuplicate) {
        let historyToKeep = newHistory;
        const matchingItems = newHistory.filter(h => h.reference === title && h.text === text && h.subtext === subtext);
        
        // If it already appears 3 or more times, remove the oldest occurrences so we only keep the 2 most recent ones (making room for the new 3rd one)
        if (matchingItems.length >= 3) {
          const idsToKeep = matchingItems.slice(0, 2).map(h => h.id);
          historyToKeep = newHistory.filter(h => {
            const isMatch = h.reference === title && h.text === text && h.subtext === subtext;
            return !isMatch || idsToKeep.includes(h.id);
          });
        }

        newHistory = [{
          id: Math.random().toString(36).substring(7),
          reference: title,
          text: text,
          subtext: subtext,
          timestamp: Date.now()
        }, ...historyToKeep].slice(0, 50);
      }
    }
    return {
      text,
      subtext,
      title,
      contentType,
      isBlackout: false,
      history: newHistory
    };
  }),

  toggleBlackout: () => set((state) => ({ isBlackout: !state.isBlackout })),

  setTheme: (newTheme) => set((state) => {
    const updatedTheme = { ...state.theme, ...newTheme };
    localStorage.setItem('veritas_theme', JSON.stringify(updatedTheme));
    return { theme: updatedTheme };
  }),

  setActiveVerses: (verses, type = 'bible', id = null, title = '') => set(() => {
    if (type === 'bible') {
      return { bibleState: { verses, slideIndex: 0, id, title } };
    } else {
      return { songState: { verses, slideIndex: 0, id, title } };
    }
  }),

  setActiveSlideIndex: (index) => set((state) => {
    if (state.activeTab === 'bibles') {
      return { bibleState: { ...state.bibleState, slideIndex: index } };
    } else if (state.activeTab === 'songs') {
      return { songState: { ...state.songState, slideIndex: index } };
    }
    return state;
  }),

  setStateFromEvent: (payload) => set({
    title: payload.title,
    text: payload.text,
    subtext: payload.subtext,
    contentType: payload.contentType,
    isBlackout: payload.isBlackout,
    theme: payload.theme,
  }),

  goToNextSlide: () => set((state) => {
    const isBible = state.activeTab === 'bibles';
    const activeItem = isBible ? state.bibleState : state.songState;
    
    if (activeItem.verses.length === 0 || activeItem.slideIndex === null) return state;
    
    const nextIndex = activeItem.slideIndex + 1;
    if (nextIndex < activeItem.verses.length) {
      const v = activeItem.verses[nextIndex];
      let title = activeItem.title;
      
      if (isBible) {
        const englishBook = v.book_name;
        const hindiBook = bookTranslationMap[englishBook] || englishBook;
        title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
      }

      const newState: Partial<StoreState> = {
        text: cleanText(v.text),
        subtext: v.secondary_text ? cleanText(v.secondary_text) : undefined,
        title: title,
        contentType: isBible ? 'bible' : 'song',
        isBlackout: false
      };

      if (isBible) {
        newState.bibleState = { ...state.bibleState, slideIndex: nextIndex };
      } else {
        newState.songState = { ...state.songState, slideIndex: nextIndex };
      }

      return newState;
    }
    return state;
  }),

  goToPrevSlide: () => set((state) => {
    const isBible = state.activeTab === 'bibles';
    const activeItem = isBible ? state.bibleState : state.songState;

    if (activeItem.verses.length === 0 || activeItem.slideIndex === null) return state;
    
    const prevIndex = activeItem.slideIndex - 1;
    if (prevIndex >= 0) {
      const v = activeItem.verses[prevIndex];
      let title = activeItem.title;
      
      if (isBible) {
        const englishBook = v.book_name;
        const hindiBook = bookTranslationMap[englishBook] || englishBook;
        title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
      }

      const newState: Partial<StoreState> = {
        text: cleanText(v.text),
        subtext: v.secondary_text ? cleanText(v.secondary_text) : undefined,
        title: title,
        contentType: isBible ? 'bible' : 'song',
        isBlackout: false
      };

      if (isBible) {
        newState.bibleState = { ...state.bibleState, slideIndex: prevIndex };
      } else {
        newState.songState = { ...state.songState, slideIndex: prevIndex };
      }

      return newState;
    }
    return state;
  }),

}));
