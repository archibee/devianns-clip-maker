# 메타데이터·SEO 업그레이드 v1

- [v] SEO101. 정적 HTML head에 한국어 서비스 제목·기능 설명·application-name·robots와 현재 회색 테마 색을 설정한다. 기존 언어/문자 인코딩/viewport를 유지하고 편집 UI·초기 로딩·오류 안내·미디어 처리는 변경하지 않는다.
- [v] SEO102. 현재 원격 저장소의 실제 응답하는 Pages 주소 `https://devianns.github.io/devianns-clip-maker/`를 canonical 및 공유 대표 URL로 통일한다. localhost나 프로젝트 파일명/사용자 입력을 메타데이터에 넣지 않는다.
- [v] SEO103. Open Graph 및 Twitter 카드에 제목·설명·사이트 이름·언어·공유 이미지/대체 설명을 제공한다. 자체 호스팅 1200×630 PNG 공유 이미지와 SVG 파비콘을 추가하고 UI에 로고를 다시 넣지는 않는다. 파비콘은 상대 경로로 하위 경로 배포를 유지한다.
- [v] SEO104. 실제 기능만 설명하는 WebApplication JSON-LD를 정적으로 제공한다. 평점·가격·검색 노출 보장·가공 리뷰는 추가하지 않는다. JavaScript/WebCodecs 필요 조건을 명시한다.
- [v] SEO105. 대표 페이지 한 개만 포함하는 UTF-8 XML 사이트맵을 정적 배포 파일에 추가한다. 존재하지 않는 페이지와 검증하지 않은 lastmod 날짜는 넣지 않는다. 프로젝트 하위 경로 robots.txt를 사이트 전체 정책인 것처럼 추가하지 않으며 검색 허용은 HTML robots 메타로 명시한다.
- [v] SEO106. 런타임 백엔드·외부 폰트/CDN·분석/추적 SDK·리디렉션·라우팅 변경 없이 적용한다. 설치 의존성과 기존 빌드/배포 명령은 유지한다. 미디어/사용자 정보는 공유 이미지나 구조화 데이터에 포함하지 않는다.
- [v] SEO107. 타입 검사·빌드 후 dist의 메타데이터·JSON-LD·사이트맵·이미지/파비콘을 확인한다. 정적 하위 경로에서 페이지 부팅과 메타데이터/정적 파일 응답을 간단히 확인하고 완료 체크한다. 검색 등록/색인/실제 SNS 캐시는 별도의 외부 서비스 반영이므로 완료를 주장하지 않는다.

대표 URL 변경 시 `index.html`의 canonical·OG/Twitter 이미지·JSON-LD와 `public/sitemap.xml`의 URL을 함께 변경한다. 현재 대표 URL은 HTTP 200 응답을 확인했으며 이번 작업으로 원격 배포하지는 않는다. 사이트맵 제출이 필요하면 배포 후 Search Console에서 `https://devianns.github.io/devianns-clip-maker/sitemap.xml`을 제출할 수 있다. 검색 순위나 색인 반영 여부는 이번 검사의 범위가 아니다.

기준: [Google canonical 안내](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Google 사이트맵 안내](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

확인: `npm run build`(타입 검사 포함) 통과. Windows Edge의 정적 `/devianns-clip-maker/` 경로에서 편집기 부팅·canonical/OG/Twitter 값·JSON-LD 파싱·사이트맵 XML/대표 URL·파비콘 200 응답·공유 PNG 1200×630 크기를 확인했다. 검색 색인 및 SNS 서비스에서의 카드 반영은 미확인이다.
