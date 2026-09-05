import { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, X } from 'lucide-react';
import type {
  BatchImageEditOptions,
  BatchImageFormat,
  BatchImageRotation,
  BatchOperationResult,
  ImageFile,
} from '../types';
import type { Language } from '../i18n';

interface BatchEditDialogProps {
  images: ImageFile[];
  language: Language;
  mode: 'edit' | 'export';
  onClose: () => void;
  onComplete: (result: BatchOperationResult) => void;
}

const FORMAT_OPTIONS: Array<{ value: BatchImageFormat; label: string }> = [
  { value: 'original', label: '원본 형식 유지' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

const ROTATION_OPTIONS: Array<{ value: BatchImageRotation; label: string }> = [
  { value: 0, label: '회전 없음' },
  { value: 90, label: '90° 시계 방향' },
  { value: 180, label: '180° 회전' },
  { value: 270, label: '90° 반시계 방향' },
];

export function BatchEditDialog({ images, language, mode, onClose, onComplete }: BatchEditDialogProps) {
  const ko = language === 'ko';
  const [format, setFormat] = useState<BatchImageFormat>('original');
  const [quality, setQuality] = useState(90);
  const [maxDimension, setMaxDimension] = useState('');
  const [rotation, setRotation] = useState<BatchImageRotation>(0);
  const [outputFolderPath, setOutputFolderPath] = useState<string | null>(null);
  const [outputFolderLabel, setOutputFolderLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  const chooseOutputFolder = async () => {
    if (busy) return;
    const picked = await window.electron.chooseDirectory();
    if (!picked) return;
    setOutputFolderPath(picked.path);
    setOutputFolderLabel(picked.name);
    setError(null);
  };

  const submit = async () => {
    if (images.length === 0) {
      setError(ko ? '처리할 이미지를 먼저 선택하세요.' : 'Select at least one image to process.');
      return;
    }
    if (mode === 'export' && !outputFolderPath) {
      setError(ko ? '내보낼 대상 폴더를 선택하세요.' : 'Choose an export destination folder.');
      return;
    }
    const dimensionText = maxDimension.trim();
    const parsedDimension = dimensionText ? Number(dimensionText) : null;
    if (parsedDimension !== null && (!Number.isFinite(parsedDimension) || parsedDimension < 1)) {
      setError(ko ? '최대 크기는 1 이상의 숫자여야 합니다.' : 'The maximum dimension must be a number of at least 1.');
      return;
    }

    const options: BatchImageEditOptions = {
      outputFolderPath,
      format,
      quality,
      maxWidth: parsedDimension,
      maxHeight: parsedDimension,
      rotation,
      suffix: mode === 'export' ? '_exported' : '_edited',
    };
    setBusy(true);
    setError(null);
    try {
      const result = await window.electron.batchEditImages(images.map((image) => image.path), options);
      onComplete(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (ko ? '일괄 작업에 실패했습니다.' : 'Batch processing failed.'));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'export'
    ? (ko ? '고급 내보내기' : 'Advanced export')
    : (ko ? '일괄 편집' : 'Batch edit');

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/65 p-4" role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <section
        className="w-[620px] max-w-full overflow-hidden rounded-xl border border-teal-500/40 bg-[#1f1f1f] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-700 px-5 py-4">
          <div>
            <h2 id="batch-edit-title" className="text-base font-semibold text-white">{title}</h2>
            <p className="mt-1 text-xs text-gray-400">
              {ko ? `${images.length}개 이미지에 동일한 설정을 적용합니다.` : `Apply the same settings to ${images.length} image${images.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50" aria-label={ko ? '닫기' : 'Close'}>
            <X size={17} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="max-h-28 overflow-auto rounded-lg border border-gray-700 bg-gray-900/70 p-2 text-xs text-gray-300">
            {images.slice(0, 8).map((image) => <div key={image.id} className="truncate py-0.5">{image.name}</div>)}
            {images.length > 8 && <div className="pt-1 text-gray-500">+ {images.length - 8} more</div>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="text-gray-400">
              {ko ? '출력 형식' : 'Output format'}
              <select value={format} onChange={(event) => setFormat(event.target.value as BatchImageFormat)} disabled={busy} className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white">
                {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{ko ? option.label : option.value === 'original' ? 'Keep original' : option.value.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="text-gray-400">
              {ko ? '회전' : 'Rotation'}
              <select value={rotation} onChange={(event) => setRotation(Number(event.target.value) as BatchImageRotation)} disabled={busy} className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white">
                {ROTATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{ko ? option.label : option.value === 0 ? 'None' : `${option.value}° clockwise`}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="text-gray-400">
              {ko ? '최대 가로·세로 (선택)' : 'Max width / height (optional)'}
              <input value={maxDimension} onChange={(event) => setMaxDimension(event.target.value.replace(/[^0-9]/g, ''))} disabled={busy} inputMode="numeric" placeholder={ko ? '예: 2400' : 'e.g. 2400'} className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white placeholder-gray-600" />
            </label>
            <label className="text-gray-400">
              {ko ? '품질' : 'Quality'} <span className="text-gray-500">({quality})</span>
              <input type="range" min="10" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} disabled={busy || format === 'png'} className="mt-3 w-full" />
            </label>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-300">{mode === 'export' ? (ko ? '내보내기 폴더' : 'Export folder') : (ko ? '저장 위치' : 'Output location')}</p>
                <p className="mt-1 truncate text-xs text-gray-500">{outputFolderLabel || (mode === 'export' ? (ko ? '폴더를 선택하세요.' : 'Choose a destination folder.') : (ko ? '각 원본 폴더에 _edited 파일로 저장' : 'Save _edited files beside each original'))}</p>
              </div>
              <button type="button" onClick={() => void chooseOutputFolder()} disabled={busy} className="flex shrink-0 items-center gap-1 rounded border border-gray-600 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50">
                <FolderOpen size={14} />{ko ? '폴더 선택' : 'Choose folder'}
              </button>
            </div>
          </div>

          {error && <p className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200" role="alert">{error}</p>}
          <p className="text-[11px] leading-relaxed text-gray-500">
            {mode === 'export'
              ? (ko ? '원본은 변경하지 않고 선택한 폴더에 _exported 파일을 만듭니다.' : 'Original files are preserved; _exported files are created in the selected folder.')
              : (ko ? '원본은 변경하지 않고 각 원본 폴더에 _edited 파일을 만듭니다.' : 'Original files are preserved; _edited files are created beside each original.')}
          </p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-700 bg-gray-900/50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50">{ko ? '취소' : 'Cancel'}</button>
          <button type="button" onClick={() => void submit()} disabled={busy || images.length === 0} className="flex items-center gap-2 rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50">
            {busy && <RefreshCw size={14} className="animate-spin" />}
            {busy ? (ko ? '처리 중…' : 'Processing…') : (ko ? `${images.length}개 처리` : `Process ${images.length}`)}
          </button>
        </footer>
      </section>
    </div>
  );
}
