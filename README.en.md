# FastImage 2.0

[![Latest Release](https://img.shields.io/github/v/release/cybereun/FastImageViewer?display_name=tag&sort=semver&style=flat-square)](https://github.com/cybereun/FastImageViewer/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/cybereun/FastImageViewer/release.yml?branch=main&label=build&style=flat-square)](https://github.com/cybereun/FastImageViewer/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0ea5e9.svg)](https://github.com/cybereun/FastImageViewer)

[한국어 README](README.md)

![FastImage application preview](docs/fastimage-preview.png)

_FastImage v2.0.5 real application preview_

FastImage is a local-first image browser and organizer for Windows. Scan folders quickly and manage thumbnails, viewing, basic editing, and file organization in one focused workspace.

Developer: **Lebi_Cybereun**<br />
Copyright: **© 2026 Lebi_Cybereun**<br />
License: [MIT License](LICENSE)<br />
Contact: [cybereunny@gmail.com](mailto:cybereunny@gmail.com)

## FastImage promo site

The bright, static product site in [FastImage-Web](https://github.com/cybereun/FastImage-Web) introduces FastImage and provides direct downloads for the available Windows releases. See the repository README for local preview and validation commands.

## Features

- Windows Explorer-style folder tree with system-folder and drive-type icons, recent-folder memory, and folder change detection
- Volume labels, drive letters, and capacity details for fixed, USB, CD/DVD, and network drives
- Filename search and natural sorting by name, size, date, or rating
- JPG/JPEG, PNG, GIF, BMP, WebP, SVG, ICO, TIFF, and AVIF support
- Lazy-loaded thumbnails with an Electron-native memory cache
- Ctrl/Shift multi-selection, keyboard navigation, copy/cut/paste, and batch copy/move/delete
- Collision-safe batch rename preview
- Favorites, 0–5 ratings, color labels, and saved tags
- A viewer that follows the same collection as the current search and filter results
- Zoom, actual-pixel and fit-to-view modes, cursor-centered zoom, bounded panning, rotation, slideshow, and fullscreen
- Non-destructive editing state, Undo/Redo, crop presets, brightness/contrast/saturation controls, and JPG/PNG/WebP Save As
- Explicit same-format overwrite support and Recycle Bin deletion
- Korean/English UI, dark/light themes, mouse-wheel behavior, and delete-confirmation settings
- Open image files or folders by passing them as arguments, plus Windows file associations
- Diagnostic information copy without image data or uploads
- GitHub Release update checks, update notifications, SHA-256 verification, and portable EXE replacement
- A unified bottom footer with item count, processing state, and a fixed right-side version label

## Architecture

- Electron + React 19 + TypeScript + Vite + Tailwind CSS
- src/domain: pure filtering, sorting, and selection rules with unit tests
- src/application: transforms file records and metadata into view models
- electron: IPC boundary for safe file operations, thumbnails, watchers, and settings
- Deletion moves files to the Windows Recycle Bin instead of permanently deleting them

## Requirements

- Windows 10/11 recommended
- Node.js 20.19 or newer
- npm

## Install and run from source

~~~
git clone https://github.com/cybereun/FastImageViewer.git
cd FastImageViewer
npm ci
npm run electron:dev
~~~

Verification commands:

~~~
npm test
npm run typecheck
npm run build
~~~

## Build Windows packages

~~~
npm run electron:build
~~~

The build produces:

- dist-electron/FastImage-2.3.0-Windows-Portable.exe
- dist-electron/FastImage-2.3.0-Windows-Setup.exe
- dist-electron/win-unpacked/

The portable executable runs without installation. The Setup executable installs per user and creates FastImage shortcuts in the Desktop and Start menu.

Community and Pro builds use separate app IDs and update channels:

~~~
npm run electron:build:community  # dist-electron/
npm run electron:build:pro        # dist-electron-pro/
~~~

The edition split and update policy are documented in [docs/EDITIONS.md](docs/EDITIONS.md).

## Automatic updates

Portable and installed builds check the latest stable GitHub Release after launch. When a newer version is available, the update dialog shows its version and release notes. Choosing Update now downloads the matching EXE over HTTPS and verifies its SHA-256 hash. Portable builds replace the running executable; installed builds launch the Setup installer. The app exits and restarts after the update is ready.

A source commit alone does not create an executable. For a new release, update the version in package.json and push the matching vX.Y.Z tag:

~~~
npm test
npm run typecheck
git add .
git commit -m "release: FastImage X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
~~~

The .github/workflows/release.yml workflow builds and uploads the Windows portable and Setup packages when it receives a tag. If the network is unavailable or the matching asset is missing from the public GitHub Release, the app keeps the current version.

## FastImage 2.0 work record

The original checkout is preserved at Y:/내 드라이브/AI/내가 만든 앱/Util/fast-image; implementation work is performed in L:/Codex-L/fast-image. After verification, the worktree is synchronized with the Git remote and the Y: checkout.

Verification results and manual checks are recorded in [docs/FASTIMAGE-2.0-VERIFICATION.md](docs/FASTIMAGE-2.0-VERIFICATION.md). The complete change history is in [CHANGELOG.md](CHANGELOG.md).

## Release history

- [v2.3.0](https://github.com/cybereun/FastImageViewer/releases/tag/v2.3.0) — Unified ribbon tabs, Pro capture, batch editing, and duplicate search
- [v2.1.0](https://github.com/cybereun/FastImageViewer/releases/tag/v2.1.0) — Separate Community/Pro app IDs, update channels, and build commands
- [v2.0.0](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.0) — Local image collections, safe batch file operations, thumbnail cache, filters/metadata, and viewer/editor improvements
- [v2.0.1](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.1) — GitHub Release update checks, notifications, downloads, SHA-256 verification, and portable EXE replacement
- [v2.0.2](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.2) — Bottom image tabs and initial version visibility
- [v2.0.3](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.3) — Unified bottom footer matching the navigation pane and a fixed right-side version label
- [v2.0.4](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.4) — Download size/progress visibility and a smoother automatic restart after update installation
- [v2.0.5](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.5) — Keyboard help moved to Settings, duplicate original-image loading removed, and cache flow improved
- [v2.0.6](https://github.com/cybereun/FastImageViewer/releases/tag/v2.0.6) — Windows installer, Desktop/Start menu shortcuts, and installed-build update support
- v1.0.0 — Folder navigation, thumbnail grid, image viewer, basic editor, and file operations

## Known limitations

- All processing is local; cloud synchronization is not provided.
- Animated images such as GIFs may be processed from their first frame during editing or conversion.
- EXIF/ICC and other original metadata may not be preserved when saving edits.
- Original overwrite is enabled only for matching MIME types to avoid format-related corruption.
- Unsigned portable builds may show a Windows SmartScreen warning on first launch.
- Automatic updates support Windows portable/installed builds and public GitHub Releases.

## License

[MIT License](LICENSE)
