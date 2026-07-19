import { clsx } from 'clsx';
import { Book, Edit, Trash2, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { bookTranslationMap } from '../../utils/bibleMap';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import { emit } from '@tauri-apps/api/event';
import { parseBibleReference } from '../../utils/bibleParser';
import { useStore, Verse } from '../../store/useStore';

export default function CenterPane() {
  const activeTab = useStore((state) => state.activeTab);
  const isBible = activeTab === 'bibles';

  const activeItem = useStore((state) => isBible ? state.bibleState : state.songState);
  const activeSlideIndex = activeItem.slideIndex;
  const activeVerses = activeItem.verses;
  const activeItemId = activeItem.id;
  const activeItemTitle = activeItem.title;
  const activeItemType = isBible ? 'bible' : 'song';

  const setActiveSlideIndex = useStore((state) => state.setActiveSlideIndex);
  const setSlideText = useStore((state) => state.setSlideText);

  const activeItemRef = useRef<HTMLDivElement>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isRawTextMode, setIsRawTextMode] = useState(false);
  const [rawSongText, setRawSongText] = useState('');
  const [editSections, setEditSections] = useState<{ id: string, label: string, text: string }[]>([
    { id: 'initial', label: 'Verse 1', text: '' }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const handleDeleteSong = async () => {
    if (!activeItemId) return;

    const yes = await confirm("Are you sure you want to delete this song?", { title: 'Delete Song', kind: 'warning' });
    if (yes) {
      try {
        await invoke('delete_song', { songId: activeItemId });
        useStore.getState().setActiveVerses([], 'song', null, '');
      } catch (err) {
        console.error(err);
        await message("Failed to delete song.", { title: 'Error', kind: 'error' });
      }
    }
  };

  const openEditModal = () => {
    setEditTitle(activeItemTitle);
    const sections = activeVerses.map((v, i) => {
      let label = `Verse ${i + 1}`;
      let text = v.text;
      const match = text.match(/^\[(.*?)\]\s*\n/);
      if (match) {
        label = match[1];
        text = text.replace(/^\[.*?\]\s*\n/, '');
      }
      return { id: String(Date.now() + i + Math.random()), label, text };
    });
    const compiled = sections
      .filter(s => s.text.trim())
      .map(s => `[${s.label}]\n${s.text.trim()}`)
      .join('\n\n');
    setRawSongText(compiled);
    setIsRawTextMode(false);
    setEditSections(sections.length > 0 ? sections : [{ id: 'initial', label: 'Verse 1', text: '' }]);
    setIsEditModalOpen(true);
  };

  const handleUpdateSong = async () => {
    let compiledText = "";
    if (isRawTextMode) {
      compiledText = rawSongText;
    } else {
      compiledText = editSections
        .filter(s => s.text.trim())
        .map(s => `[${s.label}]\n${s.text.trim()}`)
        .join('\n\n');
    }

    if (!editTitle.trim() || !compiledText.trim()) {
      await message("Title and Lyrics are required.", { title: 'Required', kind: 'warning' });
      return;
    }
    if (!activeItemId) return;
    try {
      setIsSaving(true);
      await invoke('update_song', { songId: activeItemId, title: editTitle, text: compiledText });
      setIsSaving(false);
      setIsEditModalOpen(false);
      await emit('song-updated');

      // Reload verses
      const lyrics = await invoke<{ id: number, song_id: number, verse_order: number, text: string }[]>('get_song_lyrics', { songId: activeItemId });
      const mappedVerses: Verse[] = lyrics.map(l => ({
        id: l.id,
        book_id: l.song_id,
        book_name: editTitle,
        chapter: 1,
        verse_num: l.verse_order,
        text: l.text,
        secondary_text: undefined
      }));
      useStore.getState().setActiveVerses(mappedVerses, 'song', activeItemId, editTitle);
    } catch (err) {
      console.error(err);
      setIsSaving(false);
      await message("Failed to update song", { title: 'Error', kind: 'error' });
    }
  };

  const cleanText = (t: string) => t.replace(/^\[.*?\]\s*\n/, '');

  const handleSlideClick = (index: number, verse: Verse) => {
    setActiveSlideIndex(index);
    if (activeItemType === 'bible') {
      const englishBook = verse.book_name;
      const hindiBook = bookTranslationMap[englishBook] || englishBook;
      const title = `${hindiBook} (${englishBook}) ${verse.chapter}:${verse.verse_num}`;
      const primaryText = cleanText(verse.text);
      const secondaryText = verse.secondary_text ? cleanText(verse.secondary_text) : undefined;
      setSlideText(primaryText, secondaryText, title, 'bible');
    } else {
      const primaryText = cleanText(verse.text);
      const secondaryText = verse.secondary_text ? cleanText(verse.secondary_text) : undefined;
      setSlideText(primaryText, secondaryText, activeItemTitle, 'song');
    }
  };


  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSlideIndex]);

  useEffect(() => {
    const unlisten = listen<any>('remote_action', (event) => {
      console.log('Received remote action:', event.payload);
      let payload: any = event.payload;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          payload = { action: payload };
        }
      }

      const action = payload.action;
      const state = useStore.getState();

      if (action === 'clear') {
        state.toggleBlackout();
      } else if (action === 'next') {
        state.goToNextSlide();
      } else if (action === 'prev') {
        state.goToPrevSlide();
      } else if (action === 'go_to_slide') {
        state.setActiveSlideIndex(payload.index);
        const activeItem = state.activeTab === 'bibles' ? state.bibleState : state.songState;
        if (activeItem.verses[payload.index]) {
          const verse = activeItem.verses[payload.index];
          let title = activeItem.title;
          if (state.activeTab === 'bibles') {
            const englishBook = verse.book_name;
            const hindiBook = bookTranslationMap[englishBook] || englishBook;
            title = `${hindiBook} (${englishBook}) ${verse.chapter}:${verse.verse_num}`;
          }
          const primaryText = cleanText(verse.text);
          const secondaryText = verse.secondary_text ? cleanText(verse.secondary_text) : undefined;
          state.setSlideText(primaryText, secondaryText, title, state.activeTab === 'bibles' ? 'bible' : 'song');
        }
      } else if (action === 'get_state') {
        const activeItem = state.activeTab === 'bibles' ? state.bibleState : state.songState;
        invoke('broadcast_slide_state', {
          payload: JSON.stringify({
            title: state.title,
            text: state.text,
            subtext: state.subtext,
            contentType: state.contentType,
            isBlackout: state.isBlackout,
            theme: state.theme,
            playlist: activeItem.verses,
            slideIndex: activeItem.slideIndex,
          })
        }).catch(console.error);
      } else if (action === 'search_songs') {
        invoke('search_songs', { query: payload.query }).then(results => {
          invoke('broadcast_slide_state', {
            payload: JSON.stringify({ type: 'search_results', results })
          }).catch(console.error);
        }).catch(console.error);
      } else if (action === 'select_song') {
        const songId = payload.id;
        const title = payload.title || "Song";
        invoke<any[]>('get_song_lyrics', { songId }).then(lyrics => {
          const mappedVerses: Verse[] = lyrics.map(l => ({
            id: l.id,
            book_id: l.song_id,
            book_name: title,
            chapter: 1,
            verse_num: l.verse_order,
            text: l.text,
            secondary_text: undefined
          }));
          state.setActiveTab('songs');
          state.setActiveVerses(mappedVerses, 'song', songId, title);
          state.setActiveSlideIndex(0);
          if (mappedVerses.length > 0) {
            state.setSlideText(cleanText(mappedVerses[0].text), undefined, title, 'song');
          }
        }).catch(console.error);
      } else if (action === 'search_verses') {
        const primaryBibleId = parseInt(localStorage.getItem('veritas_primaryBibleId') || '1') || 1;
        const savedSec = localStorage.getItem('veritas_secondaryBibleId');
        const secondaryBibleId = (savedSec && savedSec !== 'null') ? parseInt(savedSec) : null;
        
        const parsedRef = parseBibleReference(payload.query);
        if (parsedRef) {
          invoke('get_chapter', {
            bibleId: primaryBibleId,
            bookNumber: parsedRef.bookNumber,
            chapterNumber: parsedRef.chapter,
            secondaryBibleId
          }).then((chapterVerses: any) => {
            let results = chapterVerses;
            if (parsedRef.verse !== undefined) {
              const targetVerse = chapterVerses.find((v: any) => v.verse_num == parsedRef.verse);
              results = targetVerse ? [targetVerse] : [];
            }
            if (results.length === 0) {
              results = [{ id: 0, book_id: 0, book_name: 'Debug', chapter: parsedRef.chapter, verse_num: parsedRef.verse || 0, text: `No verses found. BibleID: ${primaryBibleId}, Book: ${parsedRef.bookNumber}, Chap: ${parsedRef.chapter}, Sec: ${secondaryBibleId}, ChVsLen: ${chapterVerses.length}` }];
            }
            invoke('broadcast_slide_state', { 
              payload: JSON.stringify({ type: 'search_results_bible', results }) 
            }).catch(console.error);
          }).catch((err) => {
            invoke('broadcast_slide_state', { 
              payload: JSON.stringify({ type: 'search_results_bible', results: [{ id: 0, book_id: 0, book_name: 'Error', chapter: 0, verse_num: 0, text: err.toString() }] }) 
            });
          });
        } else {
          invoke('search_verses', { query: payload.query, primaryBibleId, secondaryBibleId, testamentFilter: null }).then((results: any) => {
            if (results.length === 0) {
              results = [{ id: 0, book_id: 0, book_name: 'Debug', chapter: 0, verse_num: 0, text: `FTS empty. BibleID: ${primaryBibleId}, Query: ${payload.query}` }];
            }
            invoke('broadcast_slide_state', { 
              payload: JSON.stringify({ type: 'search_results_bible', results }) 
            }).catch(console.error);
          }).catch((err) => {
            invoke('broadcast_slide_state', { 
              payload: JSON.stringify({ type: 'search_results_bible', results: [{ id: 0, book_id: 0, book_name: 'Error', chapter: 0, verse_num: 0, text: err.toString() }] }) 
            });
          });
        }
      } else if (action === 'select_verse') {
        const verse = payload.verse;
        
        const primaryBibleId = parseInt(localStorage.getItem('veritas_primaryBibleId') || '1') || 1;
        const savedSec = localStorage.getItem('veritas_secondaryBibleId');
        const secondaryBibleId = (savedSec && savedSec !== 'null') ? parseInt(savedSec) : null;

        invoke('get_books', { bibleId: primaryBibleId }).then((books: any) => {
          const book = books.find((b: any) => b.id === verse.book_id);
          const bookNumber = book ? book.number : 1;

          invoke('get_chapter', {
            bibleId: primaryBibleId,
            bookNumber: bookNumber,
            chapterNumber: verse.chapter,
            secondaryBibleId
          }).then((chapterVerses: any) => {
            state.setActiveTab('bibles');
            state.setActiveVerses(chapterVerses, 'bible', null);
            
            const targetIndex = chapterVerses.findIndex((v: any) => v.verse_num == verse.verse_num);
            if (targetIndex === -1) {
              invoke('broadcast_slide_state', { 
                payload: JSON.stringify({ type: 'search_results_bible', results: [{ id: 0, book_id: 0, book_name: 'Error', chapter: verse.chapter, verse_num: verse.verse_num, text: `Verse not found in chapter. book_id=${verse.book_id}, computed_bookNumber=${bookNumber}, chapterVerses length=${chapterVerses.length}` }] }) 
              });
            }
            
            const finalIndex = Math.max(0, targetIndex);
            state.setActiveSlideIndex(finalIndex);
            
            if (chapterVerses[finalIndex]) {
              const v = chapterVerses[finalIndex];
              const englishBook = v.book_name;
              const hindiBook = bookTranslationMap[englishBook] || englishBook;
              const title = `${hindiBook} (${englishBook}) ${v.chapter}:${v.verse_num}`;
              const primaryText = cleanText(v.text);
              const secondaryText = v.secondary_text ? cleanText(v.secondary_text) : undefined;
              
              state.setSlideText(primaryText, secondaryText, title, 'bible');
            }
          }).catch((err) => {
            invoke('broadcast_slide_state', { 
              payload: JSON.stringify({ type: 'search_results_bible', results: [{ id: 0, book_id: 0, book_name: 'Error', chapter: 0, verse_num: 0, text: `get_chapter error: ${err.toString()}` }] }) 
            });
          });
        }).catch((err) => {
          invoke('broadcast_slide_state', { 
            payload: JSON.stringify({ type: 'search_results_bible', results: [{ id: 0, book_id: 0, book_name: 'Error', chapter: 0, verse_num: 0, text: `get_books error: ${err.toString()}` }] }) 
          });
        });
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  return (
    <div className="flex-1 h-full bg-background flex flex-col relative overflow-hidden">
      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border/50 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-lg">Edit Song</span>
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
              <button onClick={() => setIsEditModalOpen(false)} className="text-muted-foreground hover:text-white">&times;</button>
            </div>
            <div className="p-4 border-b border-border bg-background/30 shrink-0">
              <input
                type="text"
                placeholder="Song Title"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
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
                    {editSections.map((section, index) => (
                      <div key={section.id} className="bg-secondary/30 border border-border rounded-lg p-3 space-y-3 relative group shadow-sm transition-colors hover:bg-secondary/50">
                        <div className="flex gap-2 items-center">
                          <select
                            value={section.label}
                            onChange={e => {
                              const newSections = [...editSections];
                              newSections[index].label = e.target.value;
                              setEditSections(newSections);
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
                              if (editSections.length > 1) {
                                setEditSections(editSections.filter(s => s.id !== section.id));
                              }
                            }}
                            disabled={editSections.length === 1}
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
                            const newSections = [...editSections];
                            newSections[index].text = e.target.value;
                            setEditSections(newSections);
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
                      const lastLabel = editSections[editSections.length - 1]?.label;
                      if (lastLabel === "Verse 1") nextLabel = "Chorus";
                      else if (lastLabel === "Chorus") nextLabel = "Verse 2";
                      else if (lastLabel === "Verse 2") nextLabel = "Verse 3";

                      setEditSections([...editSections, { id: nextId, label: nextLabel, text: '' }]);
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
                onClick={() => setIsEditModalOpen(false)}
                className="px-3 py-1.5 rounded text-sm bg-background border border-border hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSong}
                disabled={isSaving}
                className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm z-10 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-foreground line-clamp-1">
            {activeItemType === 'song' && activeItemTitle ? activeItemTitle : (activeVerses.length > 0 ? `Selected Verses (${activeVerses.length})` : "No Verses Selected")}
          </h1>
          <p className="text-sm text-muted-foreground">Presentation View</p>
        </div>
        <div className="flex gap-2">
          {activeItemType === 'song' && activeItemId && (
            <>
              <button onClick={openEditModal} className="p-2 rounded-md border border-border hover:bg-secondary text-muted-foreground hover:text-blue-400 transition-colors" title="Edit Song">
                <Edit size={18} />
              </button>
              <button onClick={handleDeleteSong} className="p-2 rounded-md border border-border hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors" title="Delete Song">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {activeVerses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Book size={48} className="mb-4 opacity-20" />
            <p>Search and select verses from the Left Pane.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeItemType === 'bible' ? (
              activeVerses.map((verse, index) => {
                const isActive = activeSlideIndex === index;
                return (
                  <div
                    key={verse.id}
                    ref={isActive ? activeItemRef : null}
                    onClick={() => handleSlideClick(index, verse)}
                    className={clsx(
                      "flex flex-col p-3 rounded cursor-pointer transition-colors border-l-4",
                      isActive
                        ? "bg-blue-500/10 border-blue-400 text-blue-800"
                        : "border-transparent hover:bg-secondary text-foreground"
                    )}
                  >
                    <div className="flex gap-4">
                      <span className={clsx(
                        "font-bold min-w-[60px]",
                        isActive ? "text-blue-500" : "text-muted-foreground"
                      )}>
                        {verse.verse_num}
                      </span>
                      <div className="flex flex-col">
                        <p className="font-medium">{verse.text}</p>
                        {verse.secondary_text && (
                          <p className={clsx(
                            "text-sm mt-1",
                            isActive ? "text-blue-700" : "text-muted-foreground"
                          )}>
                            {verse.secondary_text}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              activeVerses.map((verse, index) => {
                const isActive = activeSlideIndex === index;
                let label = `Verse ${verse.verse_num}`;
                let text = verse.text;
                const match = text.match(/^\[(.*?)\]\s*\n/);
                if (match) {
                  label = match[1];
                  text = text.replace(/^\[.*?\]\s*\n/, '');
                }

                return (
                  <div
                    key={verse.id}
                    ref={isActive ? activeItemRef : null}
                    onClick={() => handleSlideClick(index, verse)}
                    className={clsx(
                      "flex flex-col p-4 rounded-lg cursor-pointer transition-all border",
                      isActive
                        ? "bg-blue-500/10 border-blue-500 shadow-sm text-blue-500"
                        : "border-border hover:bg-secondary text-foreground"
                    )}
                  >
                    <div className="flex flex-col gap-2">
                      <span className={clsx(
                        "text-xs font-bold uppercase tracking-wider",
                        isActive ? "text-blue-400" : "text-muted-foreground"
                      )}>
                        {label}
                      </span>
                      <p className="font-medium whitespace-pre-wrap">{text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />
    </div>
  );
}
