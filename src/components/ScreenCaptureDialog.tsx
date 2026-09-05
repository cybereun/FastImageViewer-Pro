import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Camera, Copy, Monitor, RefreshCw, X } from 'lucide-react';
import type { CaptureRegion, CaptureResult, CaptureSource } from '../types';
import type { Language } from '../i18n';

interface ScreenCaptureDialogProps {
  language: Language;
  onClose: () => void;
  onCaptured?: (result: CaptureResult) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function makeSelection(start: Point, end: Point): Selection {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScreenCaptureDialog({ language, onClose, onCaptured }: ScreenCaptureDialogProps) {
  const ko = language === 'ko';
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId) ?? null,
    [selectedId, sources]
  );

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const nextSources = await window.electron.getCaptureSources();
      setSources(nextSources);
      setSelectedId((previous) => nextSources.some((source) => source.id === previous)
        ? previous
        : nextSources[0]?.id ?? null);
      setSelection(null);
    } catch (loadError) {
      setSources([]);
      setSelectedId(null);
      setError(loadError instanceof Error ? loadError.message : (ko ? '캡처할 화면을 찾지 못했습니다.' : 'Unable to find a capturable screen.'));
    } finally {
      setLoading(false);
    }
  }, [ko]);

  useEffect(() => {
    void loadSources();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !capturing) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [capturing, loadSources, onClose]);

  const pointFromEvent = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const preview = previewRef.current;
    if (!preview) return null;
    const bounds = preview.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
    };
  }, []);

  const beginSelection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedSource || capturing) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    setMessage(null);
  }, [capturing, pointFromEvent, selectedSource]);

  const updateSelection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart || capturing) return;
    const point = pointFromEvent(event);
    if (point) setSelection(makeSelection(dragStart, point));
  }, [capturing, dragStart, pointFromEvent]);

  const endSelection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const point = pointFromEvent(event);
    const nextSelection = point ? makeSelection(dragStart, point) : selection;
    setDragStart(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!nextSelection || nextSelection.width < 4 || nextSelection.height < 4) {
      setSelection(null);
      return;
    }
    setSelection(nextSelection);
  }, [dragStart, pointFromEvent, selection]);

  const handleCopy = useCallback(async () => {
    if (!selectedSource || !selectedId) return;
    const preview = previewRef.current;
    const bounds = preview?.getBoundingClientRect();
    let region: CaptureRegion | null = null;
    if (selection && bounds && bounds.width > 0 && bounds.height > 0) {
      region = {
        x: selection.x / bounds.width,
        y: selection.y / bounds.height,
        width: selection.width / bounds.width,
        height: selection.height / bounds.height,
      };
    }

    setCapturing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electron.captureRegionToClipboard(selectedId, region);
      setMessage(ko
        ? `클립보드에 복사했습니다 · ${result.width} × ${result.height} · ${formatBytes(result.bytes)}`
        : `Copied to clipboard · ${result.width} × ${result.height} · ${formatBytes(result.bytes)}`);
      onCaptured?.(result);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : (ko ? '화면 캡처에 실패했습니다.' : 'Screen capture failed.'));
    } finally {
      setCapturing(false);
    }
  }, [ko, onCaptured, selectedId, selectedSource, selection]);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4"
      role="presentation"
      onClick={() => { if (!capturing) onClose(); }}
    >
      <section
        className="flex max-h-[calc(100vh-2rem)] w-[980px] max-w-full flex-col overflow-hidden rounded-xl border border-teal-500/40 bg-[#171717] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-capture-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-700 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-teal-500/15 p-2 text-teal-300"><Camera size={21} /></span>
            <div>
              <h2 id="screen-capture-title" className="text-base font-semibold text-white">{ko ? '화면 캡처 (Pro)' : 'Screen capture (Pro)'}</h2>
              <p className="mt-1 text-xs text-gray-400">
                {ko ? '화면이나 창을 선택한 다음 마우스로 사각형을 드래그하세요.' : 'Choose a screen or window, then drag a rectangle with the mouse.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={capturing} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50" aria-label={ko ? '닫기' : 'Close'}>
            <X size={17} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-5 lg:grid-cols-[250px_1fr]">
          <aside className="min-h-0 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{ko ? '캡처 대상' : 'Capture source'}</h3>
              <button type="button" onClick={() => void loadSources()} disabled={loading || capturing} className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50" title={ko ? '새로고침' : 'Refresh'} aria-label={ko ? '새로고침' : 'Refresh'}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            {loading ? (
              <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4 text-center text-xs text-gray-400">{ko ? '화면을 찾는 중…' : 'Looking for screens…'}</div>
            ) : sources.length === 0 ? (
              <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-4 text-center text-xs text-gray-400">{ko ? '사용 가능한 화면이 없습니다.' : 'No screens are available.'}</div>
            ) : (
              <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
                {sources.map((source) => {
                  const active = source.id === selectedId;
                  const SourceIcon = source.type === 'screen' ? Monitor : AppWindow;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setSelectedId(source.id); setSelection(null); setMessage(null); setError(null); }}
                      className={`overflow-hidden rounded-lg border text-left transition-colors ${active ? 'border-teal-400 bg-teal-950/40' : 'border-gray-700 bg-gray-900/60 hover:border-gray-500 hover:bg-gray-800'}`}
                    >
                      <div className="relative aspect-video bg-gray-950">
                        <img src={source.thumbnailUrl} alt="" className="h-full w-full object-contain" draggable={false} />
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 p-1 text-teal-200"><SourceIcon size={13} /></span>
                      </div>
                      <div className="truncate px-2 py-1.5 text-xs text-gray-200">{source.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="flex min-h-[300px] min-w-0 flex-col rounded-lg border border-gray-700 bg-gray-950/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-400">
              <span className="truncate">{selectedSource?.name ?? (ko ? '캡처 대상을 선택하세요.' : 'Select a capture source.')}</span>
              <span className="shrink-0">{selection ? (ko ? '영역 선택됨' : 'Region selected') : (ko ? '전체 화면' : 'Full source')}</span>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-black/50 p-2">
              {selectedSource ? (
                <div
                  ref={previewRef}
                  className="relative inline-block max-w-full touch-none select-none"
                  onPointerDown={beginSelection}
                  onPointerMove={updateSelection}
                  onPointerUp={endSelection}
                  onPointerCancel={endSelection}
                >
                  <img src={selectedSource.thumbnailUrl} alt={selectedSource.name} className="block max-h-[52vh] max-w-[min(70vw,700px)] object-contain" draggable={false} />
                  {selection && (
                    <div
                      className="pointer-events-none absolute border-2 border-teal-300 bg-teal-400/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                      style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
                    />
                  )}
                  {!selection && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/75">{ko ? '드래그하여 영역 선택' : 'Drag to select a region'}</div>}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-500"><Monitor size={38} className="mx-auto mb-2 opacity-50" />{ko ? '왼쪽에서 화면을 선택하세요.' : 'Choose a source on the left.'}</div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              {ko ? '영역을 선택하지 않으면 선택한 화면 전체를 캡처합니다. 캡처 결과는 PNG로 클립보드에 복사됩니다.' : 'Without a selection, the entire source is captured. The PNG result is copied to the clipboard.'}
            </p>
          </div>
        </div>

        {(error || message) && (
          <div className={`border-t px-5 py-2 text-xs ${error ? 'border-red-900/60 bg-red-950/30 text-red-200' : 'border-teal-900/60 bg-teal-950/30 text-teal-200'}`} role={error ? 'alert' : 'status'}>
            {error ?? message}
          </div>
        )}
        <footer className="flex justify-end gap-2 border-t border-gray-700 bg-gray-900/50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={capturing} className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50">{ko ? '닫기' : 'Close'}</button>
          <button type="button" onClick={() => void handleCopy()} disabled={!selectedSource || loading || capturing} className="flex items-center gap-2 rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50">
            {capturing ? <RefreshCw size={15} className="animate-spin" /> : <Copy size={15} />}
            {capturing ? (ko ? '캡처 중…' : 'Capturing…') : (ko ? '클립보드에 복사' : 'Copy to clipboard')}
          </button>
        </footer>
      </section>
    </div>
  );
}
