# Community / Pro 에디션

FastImage는 공통 코드에서 두 에디션을 빌드할 수 있도록 구성합니다.

| 구분 | Community(무료) | Pro(유료) |
| --- | --- | --- |
| 앱 ID | `com.antigravity.fastimage` | `com.antigravity.fastimage.pro` |
| 제품명 | `FastImage` | `FastImage Pro` |
| 업데이트 저장소 | `cybereun/FastImageViewer` | `cybereun/FastImageViewer-Pro` (비공개) |
| 로컬 빌드 출력 | `dist-electron` | `dist-electron-pro` |

## 빌드

```powershell
npm run electron:build:community
npm run electron:build:pro
```

에디션 값은 다음 두 곳에 동시에 기록됩니다.

- Vite의 `VITE_EDITION`: 렌더러가 현재 에디션을 표시하고 Pro 전용 화면을 선택할 때 사용합니다.
- Electron 패키지의 `edition` 메타데이터: 메인 프로세스가 올바른 업데이트 저장소를 선택할 때 사용합니다.

값이 없으면 항상 Community로 동작합니다. 따라서 공개 저장소를 일반적으로 빌드해도 Pro 업데이트 채널로 잘못 연결되지 않습니다.

## 업데이트 동작

두 에디션은 서로 다른 앱 ID, 사용자 데이터 경로, 설치 경로, GitHub 릴리스 피드를 사용합니다.

- Community를 업데이트하면 Community 설치만 업데이트됩니다.
- Pro를 업데이트하면 Pro 설치만 업데이트됩니다.
- 공통 버그 수정은 같은 커밋에서 두 에디션을 모두 빌드해 각각의 릴리스로 배포할 수 있습니다. 이 경우 코드 수정은 한 번이지만 설치 파일과 업데이트 적용은 에디션별로 별도입니다.

따라서 두 에디션을 같은 앱 ID나 같은 업데이트 피드에 연결하면 안 됩니다. 그렇게 하면 무료 업데이트가 Pro 설치를 덮어쓸 수 있습니다.

## Pro 저장소 운영

공개 저장소에는 Community 코드와 빌드 기반만 둡니다. Pro 전용 UI·라이선스 검증·결제 연동은 `FastImageViewer-Pro` 비공개 저장소에서 관리하고, Pro 릴리스 workflow는 `npm run electron:build:pro`를 사용합니다. 공통 수정은 공개 저장소에서 먼저 반영한 뒤 Pro 저장소로 병합하고 두 릴리스를 같은 버전으로 발행합니다.

결제 서버 비밀키와 서명키는 소스나 렌더러 번들에 넣지 않고 GitHub Actions Secrets 또는 라이선스 서버에만 보관해야 합니다.

## Pro 업데이트 피드 준비

현재 `FastImageViewer-Pro`는 비공개 저장소이므로 일반 고객의 무인증 클라이언트가 GitHub Releases API를 직접 읽을 수 없습니다. 이 저장소의 Pro 릴리스는 소유자·테스트용으로 보관하고, 판매 전에는 라이선스 토큰을 확인하는 업데이트 게이트웨이(서명된 manifest와 다운로드 URL을 반환하는 서버)를 `pro`의 `releaseApiUrl`로 연결해야 합니다. GitHub PAT를 Pro 앱에 넣어 비공개 저장소를 읽게 하면 키가 유출되므로 사용하지 않습니다.
