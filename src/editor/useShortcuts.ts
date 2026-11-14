import { useEffect } from 'react';

export function useShortcuts({
  locked,
  modal,
  toggle,
  seekFrame,
  split,
  merge,
  remove,
  undo,
  redo,
  copyCue,
  pasteCue,
  selectAll,
  cutBlocks,
}: {
  locked: boolean;
  modal: boolean;
  toggle: () => void;
  seekFrame: (delta: number) => void;
  split: () => void;
  merge: () => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  copyCue: () => boolean;
  pasteCue: () => boolean;
  selectAll: () => boolean;
  cutBlocks: () => boolean;
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
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
        if (selectAll()) e.preventDefault();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'x'
      ) {
        if (!e.repeat && cutBlocks()) e.preventDefault();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'c'
      ) {
        if (copyCue()) e.preventDefault();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'v'
      ) {
        if (!e.repeat && pasteCue()) e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
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
        } else if ((e.key.toLowerCase() === 's' || (e.key === '1' && !e.shiftKey)) && !e.repeat) {
          e.preventDefault();
          split();
        } else if (e.key === '3' && !e.shiftKey && !e.repeat) {
          e.preventDefault();
          merge();
        } else if (
          e.key === 'Delete' ||
          e.key === 'Backspace' ||
          (e.key === '2' && !e.shiftKey && !e.repeat)
        ) {
          e.preventDefault();
          remove();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    locked,
    modal,
    toggle,
    seekFrame,
    split,
    merge,
    remove,
    undo,
    redo,
    copyCue,
    pasteCue,
    selectAll,
    cutBlocks,
  ]);
}
