import { useEffect } from 'react';
import { Check, LockKeyhole, X, Zap } from 'lucide-react';
import type { Language } from '../i18n';
import type { RibbonProFeature } from './Ribbon';

interface ProUpgradeDialogProps {
  language: Language;
  feature: RibbonProFeature;
  onClose: () => void;
  onUpgrade?: () => void;
}

const featureLabels = {
  ko: {
    capture: '전문 화면 캡처',
    'batch-edit': '일괄 편집과 포맷 변환',
    'advanced-export': '고급 내보내기',
    'duplicate-search': '중복·유사 이미지 검색',
  },
  en: {
    capture: 'Professional screen capture',
    'batch-edit': 'Batch editing and format conversion',
    'advanced-export': 'Advanced export',
    'duplicate-search': 'Duplicate and similar image search',
  },
} as const;

export function ProUpgradeDialog({ language, feature, onClose, onUpgrade }: ProUpgradeDialogProps) {
  const ko = language === 'ko';
  const labels = featureLabels[language];

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/60 p-4" role="presentation" onClick={onClose}>
      <section
        className="w-[460px] max-w-full overflow-hidden rounded-xl border border-amber-500/40 bg-[#1a1a1a] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-upgrade-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-700 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-amber-500/15 p-2 text-amber-300"><LockKeyhole size={20} /></span>
            <div>
              <h2 id="pro-upgrade-title" className="text-base font-semibold text-white">{ko ? 'Pro 기능' : 'Pro feature'}</h2>
              <p className="mt-1 text-xs text-gray-400">{labels[feature]}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white" aria-label={ko ? '닫기' : 'Close'}>
            <X size={17} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm leading-relaxed text-gray-300">
            {ko
              ? 'Community에서는 기본 탐색 기능을 무료로 사용할 수 있습니다. 이 기능은 Pro로 전환하면 사용할 수 있습니다.'
              : 'Community includes the complete basic viewer. Switch to Pro to use this advanced feature.'}
          </p>
          <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-200"><Zap size={14} />{ko ? 'Pro에 포함된 기능' : 'Included with Pro'}</p>
            <ul className="grid gap-2 text-xs text-gray-300 sm:grid-cols-2">
              {(Object.keys(labels) as RibbonProFeature[]).map((item) => (
                <li key={item} className="flex items-center gap-2"><Check size={13} className="shrink-0 text-emerald-400" />{labels[item]}</li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] leading-relaxed text-gray-500">
            {ko
              ? '라이선스 입력과 구매 연결은 Pro 라이선스 모듈에서 활성화됩니다. 기존 폴더와 설정은 그대로 유지됩니다.'
              : 'License activation and purchase links will be enabled by the Pro licensing module. Your folders and settings remain unchanged.'}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-700 bg-gray-900/50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700">
            {ko ? '닫기' : 'Close'}
          </button>
          <button
            type="button"
            onClick={() => {
              onUpgrade?.();
              onClose();
            }}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-amber-400"
          >
            <Zap size={15} />
            {ko ? 'Pro 전환 안내' : 'Switch to Pro'}
          </button>
        </div>
      </section>
    </div>
  );
}
