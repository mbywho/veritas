import LeftPane from './components/layout/LeftPane';
import CenterPane from './components/layout/CenterPane';
import RightPane from './components/layout/RightPane';
import { useTauriSync } from './hooks/useTauriSync';
import { useStore } from './store/useStore';
import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

function App() {
  // Sync state as control panel
  useTauriSync(false);


  // Theme initialization
  useEffect(() => {
    const savedTheme = localStorage.getItem('veritas_themeMode') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Custom font injection
  useEffect(() => {
    (async () => {
      try {
        const fonts = await invoke<{ name: string; path: string }[]>('get_custom_fonts');
        if (fonts.length > 0) {
          const styleId = 'veritas-custom-fonts';
          let styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }
          styleEl.innerHTML = fonts.map(f => `
            @font-face {
              font-family: '${f.name}';
              src: url('${convertFileSrc(f.path)}');
            }
          `).join('\n');
        }
      } catch (e) {
        console.error("Failed to load custom fonts", e);
      }
    })();
  }, []);

  // Auto-launch the projector window on startup
  useEffect(() => {
    (async () => {
      try {
        const monitors: any[] = await invoke('get_available_monitors');
        // If they have multiple monitors, open on the second one. Otherwise open on primary.
        const targetMonitor = monitors.length > 1 ? monitors[1].name : monitors[0].name;
        await invoke('launch_projector_window', { monitorName: targetMonitor });
      } catch (e) {
        console.error("Auto launch failed", e);
      }
    })();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      const isInput = activeEl?.tagName === 'INPUT';
      const isTextArea = activeEl?.tagName === 'TEXTAREA';
      const isSelect = activeEl?.tagName === 'SELECT';
      const inputType = isInput ? (activeEl as HTMLInputElement).type : '';
      
      // Theme settings use number and range inputs which need up/down arrows
      const isThemeInput = isInput && (inputType === 'number' || inputType === 'range');

      // Don't interfere with textarea navigation or select dropdowns
      if (isTextArea || isSelect) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        useStore.getState().setActiveTab('bibles');
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        useStore.getState().setActiveTab('songs');
        return;
      }

      if (e.key === 'PageDown' || (!isThemeInput && e.key === 'ArrowDown') || (e.key === 'ArrowRight' && !isInput)) {
        e.preventDefault();
        useStore.getState().goToNextSlide();
      } else if (e.key === 'PageUp' || (!isThemeInput && e.key === 'ArrowUp') || (e.key === 'ArrowLeft' && !isInput)) {
        e.preventDefault();
        useStore.getState().goToPrevSlide();
      } else if (e.key === 'Escape' && !isInput) {
        invoke('close_projector_window').catch(console.error);
      } else if (!isInput) {
        if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          useStore.getState().toggleBlackout();
        } else if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          useStore.getState().toggleCleared();
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          const state = useStore.getState();
          const types: ('color' | 'image' | 'video')[] = ['color', 'image', 'video'];
          const currentIndex = types.indexOf(state.theme.bgType || 'color');
          const nextType = types[(currentIndex + 1) % types.length];
          state.setTheme({ bgType: nextType });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <LeftPane />
      <CenterPane />
      <RightPane />
    </div>
  );
}

export default App;