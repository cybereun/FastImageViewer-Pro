import type { ImageFile, ImageMetadata } from '../types';

export type ImageSortMode = 'name' | 'type' | 'size' | 'date' | 'rating';
export type SortDirection = 'asc' | 'desc';

export interface ImageFilterOptions {
  format?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  modifiedAfter?: number;
}

export const SUPPORTED_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'svg',
  'ico',
  'tiff',
  'tif',
  'avif',
] as const;

const supportedExtensions = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);

export function isSupportedImageName(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return extension.length > 0 && supportedExtensions.has(extension);
}

export function getImageExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function getImageMetadata(image: ImageFile): ImageMetadata {
  return (
    image.metadata ?? {
      favorite: false,
      rating: 0,
      colorLabel: null,
      tags: [],
    }
  );
}

function compareImages(left: ImageFile, right: ImageFile, mode: ImageSortMode): number {
  switch (mode) {
    case 'type':
      return getImageExtension(left.name).localeCompare(getImageExtension(right.name), undefined, { sensitivity: 'base' });
    case 'size':
      return left.size - right.size;
    case 'date':
      return left.lastModified - right.lastModified;
    case 'rating':
      return getImageMetadata(left).rating - getImageMetadata(right).rating;
    case 'name':
    default:
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  }
}

export function filterAndSortImages(
  images: ImageFile[],
  query: string,
  sortMode: ImageSortMode = 'name',
  direction: SortDirection = 'asc',
  favoriteOnly = false,
  minimumRating = 0,
  filters: ImageFilterOptions = {}
): ImageFile[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const result = images.filter((image) => {
    const metadata = getImageMetadata(image);
    const matchesQuery = normalizedQuery.length === 0 || image.name.toLocaleLowerCase().includes(normalizedQuery);
    const matchesFavorite = !favoriteOnly || metadata.favorite;
    const matchesRating = metadata.rating >= minimumRating;
    const extension = getImageExtension(image.name);
    const matchesFormat = !filters.format
      || filters.format === 'all'
      || extension === filters.format
      || (filters.format === 'jpg' && extension === 'jpeg')
      || (filters.format === 'tif' && extension === 'tiff');
    const matchesMinSize = filters.minSizeBytes === undefined || image.size >= filters.minSizeBytes;
    const matchesMaxSize = filters.maxSizeBytes === undefined || image.size < filters.maxSizeBytes;
    const matchesDate = filters.modifiedAfter === undefined || image.lastModified >= filters.modifiedAfter;
    return matchesQuery && matchesFavorite && matchesRating && matchesFormat && matchesMinSize && matchesMaxSize && matchesDate;
  });

  result.sort((left, right) => {
    const comparison = compareImages(left, right, sortMode);
    if (comparison !== 0) return direction === 'asc' ? comparison : -comparison;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return result;
}
