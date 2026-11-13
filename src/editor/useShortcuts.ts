import { useEffect } from 'react';

export function useShortcuts({
  locked,
  modal,
  toggle,
  seekFrame,
  split,
  remove,
  undo,
  redo,
}: {
  locked: boolean;
  modal: boolean;
  toggle: () => void;
  seekFrame: (delta: number) => void;
  split: () => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        locked ||
        modal ||
        e.isComposing ||
        target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'Space') {
          e.preventDefault();
          if (!e.repeat) toggle();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          seekFrame(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          seekFrame(1);
        } else if (e.key.toLowerCase() === 's' && !e.repeat) {
          e.preventDefault();
          split();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [locked, modal, toggle, seekFrame, split, remove, undo, redo]);
}
