# 외부 구성요소 고지

## 배포 폰트

- Noto Sans KR variable font: Google / Noto 프로젝트.
- 원본: [Google Fonts 저장소](https://github.com/google/fonts/tree/main/ofl/notosanskr)
- 파일: `public/fonts/NotoSansKR.ttf`
- 라이선스: SIL Open Font License 1.1. 원문은 [public/fonts/OFL.txt](./public/fonts/OFL.txt)에 동봉한다.
- 편집기 UI, Worker 미리보기, 최종 영상 합성에 같은 로컬 폰트를 사용한다.

## JavaScript 의존성

설치된 정확한 버전은 `package-lock.json`에 고정한다. React, React DOM, Mediabunny 및 개발 도구의 원본 라이선스는 각 npm 패키지에 포함되어 있다. 의존성 변경 시 패키지 라이선스를 다시 확인한다. 이 저장소 자체의 배포 라이선스는 아직 선정하지 않았다.

실제 정적 배포에도 [public/THIRD_PARTY_LICENSES.txt](./public/THIRD_PARTY_LICENSES.txt)를 포함한다. React/React DOM 19.3.1은 MIT, Mediabunny 1.66.0은 MPL-2.0이다. Mediabunny 원본은 변경하지 않았으며 TypeScript 원본을 포함한 해당 버전의 패키지는 [npm 원본 아카이브](https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.0.tgz)에서 받을 수 있다. 앱 도움말에서도 배포된 고지 파일을 열 수 있다.

브라우저가 제공하는 코덱을 사용한다는 사실만으로 코덱 이용 조건이나 특허 문제가 모두 해소되는 것은 아니다. [MDN 코덱 선택 안내](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)를 참고한다.

## 테스트 영상

브라우저 검사 도구는 Canvas로 색상·프레임 번호·시간을 그리고 수식으로 비프음을 생성한다. 사용자 영상이나 외부 저작물을 fixture로 포함하지 않는다. 생성 결과는 `.gitignore`에 포함된 `test-results/`에만 저장한다.
