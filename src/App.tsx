import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  FolderOpen,
  FolderPlus,
  Info,
  Minus,
  PanelLeft,
  PanelLeftClose,
  Printer,
  RefreshCw,
  Save,
  Settings,
  Square,
  SquareStack,
  X,
} from 'lucide-react';
import { FileExplorer } from './components/FileExplorer';
import { ImageViewer } from './components/ImageViewer';
import { SettingsModal } from './components/SettingsModal';
import { StatusFooter } from './components/StatusFooter';
import { Toast } from './components/Toast';
import { ThumbnailGrid, type SelectionSummary } from './components/ThumbnailGrid';
import { UpdateDialog } from './components/UpdateDialog';
import { useImageStore } from './hooks/useImageStore';
import { BUILD_EDITION, getEditionLabel } from './application/edition';
import type { ImageFile, UpdateCheckResult, UpdateDownloadProgress, UpdateInfo } from './types';
import { cn } from './utils/cn';
import { t } from './i18n';

function getParentFolderPath(folderPath: string | null): string | null {
  if (!folderPath) return null;
  const trimmed = folderPath.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(trimmed)) return null;
  const separator = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (separator < 0) return null;
  if (separator === 2 && /^[A-Za-z]:/.test(trimmed)) return `${trimmed.slice(0, 2)}\\`;
  return trimmed.slice(0, separator) || null;
}

function samePath(left: string | null, right: string | null): boolean {
  if (!left || !right) return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

function ChromeAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400/70',
        danger ? 'hover:bg-red-600 hover:text-white' : 'hover:bg-gray-700 hover:text-white',
        disabled && 'cursor-not-allowed opacity-35 hover:bg-transparent hover:text-gray-400',
      )}
    >
      <Icon size={15} strokeWidth={1.9} />
    </button>
  );
}

export function App() {
  const {
    images,
    folders,
    selectedFolder,
    selectedFolderLabel,
    collectionKind,
    preferences,
    setSelectedFolder,
    processFiles,
    openFiles,
    loading,
    error,
    openDirectory,
    openFolderPath,
    toggleFolder,
    refreshRootFolders,
    refreshSelectedFolder,
    updatePreferences,
    updateImageMetadata,
    renameImage,
    renameImages,
    copyImagesToFolder,
    moveImagesToFolder,
    deleteImages,
  } = useImageStore();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<ImageFile[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerSlideshow, setViewerSlideshow] = useState(false);
  const [activeImage, setActiveImage] = useState<ImageFile | null>(null);
  const [folderHistory, setFolderHistory] = useState<{ back: string[]; forward: string[] }>({ back: [], forward: [] });
  const previousFolderRef = useRef<string | null>(selectedFolder);
  const historyNavigationRef = useRef<'back' | 'forward' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(preferences.sidebarOpen);
  const [isMaximized, setIsMaximized] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [updateOutcome, setUpdateOutcome] = useState<Awaited<ReturnType<Window['electron']['getUpdateOutcome']>>>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updateAction, setUpdateAction] = useState<'idle' | 'downloading' | 'installing' | 'error'>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionSummary>({
    count: 0,
    bytes: 0,
    width: null,
    height: null,
    mixedDimensions: false,
  });

  useEffect(() => {
    let active = true;
    void window.electron.rendererReady().catch(() => undefined);
    const poll = async () => {
      const result = await window.electron.getUpdateOutcome().catch(() => null);
      if (!active || !result) return;
      clearInterval(timer);
      if (localStorage.getItem('fastimage-dismissed-update') !== result.id) setUpdateOutcome(result);
    };
    const timer = window.setInterval(() => void poll(), 1000);
    void poll();
    const deadline = window.setTimeout(() => clearInterval(timer), 300_000);
    return () => { active = false; clearInterval(timer); clearTimeout(deadline); };
  }, []);

  useEffect(() => {
    let active = true;
    void window.electron.getAppVersion().then((version) => {
      if (active) setAppVersion(version);
    }).catch(() => undefined);
    const unsubscribeAvailable = window.electron.onUpdateAvailable((update) => {
      setUpdateInfo(update);
      setUpdateProgress(null);
      setUpdateAction('idle');
      setUpdateError(null);
      setUpdateDialogOpen(true);
    });
    const unsubscribeProgress = window.electron.onUpdateDownloadProgress((progress) => {
      setUpdateProgress(progress);
    });
    return () => {
      active = false;
      unsubscribeAvailable();
      unsubscribeProgress();
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = preferences.language;
  }, [preferences.language]);

  useEffect(() => {
    let active = true;
    window.electron.isMaximized().then((value) => {
      if (active) setIsMaximized(value);
    }).catch(() => undefined);
    const unsubscribe = window.electron.onWindowMaximizedChanged((value) => setIsMaximized(value));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(preferences.sidebarOpen);
  }, [preferences.sidebarOpen]);

  useEffect(() => {
    if (!aboutOpen && !settingsOpen) return;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAboutOpen(false);
      setSettingsOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [aboutOpen, settingsOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (viewerOpen && viewerImages.length === 0) setViewerOpen(false);
  }, [viewerImages.length, viewerOpen]);

  useEffect(() => {
    const previous = previousFolderRef.current;
    if (samePath(previous, selectedFolder)) return;
    const historyAction = historyNavigationRef.current;
    historyNavigationRef.current = null;
    if (!historyAction && previous) {
      setFolderHistory((current) => ({
        back: [...current.back.filter((path) => !samePath(path, previous)), previous].slice(-40),
        forward: [],
      }));
    }
    previousFolderRef.current = selectedFolder;
  }, [selectedFolder]);

  useEffect(() => {
    if (viewerImages.length === 0) return;
    setViewerImages((previous) => previous
      .filter((image) => images.some((candidate) => candidate.id === image.id))
      .map((image) => images.find((candidate) => candidate.id === image.id) ?? image));
    setViewerIndex((previous) => Math.max(0, Math.min(previous, Math.max(0, viewerImages.length - 1))));
  }, [images, viewerImages.length]);

  const handleImageClick = useCallback((index: number, collection: ImageFile[]) => {
    setViewerImages(collection);
    setViewerIndex(index);
    setViewerSlideshow(false);
    setViewerOpen(true);
  }, []);

  const handleStartSlideshow = useCallback((index: number, collection: ImageFile[]) => {
    setViewerImages(collection);
    setViewerIndex(index);
    setViewerSlideshow(true);
    setViewerOpen(true);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setViewerSlideshow(false);
  }, []);

  const handleSelectionChange = useCallback((summary: SelectionSummary) => {
    setSelection(summary);
  }, []);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((previous) => {
      const next = !previous;
      updatePreferences({ sidebarOpen: next });
      return next;
    });
  }, [updatePreferences]);

  const handleSaveAs = useCallback(() => {
    if (!activeImage) {
      setNotice(preferences.language === 'ko' ? '이미지를 먼저 선택하세요.' : 'Select an image first.');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = activeImage.url;
    anchor.download = activeImage.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setNotice(preferences.language === 'ko' ? '이미지를 저장했습니다.' : 'Image saved.');
  }, [activeImage, preferences.language]);

  const handlePrint = useCallback(() => {
    if (!activeImage) {
      setNotice(preferences.language === 'ko' ? '이미지를 먼저 선택하세요.' : 'Select an image first.');
      return;
    }
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      setNotice(preferences.language === 'ko' ? '인쇄 창을 열려면 팝업을 허용하세요.' : 'Allow pop-ups to print the image.');
      return;
    }
    const documentRef = printWindow.document;
    documentRef.title = activeImage.name;
    documentRef.body.style.cssText = 'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;';
    const image = documentRef.createElement('img');
    image.src = activeImage.url;
    image.alt = activeImage.name;
    image.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
    image.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
    documentRef.body.appendChild(image);
    setNotice(preferences.language === 'ko' ? '인쇄 창을 열었습니다.' : 'Print window opened.');
  }, [activeImage, preferences.language]);

  const handleNavigateBack = useCallback(async () => {
    const target = folderHistory.back[folderHistory.back.length - 1];
    if (!target) return;
    const current = selectedFolder;
    setFolderHistory((history) => ({
      back: history.back.slice(0, -1),
      forward: current && !history.forward.some((path) => samePath(path, current)) ? [...history.forward, current] : history.forward,
    }));
    historyNavigationRef.current = 'back';
    try {
      await openFolderPath(target);
    } catch (navigateError) {
      historyNavigationRef.current = null;
      setNotice(navigateError instanceof Error ? navigateError.message : (preferences.language === 'ko' ? '이전 폴더를 열지 못했습니다.' : 'Unable to open the previous folder.'));
    }
  }, [folderHistory.back, openFolderPath, preferences.language, selectedFolder]);

  const handleNavigateForward = useCallback(async () => {
    const target = folderHistory.forward[folderHistory.forward.length - 1];
    if (!target) return;
    const current = selectedFolder;
    setFolderHistory((history) => ({
      back: current && !history.back.some((path) => samePath(path, current)) ? [...history.back, current] : history.back,
      forward: history.forward.slice(0, -1),
    }));
    historyNavigationRef.current = 'forward';
    try {
      await openFolderPath(target);
    } catch (navigateError) {
      historyNavigationRef.current = null;
      setNotice(navigateError instanceof Error ? navigateError.message : (preferences.language === 'ko' ? '다음 폴더를 열지 못했습니다.' : 'Unable to open the next folder.'));
    }
  }, [folderHistory.forward, openFolderPath, preferences.language, selectedFolder]);

  const handleNewFolder = useCallback(async () => {
    if (!selectedFolder) {
      setNotice(preferences.language === 'ko' ? '새 폴더를 만들 폴더를 먼저 선택하세요.' : 'Select a folder before creating a new folder.');
      return;
    }
    const suggestedName = preferences.language === 'ko' ? '새 폴더' : 'New folder';
    const directoryName = window.prompt(preferences.language === 'ko' ? '새 폴더 이름' : 'New folder name', suggestedName)?.trim();
    if (!directoryName) return;
    try {
      await window.electron.createDirectory(selectedFolder, directoryName);
      await refreshSelectedFolder();
      setNotice(preferences.language === 'ko' ? `폴더 '${directoryName}'을 만들었습니다.` : `Created folder '${directoryName}'.`);
    } catch (createError) {
      setNotice(createError instanceof Error ? createError.message : (preferences.language === 'ko' ? '새 폴더를 만들지 못했습니다.' : 'Unable to create the folder.'));
    }
  }, [preferences.language, refreshSelectedFolder, selectedFolder]);

  const handleNavigateUp = useCallback(async () => {
    const parentPath = getParentFolderPath(selectedFolder);
    if (!parentPath) return;
    try {
      await openFolderPath(parentPath);
    } catch (navigateError) {
      setNotice(navigateError instanceof Error
        ? navigateError.message
        : (preferences.language === 'ko' ? '상위 폴더를 열지 못했습니다.' : 'Unable to open the parent folder.'));
    }
  }, [openFolderPath, preferences.language, selectedFolder]);

  const handleImageDropToFolder = useCallback(
    async ({ imagePaths, targetFolderPath, move }: { imagePaths: string[]; targetFolderPath: string; move: boolean }) => {
      const result = move
        ? await moveImagesToFolder(imagePaths, targetFolderPath)
        : await copyImagesToFolder(imagePaths, targetFolderPath);
      if (result.failed.length > 0) {
        setNotice(`${result.succeeded.length} completed, ${result.failed.length} failed.`);
      } else {
        setNotice(`${result.succeeded.length} image(s) ${move ? 'moved' : 'copied'}.`);
      }
    },
    [copyImagesToFolder, moveImagesToFolder]
  );

  const copyDiagnostics = useCallback(async () => {
    const report = [
      `FastImage ${appVersion}`,
      `Platform: ${window.navigator.platform}`,
      `Collection: ${collectionKind}`,
      `Visible items: ${images.length}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(report);
      setNotice(t(preferences.language, 'diagnosticsCopied'));
    } catch {
      setNotice('Unable to copy diagnostics.');
    }
  }, [appVersion, collectionKind, images.length, preferences.language]);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateError(null);
    const result: UpdateCheckResult = await window.electron.checkForUpdates();
    if (result.status === 'available') {
      setUpdateInfo(result.update);
      setUpdateProgress(null);
      setUpdateAction('idle');
      setUpdateDialogOpen(true);
      return;
    }
    if (result.status === 'up-to-date') {
      setNotice(t(preferences.language, 'upToDate'));
      return;
    }
    setNotice(result.status === 'development'
      ? t(preferences.language, 'updateDevelopment')
      : result.status === 'unsupported'
        ? t(preferences.language, 'updateUnsupported')
        : `${t(preferences.language, 'updateCheckFailed')} ${result.message}`);
  }, [preferences.language]);

  const handleUpdateNow = useCallback(async () => {
    if (!updateInfo) return;
    setUpdateAction('downloading');
    setUpdateProgress(null);
    setUpdateError(null);
    const downloadResult = await window.electron.downloadUpdate();
    if (downloadResult.status !== 'downloaded') {
      setUpdateAction('error');
      const message = 'message' in downloadResult ? downloadResult.message : undefined;
      setUpdateError(message ?? t(preferences.language, 'updateCheckFailed'));
      return;
    }
    setUpdateAction('installing');
    const installResult = await window.electron.installUpdate();
    if (installResult.status !== 'restarting') {
      setUpdateAction('error');
      setUpdateError(installResult.message);
    }
  }, [preferences.language, updateInfo]);

  const viewPreferences = {
    viewSize: preferences.viewSize,
    sortMode: preferences.sortMode,
    sortDirection: preferences.sortDirection,
  };

  return (
    <div className={cn('fast-image-app flex h-screen w-screen flex-col overflow-hidden text-white', preferences.theme === 'light' ? 'theme-light' : 'theme-dark')} data-theme={preferences.theme}>
      {updateOutcome && (
        <div role="status" className={cn('flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-sm', updateOutcome.phase === 'completed' ? 'bg-emerald-950 text-emerald-100' : 'bg-amber-950 text-amber-100')}>
          <span>
            {updateOutcome.phase === 'completed'
              ? (preferences.language === 'ko' ? `버전 ${updateOutcome.version} 업데이트와 재실행이 완료되었습니다.` : `Updated to ${updateOutcome.version} and restarted successfully.`)
              : updateOutcome.phase === 'rolled-back'
                ? (preferences.language === 'ko' ? '업데이트 실행에 실패하여 이전 버전으로 복구했습니다. 앱을 계속 사용할 수 있습니다.' : 'The update could not start. The previous version has been restored.')
                : (preferences.language === 'ko' ? '이전 업데이트를 완료하지 못했습니다. 업데이트를 다시 시도해주세요.' : 'The previous update did not complete. Please try again.')}
          </span>
          <button className="shrink-0 rounded px-2 py-1 hover:bg-white/10" onClick={() => {
            localStorage.setItem('fastimage-dismissed-update', updateOutcome.id);
            setUpdateOutcome(null);
          }} aria-label={preferences.language === 'ko' ? '닫기' : 'Dismiss'}><X size={16} /></button>
        </div>
      )}
      <div
        className="relative flex h-9 min-h-9 shrink-0 items-center gap-2 border-b border-gray-800 bg-[#1e1e1e] px-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        aria-label={preferences.language === 'ko' ? '빠른 실행 및 창 제어' : 'Quick access and window controls'}
      >
        <div className="flex shrink-0 items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ChromeAction
            icon={FolderOpen}
            label={t(preferences.language, 'openFolder')}
            onClick={() => void openDirectory()}
          />
          <ChromeAction
            icon={FolderPlus}
            label={preferences.language === 'ko' ? '새 폴더' : 'New folder'}
            onClick={() => void handleNewFolder()}
          />
          <ChromeAction
            icon={Save}
            label={preferences.language === 'ko' ? '다른 이름으로 저장' : 'Save as'}
            onClick={handleSaveAs}
            disabled={!activeImage}
          />
          <ChromeAction
            icon={Printer}
            label={preferences.language === 'ko' ? '인쇄' : 'Print'}
            onClick={handlePrint}
            disabled={!activeImage}
          />
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 w-[40%] -translate-x-1/2 -translate-y-1/2 truncate text-center text-xs text-gray-400">
          <span className="font-semibold text-gray-200">FastImage</span>
          {appVersion && <span className="ml-1 text-gray-400">{appVersion}</span>}
          <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500">{getEditionLabel(BUILD_EDITION)}</span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ChromeAction
            icon={RefreshCw}
            label={preferences.language === 'ko' ? '현재 폴더 새로고침' : 'Refresh folder'}
            onClick={() => void refreshSelectedFolder()}
            disabled={!selectedFolder || loading}
          />
          <ChromeAction
            icon={FolderOpen}
            label={t(preferences.language, 'openFolder')}
            onClick={() => void openDirectory()}
          />
          <ChromeAction
            icon={Settings}
            label={t(preferences.language, 'settings')}
            onClick={() => setSettingsOpen(true)}
          />
          <ChromeAction
            icon={Info}
            label={t(preferences.language, 'about')}
            onClick={() => setAboutOpen(true)}
          />
          <div className="mx-1 h-4 w-px bg-gray-700" />
          <ChromeAction icon={Minus} label={preferences.language === 'ko' ? '최소화' : 'Minimize'} onClick={() => window.electron.minimizeWindow()} />
          <ChromeAction
            icon={isMaximized ? SquareStack : Square}
            label={isMaximized ? (preferences.language === 'ko' ? '복원' : 'Restore') : (preferences.language === 'ko' ? '최대화' : 'Maximize')}
            onClick={() => window.electron.toggleMaximizeWindow()}
          />
          <ChromeAction
            icon={X}
            label={preferences.language === 'ko' ? '닫기' : 'Close'}
            onClick={() => window.electron.closeWindow()}
            danger
          />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'shrink-0 overflow-hidden border-r border-gray-800 transition-all duration-300 ease-in-out',
            sidebarOpen ? 'w-72' : 'w-0'
          )}
        >
          <FileExplorer
            folders={folders}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            onToggleFolder={toggleFolder}
            onImageDropToFolder={handleImageDropToFolder}
            onOpenDirectory={() => void openDirectory()}
            onOpenFiles={() => void openFiles()}
            onRefreshRoots={refreshRootFolders}
            onLoadFiles={processFiles}
            totalCount={images.length}
            loading={loading}
            language={preferences.language}
          />
        </div>

        <button
          type="button"
          onClick={handleSidebarToggle}
          className="absolute top-1/2 z-40 flex h-7 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-600 bg-gray-900 text-gray-400 shadow-lg transition-colors hover:border-teal-400 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-400/70"
          style={{
            left: sidebarOpen ? '18rem' : '0.875rem',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          title={sidebarOpen ? (preferences.language === 'ko' ? '사이드바 닫기' : 'Hide sidebar') : (preferences.language === 'ko' ? '사이드바 열기' : 'Show sidebar')}
          aria-label={sidebarOpen ? (preferences.language === 'ko' ? '사이드바 닫기' : 'Hide sidebar') : (preferences.language === 'ko' ? '사이드바 열기' : 'Show sidebar')}
        >
          {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
        </button>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0d0d0d]">
          {error && (
            <div className="flex items-center gap-2 border-b border-red-900/60 bg-red-950/40 px-4 py-2 text-xs text-red-200" role="alert">
              <AlertCircle size={14} />
              <span className="truncate">{error}</span>
            </div>
          )}
          <div className="relative flex-1 overflow-hidden">
            {loading && images.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">Scanning images…</div>
            ) : (
              <ThumbnailGrid
                images={images}
                currentFolderPath={selectedFolder}
                collectionKey={`${collectionKind}:${selectedFolder ?? selectedFolderLabel}`}
                onImageClick={handleImageClick}
                onRenameImage={renameImage}
                onRenameImages={renameImages}
                onCopyImages={copyImagesToFolder}
                onMoveImages={moveImagesToFolder}
                onDeleteImages={deleteImages}
                confirmDelete={preferences.confirmDelete}
                onUpdateImageMetadata={updateImageMetadata}
                viewPreferences={viewPreferences}
                onViewPreferencesChange={updatePreferences}
                onSelectionChange={handleSelectionChange}
                onOpenFolder={() => void openDirectory()}
                onOpenFiles={() => void openFiles()}
                onNewFolder={() => void handleNewFolder()}
                onRefresh={() => void refreshSelectedFolder()}
                onSettings={() => setSettingsOpen(true)}
                onAbout={() => setAboutOpen(true)}
                onCheckForUpdates={() => void handleCheckForUpdates()}
                onClose={() => window.electron.closeWindow()}
                onNavigateUp={() => void handleNavigateUp()}
                onNavigateBack={() => void handleNavigateBack()}
                onNavigateForward={() => void handleNavigateForward()}
                canNavigateBack={folderHistory.back.length > 0}
                canNavigateForward={folderHistory.forward.length > 0}
                onStartSlideshow={handleStartSlideshow}
                onActiveImageChange={setActiveImage}
                language={preferences.language}
              />
            )}
          </div>
        </div>
      </div>

      <StatusFooter
        totalCount={images.length}
        loading={loading}
        language={preferences.language}
        appVersion={appVersion}
        onVersionClick={() => setAboutOpen(true)}
        selection={selection}
      />

      {viewerOpen && viewerImages.length > 0 && (
        <ImageViewer
          images={viewerImages}
          currentIndex={viewerIndex}
          onClose={handleCloseViewer}
          onIndexChange={setViewerIndex}
          wheelNavigation={preferences.wheelNavigation}
          autoPlay={viewerSlideshow}
          onUpdateImageMetadata={updateImageMetadata}
        />
      )}

      {aboutOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4" role="presentation" onClick={() => setAboutOpen(false)}>
          <section className="w-[760px] max-w-full rounded-xl border border-gray-700 bg-[#1a1a1a] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="about-title" className="text-lg font-semibold text-white">FastImage {appVersion}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {preferences.language === 'ko' ? '개발자: Lebi_Cybereun' : 'Developer: Lebi_Cybereun'}
                  {' · '}
                  {preferences.language === 'ko' ? '에디션' : 'Edition'}: {getEditionLabel(BUILD_EDITION)}
                </p>
              </div>
              <button onClick={() => setAboutOpen(false)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white" title="Close" aria-label="Close about">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-gray-700 bg-[#101010] p-4">
              <h3 className="mb-2 text-sm font-medium text-gray-200">FastImage 2.0</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-gray-300">
                <li>로컬 폴더와 선택 파일을 빠르게 탐색하는 이미지 컬렉션</li>
                <li>검색·정렬·평점·즐겨찾기·다중 선택·일괄 파일 작업</li>
                <li>썸네일 캐시, 폴더 변경 감지, 최근 폴더 기억</li>
                <li>확대·축소·슬라이드쇼·간단한 편집과 포맷 변환</li>
                <li>이미지는 외부 서버로 업로드되지 않고 로컬에서 처리됩니다.</li>
              </ul>
              <button onClick={() => void copyDiagnostics()} className="mt-4 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
                Copy diagnostics (no image data)
              </button>
              <button onClick={() => void handleCheckForUpdates()} className="mt-4 ml-2 rounded-md border border-blue-700/60 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-950/40">
                {t(preferences.language, 'updateCheck')}
              </button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && <SettingsModal preferences={preferences} onChange={updatePreferences} onClose={() => setSettingsOpen(false)} />}
      {updateDialogOpen && updateInfo && (
        <UpdateDialog
          language={preferences.language}
          update={updateInfo}
          currentVersion={appVersion}
          action={updateAction}
          progress={updateProgress}
          error={updateError}
          onUpdate={() => void handleUpdateNow()}
          onClose={() => setUpdateDialogOpen(false)}
        />
      )}
      <Toast message={notice} />
    </div>
  );
}
