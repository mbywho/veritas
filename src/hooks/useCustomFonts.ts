import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { convertFileSrc } from '@tauri-apps/api/core';

export const useCustomFonts = () => {
  const customFonts = useStore((state) => state.customFonts);

  useEffect(() => {
    const styleId = 'veritas-custom-fonts';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const cssRules = customFonts.map(font => {
      const fontUrl = convertFileSrc(font.path);
      return `
        @font-face {
          font-family: '${font.name}';
          src: url('${fontUrl}');
          font-display: swap;
        }
      `;
    }).join('\n');

    styleEl.innerHTML = cssRules;
  }, [customFonts]);
};
