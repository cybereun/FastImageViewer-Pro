
export type ImageSource = 'folder' | 'import';
export type AppEdition = 'community' | 'pro';

/** The storage category used to choose a familiar Explorer-style icon. */
export type FolderKind =
  | 'folder'
  | 'special'
  | 'fixed-drive'
  | 'removable-drive'
  | 'cdrom-drive'
  | 'network-drive'
  | 'ram-drive'
  | 'unknown-drive';

export type SpecialFolderKind = 'desktop' | 'downloads' | 'documents' | 'pictures' | 'music' | 'videos';

export interface StorageRoot {
  name: string;
  path: string;
  kind: FolderKind;
  specialKind?: SpecialFolderKind;
  driveLetter?: string;
  volumeLabel?: string | null;
  totalBytes?: number | null;
  freeBytes?: number | null;
  providerName?: string | null;
}

export interface ImageMetadata {
  favorite: boolean;
  rating: number;
  colorLabel: string | null;
  tags: string[];
}

export interface ImageFile {
  id: string;
  name: string;
  file?: File;
  url: string;
  size: number;
  type: string;
  lastModified: number;
  path: string;
  source: ImageSource;
  metadata?: ImageMetadata;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface FolderNode {
  id: string; // path
  name: string;
  path: string; // Absolute FS path
  children: FolderNode[];
  isLoaded: boolean;
  isExpanded: boolean;
  kind?: FolderKind;
  specialKind?: SpecialFolderKind;
  driveLetter?: string;
  volumeLabel?: string | null;
  totalBytes?: number | null;
  freeBytes?: number | null;
  providerName?: string | null;
  error?: string;
}

export interface EditState {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  quality: number;
  width: number;
  height: number;
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  crop?: CropRect | null;
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ViewSize = 'small' | 'medium' | 'large';
export type SortMode = 'name' | 'size' | 'date' | 'rating';
export type SortDirection = 'asc' | 'desc';

export interface Preferences {
  language: 'ko' | 'en';
  theme: 'dark' | 'light';
  sidebarOpen: boolean;
  viewSize: ViewSize;
  sortMode: SortMode;
  sortDirection: SortDirection;
  wheelNavigation: boolean;
  defaultFolder: string | null;
  confirmDelete: boolean;
  recentFolders: string[];
  imageMetadata: Record<string, ImageMetadata>;
}

export interface UpdateInfo {
  currentVersion: string;
  version: string;
  tagName: string;
  name: string;
  notes: string;
  publishedAt: string | null;
  assetName: string;
  downloadUrl: string;
  size: number | null;
  digest: string | null;
}

export type UpdateCheckResult =
  | { status: 'available'; update: UpdateInfo }
  | { status: 'up-to-date'; currentVersion: string }
  | { status: 'development' | 'unsupported' | 'error'; currentVersion?: string; message: string };

export type UpdateDownloadResult =
  | { status: 'downloaded'; update: UpdateInfo; sha256: string }
  | { status: 'unsupported' | 'error' | 'development' | 'up-to-date'; message?: string; currentVersion?: string }
  | { status: 'available'; update: UpdateInfo };

export type UpdateInstallResult =
  | { status: 'restarting'; version: string }
  | { status: 'not-ready' | 'unsupported' | 'error'; message: string };

export interface UpdateDownloadProgress {
  version: string;
  receivedBytes: number;
  totalBytes: number;
}

export interface BatchOperationItem {
  sourcePath: string;
  destinationPath?: string;
  name?: string;
  error?: string;
}

export interface BatchOperationResult {
  succeeded: BatchOperationItem[];
  failed: BatchOperationItem[];
}

export interface BatchRenameRequest {
  sourcePath: string;
  nextName: string;
}

declare global {
  interface Window {
    electron: {
      openDirectory: () => Promise<{ path: string; name: string; content: DirectoryContent } | null>;
      chooseDirectory: () => Promise<{ path: string; name: string } | null>;
      readDirectory: (path: string) => Promise<DirectoryContent>;
      getInitialRoots: () => Promise<StorageRoot[]>;
      toLocalUrl: (filePath: string) => string;
      getThumbnailUrl: (filePath: string, size?: number) => Promise<string>;
      copyImageFile: (sourcePath: string, targetFolderPath: string) => Promise<{ path: string; name: string }>;
      moveImageFile: (sourcePath: string, targetFolderPath: string) => Promise<{ path: string; name: string }>;
      renameImageFile: (sourcePath: string, nextName: string) => Promise<{ path: string; name: string }>;
      deleteImageFile: (sourcePath: string) => Promise<{ ok: true }>;
      overwriteImageFile: (sourcePath: string, bytes: ArrayBuffer) => Promise<{ path: string; name: string }>;
      batchFileOperation: (
        operation: 'copy' | 'move' | 'delete',
        sourcePaths: string[],
        targetFolderPath?: string
      ) => Promise<BatchOperationResult>;
      batchRenameImages: (renames: BatchRenameRequest[]) => Promise<BatchOperationResult>;
      openImageFiles: () => Promise<DirectoryContent['files']>;
      startWatchingDirectory: (dirPath: string) => Promise<string>;
      stopWatchingDirectory: (watchId: string) => Promise<void>;
      onDirectoryChanged: (callback: (dirPath: string) => void) => () => void;
      onOpenFilesFromArgs: (callback: (files: DirectoryContent['files']) => void) => () => void;
      onOpenFolderFromArgs: (callback: (folder: { path: string; name: string; content: DirectoryContent }) => void) => () => void;
      loadPreferences: () => Promise<Preferences>;
      savePreferences: (preferences: Preferences) => Promise<void>;
      getAppVersion: () => Promise<string>;
      getAppEdition: () => Promise<AppEdition>;
      rendererReady: () => Promise<void>;
      getUpdateOutcome: () => Promise<{ id: string; phase: 'completed' | 'rolled-back' | 'failed'; message: string; version: string } | null>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      downloadUpdate: () => Promise<UpdateDownloadResult>;
      installUpdate: () => Promise<UpdateInstallResult>;
      onUpdateAvailable: (callback: (update: UpdateInfo) => void) => () => void;
      onUpdateDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
      minimizeWindow: () => void;
      toggleMaximizeWindow: () => void;
      closeWindow: () => void;
      isMaximized: () => Promise<boolean>;
      onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
    };
  }
}

export interface DirectoryContent {
  files: Array<{
    name: string;
    path: string;
    size: number;
    lastModified: number;
    type: string;
  }>;
  folders: Array<{
    name: string;
    path: string;
  }>;
  error?: string;
}
