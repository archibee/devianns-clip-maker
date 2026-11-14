# 구현 및 검증 기록

기준일: 2026-11-14 (Asia/Seoul). 첫 브라우저 편집기를 구현했다. CHECKLIST.md는 최초 문구를 유지하고 실제 완료 표기만 변경한다. 공개 GitHub Pages 검증(F09)은 아직 완료하지 않았다.

## 구현된 흐름

- 미디어 파일 선택/드롭 → 원본 분석 → 썸네일 에셋 보관함 → 드래그/우클릭/버튼 삽입.
- 단일 트랙의 비파괴 분할·앞뒤 트림·삭제·드래그 재배열·이동 버튼과 undo/redo.
- 결합 오디오는 클립의 동일한 in/out과 프로젝트 시간 매핑으로 자르고 함께 재배열한다. 독립 오디오 수정 UI는 구현하지 않았다.
- Worker 프레임 읽기, 960×540(가로 기준) 미리보기, Web Audio 시계, 시킹 최신 요청 우선 처리, Space/프레임/분할/삭제/undo 단축키.
- 원본 구간·contain/cover·배율·위치, 화면 비율 및 수동 한글 자막 편집.
- 원본 기반 출력 Worker, 현재 최종 프로젝트 스냅샷, MP4/WebM 지원 검사, 3개 해상도 × 3개 FPS, 진행·취소·재시도·다운로드·직접 파일 저장.
- JSON/IndexedDB 프로젝트 저장과 복구, 원본 재연결, 잘못된 입력과 누락/저장 오류 안내.
- 타입 검사, 단위 검사, 합성 fixture 기반 실제 브라우저 검사, 정적 하위 경로 검사 및 Pages workflow.

## 사용한 버전

| 구성요소 | 검증한 설치 버전 |
| --- | --- |
| Node.js | 24.22.3, 공식 아카이브 SHA-256 대조 후 프로젝트 로컬에 준비 |
| React / React DOM | 19.3.1 |
| TypeScript | 5.9.3 |
| Vite | 7.3.8 |
| Mediabunny | 1.66.0 |
| Vitest | 4.1.12 |
| Playwright | 1.65.0 |
| 브라우저 | Windows, headless Microsoft Edge 157.0.0.0 |

실제 설치는 package-lock.json이 기준이다. WebCodecs는 브라우저 내장 구현을 사용하며 하드웨어 가속 여부를 별도로 보장하지 않는다. React MIT, Mediabunny MPL-2.0, Noto Sans KR OFL 고지 원문을 정적 배포 파일에 동봉했다. Mediabunny 자체 소스는 수정하지 않았다.

## 자동 검사

| 명령 | 확인 내용 |
| --- | --- |
| `npm run typecheck` | 앱·Worker·테스트 TypeScript strict 검사 |
| `npm test` | 2개 파일, 8개 테스트: 시간 경계·분할/트림/재배열·undo/redo·자막·JSON·크기/FPS·합성 좌표 |
| `npm run checklist:check` | 체크 표시를 제외한 최초 체크리스트 SHA-256 일치 |
| `npm run build` | 정적 HTML/JS/CSS/Worker/폰트, 하위 경로 base |
| `npm run test:browser` | 실제 UI·소리 포함 출력·9개 조합·시킹/취소/복구·실패 경로 |
| `npm run test:preview` | dist의 실제 정적 실행·Worker·폰트·오디오 출력·작은 화면·미지원 환경 |

개발 중 검사 보조 코드의 CanvasSink fit 누락을 수정했다. 다른 검사 1회는 Vite 설정 파일을 갱신하는 동안 개발 서버가 재시작해 브라우저 실행 컨텍스트가 사라져 중단됐으며, 설정 고정 후 다시 검사했다. 이 중단을 제품 출력 오류나 호환성 결과로 집계하지 않았다.

## 영상·오디오 실측

프레임 번호/시간, 빨강·파랑 배경, 화면 플래시, 동기 440Hz 비프음을 코드로 합성했다. 입력은 각각 2초이고 mono 48kHz/44.1kHz를 사용했다. 두 번째 입력에는 불규칙 frame timestamp를 넣었다. 별도 320×240·90도 회전·무음 입력도 검사했다. 사용자 영상이나 외부 저작물은 사용하지 않았다.

| 결과 | 측정 |
| --- | --- |
| MP4 480p × 30/45/60fps | 모두 통과, 실제 854×480 및 선택 FPS |
| MP4 720p × 30/45/60fps | 모두 통과, 실제 1280×720 및 선택 FPS |
| MP4 1080p × 30/45/60fps | 모두 통과, 실제 1920×1080 및 선택 FPS |
| 두 원본 연결 | 영상 4.000초, AAC 포함 파일의 전체 길이 약 4.0107초 |
| 실제 UI 컷/트림/재배열 후 출력 | 영상 3.800초, 파일 전체 길이 약 3.8187초, AAC 유지 |
| A/V 표식 오차 | 검사한 표식에서 약 0.083~10.875ms, 목표 50ms 이내 |
| 미리보기/출력 비교 | 편집 시간 0.2/1.2/2.2초, 160×90 공통 크기로 비교한 RGB 평균 절대 오차 약 0.81/1.89/1.87 (0~255 기준) |
| 무음 회전 입력 → WebM | VP9, 480p/45fps, 2초, 불필요한 오디오 트랙 없음 |

길이 검사는 코덱 padding을 포함한 컨테이너 길이와 영상 트랙 길이를 구분한다. 위 길이는 모두 해당 FPS의 1프레임 허용 오차 안이다. 표식 오차는 디코딩한 PCM과 표시 프레임 timestamp의 차이이며 실제 스피커/디스플레이 하드웨어 지연을 측정한 수치는 아니다. 손실 코덱과 렌더 크기가 다르므로 픽셀 동일성은 주장하지 않는다.

전체 해상도/FPS 결과는 [matrix-report.json](./docs/validation/matrix-report.json)에 보관한다. 최종 회귀 결과는 [regression-report.json](./docs/validation/regression-report.json), 빌드 결과 검사는 [production-report.json](./docs/validation/production-report.json)에 보관한다. 원시 생성 영상은 test-results/에만 저장하고 Git에서 제외한다. 로컬 검사 도구로 다시 생성할 수 있다.

## 견고성 및 정적 실행

- 원본 에셋 HTML 드래그, 우클릭 삽입, 클립 드래그 재배열, 트림 핸들, 숫자 트림, 단축키 및 텍스트 입력 포커스 보호를 확인했다.
- 100회 반복 시킹 뒤 마지막 요청의 파란 프레임과 960×540 캔버스를 확인했다. 오래된 프레임은 표시하지 않고 bitmap을 해제한다.
- 출력 취소 → 재시도, 연속 3회 출력, 누락 원본 실패, 저장 권한 거부, 손상 파일 거부를 확인했다.
- clone 가능한 실제 OPFS FileSystemFileHandle을 검사에서 사용해 Worker의 랜덤 쓰기 직접 저장 경로와 AAC 파일을 확인했다. 제품 UI는 사용자 파일 선택기로 핸들을 받는다.
- JS heap 표본에서 반복 출력 후 큰 증가가 없었고, 최종 해상도 행렬 검사 시 약 42.2→36.4→36.5MB였다. GPU 메모리나 코덱 프로세스 전체 RSS를 측정한 결과는 아니다.
- 원본/이력이 더 이상 참조하지 않는 레지스트리 항목은 해제한다. 빈 타임라인에서는 미리보기 Worker를 종료한다. 출력 종료 시 Worker와 Blob URL의 수명을 관리한다.
- 새로고침 뒤 자동 저장의 3개 클립 복구, 누락된 2개 원본 표시, 원본 재연결을 확인했다.
- production preview의 `/ssg-clip-maker/`에서 Worker·폰트·실제 MP4/AAC 다운로드를 확인했다. 영상 854×480, 2초였다.
- 900/560/390px 뷰포트에서 문서 가로 넘침이 없음을 확인했다. 미지원 VideoDecoder 환경은 원인을 표시했다.
- 검사 중 외부 HTTP 요청과 페이지 스크립트 오류가 없었다. 앱·폰트는 로컬 정적 호스트에서 읽었고 파일/자막의 외부 전송은 없었다.

## 구현 선택과 제한

- 로컬 입력 demux 형식을 MP4/MOV/Matroska/WebM으로 한정한다. 네트워크 HLS 입력이나 URL 임포트는 제공하지 않는다.
- 별도 전체 프레임 캐시 대신 CanvasSink pool 3장과 현재/다음 프레임을 사용한다. 오디오 역시 원본 전체를 디코딩하지 않고 작은 블록으로 처리한다.
- 미리보기 Worker와 export Worker를 분리한다. 출력 중에는 미리보기 디코더를 종료하고 편집을 잠근다.
- 파일 저장은 BufferTarget(제한된 다운로드) 또는 position 기반 StreamTarget(직접 저장)이다. 제품의 별도 OPFS 임시 출력 UI는 없다. 취소/실패 시 commit 전 파일 스트림을 abort한다.
- 오디오는 timestamp 기반 선형 보간을 사용한다. 고급 리샘플링 필터·노이즈 제거·볼륨/효과 편집은 이번 범위가 아니다.
- 스키마는 src/project/model.ts가 기준이다. File·프레임·코덱·object URL은 JSON/undo 데이터에 넣지 않는다.
- 최대 5분은 앱의 편집 범위 제한이다. 이번 자동 미디어 검사는 2~4초 합성 파일 중심이며, 5분짜리 고해상도 실제 촬영 영상·여러 모바일 기기의 성능을 검증한 결과가 아니다.
- Firefox·Safari·macOS·모바일의 코덱 지원, 장시간/고부하 편집, 모든 실제 카메라 파일은 미확인이다. 브라우저 지원 검사와 실제 오류 안내를 유지한다.
- 독립 오디오 편집·자동 자막·다중 영상 레이어·BGM·전환·배속 등은 추가하지 않았다.

## 남은 인수인계: F09

현재 로컬 Git 저장소에 remote가 없고 공개 Pages URL도 없다. 따라서 실제 GitHub Pages HTTPS 환경의 전체 경로를 확인했다는 체크는 하지 않는다. GitHub 원격 저장소와 Pages 설정이 마련되면 다음 작업자가 수행한다.

1. 소스를 GitHub main에 올리고 Settings → Pages → GitHub Actions를 배포 소스로 선택한다.
2. 준비된 workflow의 build/deploy 성공과 실제 URL을 확인한다.
3. 해당 HTTPS URL에서 임포트·자막·컷/재배열·미리보기·소리 포함 출력을 다시 확인한다.
4. Network에서 영상·음성·자막 외부 전송이 없음을 확인한다.
5. URL·브라우저·OS·검사 결과를 이 문서에 기록하고 CHECKLIST.md의 F09 표시만 `[v]`로 바꾼다. 항목 문구와 기준 해시는 변경하지 않는다.

프로젝트 자체의 배포 라이선스 선정은 소유자가 결정할 사항이다. 코드 커밋·push·실제 배포는 이번 작업에서 수행하지 않았다.

## 공개 웹 흰 화면 수정 (2026-11-14)

저장소 홈페이지에 등록된 `https://devianns-clip-maker.vercel.app/`를 실제 Edge로 열어 빈 body를 확인했다. HTML은 HTTP 200이었지만 `/ssg-clip-maker/assets/` 아래의 앱 JavaScript, React/media 청크, CSS가 HTTP 404였다. 이전 저장소 경로에 고정된 Vite base와 실제 루트 배포 위치가 달라 발생한 시작 실패다. 이 관찰은 배포 서버 종류 자체의 결함을 뜻하지 않는다.

Vite base를 상대 경로 `./`로 변경했다. 단순 문자열 BASE_URL로 폰트를 요청하면 Worker에서는 잘못된 assets/fonts 경로가 될 수 있으므로 전용 font 모듈에서 Vite asset URL import를 사용한다. 순수 합성/좌표 계산과 브라우저 폰트 로더를 분리해 Node 단위 검사도 유지한다. 초기 HTML에는 로딩 안내와 앱 파일 로딩 실패 안내를 추가했다.

회귀 검사는 Vite preview의 경로 보정에 기대지 않는 실제 정적 파일 서버로 변경했다. 동일한 dist를 `/`와 `/devianns-clip-maker/`에 각각 올려 화면, Worker, 폰트, 임포트, 480p MP4/AAC 출력 및 다운로드를 검사한다. 앱 JavaScript를 고의로 404 처리했을 때 빈 화면 대신 오류 문구가 표시되는지도 검사한다. 공개 사이트에는 아직 이 로컬 수정본을 배포하지 않았다. 고정 체크리스트 및 이전 검사 기록은 변경하지 않는다.

단위 검사 8개, 타입 검사·프로덕션 빌드, 두 정적 배포 경로 검사, 새 개발 루트의 브라우저 회귀 검사(TEST_MATRIX=0)가 모두 통과했다. 관찰한 기존 공개 오류는 [blank-screen-before.json](./docs/validation/blank-screen-before.json), 수정 빌드의 두 경로 결과는 [portable-path-report.json](./docs/validation/portable-path-report.json)에 보관한다. 호스팅 이전용 설정이나 workflow는 변경하지 않았다.

## v2 자막 편집·재생 개선

자막 블록 선택·드래그/트림·내부 복사/붙여넣기·삭제, 영상/자막 동시 분할과 숫자 1·2를 기존 UI에 연결했다. 무음·오디오 중단/시계 정지·시작 대기와 첫 영상 프레임 준비를 구분해 재생 경로를 개선했다. 상세 문제 코드와 반영 내용은 [checklist_v2.md](./docs/checklists/checklist_v2.md)에 기록한다. v2 단위 검사는 4개 파일 19개이며 실제 브라우저와 정적 배포 경로도 검증했다. 이전 기록과 고정 체크리스트는 수정하지 않는다.
