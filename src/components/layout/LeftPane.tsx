import { Search, Book, Download, Loader2, BookOpen, Music, Edit2, Trash2, Plus, History, Settings, FileDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, confirm, message } from '@tauri-apps/plugin-dialog';
import { useStore, Verse } from '../../store/useStore';
import { parseBibleReference } from '../../utils/bibleParser';
import { bookTranslationMap } from '../../utils/bibleMap';

interface Bible {
  id: number;
  name: string;
  language: string | null;
}

interface Book {
  id: number;
  bible_id: number;
  name: string;
  number: number;
}

interface Song {
  id: number;
  title: string;
  alternate_title: string | null;
  category: string | null;
}

interface SongVerse {
  id: number;
  song_id: number;
  verse_order: number;
  text: string;
}



export default function LeftPane() {
  const activeTab = useStore((state) => state.activeTab);
  const setActiveTab = useStore((state) => state.setActiveTab);

  const [isImporting, setIsImporting] = useState(false);
  const [importNameModalOpen, setImportNameModalOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<string | null>(null);
  const [importBibleName, setImportBibleName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bibles, setBibles] = useState<Bible[]>([]);
  const [primaryBibleId, setPrimaryBibleId] = useState<number | null>(() => {
    const saved = localStorage.getItem('veritas_primaryBibleId');
    return saved ? parseInt(saved) : null;
  });
  const [secondaryBibleId, setSecondaryBibleId] = useState<number | null>(() => {
    const saved = localStorage.getItem('veritas_secondaryBibleId');
    return saved ? parseInt(saved) : null;
  });

  const [bibleResults, setBibleResults] = useState<Verse[]>([]);
  const [songResults, setSongResults] = useState<Song[]>([]);

  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null);
  const [chapterCount, setChapterCount] = useState<number>(0);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [verseCount, setVerseCount] = useState<number>(0);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [isManageBiblesOpen, setIsManageBiblesOpen] = useState(false);
  const [editingBibleId, setEditingBibleId] = useState<number | null>(null);
  const [editingBibleName, setEditingBibleName] = useState<string>('');

  const setActiveVerses = useStore((state) => state.setActiveVerses);

  const activeTabStore = useStore((state) => state.activeTab);
  const isBible = activeTabStore === 'bibles';
  const activeItem = useStore((state) => isBible ? state.bibleState : state.songState);
  const activeItemId = activeItem.id;
  const activeItemType = isBible ? 'bible' : 'song';

  const setActiveSlideIndex = useStore((state) => state.setActiveSlideIndex);
  const setSlideText = useStore((state) => state.setSlideText);
  const history = useStore(state => state.history);

  const bibleState = useStore((state) => state.bibleState);

  const booksContainerRef = useRef<HTMLDivElement>(null);
  const chaptersContainerRef = useRef<HTMLDivElement>(null);
  const versesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bibleState.verses.length > 0 && bibleState.slideIndex !== null) {
      const activeVerse = bibleState.verses[bibleState.slideIndex];
      if (activeVerse) {
        const book = books.find(b => b.name === activeVerse.book_name);
        if (book) {
          if (selectedBookNumber !== book.number) setSelectedBookNumber(book.number);
          if (selectedChapter !== activeVerse.chapter) setSelectedChapter(activeVerse.chapter);
          if (selectedVerse !== activeVerse.verse_num) setSelectedVerse(activeVerse.verse_num);
        }
      }
    }
  }, [bibleState.verses, bibleState.slideIndex, books]);

  useEffect(() => {
    if (activeTab === 'bibles') {
      const scrollIntoView = (containerRef: React.RefObject<HTMLDivElement | null>, selector: string) => {
        if (containerRef.current) {
          const selectedEl = containerRef.current.querySelector(selector) as HTMLElement;
          if (selectedEl) {
            const container = containerRef.current;
            const containerRect = container.getBoundingClientRect();
            const elRect = selectedEl.getBoundingClientRect();
            
            if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
              selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      };
      
      const timer = setTimeout(() => {
        scrollIntoView(booksContainerRef, '.selected-book');
        scrollIntoView(chaptersContainerRef, '.selected-chapter');
        scrollIntoView(versesContainerRef, '.selected-verse');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedBookNumber, selectedChapter, selectedVerse, activeTab, verseCount]);


  const [historyHeight, setHistoryHeight] = useState<number>(() => {
    const saved = localStorage.getItem('veritas_historyHeight');
    return saved ? parseInt(saved) : 256;
  });

  const [bibleNavHeight, setBibleNavHeight] = useState<number>(() => {
    const saved = localStorage.getItem('veritas_bibleNavHeight');
    return saved ? parseInt(saved) : 256;
  });

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = historyHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(50, Math.min(startHeight + deltaY, window.innerHeight - 200));
      setHistoryHeight(newHeight);
      localStorage.setItem('veritas_historyHeight', newHeight.toString());
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleBibleNavDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bibleNavHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY; // Dragging down increases height
      const newHeight = Math.max(100, Math.min(startHeight + deltaY, window.innerHeight - 300));
      setBibleNavHeight(newHeight);
      localStorage.setItem('veritas_bibleNavHeight', newHeight.toString());
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    invoke<Bible[]>('get_bibles')
      .then(fetchedBibles => {
        setBibles(fetchedBibles);
        if (fetchedBibles.length > 0) {
          const savedPrimary = localStorage.getItem('veritas_primaryBibleId');
          const savedSecondary = localStorage.getItem('veritas_secondaryBibleId');

          if (savedPrimary && fetchedBibles.some(b => b.id === parseInt(savedPrimary))) {
            setPrimaryBibleId(parseInt(savedPrimary));
          } else {
            setPrimaryBibleId(fetchedBibles[0].id);
          }

          if (savedSecondary && fetchedBibles.some(b => b.id === parseInt(savedSecondary))) {
            setSecondaryBibleId(parseInt(savedSecondary));
          }
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (primaryBibleId !== null) {
      localStorage.setItem('veritas_primaryBibleId', primaryBibleId.toString());
    }
  }, [primaryBibleId]);

  useEffect(() => {
    if (secondaryBibleId !== null) {
      localStorage.setItem('veritas_secondaryBibleId', secondaryBibleId.toString());
    } else {
      localStorage.removeItem('veritas_secondaryBibleId');
    }
  }, [secondaryBibleId]);

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'XML', extensions: ['xml'] }]
      });

      if (selected && typeof selected === 'string') {
        setPendingImportFile(selected);
        setImportBibleName('');
        setImportNameModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to select file');
    }
  };

  const handleConfirmImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingImportFile) return;

    setImportNameModalOpen(false);
    setIsImporting(true);

    try {
      await invoke('import_bible', { filePath: pendingImportFile, customName: importBibleName.trim() || null });
      setIsImporting(false);
      setPendingImportFile(null);
      const updatedBibles = await invoke<Bible[]>('get_bibles');
      setBibles(updatedBibles);
      if (!primaryBibleId && updatedBibles.length > 0) {
        setPrimaryBibleId(updatedBibles[0].id);
      }
      alert('Bible imported successfully!');
    } catch (err) {
      console.error(err);
      setIsImporting(false);
      setPendingImportFile(null);
      alert('Failed to import Bible');
    }
  };

  const handleDeleteBible = async (bibleId: number) => {
    const yes = await confirm('Are you sure you want to permanently delete this Bible? This action cannot be undone.', { title: 'Delete Bible', kind: 'warning' });
    if (yes) {
      try {
        await invoke('delete_bible', { bibleId });
        const updatedBibles = await invoke<Bible[]>('get_bibles');
        setBibles(updatedBibles);
        if (primaryBibleId === bibleId) {
          setPrimaryBibleId(updatedBibles.length > 0 ? updatedBibles[0].id : null);
        }
        if (secondaryBibleId === bibleId) {
          setSecondaryBibleId(null);
        }
      } catch (err) {
        console.error(err);
        await message('Failed to delete Bible', { title: 'Error', kind: 'error' });
      }
    }
  };

  const handleRenameBibleSubmit = async (bibleId: number) => {
    if (editingBibleName.trim() !== "") {
      try {
        await invoke('rename_bible', { bibleId, newName: editingBibleName.trim() });
        const updatedBibles = await invoke<Bible[]>('get_bibles');
        setBibles(updatedBibles);
        setEditingBibleId(null);
      } catch (err) {
        console.error(err);
        await message('Failed to rename Bible', { title: 'Error', kind: 'error' });
      }
    } else {
      setEditingBibleId(null);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        if (activeTab === 'bibles' && primaryBibleId) {
          const parsedRef = parseBibleReference(searchQuery);
          if (parsedRef) {
            invoke<Verse[]>('get_chapter', {
              bibleId: primaryBibleId,
              bookNumber: parsedRef.bookNumber,
              chapterNumber: parsedRef.chapter,
              secondaryBibleId
            }).then((chapterVerses) => {
              setActiveVerses(chapterVerses, 'bible', null);
              if (chapterVerses.length === 0) {
                setSearchError(`Reference not found`);
                setTimeout(() => setSearchError(null), 3000);
              } else if (parsedRef.verse !== undefined) {
                const targetIndex = chapterVerses.findIndex(v => v.verse_num === parsedRef.verse);
                if (targetIndex !== -1) {
                  setActiveSlideIndex(targetIndex);
                  setSearchError(null);
                } else {
                  setSearchError(`Verse ${parsedRef.verse} not found`);
                  setTimeout(() => setSearchError(null), 3000);
                }
              } else {
                setSearchError(null);
              }
            }).catch(console.error);
          } else {
            invoke<Verse[]>('search_verses', {
              query: searchQuery,
              primaryBibleId,
              secondaryBibleId,
              testamentFilter: null
            })
              .then(setBibleResults)
              .catch(console.error);
          }
        } else if (activeTab === 'songs') {
          invoke<Song[]>('search_songs', { query: searchQuery })
            .then(setSongResults)
            .catch(console.error);
        }
      } else {
        setBibleResults([]);
        if (activeTab === 'songs') {
          invoke<Song[]>('get_all_songs')
            .then(setSongResults)
            .catch(console.error);
        } else {
          setSongResults([]);
        }
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, activeTab, primaryBibleId, secondaryBibleId]);

  const hasInitializedDefault = useRef(false);

  useEffect(() => {
    if (primaryBibleId) {
      invoke<Book[]>('get_books', { bibleId: primaryBibleId }).then(fetchedBooks => {
        setBooks(fetchedBooks);
        if (fetchedBooks.length > 0 && useStore.getState().bibleState.verses.length === 0 && !hasInitializedDefault.current) {
          setSelectedBookNumber(1);
        } else if (!hasInitializedDefault.current) {
          setSelectedBookNumber(null);
        }
      }).catch(console.error);
    } else {
      setBooks([]);
    }
  }, [primaryBibleId]);

  useEffect(() => {
    if (primaryBibleId && selectedBookNumber) {
      invoke<number>('get_chapter_count', { bibleId: primaryBibleId, bookNumber: selectedBookNumber }).then(count => {
        setChapterCount(count);
        if (count > 0 && !hasInitializedDefault.current && selectedBookNumber === 1 && useStore.getState().bibleState.verses.length === 0) {
          setSelectedChapter(1);
        } else if (!hasInitializedDefault.current) {
          setSelectedChapter(null);
        }
        setSelectedChapter(prev => (prev !== null && prev > count) ? 1 : prev);
      }).catch(console.error);
    } else {
      setChapterCount(0);
    }
  }, [primaryBibleId, selectedBookNumber]);

  useEffect(() => {
    if (primaryBibleId && selectedBookNumber && selectedChapter) {
      invoke<number>('get_verse_count', { bibleId: primaryBibleId, bookNumber: selectedBookNumber, chapterNumber: selectedChapter }).then(count => {
        setVerseCount(count);
        if (count > 0 && !hasInitializedDefault.current && selectedBookNumber === 1 && selectedChapter === 1 && useStore.getState().bibleState.verses.length === 0) {
          hasInitializedDefault.current = true;
          setTimeout(() => handleManualJump(1), 50);
        } else {
          setSelectedVerse(prev => (prev !== null && prev > count) ? 1 : prev);
        }
      }).catch(console.error);
    } else {
      setVerseCount(0);
    }
  }, [primaryBibleId, selectedBookNumber, selectedChapter]);

  // Refresh current chapter immediately when bible versions change
  useEffect(() => {
    if (primaryBibleId && selectedBookNumber && selectedChapter && hasInitializedDefault.current) {
      invoke<Verse[]>('get_chapter', {
        bibleId: primaryBibleId,
        bookNumber: selectedBookNumber,
        chapterNumber: selectedChapter,
        secondaryBibleId
      }).then(chapterVerses => {
        setActiveVerses(chapterVerses, 'bible', null);

        const store = useStore.getState();
        if (store.bibleState.slideIndex !== null && store.contentType === 'bible' && selectedVerse !== null) {
          const targetIndex = chapterVerses.findIndex(v => v.verse_num === selectedVerse);
          if (targetIndex !== -1) {
            const v = chapterVerses[targetIndex];
            const cleanText = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '');
            const englishBook = v.book_name;
            const hindiBook = bookTranslationMap[englishBook] || englishBook;
            const title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
            const primaryText = cleanText(v.text);
            const secondaryText = v.secondary_text ? cleanText(v.secondary_text) : undefined;
            setSlideText(primaryText, secondaryText, title, 'bible');
          }
        }
      }).catch(console.error);
    }
  }, [primaryBibleId, secondaryBibleId]);

  const handleManualJump = async (verseNum: number) => {
    setSelectedVerse(verseNum);
    if (primaryBibleId && selectedBookNumber && selectedChapter) {
      try {
        const chapterVerses = await invoke<Verse[]>('get_chapter', {
          bibleId: primaryBibleId,
          bookNumber: selectedBookNumber,
          chapterNumber: selectedChapter,
          secondaryBibleId
        });
        setActiveVerses(chapterVerses, 'bible', null);

        const cleanText = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '');

        const targetIndex = chapterVerses.findIndex(v => v.verse_num === verseNum);
        if (targetIndex !== -1) {
          const v = chapterVerses[targetIndex];
          setActiveSlideIndex(targetIndex);
          const englishBook = v.book_name;
          const hindiBook = bookTranslationMap[englishBook] || englishBook;
          const title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
          const primaryText = cleanText(v.text);
          const secondaryText = v.secondary_text ? cleanText(v.secondary_text) : undefined;
          setSlideText(primaryText, secondaryText, title, 'bible');
        }
      } catch (err) {
        console.error("Failed to jump to manual verse", err);
      }
    }
  };

  const handleVerseClick = async (verse: Verse) => {
    if (!primaryBibleId) return;
    try {
      const books = await invoke<any[]>('get_books', { bibleId: primaryBibleId });
      const book = books.find((b: any) => b.id === verse.book_id);
      const bookNumber = book ? book.number : 1;

      const chapterVerses = await invoke<Verse[]>('get_chapter', {
        bibleId: primaryBibleId,
        bookNumber: bookNumber,
        chapterNumber: verse.chapter,
        secondaryBibleId: secondaryBibleId
      });

      setActiveVerses(chapterVerses, 'bible', null);

      const cleanText = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '');
      const targetIndex = chapterVerses.findIndex(v => v.verse_num == verse.verse_num);
      const finalIndex = Math.max(0, targetIndex);

      setActiveSlideIndex(finalIndex);

      if (chapterVerses[finalIndex]) {
        const v = chapterVerses[finalIndex];
        const englishBook = v.book_name;
        const hindiBook = bookTranslationMap[englishBook] || englishBook;
        const title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
        const primaryText = cleanText(v.text);
        const secondaryText = v.secondary_text ? cleanText(v.secondary_text) : undefined;
        setSlideText(primaryText, secondaryText, title, 'bible');
      }
    } catch (err) {
      console.error("Failed to load chapter for verse click", err);
    }
  };

  const handleSongClick = async (song: Song, autoProject: boolean = false) => {
    try {
      const lyrics = await invoke<SongVerse[]>('get_song_lyrics', { songId: song.id });
      const mappedVerses: Verse[] = lyrics.map(l => ({
        id: l.id,
        book_id: l.song_id,
        book_name: song.title,
        chapter: 1,
        verse_num: l.verse_order,
        text: l.text,
        secondary_text: undefined
      }));
      setActiveVerses(mappedVerses, 'song', song.id, song.title);
      if (autoProject && mappedVerses.length > 0) {
        setActiveSlideIndex(0);
        setSlideText(mappedVerses[0].text.replace(/^\[.*?\]\s*\n/, ''), undefined, song.title, 'song');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchQuery.trim().length === 0) return;

      if (activeTab === 'bibles' && primaryBibleId) {
        const parsedRef = parseBibleReference(searchQuery);
        if (parsedRef) {
          try {
            const chapterVerses = await invoke<Verse[]>('get_chapter', {
              bibleId: primaryBibleId,
              bookNumber: parsedRef.bookNumber,
              chapterNumber: parsedRef.chapter,
              secondaryBibleId
            });
            setActiveVerses(chapterVerses, 'bible', null);
            const targetIndex = parsedRef.verse !== undefined
              ? Math.max(0, chapterVerses.findIndex(v => v.verse_num === parsedRef.verse))
              : 0;

            const cleanText = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '');

            if (chapterVerses[targetIndex]) {
              const v = chapterVerses[targetIndex];
              setActiveSlideIndex(targetIndex);
              const englishBook = v.book_name;
              const hindiBook = bookTranslationMap[englishBook] || englishBook;
              const title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
              const primaryText = cleanText(v.text);
              const secondaryText = v.secondary_text ? cleanText(v.secondary_text) : undefined;
              setSlideText(primaryText, secondaryText, title, 'bible');
            }
          } catch (err) {
            console.error(err);
          }
        } else {
          try {
            const results = await invoke<Verse[]>('search_verses', {
              query: searchQuery,
              primaryBibleId,
              secondaryBibleId,

            });
            setBibleResults(results);
            if (results.length > 0) {
              const v = results[0];
              setActiveVerses([v], 'bible', null);
              setActiveSlideIndex(0);
              const cleanText = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '');
              const englishBook = v.book_name;
              const hindiBook = bookTranslationMap[englishBook] || englishBook;
              const title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
              const primaryText = cleanText(v.text);
              const secondaryText = v.secondary_text ? cleanText(v.secondary_text) : undefined;
              setSlideText(primaryText, secondaryText, title, 'bible');
            }
          } catch (err) {
            console.error(err);
          }
        }
      } else if (activeTab === 'songs') {
        try {
          const results = await invoke<Song[]>('search_songs', { query: searchQuery });
          setSongResults(results);
          if (results.length > 0) {
            handleSongClick(results[0], true);
          }
        } catch (err) {
          console.error(err);
        }
      }
    }
  };

  const [isSongModalOpen, setIsSongModalOpen] = useState(false);
  const [songTitle, setSongTitle] = useState('');
  const [songSections, setSongSections] = useState<{ id: string, label: string, text: string }[]>([
    { id: 'initial', label: 'Verse 1', text: '' }
  ]);
  const [isRawTextMode, setIsRawTextMode] = useState(false);
  const [rawSongText, setRawSongText] = useState('');
  const [isSavingSong, setIsSavingSong] = useState(false);
  const [editingSongId, setEditingSongId] = useState<number | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('song-updated', () => {
      if (searchQuery.trim().length > 0) {
        invoke<Song[]>('search_songs', { query: searchQuery })
          .then(setSongResults)
          .catch(console.error);
      } else {
        invoke<Song[]>('get_all_songs')
          .then(setSongResults)
          .catch(console.error);
      }
    }).then(u => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [searchQuery]);

  // Sync state between modes when toggling
  useEffect(() => {
    if (isRawTextMode) {
      const compiled = songSections
        .filter(s => s.text.trim())
        .map(s => `[${s.label}]\n${s.text.trim()}`)
        .join('\n\n');
      setRawSongText(compiled);
    } else {
      if (!rawSongText.trim()) {
        setSongSections([{ id: 'initial', label: 'Verse 1', text: '' }]);
        return;
      }

      const blocks = rawSongText.split(/\n\s*\n/);
      const newSections = blocks.map((block, i) => {
        let label = `Verse ${i + 1}`;
        let text = block.trim();
        const match = text.match(/^\[(.*?)\]\s*\n/);
        if (match) {
          label = match[1];
          text = text.replace(/^\[.*?\]\s*\n/, '').trim();
        } else {
          const firstLineMatch = text.match(/^([^\n]{1,30})\n/);
          if (firstLineMatch) {
            const potentialLabel = firstLineMatch[1].trim();
            const isKnownLabel = ["Verse", "Chorus", "Bridge", "Pre-Chorus", "Intro", "Outro", "Tag"].some(k => potentialLabel.startsWith(k));
            if (isKnownLabel) {
              label = potentialLabel;
              text = text.replace(/^[^\n]+\n/, '').trim();
            }
          }
        }
        return { id: String(Date.now() + i + Math.random()), label, text };
      });
      setSongSections(newSections.length > 0 ? newSections : [{ id: 'initial', label: 'Verse 1', text: '' }]);
    }
  }, [isRawTextMode]);

  const [isImportingXML, setIsImportingXML] = useState(false);

  const handleImportSongsXML = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{
          name: 'XML',
          extensions: ['xml']
        }]
      });

      if (selectedPath && typeof selectedPath === 'string') {
        setIsImportingXML(true);
        const res = await invoke<string>('import_songs_xml', { filePath: selectedPath });
        setIsImportingXML(false);
        await message(res, { title: 'Import Successful', kind: 'info' });
        const results = await invoke<Song[]>('search_songs', { query: '' });
        setSongResults(results);
      }
    } catch (err: any) {
      setIsImportingXML(false);
      console.error(err);
      await message(err.toString(), { title: 'Import Failed', kind: 'error' });
    }
  };

  const handleSaveSong = async () => {
    let compiledText = '';
    if (isRawTextMode) {
      compiledText = rawSongText.trim();
      // Ensure it has bracketed labels if they just pasted plain paragraphs
      if (compiledText && !compiledText.includes('[')) {
        const blocks = compiledText.split(/\n\s*\n/);
        compiledText = blocks.map((block, i) => {
          let text = block.trim();
          const firstLineMatch = text.match(/^([^\n]{1,30})\n/);
          let hasLabel = false;
          if (firstLineMatch) {
            const potentialLabel = firstLineMatch[1].trim();
            const isKnownLabel = ["Verse", "Chorus", "Bridge", "Pre-Chorus", "Intro", "Outro", "Tag"].some(k => potentialLabel.startsWith(k));
            if (isKnownLabel) {
              text = text.replace(/^[^\n]+\n/, '').trim();
              text = `[${potentialLabel}]\n${text}`;
              hasLabel = true;
            }
          }
          if (!hasLabel) {
            text = `[Verse ${i + 1}]\n${text}`;
          }
          return text;
        }).join('\n\n');
      }
    } else {
      compiledText = songSections
        .filter(s => s.text.trim())
        .map(s => `[${s.label}]\n${s.text.trim()}`)
        .join('\n\n');
    }

    if (!songTitle.trim() || !compiledText.trim()) {
      await message("Title and Lyrics are required.", { title: 'Required', kind: 'warning' });
      return;
    }

    try {
      setIsSavingSong(true);
      if (editingSongId !== null) {
        await invoke('update_song', { songId: editingSongId, title: songTitle, text: compiledText });
      } else {
        await invoke('import_custom_song', { title: songTitle, text: compiledText });
      }
      setIsSavingSong(false);
      setIsSongModalOpen(false);
      setSongTitle('');
      setSongSections([{ id: 'initial', label: 'Verse 1', text: '' }]);
      setRawSongText('');
      setIsRawTextMode(false);
      setEditingSongId(null);
      await message(editingSongId !== null ? "Song updated successfully!" : "Song imported successfully!", { title: 'Success', kind: 'info' });
      setSearchQuery(songTitle);
    } catch (err) {
      console.error(err);
      setIsSavingSong(false);
      await message(editingSongId !== null ? "Failed to update song" : "Failed to import song", { title: 'Error', kind: 'error' });
    }
  };



  const handleDeleteSong = async (song: Song, e: React.MouseEvent) => {
    e.stopPropagation();

    const yes = await confirm(`Are you sure you want to delete "${song.title}"?`, { title: 'Delete Song', kind: 'warning' });
    if (!yes) return;

    try {
      await invoke('delete_song', { songId: song.id });
      setSongResults(prev => prev.filter(s => s.id !== song.id));
      if (activeItemId === song.id && activeItemType === 'song') {
        setActiveVerses([], 'bible', null);
        setSlideText('', undefined, '');
      }
    } catch (err) {
      console.error(err);
      await message("Failed to delete song.", { title: 'Error', kind: 'error' });
    }
  };

  return (
    <div className="w-80 h-full bg-secondary border-r border-border flex flex-col shadow-lg shadow-black/10 z-10 relative">
      <div className="p-4 border-b border-border bg-background/50 backdrop-blur-md flex justify-between items-center shrink-0">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <img src="/logo.svg" alt="Veritas Logo" className="w-6 h-6" />
          Veritas
        </h2>
        {activeTab === 'bibles' ? (
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="text-muted-foreground hover:text-blue-400 transition-colors p-1"
            title="Import Zefania XML"
          >
            {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          </button>
        ) : activeTab === 'songs' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportSongsXML}
              disabled={isImportingXML}
              className="text-muted-foreground hover:text-blue-400 transition-colors p-1"
              title="Import Veritas Songs XML"
            >
              {isImportingXML ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
            </button>
            <button
              onClick={() => {
                setSongTitle('');
                setSongSections([{ id: 'initial', label: 'Verse 1', text: '' }]);
                setEditingSongId(null);
                setIsSongModalOpen(true);
              }}
              className="text-muted-foreground hover:text-rose-400 transition-colors p-1 text-xs font-semibold flex items-center gap-1"
              title="Add Custom Song"
            >
              + ADD
            </button>
          </div>
        ) : null}
      </div>

      {importNameModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <form onSubmit={handleConfirmImport} className="bg-card border border-border/50 rounded-xl shadow-2xl w-full max-w-sm flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border/50 flex justify-between items-center">
              <span className="font-semibold text-lg">Name this Bible</span>
              <button type="button" onClick={() => { setImportNameModalOpen(false); setPendingImportFile(null); }} className="text-muted-foreground hover:text-white">&times;</button>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium mb-2">Custom Name (Optional)</label>
              <input
                type="text"
                value={importBibleName}
                onChange={e => setImportBibleName(e.target.value)}
                placeholder="Leave blank to use default name"
                className="w-full bg-background border border-border rounded p-2 text-sm text-foreground focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button type="button" onClick={() => { setImportNameModalOpen(false); setPendingImportFile(null); }} className="px-3 py-1.5 rounded text-sm bg-background border border-border hover:bg-white/5">Cancel</button>
              <button type="submit" className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">Import</button>
            </div>
          </form>
        </div>
      )}

      {isSongModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border/50 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90%] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border/50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-lg">{editingSongId !== null ? 'Edit Song' : 'Add Song'}</span>
                <div className="flex bg-secondary/50 rounded-lg p-1 border border-border">
                  <button
                    onClick={() => setIsRawTextMode(false)}
                    className={clsx("px-3 py-1 rounded text-xs font-medium transition-colors", !isRawTextMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    Blocks
                  </button>
                  <button
                    onClick={() => setIsRawTextMode(true)}
                    className={clsx("px-3 py-1 rounded text-xs font-medium transition-colors", isRawTextMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    Smart Paste
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSongModalOpen(false);
                  setEditingSongId(null);
                  setSongTitle('');
                  setSongSections([{ id: 'initial', label: 'Verse 1', text: '' }]);
                }}
                className="text-muted-foreground hover:text-white"
              >
                &times;
              </button>
            </div>
            <div className="p-4 border-b border-border bg-background/30 shrink-0">
              <input
                type="text"
                placeholder="Song Title"
                value={songTitle}
                onChange={e => setSongTitle(e.target.value)}
                className="w-full bg-background border border-border rounded p-3 text-lg text-foreground focus:outline-none focus:border-blue-500 font-bold placeholder:font-normal placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4 flex flex-col bg-background/50">
              {isRawTextMode ? (
                <div className="flex-1 flex flex-col min-h-[300px]">
                  <p className="text-xs text-muted-foreground mb-2">
                    Paste your entire song here. Separate sections with a blank line. If a section starts with a label like <code className="text-blue-400 bg-blue-400/10 px-1 rounded">Verse 1</code> or <code className="text-blue-400 bg-blue-400/10 px-1 rounded">[Chorus]</code>, it will be automatically detected!
                  </p>
                  <textarea
                    placeholder="[Verse 1]&#10;Amazing grace how sweet the sound...&#10;&#10;[Chorus]&#10;I once was lost but now am found..."
                    value={rawSongText}
                    onChange={e => setRawSongText(e.target.value)}
                    className="flex-1 w-full bg-background border border-border rounded p-4 text-sm text-foreground focus:outline-none focus:border-blue-500 font-mono resize-none leading-relaxed"
                  ></textarea>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {songSections.map((section, index) => (
                      <div key={section.id} className="bg-secondary/30 border border-border rounded-lg p-3 space-y-3 relative group shadow-sm transition-colors hover:bg-secondary/50">
                        <div className="flex gap-2 items-center">
                          <select
                            value={section.label}
                            onChange={e => {
                              const newSections = [...songSections];
                              newSections[index].label = e.target.value;
                              setSongSections(newSections);
                            }}
                            className="bg-background border border-border rounded px-3 py-1.5 text-sm font-semibold text-foreground focus:outline-none focus:border-blue-500 max-w-[200px]"
                          >
                            <option value="Verse 1">Verse 1</option>
                            <option value="Verse 2">Verse 2</option>
                            <option value="Verse 3">Verse 3</option>
                            <option value="Verse 4">Verse 4</option>
                            <option value="Verse 5">Verse 5</option>
                            <option value="Chorus">Chorus</option>
                            <option value="Chorus 1">Chorus 1</option>
                            <option value="Chorus 2">Chorus 2</option>
                            <option value="Pre-Chorus">Pre-Chorus</option>
                            <option value="Bridge">Bridge</option>
                            <option value="Intro">Intro</option>
                            <option value="Outro">Outro</option>
                            <option value="Tag">Tag</option>
                            {!["Verse 1", "Verse 2", "Verse 3", "Verse 4", "Verse 5", "Chorus", "Chorus 1", "Chorus 2", "Pre-Chorus", "Bridge", "Intro", "Outro", "Tag"].includes(section.label) && (
                              <option value={section.label}>{section.label} (Custom)</option>
                            )}
                          </select>

                          <div className="flex-1"></div>

                          <button
                            onClick={() => {
                              if (songSections.length > 1) {
                                setSongSections(songSections.filter(s => s.id !== section.id));
                              }
                            }}
                            disabled={songSections.length === 1}
                            className="text-muted-foreground hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:bg-transparent transition-colors"
                            title="Delete Section"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <textarea
                          placeholder="Enter lyrics for this section..."
                          value={section.text}
                          onChange={e => {
                            const newSections = [...songSections];
                            newSections[index].text = e.target.value;
                            setSongSections(newSections);
                          }}
                          className="w-full bg-background border border-border rounded p-3 text-sm text-foreground focus:outline-none focus:border-blue-500 min-h-[100px] resize-y leading-relaxed"
                        ></textarea>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const nextId = String(Date.now() + Math.random());
                      let nextLabel = "Verse 1";
                      const lastLabel = songSections[songSections.length - 1]?.label;
                      if (lastLabel === "Verse 1") nextLabel = "Chorus";
                      else if (lastLabel === "Chorus") nextLabel = "Verse 2";
                      else if (lastLabel === "Verse 2") nextLabel = "Verse 3";

                      setSongSections([...songSections, { id: nextId, label: nextLabel, text: '' }]);
                    }}
                    className="w-full py-3 border border-dashed border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    <Plus size={18} /> Add Another Section
                  </button>
                </>
              )}
            </div>
            <div className="p-3 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setIsSongModalOpen(false)}
                className="px-3 py-1.5 rounded text-sm bg-background border border-border hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSong}
                disabled={isSavingSong}
                className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                {isSavingSong ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Song
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex p-2 gap-1 border-b border-border bg-background/30 overflow-x-auto shrink-0">
        <TabButton icon={<Book size={16} />} label="Bibles" isActive={activeTab === 'bibles'} onClick={() => setActiveTab('bibles')} />
        <TabButton icon={<Music size={16} />} label="Songs" isActive={activeTab === 'songs'} onClick={() => setActiveTab('songs')} />
      </div>

      {/* Dual Language Selectors (Only in Bibles Tab) */}
      {activeTab === 'bibles' && (
        <div className="p-3 border-b border-border bg-background/20 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">Primary</span>
            <div className="flex-1 min-w-0">
              <select
                className="w-full bg-background border border-border rounded p-1 text-xs text-foreground focus:outline-none focus:border-blue-500 text-ellipsis"
                value={primaryBibleId || ''}
                onChange={(e) => setPrimaryBibleId(Number(e.target.value))}
              >
                {bibles.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
                {bibles.length === 0 && <option value="">No Bibles found</option>}
              </select>
            </div>
            <button
              onClick={() => setIsManageBiblesOpen(true)}
              className="text-muted-foreground hover:text-blue-600 p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
              title="Manage Bibles"
            >
              <Settings size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-16 shrink-0">Secondary</span>
            <div className="flex-1 min-w-0">
              <select
                className="w-full bg-background border border-border rounded p-1 text-xs text-foreground focus:outline-none focus:border-blue-500 text-ellipsis"
                value={secondaryBibleId || ''}
                onChange={(e) => setSecondaryBibleId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">None</option>
                {bibles.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="w-[22px] flex-shrink-0"></div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-4 border-b border-border space-y-2 shrink-0">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${activeTab}...`}
            className="w-full bg-background border border-border rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Manual Bible Navigation */}
      {activeTab === 'bibles' && (
        <>
          <div
            className="border-b border-border bg-background/30 flex shrink-0"
            style={{ height: bibleNavHeight }}
          >
            {/* Books */}
            <div ref={booksContainerRef} className="flex-[3] border-r border-border overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent py-1">
              {books.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBookNumber(b.number)}
                  className={clsx(
                    "w-full text-left px-3 py-1.5 text-[11px] transition-colors truncate",
                    selectedBookNumber === b.number
                      ? "selected-book bg-blue-500/10 text-blue-400 font-bold border-r-2 border-blue-500"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
            {/* Chapters */}
            <div ref={chaptersContainerRef} className="flex-[2] border-r border-border overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent py-1">
              {Array.from({ length: chapterCount }, (_, i) => i + 1).map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedChapter(c)}
                  className={clsx(
                    "w-full text-left px-3 py-1.5 text-[11px] transition-colors",
                    selectedChapter === c
                      ? "selected-chapter bg-blue-500/10 text-blue-400 font-bold border-r-2 border-blue-500"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  Ch {c}
                </button>
              ))}
              {chapterCount === 0 && <div className="p-3 text-[11px] text-muted-foreground/50 text-center">Chapter</div>}
            </div>
            {/* Verses */}
            <div ref={versesContainerRef} className="flex-[2] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent py-1">
              {Array.from({ length: verseCount }, (_, i) => i + 1).map(v => (
                <button
                  key={v}
                  onClick={() => handleManualJump(v)}
                  className={clsx(
                    "w-full text-left px-3 py-1.5 text-[11px] transition-colors",
                    selectedVerse === v
                      ? "selected-verse bg-blue-500/10 text-blue-400 font-bold border-r-2 border-blue-500"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {v}
                </button>
              ))}
              {verseCount === 0 && <div className="p-3 text-[11px] text-muted-foreground/50 text-center">Verse</div>}
            </div>
          </div>
          {/* Bible Nav Resize Handle */}
          <div
            className="h-1 w-full cursor-row-resize bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors z-20 shrink-0"
            onMouseDown={handleBibleNavDragStart}
          />
        </>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent border-b border-border">
        {isImporting && (
          <div className="p-6 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
            <p className="text-sm font-medium">Importing Bible Database...</p>
          </div>
        )}

        {/* Bible Results */}
        {!isImporting && activeTab === 'bibles' && bibleResults.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Bible Results</h3>
            {bibleResults.map((verse) => (
              <div
                key={verse.id}
                onClick={() => handleVerseClick(verse)}
                className="p-3 rounded-md hover:bg-background/80 cursor-pointer transition-colors border border-transparent hover:border-border group flex items-start gap-3"
              >
                <div className="mt-0.5 bg-blue-500/10 p-1.5 rounded text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <BookOpen size={14} />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground group-hover:text-blue-400 transition-colors">
                    Ch {verse.chapter} : V {verse.verse_num}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {verse.text}
                  </p>
                  {verse.secondary_text && (
                    <p className="text-xs text-blue-400/80 line-clamp-1 mt-1 border-l-2 border-blue-500/30 pl-2">
                      {verse.secondary_text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Song Results */}
        {!isImporting && activeTab === 'songs' && songResults.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Songs</h3>
            {songResults.map((song) => (
              <div
                key={song.id}
                onClick={() => handleSongClick(song)}
                className="p-3 rounded-md hover:bg-background/80 cursor-pointer transition-colors border border-transparent hover:border-border group flex items-start gap-3 relative"
              >
                <div className="mt-0.5 bg-rose-500/10 p-1.5 rounded text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                  <Music size={14} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-foreground group-hover:text-rose-400 transition-colors">
                    {song.title}
                  </h4>
                  {song.category && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {song.category}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-0.5">
                  <button
                    onClick={(e) => handleDeleteSong(song, e)}
                    className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    title="Delete Song"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Toast */}
      {searchError && (
        <div className="absolute bottom-4 left-16 right-4 z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md text-sm shadow-lg border border-destructive">
            {searchError}
          </div>
        </div>
      )}

      {activeTab === 'bibles' && (
        <>
          {/* Resize Handle */}
          <div
            className="h-1 w-full cursor-row-resize bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors z-20 shrink-0"
            onMouseDown={handleDragStart}
          />

          {/* Persistent History Panel */}
          <div
            className="shrink-0 bg-card flex flex-col min-h-0"
            style={{ height: historyHeight }}
          >
            <div className="p-2 border-b border-border bg-secondary flex justify-between items-center shrink-0">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <History size={12} /> Recent History
              </span>
              {history.length > 0 && (
                <button onClick={() => useStore.getState().clearHistory()} className="text-[10px] text-muted-foreground hover:text-rose-400">Clear</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-1 space-y-1">
              {history.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center flex-1 flex items-center justify-center h-full">No history yet</div>
              ) : (
                history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSlideText(item.text, item.subtext, item.reference)}
                    className="w-full text-left p-2 rounded hover:bg-secondary transition-colors flex flex-col gap-1 border border-transparent hover:border-border"
                  >
                    <span className="text-xs font-semibold text-blue-400">{item.reference}</span>
                    <span className="text-xs text-foreground truncate">{item.text}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Manage Bibles Modal */}
      {isManageBiblesOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border/50 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border/50 flex justify-between items-center">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Settings size={18} className="text-blue-400" /> Manage Bibles
              </h2>
              <button
                onClick={() => setIsManageBiblesOpen(false)}
                className="text-muted-foreground hover:text-white transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="p-2 flex-1 overflow-y-auto">
              {bibles.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No Bibles imported.</div>
              ) : (
                <div className="space-y-1">
                  {bibles.map(bible => (
                    <div key={bible.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 border border-transparent hover:border-border transition-colors group">
                      {editingBibleId === bible.id ? (
                        <div className="flex items-center flex-1 mr-4 gap-2">
                          <input
                            type="text"
                            className="w-full bg-background border border-blue-500 rounded p-1 text-sm text-foreground focus:outline-none"
                            value={editingBibleName}
                            onChange={(e) => setEditingBibleName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameBibleSubmit(bible.id);
                              if (e.key === 'Escape') setEditingBibleId(null);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameBibleSubmit(bible.id)}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors whitespace-nowrap"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-sm text-foreground">{bible.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Language: {bible.language || 'Unknown'}</div>
                        </div>
                      )}

                      {!editingBibleId && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingBibleId(bible.id);
                              setEditingBibleName(bible.name);
                            }}
                            className="p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Rename Bible"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteBible(bible.id)}
                            className="p-2 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete Bible"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-md text-xs font-medium transition-all duration-200",
        isActive
          ? "bg-blue-600 shadow-sm text-white scale-100"
          : "text-muted-foreground hover:bg-background/50 hover:text-foreground scale-95 hover:scale-100"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
