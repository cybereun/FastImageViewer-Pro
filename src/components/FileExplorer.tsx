import { useState, useRef } from 'react';
import {
  Computer,
  Database,
  Disc3,
  Download,
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Home,
  Image,
  Music,
  Network,
  RefreshCw,
  Upload,
  FolderPlus,
  Usb,
  Video,
} from 'lucide-react';
import type { FolderKind, FolderNode, SpecialFolderKind, VirtualFolderKind } from '../types';
import { cn } from '../utils/cn';
import { IMAGE_DRAG_MIME } from '../constants/drag';
import type { Language } from '../i18n';
import { t } from '../i18n';

const SPECIAL_FOLDER_LABELS: Record<Language, Partial<Record<SpecialFolderKind, string>>> = {
  ko: {
    desktop: '바탕 화면',
    downloads: '다운로드',
    documents: '문서',
    pictures: '사진',
    music: '음악',
    videos: '동영상',
  },
  en: {
    desktop: 'Desktop',
    downloads: 'Downloads',
    documents: 'Documents',
    pictures: 'Pictures',
    music: 'Music',
    videos: 'Videos',
  },
};

const VIRTUAL_FOLDER_LABELS: Record<Language, Record<VirtualFolderKind, string>> = {
  ko: { home: '홈', gallery: '갤러리', libraries: '라이브러리', 'this-pc': '내 PC' },
  en: { home: 'Home', gallery: 'Gallery', libraries: 'Libraries', 'this-pc': 'This PC' },
};

function isDriveKind(kind: FolderKind | undefined): boolean {
  return Boolean(kind && kind.endsWith('-drive'));
}

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let amount = value;
  let unitIndex = -1;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount >= 10 || unitIndex === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function getNodeLabel(node: FolderNode, language: Language): string {
  if (node.virtualKind) return VIRTUAL_FOLDER_LABELS[language][node.virtualKind];
  if (node.specialKind) return SPECIAL_FOLDER_LABELS[language][node.specialKind] ?? node.name;
  if (isDriveKind(node.kind) && node.volumeLabel && node.driveLetter) {
    return `${node.volumeLabel} (${node.driveLetter})`;
  }
  return node.name;
}

function getNodeDescription(node: FolderNode, language: Language): string | null {
  if (!isDriveKind(node.kind)) return null;
  if (node.totalBytes !== null && node.totalBytes !== undefined && node.freeBytes !== null && node.freeBytes !== undefined) {
    return language === 'ko'
      ? `${formatBytes(node.freeBytes)} 여유 · ${formatBytes(node.totalBytes)}`
      : `${formatBytes(node.freeBytes)} free · ${formatBytes(node.totalBytes)}`;
  }
  if (node.providerName) return node.providerName;
  return language === 'ko' ? '드라이브' : 'Drive';
}

function FolderGlyph({ node, isSelected }: { node: FolderNode; isSelected: boolean }) {
  const className = isSelected ? 'text-white' : undefined;
  const size = 17;
  if (node.virtualKind === 'home') return <Home size={size} className={className ?? 'text-orange-400'} />;
  if (node.virtualKind === 'gallery') return <Image size={size} className={className ?? 'text-cyan-400'} />;
  if (node.virtualKind === 'libraries') return <Folder size={size} className={className ?? 'text-yellow-500'} />;
  if (node.virtualKind === 'this-pc') return <Computer size={size} className={className ?? 'text-sky-500'} />;
  if (node.kind === 'fixed-drive' || node.kind === 'unknown-drive') return <HardDrive size={size} className={className ?? 'text-sky-500'} />;
  if (node.kind === 'removable-drive') return <Usb size={size} className={className ?? 'text-violet-500'} />;
  if (node.kind === 'cdrom-drive') return <Disc3 size={size} className={className ?? 'text-amber-500'} />;
  if (node.kind === 'network-drive') return <Network size={size} className={className ?? 'text-emerald-500'} />;
  if (node.kind === 'ram-drive') return <Database size={size} className={className ?? 'text-rose-500'} />;
  if (node.specialKind === 'desktop') return <Computer size={size} className={className ?? 'text-sky-400'} />;
  if (node.specialKind === 'downloads') return <Download size={size} className={className ?? 'text-indigo-400'} />;
  if (node.specialKind === 'documents') return <FileText size={size} className={className ?? 'text-slate-400'} />;
  if (node.specialKind === 'pictures') return <Image size={size} className={className ?? 'text-cyan-400'} />;
  if (node.specialKind === 'music') return <Music size={size} className={className ?? 'text-fuchsia-400'} />;
  if (node.specialKind === 'videos') return <Video size={size} className={className ?? 'text-red-400'} />;
  return node.isExpanded
    ? <FolderOpen size={size} className={className ?? 'text-yellow-500'} />
    : <Folder size={size} className={className ?? 'text-yellow-500'} />;
}

interface FileExplorerProps {
  folders: FolderNode[];
  selectedFolder: string | null;
  onSelectFolder: (id: string | null) => void;
  onToggleFolder?: (node: FolderNode) => void;
  onImageDropToFolder?: (payload: {
    imagePaths: string[];
    targetFolderPath: string;
    move: boolean;
  }) => Promise<void> | void;
  onOpenDirectory?: () => void;
  onOpenFiles?: () => void;
  onRefreshRoots?: () => Promise<void> | void;
  onLoadFiles: (files: FileList | File[]) => void;
  totalCount: number;
  loading: boolean;
  language?: Language;
}

function FolderItem({
  node,
  depth,
  selectedFolder,
  onSelectFolder,
  onToggleFolder,
  onImageDropToFolder,
  language,
}: {
  node: FolderNode;
  depth: number;
  selectedFolder: string | null;
  onSelectFolder: (id: string) => void;
  onToggleFolder?: (node: FolderNode) => void;
  onImageDropToFolder?: (payload: {
    imagePaths: string[];
    targetFolderPath: string;
    move: boolean;
  }) => Promise<void> | void;
  language: Language;
}) {
  const isSelected = !node.isVirtual && selectedFolder === node.id;
  const canToggle = node.isVirtual ? node.children.length > 0 : node.children.length > 0 || !node.isLoaded;
  const [dropActive, setDropActive] = useState(false);
  const label = getNodeLabel(node, language);
  const description = getNodeDescription(node, language);
  const isDrive = isDriveKind(node.kind);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canToggle && onToggleFolder) {
      onToggleFolder(node);
    }
  };

  const hasImagePayload = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes(IMAGE_DRAG_MIME);

  const handleDragOver = (e: React.DragEvent) => {
    if (node.isVirtual) return;
    if (!hasImagePayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropActive(true);
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (node.isVirtual) return;
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
  };

  const handleImageDrop = async (e: React.DragEvent) => {
    if (node.isVirtual) return;
    if (!hasImagePayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);

    const rawPaths = e.dataTransfer.getData(IMAGE_DRAG_MIME);
    if (!rawPaths || !onImageDropToFolder) return;
    let imagePaths: string[];
    try {
      const parsed = JSON.parse(rawPaths);
      imagePaths = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [rawPaths];
    } catch {
      imagePaths = [rawPaths];
    }
    if (imagePaths.length === 0) return;

    await onImageDropToFolder({
      imagePaths,
      targetFolderPath: node.path,
      move: !e.ctrlKey,
    });
  };

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer select-none items-center gap-1.5 rounded-sm px-1 py-1 text-left text-sm transition-colors',
          isSelected ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800',
          dropActive && 'bg-blue-500/25 ring-1 ring-blue-400'
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={(event) => {
          if (node.isVirtual) {
            event.stopPropagation();
            if (canToggle && onToggleFolder) onToggleFolder(node);
            return;
          }
          onSelectFolder(node.id);
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleImageDrop}
        title={dropActive ? 'Drop image here (Ctrl = copy, default = move)' : node.path}
      >
        <button
          onClick={handleToggle}
          className={cn(
            'rounded p-0.5',
            canToggle ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-700'
          )}
          aria-label={node.isExpanded ? 'Collapse folder' : 'Expand folder'}
        >
          {canToggle ? (
            node.isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="inline-block w-[14px]" />
          )}
        </button>

        <FolderGlyph node={node} isSelected={isSelected} />

        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {isDrive && description && (
            <span className={cn('block truncate text-[10px]', isSelected ? 'text-white/75' : 'text-gray-500')}>
              {description}
            </span>
          )}
        </span>
      </div>

      {node.isExpanded && (
        <div>
          {node.children.map((child) => (
            <FolderItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onImageDropToFolder={onImageDropToFolder}
              language={language}
            />
          ))}
          {!node.isLoaded && (
            <div style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }} className="py-1 text-xs text-gray-500">
              Loading...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  folders,
  selectedFolder,
  onSelectFolder,
  onToggleFolder,
  onImageDropToFolder,
  onOpenDirectory,
  onOpenFiles,
  onRefreshRoots,
  onLoadFiles,
  totalCount,
  loading,
  language = 'en',
}: FileExplorerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [refreshingRoots, setRefreshingRoots] = useState(false);

  const handleRefreshRoots = async () => {
    if (!onRefreshRoots || refreshingRoots) return;
    setRefreshingRoots(true);
    try {
      await onRefreshRoots();
    } finally {
      setRefreshingRoots(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (Array.from(e.dataTransfer.types).includes(IMAGE_DRAG_MIME)) {
      return;
    }
    if (!e.dataTransfer.items) return;

    const files: File[] = [];
    for (let i = 0; i < e.dataTransfer.items.length; i += 1) {
      const item = e.dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) onLoadFiles(files);
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col select-none border-r border-gray-800 bg-[#1e1e1e] transition-colors',
        dragOver && 'bg-gray-800'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (Array.from(e.dataTransfer.types).includes(IMAGE_DRAG_MIME)) {
          setDragOver(false);
          return;
        }
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-2 border-b border-gray-800 p-3">
        <div className="flex items-center gap-2 text-gray-400">
          <Computer size={16} />
          <span className="text-xs font-semibold uppercase tracking-wider">{t(language, 'storage')}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onOpenDirectory}
            className="flex flex-1 items-center justify-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            <FolderPlus size={14} />
            {t(language, 'openFolder')}
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600"
            onClick={onOpenFiles ?? (() => fileInputRef.current?.click())}
            title={t(language, 'openFiles')}
          >
            <Upload size={14} />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files) onLoadFiles(e.target.files);
        }}
      />

      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="flex items-center gap-1.5">
          <HardDrive size={13} />
          {t(language, 'thisPc')}
        </span>
        <button
          type="button"
          onClick={() => void handleRefreshRoots()}
          disabled={!onRefreshRoots || refreshingRoots}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-200 disabled:cursor-default disabled:opacity-50"
          title={t(language, 'refreshStorage')}
          aria-label={t(language, 'refreshStorage')}
        >
          <RefreshCw size={13} className={refreshingRoots ? 'animate-spin' : undefined} />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-x-hidden overflow-y-auto py-2">
        {loading && totalCount === 0 && (
          <div className="animate-pulse px-4 py-2 text-xs text-gray-500">{t(language, 'scanning')}</div>
        )}

        {folders.length === 0 && !loading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-gray-500">
            <HardDrive size={24} className="opacity-50" />
            <p className="text-xs">{t(language, 'noFolders')}</p>
          </div>
        ) : (
          <div className="space-y-3 px-2">
            {folders.some((node) => !isDriveKind(node.kind)) && (
              <section>
                <h3 className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {t(language, 'quickAccess')}
                </h3>
                <div className="space-y-0.5">
                  {folders.filter((node) => !isDriveKind(node.kind)).map((node) => (
                    <FolderItem
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedFolder={selectedFolder}
                      onSelectFolder={(id) => onSelectFolder(id)}
                      onToggleFolder={onToggleFolder}
                      onImageDropToFolder={onImageDropToFolder}
                      language={language}
                    />
                  ))}
                </div>
              </section>
            )}
            {folders.some((node) => isDriveKind(node.kind)) && (
              <section>
                <h3 className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {t(language, 'drives')}
                </h3>
                <div className="space-y-0.5">
                  {folders.filter((node) => isDriveKind(node.kind)).map((node) => (
                    <FolderItem
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedFolder={selectedFolder}
                      onSelectFolder={(id) => onSelectFolder(id)}
                      onToggleFolder={onToggleFolder}
                      onImageDropToFolder={onImageDropToFolder}
                      language={language}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
