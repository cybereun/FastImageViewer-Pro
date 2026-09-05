import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BatchOperationResult,
  BatchRenameRequest,
  DirectoryContent,
  FolderNode,
  ImageFile,
  ImageMetadata,
  Preferences,
  StorageRoot,
} from '../types';
import {
  DEFAULT_PREFERENCES,
  inferFolderMetadata,
  mapFolders,
  mapImages,
  mapImportedFiles,
  getMetadataForImage,
  mergeImageMetadata,
} from '../application/imageLibrary';
import { isSupportedImageName } from '../domain/image';

function updateNodeTree(
  nodes: FolderNode[],
  targetId: string,
  updater: (node: FolderNode) => FolderNode
): FolderNode[] {
  const normalizedTarget = targetId.toLowerCase();
  return nodes.map((node) => {
    if (node.id.toLowerCase() === normalizedTarget) return updater(node);
    if (node.children.length > 0) {
      return { ...node, children: updateNodeTree(node.children, targetId, updater) };
    }
    return node;
  });
}

function findNodeById(nodes: FolderNode[], targetId: string): FolderNode | null {
  const normalizedTarget = targetId.toLowerCase();
  for (const node of nodes) {
    if (node.id.toLowerCase() === normalizedTarget) return node;
    const nested = findNodeById(node.children, targetId);
    if (nested) return nested;
  }
  return null;
}

function samePath(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function mapStorageRoot(root: StorageRoot, previous?: FolderNode): FolderNode {
  return {
    ...(previous ?? {
      children: [],
      isLoaded: false,
      isExpanded: false,
    }),
    id: root.path,
    name: root.name,
    path: root.path,
    kind: root.kind,
    specialKind: root.specialKind,
    driveLetter: root.driveLetter,
    volumeLabel: root.volumeLabel,
    totalBytes: root.totalBytes,
    freeBytes: root.freeBytes,
    providerName: root.providerName,
  };
}

export function useImageStore() {
  const [rootFolders, setRootFolders] = useState<FolderNode[]>([]);
  const [currentImages, setCurrentImages] = useState<ImageFile[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFolderLabel, setSelectedFolderLabel] = useState('Home');
  const [collectionKind, setCollectionKind] = useState<'folder' | 'files' | 'imported'>('folder');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  const rootFoldersRef = useRef(rootFolders);
  const selectedFolderRef = useRef<string | null>(null);
  const preferencesRef = useRef(preferences);
  const requestIdRef = useRef(0);
  const watchIdRef = useRef<string | null>(null);
  const importedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    rootFoldersRef.current = rootFolders;
  }, [rootFolders]);

  useEffect(() => {
    selectedFolderRef.current = selectedFolderId;
  }, [selectedFolderId]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const releaseImportedUrls = useCallback(() => {
    importedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    importedUrlsRef.current.clear();
  }, []);

  useEffect(() => () => {
    releaseImportedUrls();
    if (watchIdRef.current) void window.electron.stopWatchingDirectory(watchIdRef.current);
  }, [releaseImportedUrls]);

  const persistPreferences = useCallback((next: Preferences) => {
    preferencesRef.current = next;
    void window.electron.savePreferences(next).catch((saveError) => {
      console.warn('Failed to save preferences:', saveError);
    });
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      setPreferences((previous) => {
        const next = { ...previous, ...patch };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const rememberFolder = useCallback(
    (folderPath: string) => {
      setPreferences((previous) => {
        const recentFolders = [
          folderPath,
          ...previous.recentFolders.filter((item) => !samePath(item, folderPath)),
        ].slice(0, 12);
        const next = { ...previous, defaultFolder: folderPath, recentFolders };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const stopCurrentWatcher = useCallback(async () => {
    if (!watchIdRef.current) return;
    const watchId = watchIdRef.current;
    watchIdRef.current = null;
    await window.electron.stopWatchingDirectory(watchId).catch(() => undefined);
  }, []);

  const watchFolder = useCallback(
    async (folderPath: string) => {
      await stopCurrentWatcher();
      try {
        watchIdRef.current = await window.electron.startWatchingDirectory(folderPath);
      } catch (watchError) {
        console.warn('Folder watching is unavailable:', watchError);
      }
    },
    [stopCurrentWatcher]
  );

  const refreshFolderContent = useCallback(async (folderPath: string, expand = false) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const content = await window.electron.readDirectory(folderPath);
      if (requestId !== requestIdRef.current) return [];

      const children = mapFolders(content);
      const images = mapImages(content, preferencesRef.current.imageMetadata, window.electron.toLocalUrl);
      setRootFolders((previous) => updateNodeTree(previous, folderPath, (node) => ({
        ...node,
        children,
        isLoaded: true,
        isExpanded: expand || node.isExpanded,
        error: content.error,
      })));

      if (samePath(selectedFolderRef.current, folderPath)) setCurrentImages(images);
      if (content.error) setError(content.error);
      return images;
    } catch (refreshError) {
      if (requestId === requestIdRef.current) {
        setError(refreshError instanceof Error ? refreshError.message : 'Unable to read this folder.');
      }
      return [];
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const refreshRootFolders = useCallback(async () => {
    try {
      const roots = await window.electron.getInitialRoots();
      if (!Array.isArray(roots)) return;
      setRootFolders((previous) => {
        const rootPaths = new Set(roots.map((root) => root.path.toLowerCase()));
        const refreshedRoots = roots.map((root) => {
          const existing = previous.find((node) => samePath(node.path, root.path));
          return mapStorageRoot(root, existing);
        });
        const openedFolders = previous.filter((node) => !rootPaths.has(node.path.toLowerCase()));
        return [...refreshedRoots, ...openedFolders];
      });
    } catch {
      // A removable or network drive can disappear while the metadata query
      // is running. Keep the last known tree until the next refresh succeeds.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.electron.onDirectoryChanged((folderPath) => {
      if (samePath(selectedFolderRef.current, folderPath)) void refreshFolderContent(folderPath);
    });
    return unsubscribe;
  }, [refreshFolderContent]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshRootFolders(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshRootFolders]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const [loadedPreferences, roots] = await Promise.all([
          window.electron.loadPreferences().catch(() => DEFAULT_PREFERENCES),
          window.electron.getInitialRoots(),
        ]);
        if (cancelled) return;

        preferencesRef.current = loadedPreferences;
        setPreferences(loadedPreferences);
        const rootNodes: FolderNode[] = roots.map((root) => mapStorageRoot(root));
        setRootFolders(rootNodes);

        const preferredPath = loadedPreferences.defaultFolder && roots.some((root) => samePath(root.path, loadedPreferences.defaultFolder))
          ? loadedPreferences.defaultFolder
          : roots.find((root) => root.name.toLowerCase() === 'pictures')?.path
            ?? roots.find((root) => root.name.toLowerCase() === 'downloads')?.path
            ?? roots[0]?.path;
        if (!preferredPath) return;

        const preferredNode = rootNodes.find((node) => samePath(node.path, preferredPath));
        const content = await window.electron.readDirectory(preferredPath);
        if (cancelled) return;
        const images = mapImages(content, loadedPreferences.imageMetadata, window.electron.toLocalUrl);
        setSelectedFolderId(preferredPath);
        selectedFolderRef.current = preferredPath;
        setSelectedFolderLabel(preferredNode?.name ?? preferredPath);
        setCollectionKind('folder');
        setCurrentImages(images);
        setRootFolders((previous) => updateNodeTree(previous, preferredPath, (node) => ({
          ...node,
          children: mapFolders(content),
          isLoaded: true,
          isExpanded: true,
          error: content.error,
        })));
        if (content.error) setError(content.error);
        rememberFolder(preferredPath);
        await watchFolder(preferredPath);
      } catch (bootstrapError) {
        if (!cancelled) setError(bootstrapError instanceof Error ? bootstrapError.message : 'Unable to initialize folders.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [rememberFolder, watchFolder]);

  const openFolderResult = useCallback(async (result: { path: string; name: string; content: DirectoryContent }) => {
      const rootNode: FolderNode = {
        ...inferFolderMetadata(result.name, result.path),
        id: result.path,
        name: result.name,
        path: result.path,
        children: mapFolders(result.content),
        isLoaded: true,
        isExpanded: true,
        error: result.content.error,
      };
      const images = mapImages(result.content, preferencesRef.current.imageMetadata, window.electron.toLocalUrl);

      setRootFolders((previous) => {
        const existingIndex = previous.findIndex((node) => samePath(node.id, rootNode.id));
        if (existingIndex < 0) return [...previous, rootNode];
        const next = [...previous];
        next[existingIndex] = rootNode;
        return next;
      });
      selectedFolderRef.current = rootNode.id;
      setSelectedFolderId(rootNode.id);
      setSelectedFolderLabel(rootNode.name);
      setCollectionKind('folder');
      releaseImportedUrls();
      setCurrentImages(images);
      setError(result.content.error ?? null);
      rememberFolder(rootNode.path);
      await watchFolder(rootNode.path);
  }, [rememberFolder, releaseImportedUrls, watchFolder]);

  const openDirectory = useCallback(async () => {
    try {
      const result = await window.electron.openDirectory();
      if (!result) return;
      await openFolderResult(result);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open this folder.');
    }
  }, [openFolderResult]);

  const openFileRecords = useCallback(async (files: DirectoryContent['files']) => {
    if (files.length === 0) return;
    releaseImportedUrls();
    const images = mapImages({ files, folders: [] }, preferencesRef.current.imageMetadata, window.electron.toLocalUrl);
    setSelectedFolderId(null);
    selectedFolderRef.current = null;
    setSelectedFolderLabel(`${files.length} selected files`);
    setCollectionKind('files');
    setCurrentImages(images);
    setError(null);
    await stopCurrentWatcher();
  }, [releaseImportedUrls, stopCurrentWatcher]);

  const openFiles = useCallback(async () => {
    try {
      const files = await window.electron.openImageFiles();
      await openFileRecords(files);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open image files.');
    }
  }, [openFileRecords]);

  const processFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => isSupportedImageName(file.name));
    releaseImportedUrls();
    if (imageFiles.length === 0) {
      setError('No supported image files were found.');
      return;
    }

    const images = mapImportedFiles(imageFiles, (id) => getMetadataForImage(id, preferencesRef.current.imageMetadata));
    images.forEach((image) => importedUrlsRef.current.add(image.url));
    setSelectedFolderId(null);
    selectedFolderRef.current = null;
    setSelectedFolderLabel(`${images.length} imported files`);
    setCollectionKind('imported');
    setCurrentImages(images);
    setError(null);
    void stopCurrentWatcher();
  }, [releaseImportedUrls, stopCurrentWatcher]);

  useEffect(() => {
    const unsubscribe = window.electron.onOpenFilesFromArgs((files) => {
      void openFileRecords(files).catch((openError) => {
        setError(openError instanceof Error ? openError.message : 'Unable to open image files.');
      });
    });
    return unsubscribe;
  }, [openFileRecords]);

  useEffect(() => {
    const unsubscribe = window.electron.onOpenFolderFromArgs((folder) => {
      void openFolderResult(folder).catch((openError) => {
        setError(openError instanceof Error ? openError.message : 'Unable to open the requested folder.');
      });
    });
    return unsubscribe;
  }, [openFolderResult]);

  const selectFolder = useCallback(
    async (nodeId: string | null) => {
      if (!nodeId) {
        releaseImportedUrls();
        void stopCurrentWatcher();
        selectedFolderRef.current = null;
        setSelectedFolderId(null);
        setSelectedFolderLabel('Home');
        setCurrentImages([]);
        return;
      }
      const node = findNodeById(rootFoldersRef.current, nodeId);
      if (!node) return;

      selectedFolderRef.current = node.path;
      setSelectedFolderId(node.path);
      setSelectedFolderLabel(node.name);
      setCollectionKind('folder');
      releaseImportedUrls();
      rememberFolder(node.path);
      await refreshFolderContent(node.path, true);
      await watchFolder(node.path);
    },
    [refreshFolderContent, rememberFolder, releaseImportedUrls, stopCurrentWatcher, watchFolder]
  );

  const toggleFolder = useCallback(
    async (node: FolderNode) => {
      if (node.isExpanded) {
        setRootFolders((previous) => updateNodeTree(previous, node.id, (target) => ({ ...target, isExpanded: false })));
        return;
      }
      await refreshFolderContent(node.path, true);
    },
    [refreshFolderContent]
  );

  const refreshSelectedFolder = useCallback(async () => {
    if (!selectedFolderRef.current) return;
    await refreshFolderContent(selectedFolderRef.current);
  }, [refreshFolderContent]);

  const updateImageMetadata = useCallback((imageId: string, patch: Partial<ImageMetadata>) => {
    setPreferences((previous) => {
      const current = getMetadataForImage(imageId, previous.imageMetadata);
      const metadata = mergeImageMetadata(current, patch);
      const next = {
        ...previous,
        imageMetadata: { ...previous.imageMetadata, [imageId]: metadata },
      };
      persistPreferences(next);
      return next;
    });
    setCurrentImages((previous) => previous.map((image) => (
      image.id === imageId
        ? { ...image, metadata: mergeImageMetadata(getMetadataForImage(imageId, image.metadata ? { [imageId]: image.metadata } : {}), patch) }
        : image
    )));
  }, [persistPreferences]);

  const copyImageToFolder = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      await window.electron.copyImageFile(sourcePath, targetFolderPath);
      await refreshSelectedFolder();
    },
    [refreshSelectedFolder]
  );

  const moveImageToFolder = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      await window.electron.moveImageFile(sourcePath, targetFolderPath);
      await refreshSelectedFolder();
    },
    [refreshSelectedFolder]
  );

  const renameImage = useCallback(
    async (sourcePath: string, nextName: string) => {
      await window.electron.renameImageFile(sourcePath, nextName);
      await refreshSelectedFolder();
    },
    [refreshSelectedFolder]
  );

  const deleteImage = useCallback(
    async (sourcePath: string) => {
      await window.electron.deleteImageFile(sourcePath);
      await refreshSelectedFolder();
    },
    [refreshSelectedFolder]
  );

  const runBatchFileOperation = useCallback(
    async (
      operation: 'copy' | 'move' | 'delete',
      sourcePaths: string[],
      targetFolderPath?: string
    ): Promise<BatchOperationResult> => {
      const result = await window.electron.batchFileOperation(operation, sourcePaths, targetFolderPath);
      await refreshSelectedFolder();
      return result;
    },
    [refreshSelectedFolder]
  );

  const renameImages = useCallback(async (renames: BatchRenameRequest[]): Promise<BatchOperationResult> => {
    const result = await window.electron.batchRenameImages(renames);
    await refreshSelectedFolder();
    return result;
  }, [refreshSelectedFolder]);

  return {
    images: currentImages,
    folders: rootFolders,
    selectedFolder: selectedFolderId,
    selectedFolderLabel,
    collectionKind,
    preferences,
    setSelectedFolder: selectFolder,
    processFiles,
    openFiles,
    loading,
    error,
    openDirectory,
    toggleFolder,
    refreshRootFolders,
    refreshSelectedFolder,
    updatePreferences,
    updateImageMetadata,
    copyImageToFolder,
    moveImageToFolder,
    renameImage,
    renameImages,
    deleteImage,
    copyImagesToFolder: (paths: string[], targetFolderPath: string) => runBatchFileOperation('copy', paths, targetFolderPath),
    moveImagesToFolder: (paths: string[], targetFolderPath: string) => runBatchFileOperation('move', paths, targetFolderPath),
    deleteImages: (paths: string[]) => runBatchFileOperation('delete', paths),
  };
}
