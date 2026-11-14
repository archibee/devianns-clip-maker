import { Dialog } from './Panel';

const steps = [
  [
    '미디어 가져오기',
    '영상을 임포트한 뒤 에셋을 타임라인으로 드래그하세요. ＋ 버튼이나 우클릭 메뉴로도 추가할 수 있습니다.',
  ],
  [
    '컷 편집하기',
    '눈금을 눌러 재생 위치를 옮기고 분할하세요. 블록 양끝으로 길이를 조절하고 드래그 또는 이동 버튼으로 순서를 바꿉니다.',
  ],
  [
    'Auto Cut 사용하기 · 선택',
    '영상 블록 하나를 선택하고 음성과 여백 프리셋으로 분석하세요. 삭제 후보와 미리보기를 확인한 뒤 완료해야 적용됩니다. 컷마다 빈 자막 생성도 선택할 수 있습니다.',
  ],
  [
    '자막 작성하기',
    '자막 탭에서 추가하거나 타임라인의 자막 블록을 선택하세요. 속성 하단의 고정 입력창에서 스크롤 없이 내용을 쓰고, 설정에서 크기·위치·스타일을 조절합니다.',
  ],
  [
    '화면 확인하기',
    '미리보기에서 재생·탐색하세요. 영상을 선택한 뒤 Crop/Move/Resize로 배치를 조절하며, Crop은 테두리 조절 후 버튼을 다시 눌러 확정합니다.',
  ],
  [
    '저장하거나 영상으로 출력하기',
    '저장은 나중에 이어 편집할 프로젝트 JSON입니다. 내보내기는 현재 편집을 반영한 영상이며, 해상도와 FPS를 선택해 출력합니다.',
  ],
];
const shortcuts = [
  {
    group: '재생·탐색',
    rows: [
      ['Space', '재생 / 일시 정지'],
      ['← / →', '이전 / 다음 프레임'],
    ],
  },
  {
    group: '컷·선택',
    rows: [
      ['1 또는 S', '재생 위치에서 영상·자막 분할'],
      ['2 / Delete / Backspace', '선택한 영상 또는 자막 삭제'],
      ['3', '선택한 영상 합치기 · 서로 맞닿은 블록만'],
      [
        'Ctrl / ⌘ + 클릭',
        '영상·자막 혼합 다중 선택 / 선택 해제 · 각 속성 탭에서 같은 종류 공통 설정',
      ],
      ['Ctrl / ⌘ + A', '현재 속성 탭의 선택 종류 전체 선택 · 영상 또는 자막'],
    ],
  },
  {
    group: '복사·실행 취소',
    rows: [
      ['Ctrl / ⌘ + C', '선택 블록 복사'],
      ['Ctrl / ⌘ + X', '선택한 영상 또는 자막 잘라내기 · 실행 취소로 복구 가능'],
      [
        'Ctrl / ⌘ + V',
        '선택 행의 재생 위치에 붙여넣기 · 상대 시간/행 간격 보존 · 같은 행의 겹침은 거부',
      ],
      ['Ctrl / ⌘ + Z', '실행 취소'],
      ['Ctrl / ⌘ + Shift + Z', '다시 실행'],
    ],
  },
];
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="편집 가이드 & 단축키" onClose={onClose}>
      <div className="editor-help">
        <section aria-labelledby="help-start-title">
          <p>
            타임라인의 ＋ 라인 추가로 라인을 늘리고 T 번호를 눌러 대상 라인을 선택하세요. 라인
            삭제는 활성 라인과 포함 블록을 삭제하며 블록이 있으면 확인을 요청합니다. 블록 분할/블록
            삭제는 블록을 조작합니다. 각 라인에는 영상 또는 자막을 놓을 수 있습니다. 블록을 다른
            행으로 드래그해 이동하며, 행 번호가 큰 행이 앞 레이어입니다. 다른 행의 영상 소리는 함께
            재생됩니다. 라인 위/아래는 라인 전체의 순서를, 블록 이동은 해당 라인 안 영상 순서를
            바꿉니다.
          </p>
          <h3 id="help-start-title">빠른 시작</h3>
          <ol className="help-steps">
            {steps.map(([title, text], i) => (
              <li key={title}>
                <span className="help-step-number">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{title}</h4>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="help-keys-title">
          <h3 id="help-keys-title">단축키</h3>
          <p className="help-caption">
            Windows는 Ctrl, Mac은 ⌘를 사용합니다. 텍스트·숫자 입력 중에는 편집 단축키가 실행되지
            않습니다.
          </p>
          <table className="help-shortcuts">
            <thead>
              <tr>
                <th scope="col">키</th>
                <th scope="col">동작</th>
              </tr>
            </thead>
            {shortcuts.map((group) => (
              <tbody key={group.group}>
                <tr className="help-shortcut-group">
                  <th colSpan={2} scope="rowgroup">
                    {group.group}
                  </th>
                </tr>
                {group.rows.map(([key, text]) => (
                  <tr key={key}>
                    <th scope="row">
                      <kbd>{key}</kbd>
                    </th>
                    <td>{text}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </section>
        <aside className="help-notes" aria-label="편집과 저장 안내">
          <p>
            <strong>영상과 소리</strong> 원본 소리는 영상 블록과 함께 잘리고 이동합니다. 영상 블록의
            오디오 영역에서 음소거를 누르세요. 선택된 영상의 버튼을 누르면 혼합 선택 중인 영상
            전체에 같은 음소거/해제 상태를 적용하며 자막은 무시합니다. 선택 밖 버튼은 그 영상만
            변경합니다. 음소거는 미리보기와 출력에 반영되고 Auto Cut은 원본 소리를 분석합니다.
          </p>
          <p>
            <strong>프로젝트 다시 열기</strong> JSON에는 원본 영상이 포함되지 않습니다. 원본 파일을
            보관하고 필요하면 다시 연결하세요.
          </p>
          <p>
            <strong>Auto Cut</strong> 분석만으로 적용되지 않습니다. 완료 전까지 원래 타임라인이
            유지되며, 선택한 영상 블록 하나만 적용하며 다른 블록과 기존 자막 시간은 유지합니다. 자동
            자막은 항상 새 라인에 추가합니다.
          </p>
        </aside>
        <footer className="help-footer">
          <a
            href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`}
            target="_blank"
            rel="noreferrer"
          >
            오픈소스 라이선스
          </a>
          <button className="primary" onClick={onClose}>
            편집으로 돌아가기
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
