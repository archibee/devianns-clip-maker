import { Dialog } from '../editor/Panel';
import type { InstallResult } from './usePwaInstall';

export function InstallDialog({ result, onClose }: { result: InstallResult; onClose: () => void }) {
  return (
    <Dialog title="앱 설치 안내" onClose={onClose}>
      {result.status === 'dismissed' && (
        <p>설치를 취소했습니다. 나중에 브라우저 메뉴에서 다시 설치할 수 있습니다.</p>
      )}
      {result.status === 'error' && (
        <p role="alert">설치 창을 열지 못했습니다. 브라우저 메뉴에서 설치를 시도하세요.</p>
      )}
      {result.status === 'unavailable' && (
        <p>
          이 브라우저가 바로 설치할 수 있는 창을 제공하지 않았습니다. 아래 방법으로 설치할 수 있는지
          확인하세요.
        </p>
      )}
      <ol className="install-guide">
        <li>
          <strong>Chrome · Edge</strong>
          <p>
            주소창의 설치 아이콘 또는 브라우저 메뉴의 앱 설치 항목을 선택하세요. 이미 설치했다면
            운영체제의 앱 아이콘이나 브라우저의 앱 열기 기능을 사용하세요.
          </p>
        </li>
        <li>
          <strong>iPhone · iPad</strong>
          <p>
            Safari에서 이 사이트를 열고 공유 → 홈 화면에 추가를 선택하세요. 브라우저나 OS에 따라
            메뉴 이름이 다를 수 있습니다.
          </p>
        </li>
        <li>
          <strong>설치 메뉴가 없다면</strong>
          <p>
            HTTPS 주소로 접속했는지 확인하고 지원 브라우저를 사용하세요. 설치 이벤트가 아직 준비되지
            않았거나 시크릿 모드/브라우저 정책으로 설치가 제한될 수 있습니다.
          </p>
        </li>
      </ol>
      <p>
        설치 후에도 최초 로딩에는 네트워크가 필요합니다. 원본 파일과 프로젝트 JSON은 별도로
        보관하세요.
      </p>
      <footer className="dialog-footer">
        <button className="primary" onClick={onClose}>
          확인
        </button>
      </footer>
    </Dialog>
  );
}
