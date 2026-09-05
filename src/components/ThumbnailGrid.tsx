import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { FileImage, Grid3X3, ArrowUpDown, Search, Image as ImageIcon, Star, FolderOpen, FolderUp, RefreshCw } from 'lucide-react';
import type { BatchOperationResult, BatchRenameRequest, ImageFile, ImageMetadata, SortDirection, SortMode, ViewSize } from '../types';
import { cn } from '../utils/cn';
import { IMAGE_DRAG_MIME } from '../constants/drag';
import { filterAndSortImages, getImageMetadata } from '../domain/image';
import { selectAll, selectRange, toggleSelection } from '../domain/selection';
import { BatchRenameDialog } from './BatchRenameDialog';
import { FilterBar, getFilterOptions, type DateFilter, type FormatFilter, type SizeFilter } from './FilterBar';
import type { Language } from '../i18n';
import { t } from '../i18n';
import { BUILD_EDITION } from '../application/edition';
import { Ribbon, type RibbonProFeature } from './Ribbon';
import { ImageEditor } from './ImageEditor';
import { RibbonCommandDialog, type RibbonDialogKind } from './RibbonCommandDialog';
import { ScreenCaptureDialog } from './ScreenCaptureDialog';
import { BatchEditDialog } from './BatchEditDialog';
import { DuplicateSearchDialog } from './DuplicateSearchDialog';

export interface SelectionSummary {
  count: number;
  bytes: number;
  width: number | null;
  height: number | null;
  mixedDimensions: boolean;
}

const EMPTY_SELECTION: SelectionSummary = {
  count: 0,
  bytes: 0,
  width: null,
  height: null,
  mixedDimensions: false,
};

interface ThumbnailGridProps {
  images: ImageFile[];
  currentFolderPath: string | null;
  collectionKey: string;
  onImageClick: (index: number, collection: ImageFile[]) => void;
  onRenameImage: (sourcePath: string, nextName: string) => Promise<void>;
  onRenameImages: (renames: BatchRenameRequest[]) => Promise<BatchOperationResult>;
  onCopyImages: (sourcePaths: string[], targetFolderPath: string) => Promise<BatchOperationResult>;
  onMoveImages: (sourcePaths: string[], targetFolderPath: string) => Promise<BatchOperationResult>;
  onDeleteImages: (sourcePaths: string[]) => Promise<BatchOperationResult>;
  onUpdateImageMetadata: (imageId: string, patch: Partial<ImageMetadata>) => void;
  confirmDelete: boolean;
  viewPreferences?: {
    viewSize: ViewSize;
    sortMode: SortMode;
    sortDirection: SortDirection;
  };
  onViewPreferencesChange?: (patch: Partial<ViewPreferences>) => void;
  onSelectionChange?: (summary: SelectionSummary) => void;
  language?: Language;
  onOpenFolder?: () => void;
  onOpenFiles?: () => void;
  onNewFolder?: () => void;
  onCopyToFolder?: () => void;
  onMoveToFolder?: () => void;
  onToggleFavorite?: () => void;
  onRefresh?: () => void;
  onSettings?: () => void;
  onAbout?: () => void;
  onCheckForUpdates?: () => void;
  onClose?: () => void;
  onNavigateUp?: () => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onStartSlideshow?: (index: number, collection: ImageFile[]) => void;
  onActiveImageChange?: (image: ImageFile | null) => void;
}

interface ViewPreferences {
  viewSize: ViewSize;
  sortMode: SortMode;
  sortDirection: SortDirection;
}

interface ContextMenuState {
  x: number;
  y: number;
  image: ImageFile;
}

interface RenameDialogState {
  image: ImageFile;
  value: string;
  error: string | null;
}

interface DeleteDialogState {
  images: ImageFile[];
}

interface ClipboardState {
  mode: 'copy' | 'cut';
  items: Array<{ path: string; name: string }>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedDate(timestamp: number, language: Language): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return '—';
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (language === 'ko') {
    const hour = date.getHours();
    const period = hour >= 12 ? '오후' : '오전';
    const hour12 = hour % 12 || 12;
    return `${datePart} ${period} ${hour12}:${minutes}`;
  }
  const hour = date.getHours();
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${datePart} ${hour12}:${minutes} ${period}`;
}

const THUMBNAIL_SIZE = 320;
const MAX_RENDERER_THUMBNAILS = 400;
const thumbnailCache = new Map<string, string>();
const thumbnailRequests = new Map<string, Promise<string>>();

function thumbnailCacheKey(image: ImageFile): string {
  return `${image.path}|${image.lastModified}|${THUMBNAIL_SIZE}`;
}

function requestThumbnail(image: ImageFile): Promise<string> {
  const key = thumbnailCacheKey(image);
  const cached = thumbnailCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = thumbnailRequests.get(key);
  if (pending) return pending;

  const request = window.electron.getThumbnailUrl(image.path, THUMBNAIL_SIZE)
    .then((url) => {
      thumbnailCache.set(key, url);
      while (thumbnailCache.size > MAX_RENDERER_THUMBNAILS) {
        const oldestKey = thumbnailCache.keys().next().value;
        if (!oldestKey) break;
        thumbnailCache.delete(oldestKey);
      }
      return url;
    })
    .finally(() => {
      thumbnailRequests.delete(key);
    });
  thumbnailRequests.set(key, request);
  return request;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

interface SaveFileHandle {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}

type SaveFilePicker = (options: unknown) => Promise<SaveFileHandle>;

function imageMimeType(image: ImageFile): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (image.type === 'image/jpeg' || image.type === 'image/png' || image.type === 'image/webp') return image.type;
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => resolve(source);
    source.onerror = () => reject(new Error('Unable to load the image.'));
    source.src = url;
  });
}

async function readImageBlob(image: ImageFile): Promise<Blob> {
  if (image.source === 'folder' && image.path && typeof window.electron.readImageData === 'function') {
    const bytes = await window.electron.readImageData(image.path);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: image.type || 'application/octet-stream' });
  }
  if (image.file) return image.file;
  const response = await fetch(image.url);
  if (!response.ok) throw new Error('Unable to read the image.');
  return response.blob();
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to create the image.'));
    }, type, quality);
  });
}

async function rotateImageOnDisk(image: ImageFile, degrees: -90 | 90): Promise<void> {
  if (!image.path || image.source !== 'folder') throw new Error('Imported images must be saved before they can be rotated.');
  const mimeType = imageMimeType(image);
  if (!mimeType) throw new Error('Rotation supports JPG, PNG, and WebP files.');
  const sourceBlob = await readImageBlob(image);
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    const source = await loadImage(sourceUrl);
    const canvas = document.createElement('canvas');
    const quarterTurn = Math.abs(degrees) === 90;
    canvas.width = quarterTurn ? source.naturalHeight : source.naturalWidth;
    canvas.height = quarterTurn ? source.naturalWidth : source.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((degrees * Math.PI) / 180);
    context.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
    const blob = await canvasBlob(canvas, mimeType);
    await window.electron.overwriteImageFile(image.path, await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function saveImageAs(image: ImageFile): Promise<void> {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const blob = await readImageBlob(image);
      const extension = image.name.includes('.') ? image.name.slice(image.name.lastIndexOf('.')) : '.png';
      const handle = await picker({ suggestedName: image.name, types: [{ description: 'Image file', accept: { [image.type || 'image/png']: [extension] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const anchor = document.createElement('a');
  anchor.href = image.url;
  anchor.download = image.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function printImage(image: ImageFile): boolean {
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) return false;
  const title = escapeHtml(image.name);
  const url = escapeHtml(image.url);
  printWindow.document.write(`<!doctype html><html><head><title>${title}</title><style>html,body{margin:0;height:100%;background:#fff}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}@media print{body{height:100vh}}</style></head><body><img src="${url}" alt="${title}" onload="window.focus();window.print();window.onafterprint=function(){window.close()}" /></body></html>`);
  printWindow.document.close();
  return true;
}

function getParentFolderPath(folderPath: string | null): string | null {
  if (!folderPath) return null;
  const trimmed = folderPath.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(trimmed)) return null;
  const separator = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (separator < 0) return null;
  if (separator === 2 && /^[A-Za-z]:/.test(trimmed)) return `${trimmed.slice(0, 2)}\\`;
  return trimmed.slice(0, separator) || null;
}

function ParentFolderItem({
  language,
  disabled,
  onClick,
  largeIcons = false,
  simple = false,
}: {
  language: Language;
  disabled: boolean;
  onClick: () => void;
  largeIcons?: boolean;
  simple?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group relative flex min-w-0 overflow-hidden transition-all focus:outline-none',
        simple
          ? 'flex-row items-center gap-2 rounded-md border border-transparent px-2 py-0.5 hover:border-gray-700 hover:bg-gray-800'
          : largeIcons
            ? 'flex-row items-start gap-3 rounded-lg border border-gray-700 bg-gray-800 p-2 hover:border-blue-500'
            : 'flex-col rounded-lg border border-gray-700 bg-gray-800 hover:border-blue-500',
        disabled && 'cursor-wait opacity-70'
      )}
      title={language === 'ko' ? '상위 폴더로 이동' : 'Go to parent folder'}
    >
      <div className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden',
        simple ? 'h-7 w-7 bg-transparent' : largeIcons ? 'h-20 w-20 bg-gray-900' : 'h-48 w-full bg-gray-900'
      )}>
        <FolderUp size={simple ? 24 : largeIcons ? 56 : 68} strokeWidth={1.5} className="text-amber-400 drop-shadow" />
      </div>
      <div className={cn('w-full px-2 py-1.5', largeIcons && 'min-w-0 px-0 pt-1', simple && 'min-w-0 p-0')}>
        <p className={cn('truncate text-left font-medium text-gray-300', simple ? 'text-sm' : 'text-xs')}>..</p>
        {!simple && (
          <p className="truncate text-left text-[11px] text-gray-500">
            {language === 'ko' ? '상위 폴더' : 'Parent folder'}
          </p>
        )}
      </div>
    </button>
  );
}

function LocationBar({
  currentFolderPath,
  language,
  onNavigateUp,
  onRefresh,
}: {
  currentFolderPath: string | null;
  language: Language;
  onNavigateUp?: () => void;
  onRefresh?: () => void;
}) {
  const canNavigateUp = Boolean(getParentFolderPath(currentFolderPath)) && Boolean(onNavigateUp);
  const locationLabel = currentFolderPath || (language === 'ko' ? '홈' : 'Home');
  return (
    <div className="flex h-8 min-h-8 items-center gap-1 border-b border-gray-800 bg-gray-900/90 px-2" aria-label={language === 'ko' ? '현재 폴더 경로' : 'Current folder path'}>
      <button
        type="button"
        onClick={onNavigateUp}
        disabled={!canNavigateUp}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        title={language === 'ko' ? '상위 폴더' : 'Parent folder'}
        aria-label={language === 'ko' ? '상위 폴더' : 'Parent folder'}
      >
        <FolderUp size={14} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300">
        <FolderOpen size={14} className="shrink-0 text-amber-400" />
        <span className="truncate" title={currentFolderPath ?? undefined}>{locationLabel}</span>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={!onRefresh}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        title={language === 'ko' ? '현재 폴더 새로고침' : 'Refresh folder'}
        aria-label={language === 'ko' ? '현재 폴더 새로고침' : 'Refresh folder'}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}

function getImageTypeLabel(image: ImageFile): string {
  const extension = image.name.match(/\.([^.]+)$/)?.[1];
  const mimeType = image.type.split('/')[1];
  return (extension || mimeType || 'IMG').replace('jpeg', 'jpg').toUpperCase();
}

function LargeIconItem({
  image,
  index,
  active,
  selected,
  dimmedForCut,
  disabled,
  language,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onImageLoad,
}: {
  image: ImageFile;
  index: number;
  active: boolean;
  selected: boolean;
  dimmedForCut: boolean;
  disabled: boolean;
  language: Language;
  onClick: (e: React.MouseEvent, image: ImageFile, index: number) => void;
  onDoubleClick: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageFile) => void;
  onDragStart: (e: React.DragEvent, image: ImageFile) => void;
  onImageLoad?: (image: ImageFile, width: number, height: number) => void;
}) {
  const typeLabel = getImageTypeLabel(image);
  return (
    <button
      type="button"
      disabled={disabled}
      draggable={!disabled}
      onClick={(event) => onClick(event, image, index)}
      onDoubleClick={() => onDoubleClick(index)}
      onContextMenu={(event) => onContextMenu(event, image)}
      onDragStart={(event) => onDragStart(event, image)}
      className={cn(
        'group relative flex min-w-0 items-start gap-3 rounded-md border border-transparent p-2 text-left transition-colors hover:border-gray-400 hover:bg-gray-800 focus:outline-none',
        selected && 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-500/60',
        active && 'ring-2 ring-yellow-400/80',
        dimmedForCut && 'opacity-50',
        disabled && 'cursor-wait opacity-70'
      )}
      title={language === 'ko' ? '클릭하여 선택 · 두 번 클릭하여 열기' : 'Click to select. Double-click to open.'}
    >
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded border border-gray-400 bg-gray-100">
        <FileImage size={52} strokeWidth={1.25} className="text-gray-300" />
        <span className="absolute bottom-1 rounded-sm bg-emerald-500 px-1 text-[10px] font-bold leading-4 text-white shadow">
          {typeLabel}
        </span>
        {getImageMetadata(image).favorite && (
          <Star size={13} fill="currentColor" className="absolute right-1 top-1 text-amber-500 drop-shadow" />
        )}
        {(!image.width || !image.height) && (
          <img
            src={image.url}
            alt=""
            className="pointer-events-none absolute h-px w-px opacity-0"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) onImageLoad?.(image, naturalWidth, naturalHeight);
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="truncate text-sm font-medium text-gray-300">{image.name}</p>
        <p className="mt-1 text-xs text-gray-400">{formatSize(image.size)}</p>
        <p className="mt-1 truncate text-xs text-gray-500">
          {language === 'ko' ? `${typeLabel} 이미지 파일` : `${typeLabel} image file`}
        </p>
      </div>
    </button>
  );
}

function SimpleListItem({
  image,
  index,
  active,
  selected,
  dimmedForCut,
  disabled,
  language,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onImageLoad,
}: {
  image: ImageFile;
  index: number;
  active: boolean;
  selected: boolean;
  dimmedForCut: boolean;
  disabled: boolean;
  language: Language;
  onClick: (e: React.MouseEvent, image: ImageFile, index: number) => void;
  onDoubleClick: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageFile) => void;
  onDragStart: (e: React.DragEvent, image: ImageFile) => void;
  onImageLoad?: (image: ImageFile, width: number, height: number) => void;
}) {
  const typeLabel = getImageTypeLabel(image);
  return (
    <button
      type="button"
      disabled={disabled}
      draggable={!disabled}
      onClick={(event) => onClick(event, image, index)}
      onDoubleClick={() => onDoubleClick(index)}
      onContextMenu={(event) => onContextMenu(event, image)}
      onDragStart={(event) => onDragStart(event, image)}
      className={cn(
        'group relative flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-0.5 text-left transition-colors hover:border-gray-700 hover:bg-gray-800 focus:outline-none',
        selected && 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/60',
        active && 'ring-1 ring-yellow-400/80',
        dimmedForCut && 'opacity-50',
        disabled && 'cursor-wait opacity-70'
      )}
      title={language === 'ko' ? '클릭하여 선택 · 두 번 클릭하여 열기' : 'Click to select. Double-click to open.'}
    >
      <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <FileImage size={25} strokeWidth={1.25} className="text-gray-300" />
        <span className="absolute bottom-0 rounded-sm bg-emerald-500 px-0.5 text-[7px] font-bold leading-[10px] text-white shadow">
          {typeLabel}
        </span>
        {getImageMetadata(image).favorite && (
          <Star size={10} fill="currentColor" className="absolute right-0 top-0 text-amber-500 drop-shadow" />
        )}
        {(!image.width || !image.height) && (
          <img
            src={image.url}
            alt=""
            className="pointer-events-none absolute h-px w-px opacity-0"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) onImageLoad?.(image, naturalWidth, naturalHeight);
            }}
          />
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-sm text-gray-300">{image.name}</p>
    </button>
  );
}

const DETAILS_GRID_COLUMNS = 'grid-cols-[minmax(240px,1fr)_110px_minmax(140px,200px)_minmax(170px,220px)]';

function DetailsListHeader({ language }: { language: Language }) {
  return (
    <div className={cn(
      'sticky top-0 z-10 grid min-w-[720px] items-center gap-3 border-b border-gray-700 bg-gray-900 px-2 py-1 text-xs font-medium text-gray-300',
      DETAILS_GRID_COLUMNS
    )}>
      <span>{language === 'ko' ? '이름' : 'Name'}</span>
      <span>{language === 'ko' ? '크기' : 'Size'}</span>
      <span>{language === 'ko' ? '종류' : 'Type'}</span>
      <span>{language === 'ko' ? '수정한 날짜' : 'Date modified'}</span>
    </div>
  );
}

function DetailsParentFolderItem({
  language,
  disabled,
  onClick,
}: {
  language: Language;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid w-full min-w-[720px] items-center gap-3 rounded-md border border-transparent px-2 py-0.5 text-left transition-colors hover:border-gray-700 hover:bg-gray-800 focus:outline-none',
        DETAILS_GRID_COLUMNS,
        disabled && 'cursor-wait opacity-70'
      )}
      title={language === 'ko' ? '상위 폴더로 이동' : 'Go to parent folder'}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <FolderUp size={24} strokeWidth={1.5} className="text-amber-400 drop-shadow" />
        </span>
        <span className="truncate text-sm font-medium text-gray-300">..</span>
      </span>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </button>
  );
}

function DetailsListItem({
  image,
  index,
  active,
  selected,
  dimmedForCut,
  disabled,
  language,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onImageLoad,
}: {
  image: ImageFile;
  index: number;
  active: boolean;
  selected: boolean;
  dimmedForCut: boolean;
  disabled: boolean;
  language: Language;
  onClick: (e: React.MouseEvent, image: ImageFile, index: number) => void;
  onDoubleClick: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageFile) => void;
  onDragStart: (e: React.DragEvent, image: ImageFile) => void;
  onImageLoad?: (image: ImageFile, width: number, height: number) => void;
}) {
  const typeLabel = getImageTypeLabel(image);
  return (
    <button
      type="button"
      disabled={disabled}
      draggable={!disabled}
      onClick={(event) => onClick(event, image, index)}
      onDoubleClick={() => onDoubleClick(index)}
      onContextMenu={(event) => onContextMenu(event, image)}
      onDragStart={(event) => onDragStart(event, image)}
      className={cn(
        'grid w-full min-w-[720px] items-center gap-3 rounded-md border border-transparent px-2 py-0.5 text-left transition-colors hover:border-gray-700 hover:bg-gray-800 focus:outline-none',
        DETAILS_GRID_COLUMNS,
        selected && 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/60',
        active && 'ring-1 ring-yellow-400/80',
        dimmedForCut && 'opacity-50',
        disabled && 'cursor-wait opacity-70'
      )}
      title={language === 'ko' ? '클릭하여 선택 · 두 번 클릭하여 열기' : 'Click to select. Double-click to open.'}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <FileImage size={25} strokeWidth={1.25} className="text-gray-300" />
          <span className="absolute bottom-0 rounded-sm bg-emerald-500 px-0.5 text-[7px] font-bold leading-[10px] text-white shadow">
            {typeLabel}
          </span>
          {getImageMetadata(image).favorite && (
            <Star size={10} fill="currentColor" className="absolute right-0 top-0 text-amber-500 drop-shadow" />
          )}
          {(!image.width || !image.height) && (
            <img
              src={image.url}
              alt=""
              className="pointer-events-none absolute h-px w-px opacity-0"
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) onImageLoad?.(image, naturalWidth, naturalHeight);
              }}
            />
          )}
        </span>
        <span className="min-w-0 truncate text-sm text-gray-300">{image.name}</span>
      </span>
      <span className="truncate text-sm text-gray-400">{formatSize(image.size)}</span>
      <span className="truncate text-sm text-gray-400">
        {language === 'ko' ? `${typeLabel} 이미지 파일` : `${typeLabel} image file`}
      </span>
      <span className="truncate text-sm text-gray-400">{formatModifiedDate(image.lastModified, language)}</span>
    </button>
  );
}

function ThumbnailItem({
  image,
  index,
  active,
  selected,
  dimmedForCut,
  disabled,
  viewSize,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onImageLoad,
}: {
  image: ImageFile;
  index: number;
  active: boolean;
  selected: boolean;
  dimmedForCut: boolean;
  disabled: boolean;
  viewSize: ViewSize;
  onClick: (e: React.MouseEvent, image: ImageFile, index: number) => void;
  onDoubleClick: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageFile) => void;
  onDragStart: (e: React.DragEvent, image: ImageFile) => void;
  onImageLoad?: (image: ImageFile, width: number, height: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(image.thumbnailUrl ?? null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const generatedThumbnail = image.source !== 'import' && Boolean(image.path) && !image.thumbnailUrl;

  useEffect(() => {
    if (!generatedThumbnail) {
      setThumbnailUrl(image.thumbnailUrl ?? null);
      setThumbnailFailed(false);
      return;
    }
    const node = thumbnailRef.current;
    if (!node) return;
    let active = true;
    let observer: IntersectionObserver | null = null;
    const cached = thumbnailCache.get(thumbnailCacheKey(image));
    if (cached) {
      setThumbnailUrl(cached);
      return () => undefined;
    }
    setThumbnailUrl(null);
    setThumbnailFailed(false);
    setError(false);
    setLoaded(false);
    const loadThumbnail = () => {
      void requestThumbnail(image)
        .then((url) => {
          if (active) setThumbnailUrl(url);
        })
        .catch(() => {
          if (active) setThumbnailFailed(true);
        });
    };
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadThumbnail();
          observer?.disconnect();
        }
      }, { rootMargin: '300px' });
      observer.observe(node);
    } else {
      loadThumbnail();
    }
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [generatedThumbnail, image.lastModified, image.path, image.source, image.thumbnailUrl]);

  const imageUrl = generatedThumbnail
    ? (thumbnailFailed ? image.url : thumbnailUrl)
    : (image.thumbnailUrl ?? image.url);

  const sizeClasses = {
    small: 'h-28',
    medium: 'h-44',
    // Preview uses a wide, Explorer-style tile.  Keep one consistent canvas
    // height so portrait and landscape photos can be compared in one row,
    // while object-contain below preserves each image's natural ratio.
    large: 'h-48',
    'large-icons': 'h-20',
    filmstrip: 'h-48',
  };

  return (
    <button
      disabled={disabled}
      draggable={!disabled}
      onClick={(e) => onClick(e, image, index)}
      onDoubleClick={() => onDoubleClick(index)}
      onContextMenu={(e) => onContextMenu(e, image)}
      onDragStart={(e) => onDragStart(e, image)}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 transition-all hover:border-blue-500 focus:outline-none',
        selected && 'border-blue-500 ring-2 ring-blue-500/70',
        active && 'ring-2 ring-yellow-400/80',
        dimmedForCut && 'opacity-50',
        disabled && 'cursor-wait opacity-70'
      )}
      title="Click to select. Double-click to open."
    >
      <div ref={thumbnailRef} className={cn('relative w-full overflow-hidden bg-gray-900', sizeClasses[viewSize])}>
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <ImageIcon size={32} />
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={image.name}
            loading={generatedThumbnail && !thumbnailFailed ? 'eager' : 'lazy'}
            decoding="async"
            className={cn(
              'h-full w-full object-contain',
              !loaded && 'opacity-0'
            )}
            onLoad={(event) => {
              setLoaded(true);
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if ((!image.width || !image.height) && naturalWidth > 0 && naturalHeight > 0) {
                onImageLoad?.(image, naturalWidth, naturalHeight);
              }
            }}
            onError={() => {
              if (generatedThumbnail && !thumbnailFailed) {
                setThumbnailFailed(true);
                setLoaded(false);
                return;
              }
              setError(true);
            }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute bottom-0 left-0 right-0 translate-y-full p-2 transition-transform group-hover:translate-y-0">
          <p className="text-xs text-gray-300">{formatSize(image.size)}</p>
        </div>
        {getImageMetadata(image).favorite && (
          <Star size={14} fill="currentColor" className="absolute right-2 top-2 text-yellow-300 drop-shadow" />
        )}
      </div>
      <div className="w-full px-2 py-1.5">
        <p className="truncate text-left text-xs text-gray-300">{image.name}</p>
      </div>
    </button>
  );
}

interface FilmstripViewProps {
  images: ImageFile[];
  activeImage: ImageFile | null;
  activeIndex: number;
  currentFolderPath: string | null;
  language: Language;
  busy: boolean;
  selectedIds: Set<string>;
  activeId: string | null;
  cutIdSet: Set<string>;
  gridRef: React.MutableRefObject<HTMLDivElement | null>;
  onFocus: () => void;
  onBlur: () => void;
  onNavigateUp?: () => void;
  onSelectClick: (e: React.MouseEvent, image: ImageFile) => void;
  onDoubleClick: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, image: ImageFile) => void;
  onDragStart: (e: React.DragEvent, image: ImageFile) => void;
  onImageLoad?: (image: ImageFile, width: number, height: number) => void;
}

function FilmstripView({
  images,
  activeImage,
  activeIndex,
  currentFolderPath,
  language,
  busy,
  selectedIds,
  activeId,
  cutIdSet,
  gridRef,
  onFocus,
  onBlur,
  onNavigateUp,
  onSelectClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onImageLoad,
}: FilmstripViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const showParentFolder = Boolean(getParentFolderPath(currentFolderPath)) && Boolean(onNavigateUp);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [activeImage?.id, activeImage?.url]);

  return (
    <div
      ref={gridRef}
      tabIndex={0}
      onFocus={onFocus}
      onBlur={onBlur}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-900 outline-none"
    >
      <div
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gray-900 p-3',
          activeImage && 'cursor-zoom-in'
        )}
        onDoubleClick={() => {
          if (activeIndex >= 0) onDoubleClick(activeIndex);
        }}
        title={activeImage
          ? (language === 'ko' ? '두 번 클릭하여 전체 화면으로 열기' : 'Double-click to open full view')
          : undefined}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-gray-950/60">
          {!activeImage ? (
            <ImageIcon size={72} className="text-gray-600" />
          ) : error ? (
            <ImageIcon size={72} className="text-gray-600" />
          ) : (
            <>
              {!loaded && (
                <div className="absolute flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
                </div>
              )}
              <img
                src={activeImage.url}
                alt={activeImage.name}
                className={cn('max-h-full max-w-full object-contain', !loaded && 'opacity-0')}
                onLoad={(event) => {
                  setLoaded(true);
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if ((!activeImage.width || !activeImage.height) && naturalWidth > 0 && naturalHeight > 0) {
                    onImageLoad?.(activeImage, naturalWidth, naturalHeight);
                  }
                }}
                onError={() => setError(true)}
              />
            </>
          )}
        </div>
        {activeImage && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded bg-black/60 px-3 py-1 text-xs text-gray-200 shadow">
            {activeImage.name}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-2 py-2">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {showParentFolder && (
            <div className="w-48 shrink-0">
              <ParentFolderItem onClick={() => onNavigateUp?.()} language={language} disabled={busy} />
            </div>
          )}
          {images.map((image, index) => (
            <div key={image.id} className="w-48 shrink-0">
              <ThumbnailItem
                image={image}
                index={index}
                active={activeId === image.id}
                selected={selectedIds.has(image.id)}
                dimmedForCut={cutIdSet.has(image.path)}
                disabled={busy}
                viewSize="large"
                onClick={onSelectClick}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
                onDragStart={onDragStart}
                onImageLoad={onImageLoad}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ThumbnailGrid({
  images,
  currentFolderPath,
  collectionKey,
  onImageClick,
  onRenameImage,
  onRenameImages,
  onCopyImages,
  onMoveImages,
  onDeleteImages,
  onUpdateImageMetadata,
  confirmDelete,
  viewPreferences,
  onViewPreferencesChange,
  onSelectionChange,
  language = 'en',
  onOpenFolder,
  onOpenFiles,
  onNewFolder,
  onCopyToFolder,
  onMoveToFolder,
  onToggleFavorite,
  onRefresh,
  onSettings,
  onAbout,
  onCheckForUpdates,
  onClose,
  onNavigateUp,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack = false,
  canNavigateForward = false,
  onStartSlideshow,
  onActiveImageChange,
}: ThumbnailGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(viewPreferences?.sortMode ?? 'name');
  const [sortDirection, setSortDirection] = useState<SortDirection>(viewPreferences?.sortDirection ?? 'asc');
  const [viewSize, setViewSize] = useState<ViewSize>(viewPreferences?.viewSize ?? 'medium');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [minimumRating, setMinimumRating] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [colorLabelDraft, setColorLabelDraft] = useState('');
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [batchEditRequest, setBatchEditRequest] = useState<{ mode: 'edit' | 'export'; images: ImageFile[] } | null>(null);
  const [duplicateSearchImages, setDuplicateSearchImages] = useState<ImageFile[] | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gridFocused, setGridFocused] = useState(false);
  const [dimensionsById, setDimensionsById] = useState<Record<string, { width: number; height: number }>>({});
  const [commandDialog, setCommandDialog] = useState<RibbonDialogKind | null>(null);
  const [editorImage, setEditorImage] = useState<ImageFile | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => filterAndSortImages(
    images,
    searchQuery,
    sortMode,
    sortDirection,
    favoriteOnly,
    minimumRating,
    getFilterOptions(formatFilter, sizeFilter, dateFilter)
  ), [dateFilter, favoriteOnly, formatFilter, images, minimumRating, searchQuery, sizeFilter, sortDirection, sortMode]);

  const filteredIdSet = useMemo(() => new Set(filtered.map((img) => img.id)), [filtered]);
  const selectedImages = useMemo(
    () => filtered.filter((img) => selectedIds.has(img.id)),
    [filtered, selectedIds]
  );
  const selectionSummary = useMemo<SelectionSummary>(() => {
    const bytes = selectedImages.reduce((sum, image) => sum + (Number.isFinite(image.size) ? image.size : 0), 0);
    const dimensions = selectedImages.map((image) => {
      if (image.width && image.height) return { width: image.width, height: image.height };
      const measured = dimensionsById[image.id];
      if (measured) return measured;
      return null;
    });
    const first = dimensions[0];
    const allKnown = Boolean(first) && dimensions.every((dimension) => Boolean(dimension));
    const sameDimensions = allKnown && dimensions.every((dimension) => (
      dimension?.width === first?.width && dimension?.height === first?.height
    ));
    return {
      count: selectedImages.length,
      bytes,
      width: sameDimensions ? first?.width ?? null : null,
      height: sameDimensions ? first?.height ?? null : null,
      mixedDimensions: allKnown && !sameDimensions,
    };
  }, [dimensionsById, selectedImages]);
  const activeIndex = activeId ? filtered.findIndex((image) => image.id === activeId) : -1;
  const activeImage = activeIndex >= 0 ? filtered[activeIndex] ?? null : null;
  const showParentFolder = (viewSize === 'small' || viewSize === 'medium' || viewSize === 'large' || viewSize === 'large-icons' || viewSize === 'filmstrip')
    && Boolean(getParentFolderPath(currentFolderPath))
    && Boolean(onNavigateUp);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setActiveId(null);
    setAnchorId(null);
    setDimensionsById({});
    onSelectionChange?.(EMPTY_SELECTION);
    return () => onSelectionChange?.(EMPTY_SELECTION);
  }, [collectionKey, onSelectionChange]);

  useEffect(() => {
    onSelectionChange?.(selectionSummary);
  }, [onSelectionChange, selectionSummary]);

  const handleImageLoad = useCallback((image: ImageFile, width: number, height: number) => {
    setDimensionsById((previous) => {
      const current = previous[image.id];
      if (current?.width === width && current.height === height) return previous;
      return { ...previous, [image.id]: { width, height } };
    });
  }, []);

  useEffect(() => {
    onActiveImageChange?.(activeImage);
  }, [activeImage, onActiveImageChange]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => filteredIdSet.has(id)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [filteredIdSet]);

  useEffect(() => {
    if (filtered.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId((previous) => {
      if (previous && filtered.some((image) => image.id === previous)) return previous;
      const selectedImage = filtered.find((image) => selectedIds.has(image.id));
      return selectedImage?.id ?? filtered[0]?.id ?? null;
    });
  }, [filtered, selectedIds]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeOnEsc);
    window.addEventListener('blur', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeOnEsc);
      window.removeEventListener('blur', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      if (renameDialog) setRenameDialog(null);
      if (deleteDialog) setDeleteDialog(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [busy, deleteDialog, renameDialog]);

  const getGridColumnCount = useCallback(() => {
    const node = gridRef.current;
    if (!node) return 1;
    const style = window.getComputedStyle(node);
    const columns = style.gridTemplateColumns.split(' ').filter(Boolean);
    return Math.max(1, columns.length);
  }, []);

  const getActionImages = useCallback(
    (anchor?: ImageFile | null) => {
      if (anchor && selectedIds.has(anchor.id) && selectedImages.length > 0) {
        return selectedImages;
      }
      if (anchor) return [anchor];
      if (selectedImages.length > 0) return selectedImages;
      if (activeImage) return [activeImage];
      return [];
    },
    [activeImage, selectedIds, selectedImages]
  );

  const runBatchOperation = useCallback(
    async (
      targets: ImageFile[],
      operation: (paths: string[]) => Promise<BatchOperationResult>,
      successMessage: string
    ) => {
      const persistedTargets = targets.filter((image) => image.source === 'folder' && image.path);
      if (persistedTargets.length === 0) {
        showStatus('No image selected. Imported files must be saved first.');
        return;
      }

      setBusy(true);
      let result: BatchOperationResult = { succeeded: [], failed: [] };
      try {
        result = await operation(persistedTargets.map((image) => image.path));
      } catch (error) {
        result.failed.push({
          sourcePath: '',
          error: error instanceof Error ? error.message : 'File operation failed.',
        });
      } finally {
        setBusy(false);
      }

      if (result.failed.length > 0) {
        const first = result.failed[0];
        showStatus(`${result.succeeded.length} completed, ${result.failed.length} failed.`);
        setStatusMessage(`${first.error ?? 'Some file operations failed.'}`);
        return;
      }
      showStatus(`${successMessage} (${result.succeeded.length})`);
    },
    [showStatus]
  );

  const chooseTargetFolder = useCallback(async () => {
    const picked = await window.electron.chooseDirectory();
    return picked?.path ?? null;
  }, []);

  useEffect(() => {
    if (!viewPreferences) return;
    setViewSize(viewPreferences.viewSize);
    setSortMode(viewPreferences.sortMode);
    setSortDirection(viewPreferences.sortDirection);
  }, [viewPreferences?.sortDirection, viewPreferences?.sortMode, viewPreferences?.viewSize]);

  const changeViewSize = useCallback((size: ViewSize) => {
    setViewSize(size);
    onViewPreferencesChange?.({ viewSize: size });
  }, [onViewPreferencesChange]);

  const changeSortMode = useCallback(() => {
    const modes: SortMode[] = ['name', 'type', 'size', 'date', 'rating'];
    const nextMode = modes[(modes.indexOf(sortMode) + 1) % modes.length];
    setSortMode(nextMode);
    onViewPreferencesChange?.({ sortMode: nextMode });
  }, [onViewPreferencesChange, sortMode]);

  const changeSortDirection = useCallback(() => {
    const nextDirection: SortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    setSortDirection(nextDirection);
    onViewPreferencesChange?.({ sortDirection: nextDirection });
  }, [onViewPreferencesChange, sortDirection]);

  const setSortModeValue = useCallback((nextMode: SortMode) => {
    setSortMode(nextMode);
    onViewPreferencesChange?.({ sortMode: nextMode });
  }, [onViewPreferencesChange]);

  const selectAllImages = useCallback(() => {
    const nextSelection = selectAll(filtered);
    setSelectedIds(nextSelection);
    setAnchorId(filtered[0]?.id ?? null);
    setActiveId(filtered[0]?.id ?? null);
  }, [filtered]);

  const invertSelection = useCallback(() => {
    const nextSelection = new Set(filtered
      .filter((image) => !selectedIds.has(image.id))
      .map((image) => image.id));
    setSelectedIds(nextSelection);
    setAnchorId(filtered.find((image) => nextSelection.has(image.id))?.id ?? null);
    setActiveId(filtered.find((image) => nextSelection.has(image.id))?.id ?? null);
  }, [filtered, selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setActiveId(null);
    setAnchorId(null);
  }, []);

  const openImageByIndex = useCallback(
    (filteredIndex: number) => {
      const img = filtered[filteredIndex];
      if (!img) return;
      setSelectedIds(new Set([img.id]));
      setAnchorId(img.id);
      setActiveId(img.id);
      onImageClick(filteredIndex, filtered);
    },
    [filtered, onImageClick]
  );

  const openActiveImage = useCallback(() => {
    if (activeIndex >= 0) {
      openImageByIndex(activeIndex);
      return;
    }
    showStatus('No image selected.');
  }, [activeIndex, openImageByIndex, showStatus]);

  const startSlideshow = useCallback(() => {
    if (activeIndex < 0) {
      showStatus('No image selected.');
      return;
    }
    if (onStartSlideshow) {
      onStartSlideshow(activeIndex, filtered);
      return;
    }
    openActiveImage();
  }, [activeIndex, filtered, onStartSlideshow, openActiveImage, showStatus]);

  const saveActiveImage = useCallback(async () => {
    if (!activeImage) {
      showStatus('No image selected.');
      return;
    }
    try {
      await saveImageAs(activeImage);
      showStatus('Image saved.');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Unable to save the image.');
    }
  }, [activeImage, showStatus]);

  const printActiveImage = useCallback(() => {
    if (!activeImage) {
      showStatus('No image selected.');
      return;
    }
    if (!printImage(activeImage)) {
      showStatus('Allow pop-ups to print the image.');
      return;
    }
    showStatus('Print window opened.');
  }, [activeImage, showStatus]);

  const rotateSelection = useCallback(async (degrees: -90 | 90) => {
    const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
    if (targets.length === 0) {
      showStatus('Select a saved JPG, PNG, or WebP image first.');
      return;
    }
    setBusy(true);
    let completed = 0;
    let failed = 0;
    let firstError = '';
    try {
      for (const image of targets) {
        try {
          await rotateImageOnDisk(image, degrees);
          completed += 1;
        } catch (error) {
          failed += 1;
          if (!firstError) firstError = error instanceof Error ? error.message : 'Rotation failed.';
        }
      }
    } finally {
      setBusy(false);
    }
    await onRefresh?.();
    if (failed > 0) {
      showStatus(`${completed} rotated, ${failed} failed. ${firstError}`);
    } else {
      showStatus(`${completed} image(s) rotated ${degrees > 0 ? '90°' : '-90°'}.`);
    }
  }, [getActionImages, onRefresh, showStatus]);

  const viewCopiedImage = useCallback(() => {
    const item = clipboard?.items[0];
    if (!item) {
      showStatus('Clipboard is empty.');
      return;
    }
    const existingIndex = filtered.findIndex((image) => image.path.toLowerCase() === item.path.toLowerCase());
    if (existingIndex >= 0) {
      openImageByIndex(existingIndex);
      return;
    }
    const name = item.name || item.path.split(/[\\/]/).pop() || item.path;
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
    const imported: ImageFile = {
      id: `clipboard:${item.path}`,
      name,
      url: window.electron.toLocalUrl(item.path),
      size: 0,
      type: extension ? `image/${extension === 'jpg' ? 'jpeg' : extension}` : 'image/*',
      lastModified: Date.now(),
      path: item.path,
      source: 'folder',
    };
    onImageClick(0, [imported]);
  }, [clipboard, filtered, onImageClick, openImageByIndex, showStatus]);

  const openMetadataDialog = useCallback(() => {
    if (!activeImage) {
      showStatus('No image selected.');
      return;
    }
    const metadata = getImageMetadata(activeImage);
    setTagDraft(metadata.tags.join(', '));
    setColorLabelDraft(metadata.colorLabel ?? '');
    setCommandDialog('metadata');
  }, [activeImage, showStatus]);

  const saveCommandMetadata = useCallback((patch: Partial<ImageMetadata>) => {
    if (!activeImage) return;
    onUpdateImageMetadata(activeImage.id, patch);
    showStatus('Metadata saved.');
  }, [activeImage, onUpdateImageMetadata, showStatus]);

  const openImageOptions = useCallback(() => {
    if (!activeImage) {
      showStatus('No image selected.');
      return;
    }
    setEditorImage(activeImage);
  }, [activeImage, showStatus]);

  const handleSelectClick = useCallback((e: React.MouseEvent, image: ImageFile) => {
    const multiSelect = e.ctrlKey || e.metaKey;
    setActiveId(image.id);
    if (e.shiftKey) {
      const range = selectRange(filtered, anchorId, image.id);
      setSelectedIds((previous) => (multiSelect ? new Set([...previous, ...range]) : range));
    } else {
      setSelectedIds((previous) => toggleSelection(previous, image.id, multiSelect));
    }
    setAnchorId(image.id);
  }, [anchorId, filtered]);

  const handleDragStart = useCallback((e: React.DragEvent, image: ImageFile) => {
    e.dataTransfer.effectAllowed = 'copyMove';
    const paths = (selectedIds.has(image.id) ? selectedImages : [image])
      .filter((target) => target.source === 'folder' && target.path)
      .map((target) => target.path);
    e.dataTransfer.setData(IMAGE_DRAG_MIME, JSON.stringify(paths));
    e.dataTransfer.setData('text/plain', image.path);
  }, [selectedIds, selectedImages]);

  const handleContextMenu = useCallback((e: React.MouseEvent, image: ImageFile) => {
    e.preventDefault();
    setSelectedIds((prev) => (prev.has(image.id) ? prev : new Set([image.id])));
    setAnchorId(image.id);
    setTagDraft(getImageMetadata(image).tags.join(', '));
    setColorLabelDraft(getImageMetadata(image).colorLabel ?? '');
    setContextMenu({ x: e.clientX, y: e.clientY, image });
  }, []);

  const saveMetadataDraft = useCallback(() => {
    if (!contextMenu) return;
    onUpdateImageMetadata(contextMenu.image.id, {
      tags: tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean),
      colorLabel: colorLabelDraft || null,
    });
    showStatus('Metadata saved.');
    setContextMenu(null);
  }, [colorLabelDraft, contextMenu, onUpdateImageMetadata, showStatus, tagDraft]);

  const toggleFavorite = useCallback((image: ImageFile) => {
    onUpdateImageMetadata(image.id, { favorite: !getImageMetadata(image).favorite });
    showStatus(getImageMetadata(image).favorite ? 'Removed from favorites.' : 'Added to favorites.');
  }, [onUpdateImageMetadata, showStatus]);

  const setImageRating = useCallback((image: ImageFile, rating: number) => {
    onUpdateImageMetadata(image.id, { rating });
    showStatus(`Rating set to ${rating}/5.`);
  }, [onUpdateImageMetadata, showStatus]);

  const openRenameDialog = useCallback(
    (target: ImageFile | null) => {
      if (!target) {
        showStatus('No image selected.');
        return;
      }
      setRenameDialog({
        image: target,
        value: target.name,
        error: null,
      });
    },
    [showStatus]
  );

  const handleCopyToFolder = useCallback(async () => {
    if (!contextMenu) return;
    const targets = getActionImages(contextMenu.image).filter((image) => image.source === 'folder' && image.path);
    const targetFolderPath = await chooseTargetFolder();
    if (!targetFolderPath) return;
    setContextMenu(null);
    await runBatchOperation(
      targets,
      (paths) => onCopyImages(paths, targetFolderPath),
      `${targets.length} image(s) copied.`
    );
  }, [chooseTargetFolder, contextMenu, getActionImages, onCopyImages, runBatchOperation]);

  const handleMoveToFolder = useCallback(async () => {
    if (!contextMenu) return;
    const targets = getActionImages(contextMenu.image).filter((image) => image.source === 'folder' && image.path);
    const targetFolderPath = await chooseTargetFolder();
    if (!targetFolderPath) return;
    setContextMenu(null);
    await runBatchOperation(
      targets,
      (paths) => onMoveImages(paths, targetFolderPath),
      `${targets.length} image(s) moved.`
    );
  }, [chooseTargetFolder, contextMenu, getActionImages, onMoveImages, runBatchOperation]);

  const copySelectionToFolder = useCallback(async () => {
    const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
    if (targets.length === 0) {
      showStatus('No saved image selected. Imported files must be saved first.');
      return;
    }
    const targetFolderPath = await chooseTargetFolder();
    if (!targetFolderPath) return;
    await runBatchOperation(
      targets,
      (paths) => onCopyImages(paths, targetFolderPath),
      `${targets.length} image(s) copied.`
    );
  }, [chooseTargetFolder, getActionImages, onCopyImages, runBatchOperation, showStatus]);

  const moveSelectionToFolder = useCallback(async () => {
    const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
    if (targets.length === 0) {
      showStatus('No saved image selected. Imported files must be saved first.');
      return;
    }
    const targetFolderPath = await chooseTargetFolder();
    if (!targetFolderPath) return;
    await runBatchOperation(
      targets,
      (paths) => onMoveImages(paths, targetFolderPath),
      `${targets.length} image(s) moved.`
    );
  }, [chooseTargetFolder, getActionImages, onMoveImages, runBatchOperation, showStatus]);

  const toggleFavoriteSelection = useCallback(() => {
    const targets = getActionImages();
    if (targets.length === 0) {
      showStatus('No image selected.');
      return;
    }
    const shouldRemove = targets.every((image) => getImageMetadata(image).favorite);
    targets.forEach((image) => onUpdateImageMetadata(image.id, { favorite: !shouldRemove }));
    showStatus(shouldRemove ? `${targets.length} image(s) removed from favorites.` : `${targets.length} image(s) added to favorites.`);
  }, [getActionImages, onUpdateImageMetadata, showStatus]);

  const handleRenameFromMenu = useCallback(() => {
    if (!contextMenu) return;
    const targets = getActionImages(contextMenu.image).filter((image) => image.source === 'folder' && image.path);
    setContextMenu(null);
    if (targets.length !== 1) {
      showStatus('Rename is available for one image at a time.');
      return;
    }
    openRenameDialog(targets[0]);
  }, [contextMenu, getActionImages, openRenameDialog, showStatus]);

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) return;
    const targets = getActionImages(contextMenu.image).filter((image) => image.source === 'folder' && image.path);
    setContextMenu(null);
    if (targets.length === 0) {
      showStatus('No image selected.');
      return;
    }
    if (!confirmDelete) {
      void runBatchOperation(targets, (paths) => onDeleteImages(paths), `${targets.length} image(s) moved to Recycle Bin.`);
      setSelectedIds(new Set());
      return;
    }
    setDeleteDialog({ images: targets });
  }, [confirmDelete, contextMenu, getActionImages, onDeleteImages, runBatchOperation, showStatus]);

  const deleteSelection = useCallback(() => {
    const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
    if (targets.length === 0) {
      showStatus('No image selected.');
      return;
    }
    if (!confirmDelete) {
      void runBatchOperation(targets, (paths) => onDeleteImages(paths), `${targets.length} image(s) moved to Recycle Bin.`);
      clearSelection();
      return;
    }
    setDeleteDialog({ images: targets });
  }, [clearSelection, confirmDelete, getActionImages, onDeleteImages, runBatchOperation, showStatus]);

  const renameSelection = useCallback(() => {
    const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
    if (targets.length !== 1) {
      showStatus('Rename is available for one image at a time.');
      return;
    }
    openRenameDialog(targets[0]);
  }, [getActionImages, openRenameDialog, showStatus]);

  const batchRenameSelection = useCallback(() => {
    if (selectedImages.length < 2) {
      showStatus('Select at least two images to rename together.');
      return;
    }
    setBatchRenameOpen(true);
  }, [selectedImages.length, showStatus]);

  const handleProFeature = useCallback((feature: RibbonProFeature) => {
    if (BUILD_EDITION === 'pro') {
      if (feature === 'capture') {
        setCaptureOpen(true);
        return;
      }
      if (feature === 'batch-edit' || feature === 'advanced-export') {
        const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
        if (targets.length === 0) {
          showStatus('No saved image selected. Imported files must be saved first.');
          return;
        }
        setBatchEditRequest({ mode: feature === 'advanced-export' ? 'export' : 'edit', images: targets });
        return;
      }
      if (feature === 'duplicate-search') {
        const targets = images.filter((image) => image.source === 'folder' && image.path);
        if (targets.length < 2) {
          showStatus('At least two saved images are required for duplicate search.');
          return;
        }
        setDuplicateSearchImages(targets);
        return;
      }
    }
    const labels: Record<RibbonProFeature, string> = language === 'ko'
      ? {
          capture: '화면 캡처는 Pro 전용 기능입니다. 도움말의 Pro로 전환에서 라이선스를 확인하세요.',
          'batch-edit': '일괄 편집과 포맷 변환은 Pro 전용 기능입니다.',
          'advanced-export': '고급 내보내기는 Pro 전용 기능입니다.',
          'duplicate-search': '중복 이미지 검색은 Pro 전용 기능입니다.',
        }
      : {
          capture: 'Screen capture is a Pro feature. Use Switch to Pro in Help to activate your license.',
          'batch-edit': 'Batch editing and format conversion are Pro features.',
          'advanced-export': 'Advanced export is a Pro feature.',
          'duplicate-search': 'Duplicate image search is a Pro feature.',
        };
    showStatus(BUILD_EDITION === 'pro'
      ? (language === 'ko' ? 'Pro 모듈은 다음 단계에서 연결됩니다.' : 'The Pro module will be connected in the next step.')
      : labels[feature]);
  }, [getActionImages, images, language, showStatus]);

  const handleBatchEditComplete = useCallback((result: BatchOperationResult) => {
    if (result.failed.length > 0) {
      showStatus(`${result.succeeded.length} completed, ${result.failed.length} failed.`);
    } else {
      showStatus(`${result.succeeded.length} image(s) processed.`);
    }
    setBatchEditRequest(null);
    onRefresh?.();
  }, [onRefresh, showStatus]);

  const submitRename = useCallback(async () => {
    if (!renameDialog) return;
    const trimmed = renameDialog.value.trim();
    if (!trimmed) {
      setRenameDialog((prev) => (prev ? { ...prev, error: 'File name cannot be empty.' } : prev));
      return;
    }

    setBusy(true);
    try {
      await onRenameImage(renameDialog.image.path, trimmed);
      setRenameDialog(null);
      showStatus('File renamed.');
    } catch (error) {
      setRenameDialog((prev) =>
        prev
          ? {
              ...prev,
              error: error instanceof Error ? error.message : 'Rename failed.',
            }
          : prev
      );
    } finally {
      setBusy(false);
    }
  }, [onRenameImage, renameDialog, showStatus]);

  const submitBatchRename = useCallback(async (renames: Array<{ image: ImageFile; nextName: string }>) => {
    setBusy(true);
    let result: BatchOperationResult = { succeeded: [], failed: [] };
    try {
      result = await onRenameImages(renames.map(({ image, nextName }) => ({ sourcePath: image.path, nextName })));
    } catch (error) {
      result.failed.push({ sourcePath: '', error: error instanceof Error ? error.message : 'Rename failed.' });
    } finally {
      setBusy(false);
    }
    setBatchRenameOpen(false);
    if (result.failed.length > 0) {
      setStatusMessage(`${result.succeeded.length} renamed, ${result.failed.length} failed. ${result.failed[0].error ?? ''}`);
    } else {
      showStatus(`${result.succeeded.length} files renamed.`);
    }
  }, [onRenameImages, showStatus]);

  const submitDelete = useCallback(async () => {
    if (!deleteDialog) return;
    const targets = deleteDialog.images;
    setDeleteDialog(null);
    await runBatchOperation(
      targets,
      (paths) => onDeleteImages(paths),
      `${targets.length} image(s) moved to Recycle Bin.`
    );
    setSelectedIds(new Set());
  }, [deleteDialog, onDeleteImages, runBatchOperation]);

  const moveActive = useCallback(
    (delta: number, keepSelection: boolean) => {
      if (filtered.length === 0) return;
      const start = activeIndex >= 0 ? activeIndex : Math.max(0, filtered.findIndex((img) => selectedIds.has(img.id)));
      const safeStart = start < 0 ? 0 : start;
      const nextIndex = Math.max(0, Math.min(filtered.length - 1, safeStart + delta));
      const nextImage = filtered[nextIndex];
      setActiveId(nextImage?.id ?? null);
      if (!keepSelection && nextImage) {
        setSelectedIds(new Set([nextImage.id]));
      }
    },
    [activeIndex, filtered, selectedIds]
  );

  const copyOrCutSelection = useCallback(
    (mode: 'copy' | 'cut') => {
      const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
      if (targets.length === 0) {
        showStatus('No saved image selected. Imported files must be saved first.');
        return;
      }
      setClipboard({
        mode,
        items: targets.map((img) => ({ path: img.path, name: img.name })),
      });
      showStatus(`${targets.length} image(s) ${mode === 'copy' ? 'copied' : 'cut'} to clipboard.`);
    },
    [getActionImages, showStatus]
  );

  const pasteClipboard = useCallback(async () => {
    if (!clipboard || clipboard.items.length === 0) {
      showStatus('Clipboard is empty.');
      return;
    }
    if (!currentFolderPath) {
      showStatus('No target folder selected.');
      return;
    }

    const mode = clipboard.mode;
    const paths = clipboard.items.map((item) => item.path);
    setBusy(true);
    try {
      const result = mode === 'copy'
        ? await onCopyImages(paths, currentFolderPath)
        : await onMoveImages(paths, currentFolderPath);
      if (result.failed.length > 0) {
        showStatus(`${result.succeeded.length} completed, ${result.failed.length} failed.`);
      } else {
        showStatus(`${paths.length} image(s) ${mode === 'copy' ? 'pasted' : 'moved'}.`);
      }
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Paste failed.');
    } finally {
      setBusy(false);
    }

    if (mode === 'cut') {
      setClipboard(null);
      setSelectedIds(new Set());
    }
  }, [clipboard, currentFolderPath, onCopyImages, onMoveImages, showStatus]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (busy) return;
      if (isEditableElement(e.target)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key;
      const lower = key.toLowerCase();

      if (ctrl && lower === 'c') {
        e.preventDefault();
        copyOrCutSelection('copy');
        return;
      }
      if (ctrl && lower === 'x') {
        e.preventDefault();
        copyOrCutSelection('cut');
        return;
      }
      if (ctrl && lower === 'v') {
        e.preventDefault();
        void pasteClipboard();
        return;
      }

      if (ctrl && lower === 'a') {
        e.preventDefault();
        setSelectedIds(selectAll(filtered));
        setAnchorId(filtered[0]?.id ?? null);
        setActiveId(filtered[0]?.id ?? null);
        return;
      }

      if (key === 'F2') {
        e.preventDefault();
        const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
        if (targets.length !== 1) {
          showStatus('Rename is available for one image at a time.');
          return;
        }
        openRenameDialog(targets[0]);
        return;
      }

      if (key === 'Delete') {
        e.preventDefault();
        const targets = getActionImages().filter((image) => image.source === 'folder' && image.path);
        if (targets.length === 0) {
          showStatus('No image selected.');
          return;
        }
        if (!confirmDelete) {
          void runBatchOperation(targets, (paths) => onDeleteImages(paths), `${targets.length} image(s) moved to Recycle Bin.`);
          setSelectedIds(new Set());
        } else {
          setDeleteDialog({ images: targets });
        }
        return;
      }

      if (key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0) {
          openImageByIndex(activeIndex);
        } else if (filtered.length > 0) {
          openImageByIndex(0);
        }
        return;
      }

      if (key === 'Escape') {
        e.preventDefault();
        setContextMenu(null);
        setRenameDialog(null);
        setDeleteDialog(null);
        setSelectedIds(new Set());
        setActiveId(null);
        setAnchorId(null);
        showStatus('Selection cleared.');
        return;
      }

      if (key === 'ArrowRight') {
        e.preventDefault();
        moveActive(1, ctrl);
        return;
      }
      if (key === 'ArrowLeft') {
        e.preventDefault();
        moveActive(-1, ctrl);
        return;
      }
      if (key === 'ArrowDown') {
        e.preventDefault();
        moveActive(getGridColumnCount(), ctrl);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        moveActive(-getGridColumnCount(), ctrl);
      }
    },
    [
      activeIndex,
      busy,
      copyOrCutSelection,
      filtered.length,
      getActionImages,
      getGridColumnCount,
      moveActive,
      onDeleteImages,
      openImageByIndex,
      openRenameDialog,
      pasteClipboard,
      confirmDelete,
      runBatchOperation,
      showStatus,
    ]
  );

  const gridCols = {
    small: 'grid-cols-1',
    medium: 'grid-cols-1',
    // Preview cards should fill the available width instead of collapsing to
    // four oversized columns.  A 230px minimum matches the reference layout
    // and still adapts cleanly to narrow windows.
    large: 'grid-cols-[repeat(auto-fill,minmax(230px,1fr))]',
    'large-icons': 'grid-cols-[repeat(auto-fill,minmax(340px,1fr))]',
    filmstrip: 'grid-cols-1',
  };

  const menuPosition = useMemo(() => {
    if (!contextMenu) return null;
    const menuWidth = 220;
    const menuHeight = 430;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    return {
      left: Math.min(contextMenu.x, maxX),
      top: Math.min(contextMenu.y, maxY),
    };
  }, [contextMenu]);

  const cutIdSet = useMemo(() => {
    if (!clipboard || clipboard.mode !== 'cut') return new Set<string>();
    return new Set(clipboard.items.map((item) => item.path));
  }, [clipboard]);

  return (
    <div className="flex h-full flex-col bg-gray-950" onKeyDown={handleGridKeyDown}>
      <Ribbon
        language={language}
        edition={BUILD_EDITION}
        selectedCount={selectedImages.length}
        itemCount={filtered.length}
        hasActiveImage={Boolean(activeImage)}
        viewSize={viewSize}
        sortMode={sortMode}
        sortDirection={sortDirection}
        onOpenFolder={onOpenFolder}
        onOpenFiles={onOpenFiles}
        onNewFolder={onNewFolder}
        onCopyToFolder={onCopyToFolder ?? copySelectionToFolder}
        onMoveToFolder={onMoveToFolder ?? moveSelectionToFolder}
        onToggleFavorite={onToggleFavorite ?? toggleFavoriteSelection}
        onRefresh={onRefresh}
        onSettings={onSettings}
        onAbout={onAbout}
        onCheckForUpdates={onCheckForUpdates}
        onClose={onClose}
        onOpenActive={openActiveImage}
        onStartSlideshow={startSlideshow}
        onSaveAs={() => void saveActiveImage()}
        onPrint={printActiveImage}
        onShowCameraInfo={() => setCommandDialog('camera')}
        onShowProperties={() => setCommandDialog('properties')}
        onRotate={rotateSelection}
        onNavigateBack={onNavigateBack}
        onNavigateForward={onNavigateForward}
        onNavigateUp={onNavigateUp}
        canNavigateUp={Boolean(getParentFolderPath(currentFolderPath))}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        onShowFileOptions={() => setCommandDialog('file-options')}
        onShowImageOptions={openImageOptions}
        onViewCopiedImage={viewCopiedImage}
        onShowMetadata={openMetadataDialog}
        onShowShortcuts={() => setCommandDialog('shortcuts')}
        onViewSizeChange={changeViewSize}
        onSortModeChange={setSortModeValue}
        onSortDirectionChange={(direction) => {
          setSortDirection(direction);
          onViewPreferencesChange?.({ sortDirection: direction });
        }}
        onSelectAll={selectAllImages}
        onInvertSelection={invertSelection}
        onClearSelection={clearSelection}
        onCopy={() => copyOrCutSelection('copy')}
        onCut={() => copyOrCutSelection('cut')}
        onPaste={() => void pasteClipboard()}
        onRename={renameSelection}
        onDelete={deleteSelection}
        onBatchRename={batchRenameSelection}
        onNotify={showStatus}
        onProFeature={handleProFeature}
      />
      <LocationBar
        currentFolderPath={currentFolderPath}
        language={language}
        onNavigateUp={onNavigateUp}
        onRefresh={onRefresh}
      />
      <div className="flex items-center gap-3 border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 py-1.5 pl-8 pr-3 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 p-0.5">
          {(['small', 'medium', 'large'] as ViewSize[]).map((size) => (
            <button
              key={size}
              onClick={() => changeViewSize(size)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                viewSize === size ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              )}
            >
              {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={changeSortMode}
            className="flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
            title="Change sort field"
          >
            <ArrowUpDown size={12} />
            {sortMode === 'name' ? 'Name' : sortMode === 'type' ? 'Type' : sortMode === 'size' ? 'Size' : sortMode === 'date' ? 'Date' : 'Rating'}
          </button>
          <button
            onClick={changeSortDirection}
            className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            title="Toggle sort direction"
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Grid3X3 size={14} />
          {selectedIds.size > 0
            ? `${selectedIds.size} selected / ${filtered.length} items`
            : `${filtered.length} items`}
        </div>
        {selectedImages.length > 1 && (
          <button
            onClick={() => setBatchRenameOpen(true)}
            className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
          >
            {t(language, 'batchRename')}
          </button>
        )}
      </div>

      <FilterBar
        format={formatFilter}
        size={sizeFilter}
        date={dateFilter}
        favoriteOnly={favoriteOnly}
        minimumRating={minimumRating}
        onFormatChange={setFormatFilter}
        onSizeChange={setSizeFilter}
        onDateChange={setDateFilter}
        onFavoriteChange={setFavoriteOnly}
        onMinimumRatingChange={setMinimumRating}
        language={language}
        onClear={() => {
          setFormatFilter('all');
          setSizeFilter('all');
          setDateFilter('all');
          setFavoriteOnly(false);
          setMinimumRating(0);
        }}
      />

      {clipboard && (
        <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-1 text-xs text-gray-400">
          Clipboard: {clipboard.items.length} image(s) {clipboard.mode === 'copy' ? 'copied' : 'cut'}
        </div>
      )}

      {statusMessage && (
        <div className="border-b border-blue-900/50 bg-blue-950/40 px-4 py-1.5 text-xs text-blue-200">
          {statusMessage}
        </div>
      )}

      {filtered.length > 0 || showParentFolder ? (
        viewSize === 'filmstrip' ? (
          <FilmstripView
            images={filtered}
            activeImage={activeImage}
            activeIndex={activeIndex}
            currentFolderPath={currentFolderPath}
            language={language}
            busy={busy}
            selectedIds={selectedIds}
            activeId={activeId}
            cutIdSet={cutIdSet}
            gridRef={gridRef}
            onFocus={() => setGridFocused(true)}
            onBlur={() => setGridFocused(false)}
            onNavigateUp={onNavigateUp}
            onSelectClick={handleSelectClick}
            onDoubleClick={openImageByIndex}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onImageLoad={handleImageLoad}
          />
        ) : (
        <div
          ref={gridRef}
          tabIndex={0}
          onFocus={() => setGridFocused(true)}
          onBlur={() => setGridFocused(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedIds(new Set());
              setActiveId(null);
              setAnchorId(null);
            }
          }}
          className={cn(
            'flex-1 content-start overflow-auto p-3 auto-rows-min grid gap-2 outline-none',
            gridCols[viewSize],
            (viewSize === 'small' || viewSize === 'medium') && 'gap-0.5',
            gridFocused && 'ring-inset ring-2 ring-blue-500/40'
          )}
        >
          {viewSize === 'small' && <DetailsListHeader language={language} />}
          {showParentFolder && (
            viewSize === 'small' ? (
              <DetailsParentFolderItem
                language={language}
                disabled={busy}
                onClick={() => onNavigateUp?.()}
              />
            ) : (
              <ParentFolderItem
                language={language}
                disabled={busy}
                largeIcons={viewSize === 'large-icons'}
                simple={viewSize === 'medium'}
                onClick={() => onNavigateUp?.()}
              />
            )
          )}
          {filtered.map((image, index) => (
            viewSize === 'small' ? (
              <DetailsListItem
                key={image.id}
                image={image}
                index={index}
                active={activeId === image.id}
                selected={selectedIds.has(image.id)}
                dimmedForCut={cutIdSet.has(image.path)}
                disabled={busy}
                language={language}
                onClick={handleSelectClick}
                onDoubleClick={openImageByIndex}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onImageLoad={handleImageLoad}
              />
            ) : viewSize === 'medium' ? (
              <SimpleListItem
                key={image.id}
                image={image}
                index={index}
                active={activeId === image.id}
                selected={selectedIds.has(image.id)}
                dimmedForCut={cutIdSet.has(image.path)}
                disabled={busy}
                language={language}
                onClick={handleSelectClick}
                onDoubleClick={openImageByIndex}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onImageLoad={handleImageLoad}
              />
            ) : viewSize === 'large-icons' ? (
              <LargeIconItem
                key={image.id}
                image={image}
                index={index}
                active={activeId === image.id}
                selected={selectedIds.has(image.id)}
                dimmedForCut={cutIdSet.has(image.path)}
                disabled={busy}
                language={language}
                onClick={handleSelectClick}
                onDoubleClick={openImageByIndex}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onImageLoad={handleImageLoad}
              />
            ) : (
              <ThumbnailItem
                key={image.id}
                image={image}
                index={index}
                active={activeId === image.id}
                selected={selectedIds.has(image.id)}
                dimmedForCut={cutIdSet.has(image.path)}
                disabled={busy}
                viewSize={viewSize}
                onClick={handleSelectClick}
                onDoubleClick={openImageByIndex}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onImageLoad={handleImageLoad}
              />
            )
          ))}
        </div>
        )
      ) : images.length > 0 ? (
        <div className="flex flex-1 items-center justify-center text-gray-500">
          <div className="text-center">
            <Search size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No search results.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-gray-500">
          <div className="text-center">
            <ImageIcon size={64} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-400">No images in this folder</p>
            <p className="mt-2 text-sm text-gray-500">Open a folder to browse images.</p>
          </div>
        </div>
      )}

      {contextMenu && menuPosition && (
        <div
          className="fixed z-[80] min-w-[220px] overflow-hidden rounded-md border border-gray-700 bg-[#1f1f1f] shadow-2xl"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-700 px-3 py-2 text-xs text-gray-400">
            {contextMenu.image.name}
          </div>
          <button
            onClick={() => {
              toggleFavorite(contextMenu.image);
              setContextMenu(null);
            }}
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-yellow-200 transition-colors hover:bg-gray-700 disabled:opacity-60"
          >
            <Star size={14} fill={getImageMetadata(contextMenu.image).favorite ? 'currentColor' : 'none'} />
            {getImageMetadata(contextMenu.image).favorite ? 'Remove Favorite' : 'Add Favorite'}
          </button>
          <div className="flex items-center gap-1 border-b border-gray-700 px-3 py-2">
            <span className="mr-1 text-xs text-gray-400">Rating</span>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => {
                  setImageRating(contextMenu.image, rating);
                  setContextMenu(null);
                }}
                className={cn(
                  'text-sm',
                  getImageMetadata(contextMenu.image).rating >= rating ? 'text-yellow-300' : 'text-gray-600 hover:text-yellow-200'
                )}
                title={`${rating}/5`}
              >
                ★
              </button>
              ))}
            </div>
          <div className="space-y-2 border-b border-gray-700 px-3 py-2">
            <label className="flex items-center justify-between gap-2 text-xs text-gray-400">
              Label
              <select
                value={colorLabelDraft}
                onChange={(event) => setColorLabelDraft(event.target.value)}
                className="rounded border border-gray-600 bg-gray-800 px-1.5 py-1 text-xs text-gray-200"
              >
                <option value="">None</option>
                <option value="red">Red</option>
                <option value="orange">Orange</option>
                <option value="yellow">Yellow</option>
                <option value="green">Green</option>
                <option value="blue">Blue</option>
                <option value="purple">Purple</option>
              </select>
            </label>
            <label className="block text-xs text-gray-400">
              Tags (comma separated)
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveMetadataDraft();
                  }
                }}
                className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
                placeholder="travel, family"
              />
            </label>
            <button onClick={saveMetadataDraft} className="w-full rounded bg-blue-700 px-2 py-1 text-xs text-white hover:bg-blue-600">
              Save metadata
            </button>
          </div>
          <button
            onClick={() => void handleCopyToFolder()}
            disabled={busy}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
          >
            Copy To Folder...
          </button>
          <button
            onClick={() => void handleMoveToFolder()}
            disabled={busy}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
          >
            Move To Folder...
          </button>
          <button
            onClick={handleRenameFromMenu}
            disabled={busy}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
          >
            Rename...
          </button>
          <button
            onClick={handleDeleteFromMenu}
            disabled={busy}
            className="w-full px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-900/30 disabled:cursor-wait disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      )}

      {batchRenameOpen && (
        <BatchRenameDialog
          images={selectedImages.filter((image) => image.source === 'folder' && image.path)}
          busy={busy}
          onClose={() => setBatchRenameOpen(false)}
          onSubmit={submitBatchRename}
        />
      )}

      {renameDialog && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50">
          <div
            className="w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-700 bg-[#1f1f1f] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-medium text-white">Rename File</h4>
            <p className="mt-1 truncate text-xs text-gray-400">{renameDialog.image.name}</p>
            <input
              autoFocus
              value={renameDialog.value}
              disabled={busy}
              onChange={(e) =>
                setRenameDialog((prev) =>
                  prev ? { ...prev, value: e.target.value, error: null } : prev
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitRename();
                }
              }}
              className="mt-3 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
            {renameDialog.error && <p className="mt-2 text-xs text-red-300">{renameDialog.error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRenameDialog(null)}
                disabled={busy}
                className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitRename()}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDialog && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50">
          <div
            className="w-[460px] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-700 bg-[#1f1f1f] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && !isEditableElement(e.target)) {
                e.preventDefault();
                void submitDelete();
              }
            }}
          >
            <h4 className="text-sm font-medium text-white">Delete Image{deleteDialog.images.length > 1 ? 's' : ''}</h4>
            <p className="mt-2 text-sm text-gray-300">
              {deleteDialog.images.length} image{deleteDialog.images.length > 1 ? 's' : ''} will be
              moved to Recycle Bin.
            </p>
            <div className="mt-2 max-h-28 overflow-auto rounded border border-gray-700 bg-gray-900 p-2 text-xs text-gray-400">
              {deleteDialog.images.map((img) => (
                <div key={img.id} className="truncate">
                  {img.name}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteDialog(null)}
                disabled={busy}
                className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitDelete()}
                disabled={busy}
                autoFocus
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {commandDialog && (
        <RibbonCommandDialog
          kind={commandDialog}
          language={language}
          image={activeImage}
          formatFilter={formatFilter}
          sizeFilter={sizeFilter}
          dateFilter={dateFilter}
          favoriteOnly={favoriteOnly}
          minimumRating={minimumRating}
          onFormatChange={setFormatFilter}
          onSizeChange={setSizeFilter}
          onDateChange={setDateFilter}
          onFavoriteChange={setFavoriteOnly}
          onMinimumRatingChange={setMinimumRating}
          onClearFilters={() => {
            setFormatFilter('all');
            setSizeFilter('all');
            setDateFilter('all');
            setFavoriteOnly(false);
            setMinimumRating(0);
          }}
          onSaveMetadata={saveCommandMetadata}
          onClose={() => setCommandDialog(null)}
        />
      )}

      {editorImage && <ImageEditor image={editorImage} onClose={() => setEditorImage(null)} />}

      {captureOpen && BUILD_EDITION === 'pro' && (
        <ScreenCaptureDialog
          language={language}
          onClose={() => setCaptureOpen(false)}
          onCaptured={(result) => showStatus(language === 'ko'
            ? `캡처 완료 · ${result.width} × ${result.height}`
            : `Capture copied · ${result.width} × ${result.height}`)}
        />
      )}

      {batchEditRequest && BUILD_EDITION === 'pro' && (
        <BatchEditDialog
          images={batchEditRequest.images}
          language={language}
          mode={batchEditRequest.mode}
          onClose={() => setBatchEditRequest(null)}
          onComplete={handleBatchEditComplete}
        />
      )}

      {duplicateSearchImages && BUILD_EDITION === 'pro' && (
        <DuplicateSearchDialog
          images={duplicateSearchImages}
          language={language}
          onClose={() => setDuplicateSearchImages(null)}
        />
      )}
    </div>
  );
}
