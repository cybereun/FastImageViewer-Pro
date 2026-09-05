import type { DirectoryContent, FolderKind, FolderNode, ImageFile, ImageMetadata, Preferences, SpecialFolderKind } from '../types';

export const DEFAULT_IMAGE_METADATA: ImageMetadata = {
  favorite: false,
  rating: 0,
  colorLabel: null,
  tags: [],
};

export const DEFAULT_PREFERENCES: Preferences = {
  language: 'ko',
  theme: 'dark',
  sidebarOpen: true,
  viewSize: 'medium',
  sortMode: 'name',
  sortDirection: 'asc',
  wheelNavigation: true,
  defaultFolder: null,
  confirmDelete: true,
  recentFolders: [],
  imageMetadata: {},
};

export function getMetadataForImage(imageId: string, metadata: Record<string, ImageMetadata>): ImageMetadata {
  return metadata[imageId] ?? { ...DEFAULT_IMAGE_METADATA, tags: [] };
}

export function mergeImageMetadata(current: ImageMetadata, patch: Partial<ImageMetadata>): ImageMetadata {
  return {
    ...current,
    ...patch,
    favorite: patch.favorite ?? current.favorite,
    rating: Math.max(0, Math.min(5, patch.rating ?? current.rating)),
    colorLabel: patch.colorLabel === undefined ? current.colorLabel : patch.colorLabel,
    tags: patch.tags
      ? [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 50)
      : current.tags,
  };
}

export function inferFolderMetadata(name: string, folderPath: string): {
  kind: FolderKind;
  specialKind?: SpecialFolderKind;
  driveLetter?: string;
} {
  const driveMatch = String(folderPath).trim().match(/^([A-Za-z]):\\?$/);
  if (driveMatch) {
    return { kind: 'fixed-drive', driveLetter: `${driveMatch[1].toUpperCase()}:` };
  }

  const specialKinds: Record<string, SpecialFolderKind> = {
    desktop: 'desktop',
    downloads: 'downloads',
    documents: 'documents',
    pictures: 'pictures',
    music: 'music',
    videos: 'videos',
  };
  const specialKind = specialKinds[String(name).trim().toLowerCase()];
  return specialKind ? { kind: 'special', specialKind } : { kind: 'folder' };
}

export function mapFolders(content: DirectoryContent): FolderNode[] {
  return content.folders
    .map((folder) => ({
      ...inferFolderMetadata(folder.name, folder.path),
      id: folder.path,
      name: folder.name,
      path: folder.path,
      children: [],
      isLoaded: false,
      isExpanded: false,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function mapImages(
  content: DirectoryContent,
  metadata: Record<string, ImageMetadata>,
  toLocalUrl: (filePath: string) => string
): ImageFile[] {
  return content.files
    .map((file) => ({
      id: file.path,
      name: file.name,
      path: file.path,
      url: toLocalUrl(file.path),
      size: file.size,
      lastModified: file.lastModified,
      type: file.type || 'image/unknown',
      source: 'folder' as const,
      metadata: getMetadataForImage(file.path, metadata),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function mapImportedFiles(
  files: File[],
  toMetadata: (id: string) => ImageMetadata = () => ({ ...DEFAULT_IMAGE_METADATA, tags: [] })
): ImageFile[] {
  return files.map((file, index) => {
    const nativePath = (file as File & { path?: string }).path ?? '';
    const id = `import:${nativePath || file.name}:${file.lastModified}:${index}`;
    return {
      id,
      name: file.name,
      file,
      path: nativePath,
      url: URL.createObjectURL(file),
      size: file.size,
      type: file.type || 'image/unknown',
      lastModified: file.lastModified,
      source: 'import' as const,
      metadata: toMetadata(id),
    };
  });
}
