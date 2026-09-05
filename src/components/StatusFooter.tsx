import { CheckCircle2, LoaderCircle } from 'lucide-react';
import type { Language } from '../i18n';
import { t } from '../i18n';
import type { SelectionSummary } from './ThumbnailGrid';

interface StatusFooterProps {
  totalCount: number;
  loading: boolean;
  language: Language;
  appVersion: string;
  onVersionClick: () => void;
  selection: SelectionSummary;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let amount = value;
  let unitIndex = -1;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(2).replace(/\.00$/, '')} ${units[unitIndex]}`;
}

export function StatusFooter({
  totalCount,
  loading,
  language,
  appVersion,
  onVersionClick,
  selection,
}: StatusFooterProps) {
  const selectedText = language === 'ko'
    ? `${selection.count} ${t(language, 'selectedObjects')} (${formatBytes(selection.bytes)})`
    : `${selection.count} ${t(language, 'selectedObjects')} (${formatBytes(selection.bytes)})`;
  const imageSize = selection.width !== null && selection.height !== null
    ? `${selection.width} × ${selection.height}`
    : selection.mixedDimensions
      ? t(language, 'mixedDimensions')
      : null;

  return (
    <footer
      className="flex h-7 min-h-7 shrink-0 items-center justify-between gap-3 border-t border-gray-800 bg-[#252526] px-2 text-xs text-gray-400"
      role="contentinfo"
    >
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        {selection.count > 0 && imageSize && (
          <span className="shrink-0" title={t(language, 'imageSize')}>
            {imageSize}
          </span>
        )}
        {selection.count > 0 && (
          <span className="shrink-0" title={t(language, 'selectedObjects')}>
            {selectedText}
          </span>
        )}
        <span className="truncate" title={`${t(language, 'totalObjects')}: ${totalCount}`}>
          {t(language, 'totalObjects')} {totalCount}
        </span>
      </div>
      <div className="flex h-full items-center gap-3">
        <span className="flex items-center gap-1">
          {loading ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle2 size={12} className="text-emerald-500" />}
          {loading ? t(language, 'scanning') : t(language, 'ready')}
        </span>
        <button
          type="button"
          onClick={onVersionClick}
          className="h-full border-l border-gray-700 pl-3 text-gray-400 transition-colors hover:text-white"
          title={t(language, 'about')}
          aria-label={`${t(language, 'about')} FastImage ${appVersion}`}
        >
          FastImage v{appVersion}
        </button>
      </div>
    </footer>
  );
}
