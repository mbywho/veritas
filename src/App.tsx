import LeftPane from './components/layout/LeftPane';
import CenterPane from './components/layout/CenterPane';
import RightPane from './components/layout/RightPane';
import { useTauriSync } from './hooks/useTauriSync';
import { useStore } from './store/useStore';
import { useEffect } from 'react';

function App() {
  // Sync state as control panel
  useTauriSync(false);

  const goToNextSlide = useStore(state => state.goToNextSlide);
  const goToPrevSlide = useStore(state => state.goToPrevSlide);

  // Auto-launch the projector window on startup
  useEffect(() => {
    import('@tauri-apps/api/core').then(async ({ invoke }) => {
      try {
        const monitors: any[] = await invoke('get_available_monitors');
        // If they have multiple monitors, open on the second one. Otherwise open on primary.
        const targetMonitor = monitors.length > 1 ? monitors[1].name : monitors[0].name;
        await invoke('launch_projector_window', { monitorName: targetMonitor });
      } catch (e) {
        console.error("Auto launch failed", e);
      }
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goToNextSlide();
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goToPrevSlide();
      } else if (e.key === 'Escape') {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('close_projector_window').catch(console.error);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextSlide, goToPrevSlide]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <LeftPane />
      <CenterPane />
      <RightPane />
    </div>
  );
}

export default App;
