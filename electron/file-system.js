const fs = require('fs');
const path = require('path');
const { nativeImage, shell } = require('electron');
const sharp = require('sharp');
const { createOrientedThumbnail } = require('./thumbnail');

const SUPPORTED_EXTENSIONS = new Set([
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
]);

const MIME_TYPES = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    avif: 'image/avif',
};

const thumbnailCache = new Map();
const MAX_THUMBNAIL_CACHE = 400;

function assertString(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${label} must be a non-empty string.`);
    }
}

function isSupportedImageName(name) {
    const extension = path.extname(name).slice(1).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(extension);
}

function normalizePath(value, label) {
    assertString(value, label);
    return path.resolve(value);
}

async function statFile(filePath) {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) throw new Error('The source path is not a file.');
    return stats;
}

async function readImageDimensions(filePath) {
    try {
        const extension = path.extname(filePath).toLowerCase();
        if (['.bmp', '.ico'].includes(extension)) {
            const image = nativeImage.createFromPath(filePath);
            if (image.isEmpty()) return {};
            const dimensions = image.getSize();
            return dimensions.width > 0 && dimensions.height > 0
                ? { width: dimensions.width, height: dimensions.height }
                : {};
        }
        const metadata = await sharp(filePath).metadata();
        if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)) return {};
        const rotated = [5, 6, 7, 8].includes(metadata.orientation);
        return rotated
            ? { width: metadata.height, height: metadata.width }
            : { width: metadata.width, height: metadata.height };
    } catch {
        return {};
    }
}

async function ensureImageFile(filePath) {
    const source = normalizePath(filePath, 'sourcePath');
    if (!isSupportedImageName(source)) throw new Error('Only supported image files can be modified.');
    await statFile(source);
    return source;
}

async function ensureDirectory(dirPath) {
    const target = normalizePath(dirPath, 'targetFolderPath');
    const stats = await fs.promises.stat(target);
    if (!stats.isDirectory()) throw new Error('Target path is not a directory.');
    return target;
}

function getDisplayName(dirPath) {
    const resolved = path.resolve(dirPath);
    const driveMatch = resolved.match(/^([A-Za-z]:)\\?$/);
    if (driveMatch) return driveMatch[1];
    const base = path.basename(resolved);
    return base || resolved;
}

function isSamePath(left, right) {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function getAvailablePath(targetDir, fileName) {
    const parsed = path.parse(fileName);
    const baseName = parsed.name || 'file';
    const extension = parsed.ext || '';
    let candidate = path.join(targetDir, `${baseName}${extension}`);
    let index = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(targetDir, `${baseName} (${index})${extension}`);
        index += 1;
    }
    return candidate;
}

function sanitizeFileName(name) {
    if (typeof name !== 'string') return '';
    const trimmed = name.trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return '';
    const cleaned = trimmed.replace(/[<>:"|?*]/g, '').trim().replace(/[. ]+$/, '');
    if (!cleaned) return '';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(cleaned)) return '';
    return cleaned;
}

async function readDirectory(dirPath) {
    const resolved = normalizePath(dirPath, 'dirPath');
    try {
        const dirents = await fs.promises.readdir(resolved, { withFileTypes: true });
        const folders = dirents
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => ({
                name: dirent.name,
                path: path.join(resolved, dirent.name),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        const files = await Promise.all(
            dirents
                .filter((dirent) => dirent.isFile() && isSupportedImageName(dirent.name))
                .map(async (dirent) => {
                    const filePath = path.join(resolved, dirent.name);
                    const stats = await fs.promises.stat(filePath);
                    const extension = path.extname(dirent.name).slice(1).toLowerCase();
                    const dimensions = await readImageDimensions(filePath);
                    return {
                        name: dirent.name,
                        path: filePath,
                        size: stats.size,
                        lastModified: stats.mtimeMs,
                        type: MIME_TYPES[extension] || 'image/unknown',
                        ...dimensions,
                    };
                })
        );

        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        return { files, folders };
    } catch (error) {
        console.warn('Failed to read directory:', error.message);
        return { files: [], folders: [], error: error.message || 'Unable to read this folder.' };
    }
}

async function readImageFiles(filePaths) {
    if (!Array.isArray(filePaths)) throw new Error('filePaths must be an array.');
    const files = [];
    for (const filePath of filePaths) {
        try {
            const source = await ensureImageFile(filePath);
            const stats = await fs.promises.stat(source);
            const extension = path.extname(path.basename(source)).slice(1).toLowerCase();
            const dimensions = await readImageDimensions(source);
            files.push({
                name: path.basename(source),
                path: source,
                size: stats.size,
                lastModified: stats.mtimeMs,
                type: MIME_TYPES[extension] || 'image/unknown',
                ...dimensions,
            });
        } catch (error) {
            console.warn('Skipped invalid image file:', error.message);
        }
    }
    return files;
}

async function copyImageFile(sourcePath, targetFolderPath) {
    const source = await ensureImageFile(sourcePath);
    const targetFolder = await ensureDirectory(targetFolderPath);
    const destination = getAvailablePath(targetFolder, path.basename(source));
    await fs.promises.copyFile(source, destination);
    return { path: destination, name: path.basename(destination) };
}

async function moveImageFile(sourcePath, targetFolderPath) {
    const source = await ensureImageFile(sourcePath);
    const targetFolder = await ensureDirectory(targetFolderPath);
    if (isSamePath(path.dirname(source), targetFolder)) {
        return { path: source, name: path.basename(source) };
    }

    const destination = getAvailablePath(targetFolder, path.basename(source));
    try {
        await fs.promises.rename(source, destination);
    } catch (error) {
        if (error && error.code === 'EXDEV') {
            await fs.promises.copyFile(source, destination);
            await fs.promises.unlink(source);
        } else {
            throw error;
        }
    }
    return { path: destination, name: path.basename(destination) };
}

async function renameImageFile(sourcePath, nextName) {
    const source = await ensureImageFile(sourcePath);
    const sanitized = sanitizeFileName(nextName);
    if (!sanitized) throw new Error('Enter a valid file name.');

    const parsed = path.parse(source);
    const suppliedExtension = path.extname(sanitized);
    if (suppliedExtension && !isSupportedImageName(sanitized)) {
        throw new Error('The new extension must be a supported image format.');
    }
    const destination = path.join(parsed.dir, suppliedExtension ? sanitized : `${sanitized}${parsed.ext}`);
    if (isSamePath(source, destination)) return { path: source, name: path.basename(source) };
    if (fs.existsSync(destination)) throw new Error('A file with the same name already exists.');
    await fs.promises.rename(source, destination);
    return { path: destination, name: path.basename(destination) };
}

async function deleteImageFile(sourcePath) {
    const source = await ensureImageFile(sourcePath);
    await shell.trashItem(source);
    return { ok: true };
}

async function overwriteImageFile(sourcePath, bytes) {
    const source = await ensureImageFile(sourcePath);
    if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
        throw new Error('Image data must be a byte buffer.');
    }
    const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
    if (buffer.length === 0 || buffer.length > 250 * 1024 * 1024) {
        throw new Error('Edited image data is empty or too large.');
    }
    const tempPath = `${source}.fastimage-${Date.now()}.tmp`;
    try {
        await fs.promises.writeFile(tempPath, buffer);
        await fs.promises.copyFile(tempPath, source);
    } finally {
        await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    }
    return { path: source, name: path.basename(source) };
}

async function batchFileOperation(operation, sourcePaths, targetFolderPath) {
    if (!['copy', 'move', 'delete'].includes(operation)) throw new Error('Unsupported file operation.');
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) throw new Error('No source files were provided.');
    if (operation !== 'delete') await ensureDirectory(targetFolderPath);

    const result = { succeeded: [], failed: [] };
    for (const sourcePath of sourcePaths) {
        try {
            const value = operation === 'copy'
                ? await copyImageFile(sourcePath, targetFolderPath)
                : operation === 'move'
                    ? await moveImageFile(sourcePath, targetFolderPath)
                    : await deleteImageFile(sourcePath);
            result.succeeded.push({
                sourcePath,
                destinationPath: value.path,
                name: value.name,
            });
        } catch (error) {
            result.failed.push({ sourcePath, error: error.message || 'File operation failed.' });
        }
    }
    return result;
}

async function batchRenameImageFiles(renames) {
    if (!Array.isArray(renames) || renames.length === 0) throw new Error('No rename requests were provided.');

    const result = { succeeded: [], failed: [] };
    for (const request of renames) {
        const sourcePath = request && request.sourcePath;
        try {
            const value = await renameImageFile(sourcePath, request.nextName);
            result.succeeded.push({ sourcePath, destinationPath: value.path, name: value.name });
        } catch (error) {
            result.failed.push({ sourcePath: typeof sourcePath === 'string' ? sourcePath : '', error: error.message || 'Rename failed.' });
        }
    }
    return result;
}

async function getThumbnailDataUrl(filePath, requestedSize = 320) {
    const source = await ensureImageFile(filePath);
    const size = Math.max(64, Math.min(640, Number(requestedSize) || 320));
    const stats = await fs.promises.stat(source);
    const key = `${source}|${stats.mtimeMs}|${size}`;
    const cached = thumbnailCache.get(key);
    if (cached) return cached;

    let dataUrl;
    if (['.bmp', '.ico'].includes(path.extname(source).toLowerCase())) {
        // These formats are supported by Electron but not by sharp.
        const image = nativeImage.createFromPath(source);
        if (image.isEmpty()) throw new Error('Unable to decode image.');
        const dimensions = image.getSize();
        const bounds = dimensions.width >= dimensions.height ? { width: size } : { height: size };
        dataUrl = image.resize({ ...bounds, quality: 'good' }).toDataURL();
    } else {
        // Apply EXIF rotation/mirroring before metadata is removed from the PNG.
        dataUrl = await createOrientedThumbnail(source, size);
    }
    thumbnailCache.set(key, dataUrl);
    while (thumbnailCache.size > MAX_THUMBNAIL_CACHE) {
        thumbnailCache.delete(thumbnailCache.keys().next().value);
    }
    return dataUrl;
}

function isSupportedImagePath(filePath) {
    return typeof filePath === 'string' && isSupportedImageName(filePath);
}

module.exports = {
    SUPPORTED_EXTENSIONS,
    isSupportedImageName,
    isSupportedImagePath,
    getDisplayName,
    readDirectory,
    readImageFiles,
    copyImageFile,
    moveImageFile,
    renameImageFile,
    deleteImageFile,
    overwriteImageFile,
    batchFileOperation,
    batchRenameImageFiles,
    getThumbnailDataUrl,
};
