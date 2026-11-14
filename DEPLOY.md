# Git Bash로 GitHub Pages 배포

Windows의 **Git Bash**에서 실행한다. 로컬에서 빌드한 `dist/` 내용만 배포 전용 `gh-pages` 브랜치에 올린다. GitHub에 push할 수 있는 인증과 권한이 필요하다.

전체 순서는 **개발 서버 종료 → 프로젝트·도구 확인 → 원격 저장소 확인 → 설치·검사·빌드 → 업로드 → 최초 Pages 설정 → 공개 사이트 확인**이다. 각 단계가 실패하면 다음 단계로 진행하지 말고 오류를 해결한다.

## 1. 개발 서버 종료

`npm run dev` 또는 `npm run preview`를 실행한 터미널에서 **Ctrl+C**를 누른다. Windows에서는 실행 중인 Vite가 Rollup 파일을 잠가 `npm ci`가 `EPERM: operation not permitted, unlink ...rollup.win32-x64-msvc.node`로 실패할 수 있다.

서버 터미널을 찾을 수 없다면 작업 관리자에서 명령줄을 확인해 **현재 프로젝트의 Vite에 해당하는 Node.js 프로세스만** 종료한 뒤 설치를 다시 실행한다.

## 2. 프로젝트 폴더와 도구 확인

Git Bash를 열고 프로젝트 폴더로 이동한다. 실제 설치 위치가 다르면 경로를 바꾼다.

```bash
cd /c/Users/USER/Desktop/CLIP_MAKER/devianns-clip-maker
git status --short
git --version
node --version
npm --version
```

Node.js는 `package.json` 기준 **22.12 이상**이어야 한다. 이 작업 환경에 준비된 로컬 Node.js를 사용할 경우, 버전 확인 전에 아래를 실행한다.

```bash
export PATH="$PWD/.tools/node-v24.22.3-win-x64:$PATH"
```

PATH 설정은 현재 Git Bash 세션에만 적용된다. `.tools/`는 Git에 포함되지 않으므로 새로 받은 저장소에서는 Node.js를 별도로 설치해야 한다. Git Bash에서는 `npm`, `npx`를 사용한다.

## 3. 원격 저장소 확인 — 최초 한 번 또는 주소 변경 시

```bash
git remote -v
```

`origin`이 없으면 추가한다. 다른 저장소에 배포한다면 URL을 바꾼다.

```bash
git remote add origin https://github.com/devianns/devianns-clip-maker.git
```

`origin`이 있지만 실제 배포할 저장소 주소와 다르면 변경한다.

```bash
git remote set-url origin https://github.com/devianns/devianns-clip-maker.git
```

설정된 주소를 다시 확인한다.

```bash
git remote get-url origin
```

## 4. 의존성 설치·검사·빌드

최초 실행, `package-lock.json` 변경 또는 설치 상태가 불확실할 때 실행한다. `&&`로 연결했으므로 앞 명령이 실패하면 다음 명령을 실행하지 않는다.

```bash
npm ci && npm test && npm run build
```

의존성이 이미 설치되어 있고 잠금 파일이 바뀌지 않았다면 아래로 진행할 수 있다.

```bash
npm test && npm run build
```

`npm run build`에는 고정 체크리스트 검사와 타입 검사가 포함된다. **모든 명령이 성공하고 최신 `dist/`가 생성된 경우에만** 다음 단계로 진행한다. 실패한 빌드의 이전 `dist/`를 배포하지 않는다.

## 5. 빌드 결과 업로드

프로젝트 폴더에서 실행한다.

```bash
npx --yes gh-pages@6.3.0 -d dist -b gh-pages --nojekyll
```

`Published`가 표시되면 배포 브랜치 업로드가 끝난 것이다. 실패하면 Git 인증, 원격 저장소 권한, Git 사용자 이름·이메일 설정을 확인한 뒤 다시 실행한다.

이 명령은 `gh-pages` 브랜치의 파일을 최신 `dist/` 내용으로 갱신하므로 해당 브랜치에는 배포 파일만 둔다. 로컬에서 `gh-pages` 브랜치로 전환할 필요는 없다. `--nojekyll`은 `.nojekyll` 파일을 생성한다.

## 6. GitHub Pages 설정 — 최초 업로드 후 한 번

5단계에서 원격 `gh-pages` 브랜치가 생성된 뒤 GitHub 저장소의 **Settings → Pages → Build and deployment**에서 설정한다.

1. Source: **Deploy from a branch**
2. Branch: **gh-pages**
3. Folder: **/ (root)**
4. **Save**를 누른다.

이 문서는 브랜치 배포 방식이다. README의 **GitHub Actions** 방식과 Pages 소스 설정이 다르다. 저장소에 있는 `.github/workflows/pages.yml`은 `main` push 시 별도로 실행되므로 Actions 목록에서는 실행한 워크플로 이름과 배포 소스를 함께 확인한다. 이 절차를 위해 기존 workflow 파일을 수정할 필요는 없다. 브랜치 방식도 GitHub 내부 Pages 배포 워크플로를 통해 게시된다.

## 7. 공개 사이트 확인

GitHub의 **Actions**에서 Pages 배포 성공을 확인하고 **Settings → Pages**에 표시된 HTTPS 주소를 연다. `Published`는 브랜치 업로드 완료를 뜻하므로 공개 사이트 반영까지 확인한다.

- 화면, Worker, 로컬 폰트가 정상적으로 로딩되는지 확인한다.
- 로컬 영상 임포트 → 컷·자막 편집 → 미리보기 → 소리 포함 내보내기·다운로드를 확인한다.
- 개발자 도구 Network에서 원본 영상·음성·자막이 외부로 전송되지 않는지 확인한다.

실제 검증 결과는 `IMPLEMENTATION.md`에 기록한다. 확인 전에는 공개 배포 검증을 완료로 표시하지 않는다.

## 8. 다음 수정부터 재배포

새 Git Bash에서 1~2단계를 진행한 뒤 **4단계 설치·검사·빌드 → 5단계 업로드 → 7단계 공개 사이트 확인** 순서로 반복한다. 원격 주소와 Pages 설정이 같다면 3·6단계는 반복할 필요가 없다.

원본 코드 보관을 위한 커밋·push는 현재 개발 브랜치에서 별도로 진행한다. 위 배포 명령은 원본 코드의 커밋·push를 대신하지 않는다.

공식 참고: [GitHub Pages 배포 소스 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [gh-pages 사용법과 옵션](https://github.com/tschaub/gh-pages).
