import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, X } from 'lucide-react';
import type { DuplicateImageGroup, ImageFile } from '../types';
import type { Language } from '../i18n';

interface DuplicateSearchDialogProps {
  images: ImageFile[];
  language: Language;
  onClose: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function DuplicateSearchDialog({ images, language, onClose }: DuplicateSearchDialogProps) {
  const ko = language === 'ko';
  const [groups, setGroups] = useState<DuplicateImageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.findDuplicateImages(images.map((image) => image.path));
        if (active) setGroups(result);
      } catch (searchError) {
        if (active) setError(searchError instanceof Error ? searchError.message : (ko ? '중복 검색에 실패했습니다.' : 'Duplicate search failed.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      active = false;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [images, ko, onClose]);

  const duplicateCount = useMemo(() => groups.reduce((sum, group) => sum + group.files.length - 1, 0), [groups]);
  const reclaimableBytes = useMemo(() => groups.reduce((sum, group) => sum + group.files.slice(1).reduce((total, file) => total + file.size, 0), 0), [groups]);

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/65 p-4" role="presentation" onClick={onClose}>
      <section className="flex max-h-[calc(100vh-2rem)] w-[680px] max-w-full flex-col overflow-hidden rounded-xl border border-teal-500/40 bg-[#1f1f1f] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="duplicate-search-title" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-gray-700 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-teal-500/15 p-2 text-teal-300"><Copy size={20} /></span>
            <div>
              <h2 id="duplicate-search-title" className="text-base font-semibold text-white">{ko ? '중복 이미지 검색' : 'Find duplicate images'}</h2>
              <p className="mt-1 text-xs text-gray-400">{ko ? '동일한 파일 내용을 SHA-256으로 비교합니다.' : 'Files are compared by their exact SHA-256 content.'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white" aria-label={ko ? '닫기' : 'Close'}><X size={17} /></button>
        </header>

        <div className="grid grid-cols-2 gap-2 border-b border-gray-700 bg-gray-900/50 px-5 py-3 text-xs">
          <div><span className="text-gray-500">{ko ? '중복 그룹' : 'Duplicate groups'}</span><strong className="ml-2 text-gray-200">{groups.length}</strong></div>
          <div><span className="text-gray-500">{ko ? '중복 파일' : 'Extra files'}</span><strong className="ml-2 text-gray-200">{duplicateCount}</strong><span className="ml-2 text-gray-500">· {formatSize(reclaimableBytes)}</span></div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><RefreshCw size={16} className="animate-spin" />{ko ? '파일을 비교하는 중…' : 'Comparing files…'}</div>
          ) : error ? (
            <p className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200" role="alert">{error}</p>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500"><Copy size={34} className="mx-auto mb-2 opacity-40" />{ko ? '동일한 이미지가 없습니다.' : 'No exact duplicate images found.'}</div>
          ) : (
            <div className="space-y-3">
              {groups.map((group, index) => (
                <article key={group.hash} className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-teal-200">{ko ? `그룹 ${index + 1}` : `Group ${index + 1}`} · {formatSize(group.files[0]?.size ?? 0)}</span>
                    <code className="truncate text-[10px] text-gray-500">{group.hash.slice(0, 16)}…</code>
                  </div>
                  <div className="space-y-1">
                    {group.files.map((file, fileIndex) => (
                      <div key={file.sourcePath} className="flex items-center justify-between gap-3 rounded bg-gray-800/70 px-2 py-1.5 text-xs">
                        <span className="min-w-0 truncate text-gray-300">{file.name}</span>
                        <span className="shrink-0 text-gray-500">{fileIndex === 0 ? (ko ? '원본' : 'original') : formatSize(file.size)}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="flex justify-end border-t border-gray-700 bg-gray-900/50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500">{ko ? '닫기' : 'Close'}</button>
        </footer>
      </section>
    </div>
  );
}
