import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Camera,
  CheckSquare,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Copy,
  Download,
  Eye,
  FileOutput,
  FileText,
  Film,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Grid3X3,
  Image,
  Info,
  Keyboard,
  LayoutGrid,
  List,
  LockKeyhole,
  Maximize2,
  Monitor,
  Pencil,
  Play,
  Power,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Tags,
  Trash2,
  Undo2,
  Wrench,
} from 'lucide-react';
import type { AppEdition, SortDirection, SortMode, ViewSize } from '../types';
import type { Language } from '../i18n';
import { cn } from '../utils/cn';

export type RibbonTabId = 'file' | 'home' | 'edit' | 'view' | 'tools' | 'help';
export type RibbonProFeature = 'capture' | 'batch-edit' | 'advanced-export' | 'duplicate-search';

interface RibbonProps {
  language: Language;
  edition: AppEdition;
  selectedCount: number;
  itemCount: number;
  hasActiveImage: boolean;
  viewSize: ViewSize;
  sortMode: SortMode;
  sortDirection: SortDirection;
  onOpenFolder?: () => void;
  onOpenFiles?: () => void;
  onRefresh?: () => void;
  onSettings?: () => void;
  onAbout?: () => void;
  onCheckForUpdates?: () => void;
  onClose?: () => void;
  onOpenActive?: () => void;
  onViewSizeChange: (size: ViewSize) => void;
  onSortModeChange: (mode: SortMode) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onClearSelection: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
  onBatchRename: () => void;
  onNotify?: (message: string) => void;
  onProFeature?: (feature: RibbonProFeature) => void;
}

interface RibbonButtonProps {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  active?: boolean;
  compact?: boolean;
  tone?: 'default' | 'accent' | 'danger';
}

function RibbonButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled = false,
  locked = false,
  active = false,
  compact = false,
  tone = 'default',
}: RibbonButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'group relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-md px-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400/70',
        compact ? 'min-w-[58px] py-1 text-[10px]' : 'min-w-[68px] py-1.5 text-[11px]',
        active ? 'bg-teal-600/25 text-teal-200' : 'text-gray-300 hover:bg-gray-700/80 hover:text-white',
        tone === 'accent' && !active && 'text-teal-300 hover:bg-teal-700/25 hover:text-teal-100',
        tone === 'danger' && 'text-red-300 hover:bg-red-900/30 hover:text-red-100',
        locked && 'text-amber-300/80 hover:bg-amber-900/20 hover:text-amber-100',
        disabled && 'cursor-not-allowed opacity-35 hover:bg-transparent hover:text-gray-300',
      )}
    >
      <span className="relative flex h-6 items-center justify-center">
        <Icon size={compact ? 16 : 20} strokeWidth={1.8} />
        {locked && (
          <span className="absolute -right-2 -top-2 rounded-full bg-amber-500/90 p-0.5 text-gray-950 shadow" aria-hidden="true">
            <LockKeyhole size={9} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className="max-w-[86px] truncate leading-tight">{label}</span>
    </button>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-r border-gray-700/80 px-2 first:pl-0 last:border-r-0">
      <div className="flex min-h-[66px] items-stretch justify-center gap-1">{children}</div>
      <span className="mt-0.5 text-center text-[10px] font-medium tracking-wide text-gray-500">{label}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-400/70"
    >
      <Icon size={15} strokeWidth={1.9} />
    </button>
  );
}

export function Ribbon({
  language,
  edition,
  selectedCount,
  itemCount,
  hasActiveImage,
  viewSize,
  sortMode,
  sortDirection,
  onOpenFolder,
  onOpenFiles,
  onRefresh,
  onSettings,
  onAbout,
  onCheckForUpdates,
  onClose,
  onOpenActive,
  onViewSizeChange,
  onSortModeChange,
  onSortDirectionChange,
  onSelectAll,
  onInvertSelection,
  onClearSelection,
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDelete,
  onBatchRename,
  onNotify,
  onProFeature,
}: RibbonProps) {
  const ko = language === 'ko';
  const [activeTab, setActiveTab] = useState<RibbonTabId>('home');

  const text = {
    tabs: {
      file: ko ? '파일' : 'File',
      home: ko ? '홈' : 'Home',
      edit: ko ? '편집' : 'Edit',
      view: ko ? '보기' : 'View',
      tools: ko ? '도구' : 'Tools',
      help: ko ? '도움말' : 'Help',
    },
    groups: {
      quick: ko ? '빠른 실행' : 'Quick access',
      connect: ko ? '연결 기능' : 'Connect',
      mode: ko ? '모드' : 'Mode',
      rotate: ko ? '회전' : 'Rotate',
      viewFormat: ko ? '보기 형식' : 'View format',
      clipboard: ko ? '클립보드' : 'Clipboard',
      image: ko ? '이미지' : 'Image',
      selection: ko ? '선택' : 'Selection',
      sort: ko ? '정렬' : 'Sort',
      explore: ko ? '탐색' : 'Explore',
      advanced: ko ? '고급' : 'Advanced',
      refresh: ko ? '갱신' : 'Refresh',
      changes: ko ? '변경' : 'Changes',
      export: ko ? '내보내기' : 'Export',
      organize: ko ? '정리' : 'Organize',
      support: ko ? '지원' : 'Support',
    },
    openFolder: ko ? '폴더 열기' : 'Open folder',
    openImages: ko ? '이미지 열기' : 'Open images',
    newFolder: ko ? '새 폴더' : 'New folder',
    saveAs: ko ? '다른 이름으로 저장' : 'Save as',
    print: ko ? '인쇄' : 'Print',
    cameraInfo: ko ? '카메라 정보' : 'Camera info',
    properties: ko ? '파일 속성' : 'Properties',
    update: ko ? '온라인 업데이트' : 'Online update',
    settings: ko ? '환경설정' : 'Settings',
    exit: ko ? '종료' : 'Exit',
    viewer: ko ? '크게 보기' : 'Viewer',
    slideshow: ko ? '연속 보기' : 'Slideshow',
    fullscreen: ko ? '전체 화면' : 'Fullscreen',
    rotateLeft: ko ? '-90° 회전' : 'Rotate -90°',
    rotateRight: ko ? '90° 회전' : 'Rotate 90°',
    preview: ko ? '미리보기' : 'Preview',
    simple: ko ? '간단히' : 'Simple',
    largeIcons: ko ? '큰 아이콘' : 'Large icons',
    details: ko ? '자세히' : 'Details',
    filmstrip: ko ? '필름스트립' : 'Filmstrip',
    paste: ko ? '붙여넣기' : 'Paste',
    cut: ko ? '잘라내기' : 'Cut',
    copy: ko ? '복사' : 'Copy',
    delete: ko ? '삭제' : 'Delete',
    rename: ko ? '이름 변경' : 'Rename',
    batchRename: ko ? '일괄 이름 변경' : 'Batch rename',
    selectAll: ko ? '모두 선택' : 'Select all',
    invertSelection: ko ? '선택 반전' : 'Invert selection',
    name: ko ? '이름' : 'Name',
    type: ko ? '종류' : 'Type',
    size: ko ? '크기' : 'Size',
    date: ko ? '날짜' : 'Date',
    back: ko ? '뒤로' : 'Back',
    forward: ko ? '앞으로' : 'Forward',
    up: ko ? '한 수준 위로' : 'Up one level',
    documents: ko ? '내 문서' : 'Documents',
    fileOptions: ko ? '파일 보기 옵션' : 'File view options',
    imageOptions: ko ? '이미지 옵션' : 'Image options',
    copiedView: ko ? '복사한 이미지 보기' : 'View copied image',
    refresh: ko ? '새로고침' : 'Refresh',
    batchEdit: ko ? '일괄 편집' : 'Batch edit',
    convert: ko ? '포맷 변환' : 'Convert format',
    move: ko ? '파일 이동' : 'Move files',
    metadata: ko ? '메타데이터' : 'Metadata',
    capture: ko ? '화면 캡처' : 'Screen capture',
    export: ko ? '고급 내보내기' : 'Advanced export',
    duplicates: ko ? '중복 이미지' : 'Find duplicates',
    shortcuts: ko ? '단축키' : 'Keyboard shortcuts',
    about: ko ? 'FastImage 정보' : 'About FastImage',
    noImage: ko ? '이미지를 먼저 선택하세요.' : 'Select an image first.',
    unavailable: ko ? '이 기능은 다음 단계에서 연결됩니다.' : 'This command will be connected in the next step.',
    proOnly: ko ? 'Pro 전용 기능입니다. Pro로 전환하면 사용할 수 있습니다.' : 'This is a Pro feature. Switch to Pro to use it.',
    proReady: ko ? 'Pro 기능 모듈을 준비 중입니다.' : 'The Pro feature module is being prepared.',
  };

  const notifyUnavailable = () => onNotify?.(text.unavailable);
  const notifyImageRequired = () => onNotify?.(text.noImage);
  const runProFeature = (feature: RibbonProFeature) => {
    if (edition !== 'pro') {
      onProFeature?.(feature);
      if (!onProFeature) onNotify?.(text.proOnly);
      return;
    }
    onProFeature?.(feature);
    if (!onProFeature) onNotify?.(text.proReady);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => onNotify?.(text.unavailable));
  };

  useEffect(() => {
    const isEditableElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase());
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && event.shiftKey && key === 'o') {
        event.preventDefault();
        onOpenFiles?.();
      } else if (ctrl && key === 'o') {
        event.preventDefault();
        onOpenFolder?.();
      } else if (ctrl && key === 'r') {
        event.preventDefault();
        onRefresh?.();
      } else if (event.key === 'F4') {
        event.preventDefault();
        onSettings?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenFiles, onOpenFolder, onRefresh, onSettings]);

  const tabs: Array<{ id: RibbonTabId; label: string; icon: LucideIcon }> = [
    { id: 'file', label: text.tabs.file, icon: FileText },
    { id: 'home', label: text.tabs.home, icon: Image },
    { id: 'edit', label: text.tabs.edit, icon: Pencil },
    { id: 'view', label: text.tabs.view, icon: Eye },
    { id: 'tools', label: text.tabs.tools, icon: Wrench },
    { id: 'help', label: text.tabs.help, icon: CircleHelp },
  ];

  const setViewMode = (size: ViewSize) => onViewSizeChange(size);

  const renderTabContent = () => {
    if (activeTab === 'file') {
      return (
        <>
          <RibbonGroup label={text.groups.connect}>
            <RibbonButton icon={FolderOpen} label={text.openFolder} shortcut="Ctrl+O" onClick={onOpenFolder} />
            <RibbonButton icon={Image} label={text.openImages} shortcut="Ctrl+Shift+O" onClick={onOpenFiles} />
            <RibbonButton icon={FolderPlus} label={text.newFolder} onClick={notifyUnavailable} />
          </RibbonGroup>
          <RibbonGroup label={ko ? '저장 및 정보' : 'Save & info'}>
            <RibbonButton icon={Save} label={text.saveAs} disabled={!hasActiveImage} onClick={notifyUnavailable} />
            <RibbonButton icon={Printer} label={text.print} disabled={!hasActiveImage} onClick={notifyUnavailable} />
            <RibbonButton icon={Camera} label={text.cameraInfo} disabled={!hasActiveImage} onClick={notifyUnavailable} />
            <RibbonButton icon={Info} label={text.properties} disabled={!hasActiveImage} onClick={notifyUnavailable} />
          </RibbonGroup>
          <RibbonGroup label={text.groups.support}>
            <RibbonButton icon={Download} label={text.update} onClick={onCheckForUpdates} />
            <RibbonButton icon={Settings} label={text.settings} shortcut="F4" onClick={onSettings} />
            <RibbonButton icon={Power} label={text.exit} shortcut="Alt+F4" onClick={onClose} tone="danger" />
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'home') {
      return (
        <>
          <RibbonGroup label={text.groups.mode}>
            <RibbonButton icon={Eye} label={text.viewer} disabled={!hasActiveImage} onClick={onOpenActive ?? notifyImageRequired} />
            <RibbonButton icon={Play} label={text.slideshow} disabled={!hasActiveImage} onClick={onOpenActive ?? notifyImageRequired} />
            <RibbonButton icon={Maximize2} label={text.fullscreen} onClick={toggleFullscreen} />
          </RibbonGroup>
          <RibbonGroup label={text.groups.rotate}>
            <RibbonButton icon={RotateCcw} label={text.rotateLeft} disabled={!hasActiveImage} onClick={notifyUnavailable} />
            <RibbonButton icon={RotateCw} label={text.rotateRight} disabled={!hasActiveImage} onClick={notifyUnavailable} />
          </RibbonGroup>
          <RibbonGroup label={text.groups.viewFormat}>
            <RibbonButton icon={Eye} label={text.preview} active={viewSize === 'large'} onClick={() => setViewMode('large')} compact />
            <RibbonButton icon={LayoutGrid} label={text.simple} active={viewSize === 'medium'} onClick={() => setViewMode('medium')} compact />
            <RibbonButton icon={Grid3X3} label={text.largeIcons} active={viewSize === 'small'} onClick={() => setViewMode('small')} compact />
            <RibbonButton icon={List} label={text.details} active={viewSize === 'small'} onClick={() => setViewMode('small')} compact />
            <RibbonButton icon={Film} label={text.filmstrip} active={viewSize === 'large'} onClick={() => setViewMode('large')} compact />
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'edit') {
      return (
        <>
          <RibbonGroup label={text.groups.clipboard}>
            <RibbonButton icon={Clipboard} label={text.paste} shortcut="Ctrl+V" onClick={onPaste} />
            <RibbonButton icon={Scissors} label={text.cut} shortcut="Ctrl+X" disabled={selectedCount === 0} onClick={onCut} />
            <RibbonButton icon={Copy} label={text.copy} shortcut="Ctrl+C" disabled={selectedCount === 0} onClick={onCopy} />
          </RibbonGroup>
          <RibbonGroup label={text.groups.image}>
            <RibbonButton icon={Trash2} label={text.delete} shortcut="Delete" disabled={selectedCount === 0} onClick={onDelete} tone="danger" />
            <RibbonButton icon={Pencil} label={text.rename} shortcut="F2" disabled={selectedCount === 0} onClick={onRename} />
            <RibbonButton icon={Pencil} label={text.batchRename} disabled={selectedCount < 2} onClick={onBatchRename} compact />
          </RibbonGroup>
          <RibbonGroup label={text.groups.selection}>
            <RibbonButton icon={CheckSquare} label={text.selectAll} shortcut="Ctrl+A" disabled={itemCount === 0} onClick={onSelectAll} />
            <RibbonButton icon={SlidersHorizontal} label={text.invertSelection} disabled={itemCount === 0} onClick={onInvertSelection} />
            <RibbonButton icon={Undo2} label={ko ? '선택 해제' : 'Clear selection'} disabled={selectedCount === 0} onClick={onClearSelection} />
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'view') {
      return (
        <>
          <RibbonGroup label={text.groups.sort}>
            <RibbonButton icon={ArrowUpDown} label={text.name} active={sortMode === 'name'} onClick={() => onSortModeChange('name')} compact />
            <RibbonButton icon={FileText} label={text.type} active={sortMode === 'type'} onClick={() => onSortModeChange('type')} compact />
            <RibbonButton icon={SlidersHorizontal} label={text.size} active={sortMode === 'size'} onClick={() => onSortModeChange('size')} compact />
            <RibbonButton icon={Info} label={text.date} active={sortMode === 'date'} onClick={() => onSortModeChange('date')} compact />
            <RibbonButton icon={sortDirection === 'asc' ? ArrowUp : ArrowDown} label={sortDirection === 'asc' ? (ko ? '오름차순' : 'Ascending') : (ko ? '내림차순' : 'Descending')} onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')} compact />
          </RibbonGroup>
          <RibbonGroup label={text.groups.explore}>
            <RibbonButton icon={ArrowLeft} label={text.back} onClick={notifyUnavailable} compact />
            <RibbonButton icon={ArrowRight} label={text.forward} onClick={notifyUnavailable} compact />
            <RibbonButton icon={FolderUp} label={text.up} onClick={notifyUnavailable} compact />
            <RibbonButton icon={FolderOpen} label={text.documents} onClick={onOpenFolder} compact />
          </RibbonGroup>
          <RibbonGroup label={text.groups.advanced}>
            <RibbonButton icon={SlidersHorizontal} label={text.fileOptions} onClick={notifyUnavailable} compact />
            <RibbonButton icon={Image} label={text.imageOptions} onClick={notifyUnavailable} compact />
            <RibbonButton icon={Copy} label={text.copiedView} onClick={notifyUnavailable} compact />
          </RibbonGroup>
          <RibbonGroup label={text.groups.refresh}>
            <RibbonButton icon={RefreshCw} label={text.refresh} onClick={onRefresh} />
          </RibbonGroup>
        </>
      );
    }

    if (activeTab === 'tools') {
      return (
        <>
          <RibbonGroup label={text.groups.changes}>
            <RibbonButton icon={SlidersHorizontal} label={text.batchEdit} locked={edition !== 'pro'} onClick={() => runProFeature('batch-edit')} />
            <RibbonButton icon={FileOutput} label={text.convert} locked={edition !== 'pro'} onClick={() => runProFeature('batch-edit')} />
            <RibbonButton icon={FolderUp} label={text.move} disabled={selectedCount === 0} onClick={notifyUnavailable} />
          </RibbonGroup>
          <RibbonGroup label={text.groups.export}>
            <RibbonButton icon={Monitor} label={text.capture} locked={edition !== 'pro'} onClick={() => runProFeature('capture')} />
            <RibbonButton icon={FileOutput} label={text.export} locked={edition !== 'pro'} onClick={() => runProFeature('advanced-export')} />
          </RibbonGroup>
          <RibbonGroup label={text.groups.organize}>
            <RibbonButton icon={Tags} label={text.metadata} disabled={selectedCount === 0} onClick={notifyUnavailable} />
            <RibbonButton icon={Search} label={text.duplicates} locked={edition !== 'pro'} onClick={() => runProFeature('duplicate-search')} />
            <RibbonButton icon={Star} label={ko ? '즐겨찾기' : 'Favorites'} disabled={selectedCount === 0} onClick={notifyUnavailable} />
          </RibbonGroup>
        </>
      );
    }

    return (
      <>
        <RibbonGroup label={text.groups.support}>
          <RibbonButton icon={Keyboard} label={text.shortcuts} onClick={notifyUnavailable} />
          <RibbonButton icon={Info} label={text.about} onClick={onAbout} />
          <RibbonButton icon={RefreshCw} label={text.update} onClick={onCheckForUpdates} />
        </RibbonGroup>
        <RibbonGroup label={ko ? 'Pro' : 'Pro edition'}>
          <RibbonButton icon={LockKeyhole} label={ko ? 'Pro로 전환' : 'Switch to Pro'} locked={edition !== 'pro'} onClick={() => runProFeature('capture')} tone="accent" />
        </RibbonGroup>
      </>
    );
  };

  return (
    <section className="shrink-0 border-b border-gray-700 bg-gray-900/95 text-gray-200 shadow-sm" aria-label={ko ? '리본 도구 모음' : 'Ribbon toolbar'}>
      <div className="flex h-8 items-center gap-1 border-b border-gray-700/80 bg-gray-950/70 px-2" aria-label={text.groups.quick}>
        <QuickAction icon={FolderOpen} label={text.openFolder} onClick={onOpenFolder} />
        <QuickAction icon={FolderPlus} label={text.newFolder} onClick={notifyUnavailable} />
        <QuickAction icon={Save} label={text.saveAs} onClick={hasActiveImage ? notifyUnavailable : notifyImageRequired} />
        <QuickAction icon={Printer} label={text.print} onClick={hasActiveImage ? notifyUnavailable : notifyImageRequired} />
        <div className="mx-1 h-4 w-px bg-gray-700" />
        <QuickAction icon={RefreshCw} label={text.refresh} onClick={onRefresh} />
        <QuickAction icon={Settings} label={text.settings} onClick={onSettings} />
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-500">
          <span>{edition === 'pro' ? 'PRO' : 'COMMUNITY'}</span>
          <span>{selectedCount > 0 ? `${selectedCount} / ${itemCount}` : `${itemCount}`}</span>
        </div>
      </div>
      <nav className="flex h-8 items-end gap-0.5 overflow-x-auto px-2" role="tablist" aria-label={ko ? '리본 탭' : 'Ribbon tabs'}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex h-8 items-center gap-1 rounded-t-md px-3 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-400/70',
                active ? 'bg-gray-800 font-semibold text-teal-200' : 'text-gray-400 hover:bg-gray-800/70 hover:text-gray-100',
              )}
            >
              <Icon size={13} strokeWidth={1.9} />
              {tab.label}
              {tab.id === 'tools' && <ChevronDown size={11} className="opacity-45" />}
            </button>
          );
        })}
      </nav>
      <div className="flex min-h-[92px] items-stretch gap-1 overflow-x-auto border-t border-gray-800 px-3 py-2" role="tabpanel">
        {renderTabContent()}
      </div>
    </section>
  );
}
