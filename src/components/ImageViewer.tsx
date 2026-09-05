import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Minus,
  Square,
  SquareStack,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Pencil,
  Download,
  FileDown,
  Maximize2,
  Info,
  Star,
  Play,
  Pause,
  Expand,
} from 'lucide-react';
import type { ImageFile, ImageMetadata } from '../types';
import { ImageEditor } from './ImageEditor';
import { cn } from '../utils/cn';

interface ImageViewerProps {
  images: ImageFile[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  wheelNavigation?: boolean;
  autoPlay?: boolean;
  onUpdateImageMetadata?: (imageId: string, patch: Partial<ImageMetadata>) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageViewer({
  images,
  currentIndex,
  onClose,
  onIndexChange,
  wheelNavigation = true,
  autoPlay = false,
  onUpdateImageMetadata,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual' | 'custom'>('fit');
  const [rotation, setRotation] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);

  const currentImage = images[currentIndex];

  useEffect(() => {
    setSlideshow(autoPlay);
  }, [autoPlay]);

  const isEditableElement = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase());
  };

  const clearControlsTimer = useCallback(() => {
    if (controlsTimer.current) {
      clearTimeout(controlsTimer.current);
      controlsTimer.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsTimer();
    controlsTimer.current = setTimeout(() => {
      if (!isDragging && !showInfo && !showEditor) {
        setControlsVisible(false);
      }
    }, 3000);
  }, [clearControlsTimer, isDragging, showEditor, showInfo]);

  const keepControlsVisible = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const resetView = useCallback(() => {
    setZoom(1);
    setZoomMode('fit');
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const clampPosition = useCallback((next: { x: number; y: number }, targetZoom = zoom) => {
    const stage = imageStageRef.current;
    const image = imageRef.current;
    if (!stage || !image || targetZoom <= 1) return { x: 0, y: 0 };
    const maxX = Math.max(0, (image.offsetWidth * targetZoom - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * targetZoom - stage.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, [zoom]);

  const changeZoom = useCallback((nextZoom: number, cursor?: { x: number; y: number }) => {
    const boundedZoom = Math.min(Math.max(nextZoom, 0.1), 10);
    setZoomMode('custom');
    setZoom((previousZoom) => {
      if (!cursor || previousZoom <= 0) {
        setPosition((previous) => clampPosition(previous, boundedZoom));
        return boundedZoom;
      }
      const ratio = boundedZoom / previousZoom;
      setPosition((previous) => clampPosition({
        x: cursor.x - (cursor.x - previous.x) * ratio,
        y: cursor.y - (cursor.y - previous.y) * ratio,
      }, boundedZoom));
      return boundedZoom;
    });
  }, [clampPosition]);

  const navigate = useCallback(
    (direction: number) => {
      const newIndex = (currentIndex + direction + images.length) % images.length;
      onIndexChange(newIndex);
      resetView();
      keepControlsVisible();
    },
    [currentIndex, images.length, keepControlsVisible, onIndexChange, resetView]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;
      switch (e.key) {
        case 'ArrowLeft':
          navigate(-1);
          break;
        case 'ArrowRight':
          navigate(1);
          break;
        case 'Escape':
          if (showEditor) {
            setShowEditor(false);
          } else {
            onClose();
          }
          break;
        case '+':
        case '=':
          changeZoom(zoom * 1.2);
          break;
        case '-':
          changeZoom(zoom / 1.2);
          break;
        case '0':
          resetView();
          break;
        case 'r':
          setRotation((value) => (value + 90) % 360);
          break;
        case 'f':
          if (onUpdateImageMetadata && currentImage) {
            onUpdateImageMetadata(currentImage.id, { favorite: !currentImage.metadata?.favorite });
          }
          break;
        case ' ':
          e.preventDefault();
          setSlideshow((value) => !value);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeZoom, currentImage, navigate, onClose, onUpdateImageMetadata, resetView, showEditor, zoom]);

  useEffect(() => {
    if (!slideshow || images.length < 2) return;
    const timer = window.setInterval(() => navigate(1), 3000);
    return () => window.clearInterval(timer);
  }, [images.length, navigate, slideshow]);

  useEffect(() => {
    scheduleControlsHide();
    return () => clearControlsTimer();
  }, [clearControlsTimer, scheduleControlsHide]);

  useEffect(() => {
    let mounted = true;
    window.electron
      .isMaximized()
      .then((value) => {
        if (mounted) setIsMaximized(value);
      })
      .catch(() => {
        if (mounted) setIsMaximized(false);
      });

    const unsubscribe = window.electron.onWindowMaximizedChanged((value) => {
      setIsMaximized(value);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const preload = (idx: number) => {
      const i = (idx + images.length) % images.length;
      const img = new Image();
      img.src = images[i].url;
    };
    preload(currentIndex + 1);
    preload(currentIndex - 1);
  }, [currentIndex, images]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      keepControlsVisible();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const stage = imageStageRef.current;
        if (stage) {
          const rect = stage.getBoundingClientRect();
          changeZoom(zoom * delta, {
            x: e.clientX - (rect.left + rect.width / 2),
            y: e.clientY - (rect.top + rect.height / 2),
          });
        } else {
          changeZoom(zoom * delta);
        }
        return;
      }
      if (!wheelNavigation) return;
      if (e.deltaY > 0) {
        navigate(1);
      } else {
        navigate(-1);
      }
    },
    [changeZoom, keepControlsVisible, navigate, wheelNavigation, zoom]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition(clampPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    }
    keepControlsVisible();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoom > 1) {
      resetView();
    } else {
      changeZoom(2.5);
    }
  };

  const downloadCurrentImage = useCallback(() => {
    const source = new Image();
    source.onload = () => {
      const quarterTurn = rotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = quarterTurn ? source.naturalHeight : source.naturalWidth;
      canvas.height = quarterTurn ? source.naturalWidth : source.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = currentImage.name.replace(/(\.[^.]+)?$/, '_view$1');
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }, ['image/png', 'image/jpeg', 'image/webp'].includes(currentImage.type) ? currentImage.type : 'image/png');
    };
    source.onerror = () => undefined;
    source.src = currentImage.url;
  }, [currentImage, rotation]);

  const downloadOriginalImage = useCallback(() => {
    const anchor = document.createElement('a');
    anchor.href = currentImage.url;
    anchor.download = currentImage.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [currentImage]);

  if (!currentImage) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className={cn(
            'absolute left-0 right-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
          onMouseEnter={() => {
            clearControlsTimer();
            setControlsVisible(true);
          }}
          onMouseLeave={scheduleControlsHide}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h3 className="max-w-[46vw] truncate text-sm font-medium text-white">{currentImage.name}</h3>
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
              {currentIndex + 1} / {images.length}
            </span>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                setShowInfo((value) => !value);
                keepControlsVisible();
              }}
              onMouseEnter={keepControlsVisible}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                showInfo ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
              title="Info"
            >
              <Info size={18} className="pointer-events-none" />
            </button>
            <button
              onClick={() => {
                setShowEditor((value) => !value);
                keepControlsVisible();
              }}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                showEditor ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
              title="Edit"
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => {
                if (onUpdateImageMetadata) {
                  onUpdateImageMetadata(currentImage.id, { favorite: !currentImage.metadata?.favorite });
                }
                keepControlsVisible();
              }}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                currentImage.metadata?.favorite ? 'text-yellow-300' : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
              title="Favorite (F)"
              aria-label="Toggle favorite"
            >
              <Star size={18} fill={currentImage.metadata?.favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => {
                setSlideshow((value) => !value);
                keepControlsVisible();
              }}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                slideshow ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
              )}
              title="Slideshow (Space)"
              aria-label={slideshow ? 'Stop slideshow' : 'Start slideshow'}
            >
              {slideshow ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
                keepControlsVisible();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Fullscreen"
              aria-label="Toggle fullscreen"
            >
              <Expand size={18} />
            </button>
            <button
              onClick={() => {
                window.electron.minimizeWindow();
                keepControlsVisible();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Minimize window"
            >
              <Minus size={18} />
            </button>
            <button
              onClick={() => {
                window.electron.toggleMaximizeWindow();
                keepControlsVisible();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              title={isMaximized ? 'Restore window' : 'Maximize window'}
            >
              {isMaximized ? <SquareStack size={16} /> : <Square size={16} />}
            </button>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white"
              title="Close (ESC)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          ref={imageStageRef}
          className="flex flex-1 items-center justify-center overflow-hidden"
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <img
            ref={imageRef}
            src={currentImage.url}
            alt={currentImage.name}
            className={cn(
              'select-none transition-transform duration-150',
              zoomMode === 'fit' && 'max-h-full max-w-full',
              zoomMode !== 'fit' && 'shrink-0'
            )}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        </div>

        <button
          onClick={() => navigate(-1)}
          className={cn(
            'absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
        >
          <ChevronLeft size={24} />
        </button>
        <button
          onClick={() => navigate(1)}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70 hover:text-white',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
        >
          <ChevronRight size={24} />
        </button>

        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
        >
          <button
            onClick={() => changeZoom(zoom / 1.3)}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            title="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={() => {
              setZoomMode('actual');
              setZoom(1);
              setPosition({ x: 0, y: 0 });
            }}
            className="min-w-[60px] rounded-lg px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
            title="Actual pixels"
          >
            {zoomMode === 'actual' ? '1:1' : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            onClick={() => changeZoom(zoom * 1.3)}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            title="Zoom in"
          >
            <ZoomIn size={18} />
          </button>
          <div className="mx-2 h-4 w-px bg-gray-600" />
          <button
            onClick={() => setRotation((value) => (value + 90) % 360)}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            title="Rotate"
          >
            <RotateCw size={18} />
          </button>
          <button
            onClick={downloadCurrentImage}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <Download size={18} />
          </button>
          <button
            onClick={downloadOriginalImage}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            title="Download original"
            aria-label="Download original"
          >
            <FileDown size={18} />
          </button>
          <button
            onClick={resetView}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            title="Fit"
          >
            <Maximize2 size={18} />
          </button>
        </div>

        {showInfo && (
          <div className="absolute right-4 top-16 z-40 w-64 rounded-xl border border-gray-700 bg-gray-900/95 p-4 shadow-xl backdrop-blur-md">
            <h4 className="mb-3 text-sm font-semibold text-white">Image Info</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Name</span>
                <span className="max-w-[150px] truncate text-right text-gray-200">{currentImage.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Size</span>
                <span className="text-gray-200">{formatSize(currentImage.size)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Type</span>
                <span className="text-gray-200">{currentImage.type}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Modified</span>
                <span className="text-gray-200">
                  {new Date(currentImage.lastModified).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Path</span>
                <span className="max-w-[150px] truncate text-right text-gray-200">{currentImage.path}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-400">Rating</span>
                <span className="text-yellow-300">{'★'.repeat(currentImage.metadata?.rating ?? 0)}{'☆'.repeat(5 - (currentImage.metadata?.rating ?? 0))}</span>
              </div>
              {currentImage.metadata?.tags && currentImage.metadata.tags.length > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Tags</span>
                  <span className="max-w-[150px] truncate text-right text-gray-200">{currentImage.metadata.tags.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            'absolute bottom-16 left-1/2 z-20 -translate-x-1/2 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="scrollbar-none flex max-w-[80vw] gap-1 overflow-x-auto rounded-xl bg-black/60 p-1.5 backdrop-blur-md">
            {images.map((img, idx) => {
              const distance = Math.abs(idx - currentIndex);
              if (distance > 8) return null;
              return (
                <button
                  key={img.id}
                  onClick={() => {
                    onIndexChange(idx);
                    resetView();
                    keepControlsVisible();
                  }}
                  className={cn(
                    'h-12 w-12 shrink-0 overflow-hidden rounded-md transition-all',
                    idx === currentIndex ? 'scale-110 ring-2 ring-blue-500' : 'opacity-60 hover:opacity-100'
                  )}
                >
                  <img src={img.url} alt="" className="h-full w-full object-contain" loading="lazy" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showEditor && <ImageEditor key={currentImage.id} image={currentImage} onClose={() => setShowEditor(false)} />}
    </>
  );
}
