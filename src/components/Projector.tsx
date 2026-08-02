import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTauriSync } from '../hooks/useTauriSync';
import { clsx } from 'clsx';
import { useLayoutEffect, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

export default function Projector({ isPreview = false }: { isPreview?: boolean }) {
  // Sync state as a projector (listen only) if not in preview mode
  if (!isPreview) {
    useTauriSync(true);
  }

  const { title, text, subtext, contentType, isBlackout, theme } = useStore(
    useShallow(state => ({
      title: state.title,
      text: state.text,
      subtext: state.subtext,
      contentType: state.contentType,
      isBlackout: state.isBlackout,
      theme: state.theme
    }))
  );
  const mainTextRef = useRef<HTMLHeadingElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const subTextRef = useRef<HTMLParagraphElement>(null);
  const subContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (theme?.smoothTransitions && wrapperRef.current) {
      wrapperRef.current.classList.remove('animate-smooth-fade');
      void wrapperRef.current.offsetWidth; // trigger reflow
      wrapperRef.current.classList.add('animate-smooth-fade');
    }
  }, [text, subtext, theme?.smoothTransitions]);

  useLayoutEffect(() => {
    if (isPreview) return;
    document.body.style.overflow = 'hidden';
    document.body.style.backgroundColor = 'black';
  }, [isPreview]);

  useEffect(() => {
    if (theme?.bgType === 'video' && videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => { });
    }
  }, [theme?.bgValue, theme?.bgType]);

  useEffect(() => {
    if (isPreview) return;
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        try {
          await invoke('close_projector_window');
        } catch (err) {
          console.error("Failed to hide window", err);
        }
      } else if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        try {
          await emit('remote_action', { action: 'next' });
        } catch (err) {
          console.error("Failed to emit next", err);
        }
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        try {
          await emit('remote_action', { action: 'prev' });
        } catch (err) {
          console.error("Failed to emit prev", err);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreview]);

  const getStrokeAndShadow = () => {
    const ts = theme?.textShadow || 'none';
    if (ts === 'outline') {
      return { WebkitTextStroke: '3px black', textShadow: 'none' };
    }
    if (ts === 'outline-shadow') {
      return { WebkitTextStroke: '3px black', textShadow: '0 10px 25px rgba(0,0,0,1)' };
    }
    if (ts.includes('2px 2px 0 #000')) {
      if (ts.includes('10px 25px')) return { WebkitTextStroke: '3px black', textShadow: '0 10px 25px rgba(0,0,0,1)' };
      return { WebkitTextStroke: '3px black', textShadow: 'none' };
    }
    return { WebkitTextStroke: 'none', textShadow: ts };
  };

  // Auto-scale font size to fill space without overflowing
  const autoScale = () => {
    if (isBlackout) return;

    let min = 0.01; // Min scale multiplier
    let max = 1.0; // Max scale multiplier
    let best = min;

    const maxMain = theme?.mainFontSize || 50;
    const maxSub = theme?.subFontSize || 50;

    // Binary search for perfect font size
    for (let i = 0; i < 8; i++) {
      const mid = (min + max) / 2;

      if (mainTextRef.current) mainTextRef.current.style.fontSize = `${mid * maxMain}px`;
      if (subTextRef.current) subTextRef.current.style.fontSize = `${mid * maxSub}px`;

      let overflows = false;

      if (mainContainerRef.current) {
        const c = mainContainerRef.current;
        const maxHeight = c.parentElement!.clientHeight * 0.95;
        const maxWidth = c.parentElement!.clientWidth;
        if (c.scrollHeight > maxHeight || c.scrollWidth > maxWidth) overflows = true;
      }

      if (subContainerRef.current && subtext) {
        const c = subContainerRef.current;
        const maxHeight = c.parentElement!.clientHeight * 0.95;
        const maxWidth = c.parentElement!.clientWidth;
        if (c.scrollHeight > maxHeight || c.scrollWidth > maxWidth) overflows = true;
      }

      if (overflows) {
        max = mid;
      } else {
        best = mid;
        min = mid;
      }
    }

    if (mainTextRef.current) mainTextRef.current.style.fontSize = `${best * maxMain}px`;
    if (subTextRef.current) subTextRef.current.style.fontSize = `${best * maxSub}px`;
  };

  useLayoutEffect(() => {
    if (text) autoScale();
  }, [
    text, subtext, isBlackout,
    theme?.mainFontSize, theme?.subFontSize,
    theme?.fontWeight, theme?.mainFontFamily, theme?.subFontFamily,
    theme?.padding, theme?.margin, theme?.textAlign,
    theme?.translationSpacing, theme?.smoothTransitions
  ]);

  return (
    <div className={clsx(
      "overflow-hidden flex flex-col items-center justify-center text-center bg-black relative",
      isPreview ? "w-full h-full" : "w-screen h-screen"
    )}>
      {/* Background Media */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: theme?.bgType === 'image' && theme.bgValue ? `url("${theme.bgValue.replace(/"/g, '\\"')}")` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: theme?.bgType === 'color' ? theme.bgValue : '#000000',
        }}
      >
        {theme?.bgType === 'video' && theme.bgValue && (
          <video
            ref={videoRef}
            src={theme.bgValue}
            autoPlay
            loop
            muted
            playsInline
            poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>

      {/* Overlay gradient for text readability if using media */}
      {(theme?.bgType === 'image' || theme?.bgType === 'video') && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(0,0,0,${(theme?.bgDim ?? 40) / 100})`,
            backdropFilter: (theme?.bgBlur && theme.bgBlur > 0) ? `blur(${theme.bgBlur}px)` : 'none'
          }}
        />
      )}

      <div
        className="absolute inset-0 flex flex-col pointer-events-none z-10"
        style={{ padding: `${(theme?.padding ?? 0) + 2}%` }}
      >
        {title && contentType !== 'song' && (
          <div className="pt-1 w-full text-center shrink-0">
            <h2
              className=""
              style={{
                fontFamily: theme?.mainFontFamily || 'serif',
                color: theme?.fontColor || 'white',
                fontSize: theme?.mainFontSize ? `${theme.mainFontSize * 0.8}px` : '40px',
                fontWeight: theme?.fontWeight ?? 800,
                ...getStrokeAndShadow(),
              }}
            >
              {title}
            </h2>
          </div>
        )}

        {/* Main Content */}
        <div
          ref={wrapperRef}
          className={clsx(
            "flex-1 flex flex-col items-center justify-start min-h-0 w-full",
            theme?.smoothTransitions && "animate-smooth-fade"
          )}
          style={{
            textAlign: theme?.textAlign || 'center',
            marginTop: `${(theme?.margin ?? 0)}%`
          }}
        >
          <div className="flex-1 flex items-center justify-center min-h-0 w-[95%] relative">
            <div ref={mainContainerRef} className="w-full">
              <p
                ref={mainTextRef}
                className={clsx(
                  "leading-snug w-full",
                  contentType === 'song' && "whitespace-pre-line"
                )}
                style={{
                  fontFamily: theme?.mainFontFamily || 'serif',
                  color: theme?.fontColor || 'white',
                  fontWeight: theme?.fontWeight ?? 800,
                  lineHeight: theme?.lineHeight ?? 1.2,
                  transform: 'scale(1)',
                  ...getStrokeAndShadow(),
                }}
              >
                {text}
              </p>
            </div>
          </div>

          {subtext && (
            <div
              className="flex-1 flex items-center justify-center min-h-0 w-[95%] relative pb-3"
              style={{ marginTop: `${(theme?.translationSpacing ?? 0) - 4}%` }}
            >
              <div ref={subContainerRef} className="w-full">
                <p
                  ref={subTextRef}
                  className={clsx(
                    "w-full",
                    contentType === 'song' && "whitespace-pre-line"
                  )}
                  style={{
                    fontFamily: theme?.subFontFamily || 'serif',
                    color: theme?.fontColor || 'white',
                    fontWeight: theme?.fontWeight ?? 800,
                    lineHeight: theme?.lineHeight ?? 1.2,
                    ...getStrokeAndShadow(),
                  }}
                >
                  {subtext}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Blackout Screen overlay */}
      <div
        className={clsx(
          "absolute inset-0 bg-black z-50 pointer-events-none transition-opacity duration-500",
          isBlackout ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
