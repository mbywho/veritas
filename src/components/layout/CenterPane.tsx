import { clsx } from 'clsx';
import { Book, Edit, Trash2, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { bookTranslationMap } from '../../utils/bibleMap';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import { emit } from '@tauri-apps/api/event';
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
  const toggleBlackout = useStore((state) => state.toggleBlackout);
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
      setSlideText(primaryText, secondaryText, undefined, 'song');
    }
  };


  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSlideIndex]);

  useEffect(() => {
    const unlisten = listen<string>('remote_action', (event) => {
      const action = event.payload;

      if (action === 'clear') {
        toggleBlackout();
        return;
      }

      const state = useStore.getState();
      
      if (action === 'next') {
        state.goToNextSlide();
      } else if (action === 'prev') {
        state.goToPrevSlide();
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [toggleBlackout]);

  return (
    <div className="flex-1 h-full bg-background flex flex-col relative overflow-hidden">
      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90%] animate-in zoom-in-95 duration-200">
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
