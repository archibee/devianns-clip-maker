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
    const spaceHandler=(e:KeyboardEvent)=>{
      if((e.code!=='Space'&&e.key!==' ')||locked||modal||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
      const target=e.target instanceof Element?e.target:null;
      if(!target||target.closest('textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"]'))return;
      const input=target.closest('input');
      if(input&&input.type!=='range'&&input.type!=='button'&&input.type!=='submit'&&input.type!=='reset')return;
      e.preventDefault();e.stopPropagation();
      if(!e.repeat)toggle();
    };
    const handler = (e: KeyboardEvent) => {
      if(e.code==='Space'||e.key===' ')return;
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
        if (e.key === 'ArrowLeft') {
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
    window.addEventListener('keydown',spaceHandler,true);
    window.addEventListener('keydown', handler);
    return () => {window.removeEventListener('keydown',spaceHandler,true);window.removeEventListener('keydown', handler);};
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
