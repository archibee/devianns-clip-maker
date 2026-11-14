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
    'AUTO CUT 사용하기 · 선택',
    '영상 블록 하나를 선택해 AUTO CUT을 여세요. 프리셋으로 분석하고 결과를 확인한 뒤 완료하면 적용됩니다.',
  ],
  [
    '자막 작성하기',
    '자막 탭에서 추가하거나 타임라인의 자막 블록을 선택하세요. 속성 하단의 고정 입력창에서 스크롤 없이 내용을 쓰고, 설정에서 크기·위치·스타일을 조절합니다.',
  ],
  [
    '화면 확인하기',
    'CROP은 테두리 조절 후 다시 눌러 확정합니다. MOVE는 중심점을 격자에 맞춰 이동하고 RESIZE는 크기를 조절합니다.',
  ],
  [
    '저장하거나 영상으로 출력하기',
    '저장은 나중에 이어 편집할 프로젝트 JSON입니다. 내보내기는 현재 편집을 반영한 영상이며, 해상도와 FPS를 선택해 출력합니다.',
  ],
];
const timelineGuide = [
  {
    title: '라인 관리',
    items: [
      [
        '라인 선택·추가',
        'T 번호로 대상 라인을 선택하고 라인 추가로 빈 라인을 만듭니다. 영상과 자막 모두 배치할 수 있습니다.',
      ],
      [
        '라인 위·라인 아래',
        '라인 전체의 순서를 바꿉니다. 번호가 큰 라인이 앞 레이어이며 블록 시간은 유지됩니다.',
      ],
      [
        '라인 삭제',
        '해당 라인과 포함 블록을 삭제합니다. 블록이 있으면 확인하며 실행 취소로 복구할 수 있습니다.',
      ],
    ],
  },
  {
    title: '블록 편집',
    items: [
      [
        '분할·삭제·합치기',
        '블록 분할은 재생 위치를 지나는 영상·자막을 자릅니다. 합치기는 같은 라인의 인접 영상만 가능합니다.',
      ],
      [
        '블록 왼쪽·블록 오른쪽',
        '같은 라인 안 영상 순서를 바꿉니다. 블록 드래그 중 겹치면 가까운 빈 경계에 붙습니다. 연속 선택 블록은 같은 라인에서 함께 드래그할 수 있습니다.',
      ],
      [
        '복사·잘라내기·붙여넣기',
        '상대 시간과 라인 간격을 유지합니다. 같은 라인의 블록과 겹치는 붙여넣기는 적용되지 않습니다.',
      ],
    ],
  },
  {
    title: '선택과 음소거',
    items: [
      [
        '혼합 다중 선택',
        'Ctrl/⌘+클릭으로 영상·자막을 함께 선택합니다. 속성 탭에서는 같은 종류의 공통 설정을 편집합니다.',
      ],
      [
        '개별·일괄 음소거',
        '영상의 오디오 영역 버튼을 사용하세요. 선택된 영상의 버튼은 선택 영상 전체에, 선택 밖 버튼은 그 영상만 적용합니다.',
      ],
      [
        '소리와 영상',
        '자막과 무음 원본은 음소거 대상에서 제외합니다. 음소거는 영상은 유지하고 미리보기·출력 소리만 바꿉니다.',
      ],
    ],
  },
  {
    title: 'AUTO CUT',
    items: [
      [
        '선택 블록만 분석',
        '영상 블록 하나만 선택해야 실행됩니다. 모달에서 원본 소리를 분석하고 완료 전에는 프로젝트를 변경하지 않습니다.',
      ],
      [
        '다른 블록 시간 유지',
        '대상 블록의 남길 컷만 이어 붙입니다. 다른 영상·기존 자막은 원래 시간에 남으며 빈 공간이 생길 수 있습니다.',
      ],
      [
        '빈 자막 자동 생성',
        '체크하면 항상 새 라인에 컷마다 같은 길이의 빈 자막을 만듭니다. 취소하면 적용하지 않습니다.',
      ],
    ],
  },
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
      [
        'Ctrl / ⌘ + A',
        '활성 라인 전체 선택 · 영상/자막 선택 중이면 같은 종류만, 무선택/혼합 선택이면 모든 블록',
      ],
    ],
  },
  {
    group: '복사·실행 취소',
    rows: [
      ['Ctrl / ⌘ + C', '선택 블록 복사'],
      ['Ctrl / ⌘ + X', '선택 블록 잘라내기'],
      ['Ctrl / ⌘ + V', '선택 라인의 재생 위치에 붙여넣기'],
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
        <section aria-labelledby="help-timeline-title">
          <h3 id="help-timeline-title">타임라인 기능</h3>
          <div className="help-timeline-grid">
            {timelineGuide.map((card) => (
              <article className="help-timeline-card" key={card.title}>
                <h4>{card.title}</h4>
                <dl>
                  {card.items.map(([label, text]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{text}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
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
            <strong>프로젝트 다시 열기</strong> JSON에는 원본 영상이 포함되지 않습니다. 원본 파일을
            보관하고 필요하면 다시 연결하세요.
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
