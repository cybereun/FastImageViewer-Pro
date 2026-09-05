# FastImage 2.0

[![Latest Release](https://img.shields.io/github/v/release/cybereun/FastImageViewer?display_name=tag&sort=semver&style=flat-square)](https://github.com/cybereun/FastImageViewer/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/cybereun/FastImageViewer/release.yml?branch=main&label=build&style=flat-square)](https://github.com/cybereun/FastImageViewer/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0ea5e9.svg)](https://github.com/cybereun/FastImageViewer)

[English](README.en.md)

![FastImage 실행 화면](docs/fastimage-preview.png)

_FastImage v2.0.5 실제 실행 화면_

Windows용 로컬 우선 이미지 브라우저·정리 도구입니다. 폴더를 빠르게 스캔하고, 썸네일/뷰어/기본 편집/파일 정리를 한 앱에서 처리합니다.

개발자: **Lebi_Cybereun**<br />
저작권: **© 2026 Lebi_Cybereun**<br />
라이선스: [MIT License](LICENSE)<br />
문의: [cybereunny@gmail.com](mailto:cybereunny@gmail.com)


## 주요 기능

- Windows 탐색기 스타일 폴더 트리, 시스템 폴더·드라이브 종류별 아이콘, 최근 폴더 기억, 폴더 변경 감지
- 고정 디스크·USB·CD/DVD·네트워크 드라이브의 볼륨명·드라이브 문자·용량 표시
- 파일명 검색, 자연 정렬(이름·용량·날짜·평점), 형식·용량·날짜·평점 필터
- JPG/JPEG, PNG, GIF, BMP, WebP, SVG, ICO, TIFF, AVIF 지원
- 썸네일 지연 로딩 및 Electron 네이티브 메모리 캐시
- Ctrl/Shift 다중 선택, 키보드 탐색, 복사·잘라내기·붙여넣기, 일괄 복사/이동/삭제
- 충돌 안전 일괄 이름 변경 미리보기
- 즐겨찾기, 0–5점 평점, 색상 라벨, 태그 저장
- 검색/필터 결과와 동일한 컬렉션을 사용하는 뷰어
- 확대·축소·실제 픽셀·맞춤 보기, 커서 기준 줌, bounded pan, 회전, 슬라이드쇼, 전체화면
- 비파괴 편집 상태, Undo/Redo, 자르기 프리셋, 밝기·대비·채도, JPG/PNG/WebP Save As
- 동일 형식에 한해 명시적 원본 덮어쓰기와 Recycle Bin 삭제
- 한국어/영어, 다크/라이트 테마, 마우스 휠 동작, 삭제 확인 설정
- 이미지 파일/폴더 인수 실행과 Windows 파일 연결 설정
- 진단 정보 복사(이미지 데이터 및 업로드 없음)
- GitHub Release 확인, 업데이트 알림, SHA-256 검증, 포터블 EXE 자동 교체
- 앱 전체 하단 통합 푸터에 이미지 개수·처리 상태·우측 고정 버전 표시

## 기술 구조

- Electron + React 19 + TypeScript + Vite + Tailwind CSS
- `src/domain`: 순수 필터/정렬/선택 규칙과 단위 테스트
- `src/application`: 파일 레코드와 메타데이터를 화면 모델로 변환
- `electron`: 안전한 파일 작업, 썸네일, watcher, 설정 저장을 담당하는 IPC 경계
- 파일 삭제는 영구 삭제 대신 Windows Recycle Bin으로 이동합니다.

## 개발 환경

- Windows 10/11 권장
- Node.js 20.19 이상
- npm

## 설치 및 실행

```bash
git clone https://github.com/cybereun/FastImageViewer.git
cd FastImageViewer
npm ci
npm run electron:dev
```

검증 명령:

```bash
npm test
npm run typecheck
npm run build
```

## Windows 배포 빌드

```bash
npm run electron:build
```

출력 파일:

- `dist-electron/FastImage-2.3.1-Windows-Portable.exe`
- `dist-electron/FastImage-2.3.1-Windows-Setup.exe`
- `dist-electron/win-unpacked/`

`Windows-Portable.exe`는 설치 없이 실행하는 버전입니다. `Windows-Setup.exe`는 사용자별 설치 방식이며 설치 과정에서 바탕화면과 시작 메뉴에 FastImage 바로가기를 만듭니다.

무료 Community와 유료 Pro는 서로 다른 앱 ID와 업데이트 채널로 빌드합니다.

```bash
npm run electron:build:community  # dist-electron/
npm run electron:build:pro        # dist-electron-pro/
```

에디션 분리와 업데이트 정책은 [docs/EDITIONS.md](docs/EDITIONS.md)에 정리되어 있습니다.

## 자동 업데이트

포터블 앱과 설치형 앱은 실행 후 GitHub의 최신 안정 Release를 확인합니다. 새 버전이 있으면 안내창에서 릴리스 내용과 버전을 보여주며, `지금 업데이트`를 선택하면 사용 중인 배포 방식에 맞는 EXE를 HTTPS로 다운로드하고 SHA-256을 확인합니다. 포터블 앱은 실행파일을 교체하고, 설치형 앱은 Setup 설치파일을 자동 실행해 업데이트합니다. 다운로드가 끝나면 앱이 자동으로 종료·재시작합니다.

소스 커밋만으로는 실행파일이 만들어지지 않으므로, 새 버전은 반드시 `package.json` 버전을 올리고 같은 버전의 `vX.Y.Z` 태그를 GitHub에 전송해야 합니다.

```bash
npm test
npm run typecheck
git add .
git commit -m "release: FastImage X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

`.github/workflows/release.yml`이 태그를 받아 Windows 포터블 EXE와 설치형 Setup EXE를 빌드하고 GitHub Release에 업로드합니다. 인터넷이 없거나 GitHub Release에 현재 배포 방식에 맞는 자산이 없으면 업데이트하지 않고 현재 버전을 유지합니다.

## FastImage 2.0 작업 기록

사용자 원본 checkout은 `Y:\내 드라이브\AI\내가 만든 앱\Util\fast-image`에 보존하고, 작업용 복사본을 `L:\Codex-L\fast-image`에 만들어 기능을 구현했습니다. 구현 완료 후에는 L: 작업본을 검증하고 Git 원격 저장소와 Y: checkout에 동기화했습니다.

검증 결과와 수동 확인 항목은 [docs/FASTIMAGE-2.0-VERIFICATION.md](docs/FASTIMAGE-2.0-VERIFICATION.md)에 기록했습니다. 전체 변경 이력은 [CHANGELOG.md](CHANGELOG.md)에서 확인할 수 있습니다.

## 릴리스 버전 히스토리

- [`v2.3.1`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.3.1) — 상단 창 제어 바, 경로 주소 줄, 경계형 사이드바 토글 추가
- [`v2.3.0`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.3.0) — 리본 메뉴 통합, Pro 캡처·일괄 편집·중복 검색 기능 추가
- [`v2.1.0`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.1.0) — Community/Pro 에디션별 앱 ID·업데이트 채널·빌드 명령 추가
- [`v2.0.0`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.0) — 로컬 이미지 컬렉션, 안전한 일괄 파일 작업, 썸네일 캐시, 필터/메타데이터, 뷰어·편집기·설정 개선
- [`v2.0.1`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.1) — GitHub Release 기반 업데이트 확인, 알림, 다운로드·SHA-256 검증, 포터블 EXE 자동 교체
- [`v2.0.2`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.2) — 하단 이미지 탭 UI와 초기 버전 표시
- [`v2.0.3`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.3) — 왼쪽 탐색창 상태 표시와 같은 디자인의 통합 하단 푸터, 우측 버전 표시
- [`v2.0.4`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.4) — 업데이트 설치 후 앱 자동 종료·재시작, 다운로드 진행 용량 표시 및 설치 상태 개선
- [`v2.0.5`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.5) — 키보드 단축키 안내를 설정창으로 이동하고 썸네일 중복 원본 로딩 제거 및 캐시 개선
- [`v2.0.6`](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.6) — Windows 설치파일 추가, 바탕화면·시작 메뉴 바로가기 생성, 설치형 업데이트 지원
- `v1.0.0` — 폴더 탐색, 썸네일 그리드, 이미지 뷰어, 기본 편집기, 파일 작업

## 알려진 제한

- 모든 처리는 로컬에서 수행되며 클라우드 동기화는 제공하지 않습니다.
- GIF 등 애니메이션 이미지는 편집/변환 시 첫 프레임 기준으로 처리될 수 있습니다.
- 편집 저장은 EXIF/ICC 등 원본 메타데이터를 보존하지 않을 수 있습니다.
- 원본 덮어쓰기는 형식 불일치로 인한 파일 손상을 막기 위해 동일 MIME 형식에서만 활성화됩니다.
- 코드 서명이 없는 포터블 파일은 첫 실행 시 Windows SmartScreen 경고가 표시될 수 있습니다.
- 자동 업데이트는 Windows 포터블/설치형 빌드와 공개 GitHub Release만 지원합니다.

## 라이선스

[MIT License](LICENSE)
