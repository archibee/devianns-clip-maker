import { useEffect } from 'react';

export function Toast({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  useEffect(() => {
    if (!onDismiss) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return (
    <div className="toast" role="alert" aria-atomic="true">
      <span>{message}</span>
      {onDismiss && (
        <button aria-label="알림 닫기" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
