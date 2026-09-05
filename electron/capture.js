const { clipboard, desktopCapturer, screen } = require('electron');

const LIST_THUMBNAIL_SIZE = Object.freeze({ width: 720, height: 480 });
const CAPTURE_THUMBNAIL_LIMIT = Object.freeze({ width: 3840, height: 2160 });

function assertSourceId(sourceId) {
    if (typeof sourceId !== 'string' || !sourceId.trim()) {
        throw new Error('A capture source is required.');
    }
    return sourceId.trim();
}

function getCaptureSize() {
    try {
        const displays = screen.getAllDisplays();
        const width = Math.max(
            1920,
            ...displays.map((display) => Math.round(display.bounds.width * display.scaleFactor))
        );
        const height = Math.max(
            1080,
            ...displays.map((display) => Math.round(display.bounds.height * display.scaleFactor))
        );
        return {
            width: Math.min(CAPTURE_THUMBNAIL_LIMIT.width, width),
            height: Math.min(CAPTURE_THUMBNAIL_LIMIT.height, height),
        };
    } catch {
        return CAPTURE_THUMBNAIL_LIMIT;
    }
}

function getSources(options) {
    return desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: options.thumbnailSize,
        fetchWindowIcons: true,
    });
}

function sourceType(source) {
    return source.id.startsWith('screen:') ? 'screen' : 'window';
}

function serializeSource(source) {
    const thumbnail = source.thumbnail;
    if (!thumbnail || thumbnail.isEmpty()) return null;
    const size = thumbnail.getSize();
    const appIcon = source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null;
    return {
        id: source.id,
        name: source.name || (sourceType(source) === 'screen' ? 'Screen' : 'Window'),
        type: sourceType(source),
        displayId: source.display_id || '',
        thumbnailUrl: thumbnail.toDataURL(),
        appIconUrl: appIcon,
        width: size.width,
        height: size.height,
    };
}

async function getCaptureSources() {
    const sources = await getSources({ thumbnailSize: LIST_THUMBNAIL_SIZE });
    return sources.map(serializeSource).filter(Boolean);
}

function clampUnit(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function normalizeRegion(region, width, height) {
    if (!region || typeof region !== 'object') {
        return { x: 0, y: 0, width, height };
    }
    const left = clampUnit(Number(region.x));
    const top = clampUnit(Number(region.y));
    const right = clampUnit(left + Math.max(0, Number(region.width)));
    const bottom = clampUnit(top + Math.max(0, Number(region.height)));
    const x = Math.floor(left * width);
    const y = Math.floor(top * height);
    const rightPixel = Math.ceil(right * width);
    const bottomPixel = Math.ceil(bottom * height);
    return {
        x,
        y,
        width: Math.max(1, rightPixel - x),
        height: Math.max(1, bottomPixel - y),
    };
}

async function captureSourceRegionToClipboard(sourceId, region) {
    const id = assertSourceId(sourceId);
    const sources = await getSources({ thumbnailSize: getCaptureSize() });
    const source = sources.find((candidate) => candidate.id === id);
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
        throw new Error('The selected screen or window is no longer available.');
    }

    const image = source.thumbnail;
    const imageSize = image.getSize();
    const rect = normalizeRegion(region, imageSize.width, imageSize.height);
    const boundedRect = {
        x: Math.max(0, Math.min(rect.x, imageSize.width - 1)),
        y: Math.max(0, Math.min(rect.y, imageSize.height - 1)),
        width: Math.max(1, Math.min(rect.width, imageSize.width - rect.x)),
        height: Math.max(1, Math.min(rect.height, imageSize.height - rect.y)),
    };
    const cropped = image.crop(boundedRect);
    if (cropped.isEmpty()) throw new Error('The selected capture area is empty.');
    clipboard.writeImage(cropped);
    return {
        width: cropped.getSize().width,
        height: cropped.getSize().height,
        bytes: cropped.toPNG().byteLength,
    };
}

module.exports = {
    getCaptureSources,
    captureSourceRegionToClipboard,
};
