const fs = require('fs');
const path = require('path');

const DEFAULT_PREFERENCES = {
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

function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
}

function normalizePreferences(value) {
    const source = value && typeof value === 'object' ? value : {};
    const result = cloneDefaults();

    if (source.language === 'ko' || source.language === 'en') result.language = source.language;
    if (source.theme === 'dark' || source.theme === 'light') result.theme = source.theme;
    if (typeof source.sidebarOpen === 'boolean') result.sidebarOpen = source.sidebarOpen;
    if (source.viewSize === 'small' || source.viewSize === 'medium' || source.viewSize === 'large') {
        result.viewSize = source.viewSize;
    }
    if (source.sortMode === 'name' || source.sortMode === 'type' || source.sortMode === 'size' || source.sortMode === 'date' || source.sortMode === 'rating') {
        result.sortMode = source.sortMode;
    }
    if (source.sortDirection === 'asc' || source.sortDirection === 'desc') {
        result.sortDirection = source.sortDirection;
    }
    if (typeof source.wheelNavigation === 'boolean') result.wheelNavigation = source.wheelNavigation;
    if (typeof source.defaultFolder === 'string' && source.defaultFolder.trim()) {
        result.defaultFolder = source.defaultFolder;
    }
    if (typeof source.confirmDelete === 'boolean') result.confirmDelete = source.confirmDelete;
    if (Array.isArray(source.recentFolders)) {
        result.recentFolders = source.recentFolders.filter((item) => typeof item === 'string').slice(0, 12);
    }
    if (source.imageMetadata && typeof source.imageMetadata === 'object') {
        result.imageMetadata = Object.fromEntries(
            Object.entries(source.imageMetadata)
                .filter(([, metadata]) => metadata && typeof metadata === 'object')
                .map(([key, metadata]) => [key, {
                    favorite: metadata.favorite === true,
                    rating: Math.max(0, Math.min(5, Number(metadata.rating) || 0)),
                    colorLabel: typeof metadata.colorLabel === 'string' ? metadata.colorLabel : null,
                    tags: Array.isArray(metadata.tags)
                        ? metadata.tags.filter((tag) => typeof tag === 'string').slice(0, 50)
                        : [],
                }])
        );
    }

    return result;
}

async function loadPreferences(userDataPath) {
    const filePath = path.join(userDataPath, 'preferences.json');
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return normalizePreferences(JSON.parse(content));
    } catch (error) {
        if (error && error.code !== 'ENOENT') {
            console.warn('Failed to load preferences:', error.message);
        }
        return cloneDefaults();
    }
}

async function savePreferences(userDataPath, preferences) {
    const filePath = path.join(userDataPath, 'preferences.json');
    const tempPath = `${filePath}.tmp`;
    const normalized = normalizePreferences(preferences);
    await fs.promises.mkdir(userDataPath, { recursive: true });
    await fs.promises.writeFile(tempPath, JSON.stringify(normalized, null, 2), 'utf8');
    await fs.promises.rename(tempPath, filePath);
    return normalized;
}

module.exports = {
    DEFAULT_PREFERENCES,
    loadPreferences,
    savePreferences,
    normalizePreferences,
};
