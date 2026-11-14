# PWA 업그레이드 v1

- [v] PWA101. 앱 이름을 `Devianns Clip Maker`로 고정한 Web App Manifest를 제공하고 HTML head에 연결한다. 설치 실행 모드는 `standalone`이며 기존 편집 UI·기능·문서 제목·SEO 대표 URL은 유지한다.
- [v] PWA102. manifest의 start_url/scope 및 아이콘 경로는 manifest 기준 상대 경로로 설정해 도메인 루트와 GitHub Pages 프로젝트 하위 경로 모두 지원한다. 앱 ID는 별도 origin 상대값을 강제하지 않고 start_url을 기본 ID로 사용해 다른 프로젝트 경로와 구분한다.
- [v] PWA103. 자체 호스팅 192×192/512×512 PNG 아이콘과 안전 영역이 있는 512×512 maskable 아이콘, 180×180 Apple touch 아이콘을 제공한다. 기존 편집 화면에 로고/설치 배너/설치 버튼을 추가하지 않는다.
- [v] PWA104. 지원 브라우저의 기본 설치 메뉴로 설치할 수 있게 한다. HTTPS 또는 localhost에서 설치/실행하며 운영체제의 앱 아이콘으로 실행하면 기존 편집기를 연다. 브라우저별 설치 UI와 WebCodecs/로컬 폰트/파일 접근 지원 차이는 그대로이며 설치가 기능 지원을 확대하지는 않는다.
- [v] PWA105. 별도 백엔드·라이브러리·추적 SDK·런타임 CDN·Service Worker 의무화 없이 적용한다. 편집 파일과 프로젝트를 외부로 전송하거나 새로운 저장소로 옮기지 않는다. 자동 새로고침·강제 업데이트·프로젝트 초기화를 추가하지 않는다.
- [v] PWA106. 이번 범위는 설치형 실행이며 오프라인 캐시/오프라인 실행을 보장하지 않는다. 설치 후에도 앱/모델 최초 로딩에는 네트워크가 필요하고 원본 파일 보관/재연결 및 JSON 저장은 기존과 같다. 기존 빌드·dist 배포 명령을 유지한다.
- [v] PWA107. 타입 검사·빌드 후 정적 루트/하위 경로에서 앱 부팅, manifest 파싱·설치 요건 오류·start_url/scope·아이콘 응답/크기를 확인한다. 실제 OS 설치 버튼 클릭/OS 앱 실행을 하지 않았다면 미실행으로 남긴다. 구현 완료 항목을 체크한다.

설치 방법: 배포 후 지원되는 Chrome/Edge에서 사이트를 열고 주소창의 설치 아이콘 또는 브라우저 메뉴의 앱 설치 기능을 사용한다. iOS/iPadOS는 Safari의 공유 → 홈 화면에 추가를 사용한다. 명칭과 설치 지원 여부는 브라우저/OS에 따라 다르다. 설치된 앱은 동일 사이트의 브라우저 저장소/권한 정책을 따르므로 JSON과 원본 파일을 별도로 보관한다.

기준: [MDN 설치 가능한 PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Manifest ID와 start_url 기본값](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id).

확인: `npm run build`(타입 검사 포함) 통과. Windows Edge 157.0.4341.57의 독립된 일반 프로필에서 정적 `/` 및 `/devianns-clip-maker/` 경로를 열어 앱 부팅·manifest 파싱·시작 URL/범위·PNG 아이콘 크기·Apple touch 아이콘 응답을 확인했다. DevTools Protocol의 `Page.getInstallabilityErrors`는 두 경로 모두 빈 오류 목록을 반환했다. 실제 운영체제 설치/설치 앱 실행·Safari 설치는 미실행이다. 원격 배포도 실행하지 않았다.
