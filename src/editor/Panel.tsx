import { useEffect, useRef, type ReactNode } from 'react';

export function PanelTitle({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-title">
      <span className="panel-index">{number}</span>
      <h2>{title}</h2>
      <div className="panel-actions">{children}</div>
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  locked?: boolean;
}) {
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    return () => {
      const previous = previousFocus.current;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog"
        ref={(element) => {
          if (element && !element.contains(document.activeElement)) element.focus();
        }}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !locked) onClose();
          if (e.key === 'Tab') {
            const targets = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
              ),
            ];
            const first = targets[0],
              last = targets.at(-1);
            if (!targets.length) {
              e.preventDefault();
              return;
            }
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === e.currentTarget)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last || document.activeElement === e.currentTarget)
            ) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="닫기" disabled={locked} onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
