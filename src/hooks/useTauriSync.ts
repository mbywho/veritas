import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useStore, SlideState } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

const SYNC_EVENT = 'slide-changed';

export function useTauriSync(isProjector: boolean = false) {
  const { setStateFromEvent } = useStore();

  const stateToSync = useStore(
    useShallow(state => ({
      title: state.title,
      text: state.text,
      subtext: state.subtext,
      contentType: state.contentType,
      isBlackout: state.isBlackout,
      theme: state.theme,
    }))
  );

  // Projector: Listen for state changes
  useEffect(() => {
    if (!isProjector) return;

    // Request initial state when projector mounts
    emit('request_state');

    const unlisten = listen<SlideState>(SYNC_EVENT, (event) => {
      setStateFromEvent(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isProjector, setStateFromEvent]);

  // Control Panel: Listen for requests and broadcast state changes
  useEffect(() => {
    if (isProjector) return;

    const payload: SlideState = {
      title: stateToSync.title,
      text: stateToSync.text,
      subtext: stateToSync.subtext,
      contentType: stateToSync.contentType,
      isBlackout: stateToSync.isBlackout,
      theme: stateToSync.theme,
    };

    // Listen for new projectors coming online
    const unlisten = listen('request_state', () => {
      emit(SYNC_EVENT, payload);
      invoke('broadcast_slide_state', { payload: JSON.stringify(payload) }).catch(console.error);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [isProjector, stateToSync]);

  // Control Panel: Broadcast state changes when state updates
  useEffect(() => {
    if (isProjector) return;

    const payload: SlideState = {
      title: stateToSync.title,
      text: stateToSync.text,
      subtext: stateToSync.subtext,
      contentType: stateToSync.contentType,
      isBlackout: stateToSync.isBlackout,
      theme: stateToSync.theme,
    };

    // Emit to all Tauri windows (Projector)
    emit(SYNC_EVENT, payload);
    
    // Broadcast to Axum Server for OBS & Web Clients
    invoke('broadcast_slide_state', { payload: JSON.stringify(payload) })
      .catch(console.error);
  }, [
    stateToSync.title,
    stateToSync.text,
    stateToSync.subtext,
    stateToSync.contentType,
    stateToSync.isBlackout,
    stateToSync.theme,
    isProjector
  ]);
}
