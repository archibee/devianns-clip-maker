# GitHub Pages 배포

PowerShell 기준이다. 로컬에서 빌드한 `dist` 내용만 배포 전용 `gh-pages` 브랜치에 올린다. 직접 Actions 설정 파일을 작성할 필요는 없으며, GitHub 내부 배포 워크플로는 자동으로 실행될 수 있다. GitHub에 push할 수 있는 인증과 권한이 필요하다.

## 1. 최초 한 번 설정

프로젝트 폴더에서 원격 저장소를 확인한다.

```powershell
cd C:\Users\USER\Desktop\ssg-clip-maker
git remote get-url origin
```

실제 저장소 주소와 다르면 변경한다.

```powershell
git remote set-url origin https://github.com/devianns/devianns-clip-maker.git
```

아래의 빌드·배포를 처음 실행한 뒤 GitHub 저장소의 **Settings → Pages**에서 설정한다.

- Source: **Deploy from a branch**
- Branch: **gh-pages**
- Folder: **/ (root)**
- **Save** 후 같은 화면에 표시되는 배포 주소를 확인한다.

## 2. 코드 수정 후 빌드·배포

새 PowerShell 터미널에서는 ①부터 순서대로 실행한다. 각 명령이 성공한 경우에만 다음 명령으로 진행한다.

① 프로젝트 폴더와 Node 경로 설정

```powershell
cd C:\Users\USER\Desktop\ssg-clip-maker
$env:PATH = "$PWD\.tools\node-v24.22.3-win-x64;$env:PATH"
```

시스템에 Node.js가 설치되어 있다면 PATH 설정은 생략할 수 있다.

② 의존성 설치 — 최초 실행 또는 `package-lock.json` 변경 시

```powershell
npm.cmd ci
```

③ 최신 코드 빌드 — 실패하면 배포하지 말고 오류를 수정한다.

```powershell
npm.cmd run build
```

④ 빌드 결과를 배포 브랜치에 업로드

```powershell
npx.cmd --yes gh-pages@6.3.0 -d dist -b gh-pages --nojekyll
```

`Published`가 표시되면 업로드가 끝난 것이다. GitHub Pages의 반영이 끝난 뒤 사이트를 새로고침한다. 이 명령은 배포 브랜치의 파일을 최신 `dist` 내용으로 갱신하므로 `gh-pages`에는 배포 파일만 둔다. 로컬에서 `gh-pages` 브랜치로 전환할 필요는 없다.

⑤ 원본 코드도 GitHub에 보관하려면 현재 개발 브랜치에서 별도로 커밋·push한다. 위 배포 명령은 원본 코드의 커밋·push를 대신하지 않는다.

공식 참고: [GitHub Pages 브랜치 배포](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [gh-pages 명령 옵션](https://github.com/tschaub/gh-pages/blob/main/bin/gh-pages.js).
