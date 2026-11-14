import { Component, type ReactNode } from 'react';

export function AutoCutPending({ onCancel, error }: { onCancel: () => void; error?: string }) {
  return (
    <div className="modal-backdrop">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={error ? 'Auto Cut 오류' : 'Auto Cut 준비'}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.preventDefault();
          if (event.key === 'Tab') {
            event.preventDefault();
            event.currentTarget.querySelector('button')?.focus();
          }
        }}
      >
        <h2>{error ? 'Auto Cut을 열지 못했습니다' : 'Auto Cut 준비'}</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <p>변경사항은 적용되지 않았습니다. 취소 후 다시 열거나 페이지를 새로고침하세요.</p>
          </>
        ) : (
          <p>Auto Cut 화면 준비 중…</p>
        )}
        <button autoFocus onClick={onCancel}>
          취소
        </button>
      </section>
    </div>
  );
}

/** 추가 기능의 로딩/렌더 실패가 기존 편집기 전체를 종료하지 않게 한다. */
export class AutoCutBoundary extends Component<
  { children: ReactNode; onCancel: () => void },
  { error?: string }
> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <AutoCutPending error={this.state.error} onCancel={this.props.onCancel} />;
  }
}
