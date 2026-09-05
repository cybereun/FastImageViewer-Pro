import { useEffect, useState } from 'react';
import { Camera, FileText, Keyboard, Tags, X } from 'lucide-react';
import type { ImageFile, ImageMetadata } from '../types';
import { getImageMetadata } from '../domain/image';
import type { Language } from '../i18n';
import type { DateFilter, FormatFilter, SizeFilter } from './FilterBar';

export type RibbonDialogKind = 'properties' | 'camera' | 'metadata' | 'file-options' | 'shortcuts';

interface RibbonCommandDialogProps {
  kind: RibbonDialogKind;
  language: Language;
  image?: ImageFile | null;
  formatFilter?: FormatFilter;
  sizeFilter?: SizeFilter;
  dateFilter?: DateFilter;
  favoriteOnly?: boolean;
  minimumRating?: number;
  onFormatChange?: (value: FormatFilter) => void;
  onSizeChange?: (value: SizeFilter) => void;
  onDateChange?: (value: DateFilter) => void;
  onFavoriteChange?: (value: boolean) => void;
  onMinimumRatingChange?: (value: number) => void;
  onClearFilters?: () => void;
  onSaveMetadata?: (patch: Partial<ImageMetadata>) => void;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number, language: Language): string {
  if (!Number.isFinite(timestamp)) return '—';
  return new Date(timestamp).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US');
}

export function RibbonCommandDialog({
  kind,
  language,
  image,
  formatFilter = 'all',
  sizeFilter = 'all',
  dateFilter = 'all',
  favoriteOnly = false,
  minimumRating = 0,
  onFormatChange,
  onSizeChange,
  onDateChange,
  onFavoriteChange,
  onMinimumRatingChange,
  onClearFilters,
  onSaveMetadata,
  onClose,
}: RibbonCommandDialogProps) {
  const ko = language === 'ko';
  const [tags, setTags] = useState('');
  const [colorLabel, setColorLabel] = useState('');

  useEffect(() => {
    const metadata = image ? getImageMetadata(image) : null;
    setTags(metadata?.tags.join(', ') ?? '');
    setColorLabel(metadata?.colorLabel ?? '');
  }, [image]);

  const titles: Record<RibbonDialogKind, string> = {
    properties: ko ? '파일 속성' : 'File properties',
    camera: ko ? '카메라 정보' : 'Camera information',
    metadata: ko ? '메타데이터' : 'Metadata',
    'file-options': ko ? '파일 보기 옵션' : 'File view options',
    shortcuts: ko ? '키보드 단축키' : 'Keyboard shortcuts',
  };

  const closeLabel = ko ? '닫기' : 'Close';

  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/55 p-4" role="presentation" onClick={onClose}>
      <section
        className="w-[520px] max-w-full rounded-xl border border-gray-700 bg-[#1b1b1b] p-5 text-gray-200 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ribbon-command-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="ribbon-command-dialog-title" className="flex items-center gap-2 text-base font-semibold text-white">
            {kind === 'camera' ? <Camera size={17} /> : kind === 'metadata' ? <Tags size={17} /> : kind === 'shortcuts' ? <Keyboard size={17} /> : <FileText size={17} />}
            {titles[kind]}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white" aria-label={closeLabel} title={closeLabel}>
            <X size={17} />
          </button>
        </div>

        {(kind === 'properties' || kind === 'camera') && image && (
          <div className="mt-4 space-y-2 rounded-lg border border-gray-700 bg-[#111] p-4 text-sm">
            {[
              [ko ? '이름' : 'Name', image.name],
              [ko ? '크기' : 'Size', formatSize(image.size)],
              [ko ? '형식' : 'Type', image.type || '—'],
              [ko ? '해상도' : 'Dimensions', image.width && image.height ? `${image.width} × ${image.height}` : '—'],
              [ko ? '수정한 날짜' : 'Modified', formatDate(image.lastModified, language)],
              [ko ? '경로' : 'Path', image.path || (ko ? '가져온 파일' : 'Imported file')],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[110px_1fr] gap-3">
                <span className="text-gray-500">{label}</span>
                <span className="break-all text-gray-200">{value}</span>
              </div>
            ))}
            {kind === 'camera' && (
              <p className="mt-3 border-t border-gray-800 pt-3 text-xs leading-relaxed text-gray-500">
                {ko
                  ? '이 파일에서 앱이 읽을 수 있는 카메라·EXIF 정보가 위에 표시됩니다. 파일에 EXIF 정보가 없으면 해상도와 형식만 표시됩니다.'
                  : 'Camera and EXIF fields available to the app are shown above. If the file has no EXIF data, dimensions and type are shown instead.'}
              </p>
            )}
          </div>
        )}

        {kind === 'metadata' && image && (
          <div className="mt-4 space-y-3">
            <p className="truncate text-xs text-gray-400">{image.name}</p>
            <label className="block text-xs text-gray-400">
              {ko ? '색상 라벨' : 'Color label'}
              <select value={colorLabel} onChange={(event) => setColorLabel(event.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-200">
                <option value="">{ko ? '없음' : 'None'}</option>
                {['red', 'orange', 'yellow', 'green', 'blue', 'purple'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-400">
              {ko ? '태그 (쉼표로 구분)' : 'Tags (comma separated)'}
              <input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none" placeholder="travel, family" />
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">{ko ? '취소' : 'Cancel'}</button>
              <button
                type="button"
                onClick={() => {
                  onSaveMetadata?.({ tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), colorLabel: colorLabel || null });
                  onClose();
                }}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              >
                {ko ? '저장' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {kind === 'file-options' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-gray-500">{ko ? '현재 폴더의 표시 필터를 여기서 바로 변경할 수 있습니다.' : 'Change the current folder display filters here.'}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-400">{ko ? '형식' : 'Format'}
                <select value={formatFilter} onChange={(event) => onFormatChange?.(event.target.value as FormatFilter)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-200">
                  <option value="all">{ko ? '모든 형식' : 'All formats'}</option><option value="jpg">JPG / JPEG</option><option value="png">PNG</option><option value="gif">GIF</option><option value="webp">WebP</option><option value="bmp">BMP</option><option value="svg">SVG</option><option value="tif">TIFF</option><option value="avif">AVIF</option>
                </select>
              </label>
              <label className="text-xs text-gray-400">{ko ? '크기' : 'Size'}
                <select value={sizeFilter} onChange={(event) => onSizeChange?.(event.target.value as SizeFilter)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-200">
                  <option value="all">{ko ? '모든 크기' : 'Any size'}</option><option value="under1">Under 1 MB</option><option value="1to10">1–10 MB</option><option value="over10">Over 10 MB</option>
                </select>
              </label>
              <label className="text-xs text-gray-400">{ko ? '날짜' : 'Date'}
                <select value={dateFilter} onChange={(event) => onDateChange?.(event.target.value as DateFilter)} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-200">
                  <option value="all">{ko ? '모든 날짜' : 'Any date'}</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="year">This year</option>
                </select>
              </label>
              <label className="text-xs text-gray-400">{ko ? '최소 평점' : 'Minimum rating'}
                <select value={minimumRating} onChange={(event) => onMinimumRatingChange?.(Number(event.target.value))} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-200">
                  <option value={0}>{ko ? '평점 무관' : 'Any rating'}</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}+ {ko ? '점' : 'stars'}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
              <input type="checkbox" checked={favoriteOnly} onChange={(event) => onFavoriteChange?.(event.target.checked)} />
              {ko ? '즐겨찾기만 보기' : 'Favorites only'}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClearFilters} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">{ko ? '필터 지우기' : 'Clear filters'}</button>
              <button type="button" onClick={onClose} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500">{ko ? '완료' : 'Done'}</button>
            </div>
          </div>
        )}

        {kind === 'shortcuts' && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {(ko
              ? [['Ctrl+O', '폴더 열기'], ['Ctrl+Shift+O', '이미지 열기'], ['Ctrl+C / X / V', '복사 / 잘라내기 / 붙여넣기'], ['Ctrl+A', '모두 선택'], ['F2', '이름 변경'], ['Delete', '휴지통으로 삭제'], ['Enter', '크게 보기'], ['Esc', '선택 취소 / 닫기'], ['← ↑ ↓ →', '이미지 이동'], ['Space', '슬라이드쇼 시작 / 중지']]
              : [['Ctrl+O', 'Open folder'], ['Ctrl+Shift+O', 'Open images'], ['Ctrl+C / X / V', 'Copy / cut / paste'], ['Ctrl+A', 'Select all'], ['F2', 'Rename'], ['Delete', 'Move to Recycle Bin'], ['Enter', 'Open viewer'], ['Esc', 'Clear selection / close'], ['← ↑ ↓ →', 'Move between images'], ['Space', 'Start / stop slideshow']]
            ).map(([shortcut, description]) => (
              <div key={shortcut} className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-2 py-2">
                <kbd className="min-w-[92px] rounded border border-gray-600 bg-gray-800 px-1.5 py-1 text-center text-xs text-gray-200">{shortcut}</kbd>
                <span className="text-xs text-gray-300">{description}</span>
              </div>
            ))}
          </div>
        )}

        {!image && (kind === 'properties' || kind === 'camera' || kind === 'metadata') && (
          <p className="mt-4 rounded border border-gray-700 bg-gray-900 px-3 py-3 text-sm text-gray-400">{ko ? '이미지를 먼저 선택하세요.' : 'Select an image first.'}</p>
        )}
      </section>
    </div>
  );
}
