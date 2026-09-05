
const { contextBridge, ipcRenderer } = require('electron');

let openFilesCallback = null;
let pendingOpenFiles = [];
let openFolderCallback = null;
let pendingOpenFolder = null;
let updateAvailableCallback = null;
let pendingUpdate = null;
let updateProgressCallback = null;

ipcRenderer.on('app:open-files', (_event, files) => {
    if (!Array.isArray(files) || files.length === 0) return;
    if (openFilesCallback) {
        openFilesCallback(files);
    } else {
        pendingOpenFiles = [...pendingOpenFiles, ...files];
    }
});

ipcRenderer.on('app:open-folder', (_event, folder) => {
    if (!folder || typeof folder.path !== 'string') return;
    if (openFolderCallback) {
        openFolderCallback(folder);
    } else {
        pendingOpenFolder = folder;
    }
});

ipcRenderer.on('app:update-available', (_event, update) => {
    if (!update || typeof update.version !== 'string') return;
    if (updateAvailableCallback) {
        updateAvailableCallback(update);
    } else {
        pendingUpdate = update;
    }
});

ipcRenderer.on('app:update-download-progress', (_event, progress) => {
    if (updateProgressCallback) updateProgressCallback(progress);
});

contextBridge.exposeInMainWorld('electron', {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
    readDirectory: (path) => ipcRenderer.invoke('fs:readDirectory', path),
    createDirectory: (parentPath, directoryName) => ipcRenderer.invoke('fs:createDirectory', parentPath, directoryName),
    getInitialRoots: () => ipcRenderer.invoke('fs:getInitialRoots'),
    toLocalUrl: (filePath) => `local:///${encodeURIComponent(filePath)}`,
    getThumbnailUrl: (filePath, size) => ipcRenderer.invoke('fs:getThumbnail', filePath, size),
    openImageFiles: () => ipcRenderer.invoke('dialog:openImageFiles'),
    copyImageFile: (sourcePath, targetFolderPath) =>
        ipcRenderer.invoke('fs:copyImageFile', sourcePath, targetFolderPath),
    moveImageFile: (sourcePath, targetFolderPath) =>
        ipcRenderer.invoke('fs:moveImageFile', sourcePath, targetFolderPath),
    renameImageFile: (sourcePath, nextName) =>
        ipcRenderer.invoke('fs:renameImageFile', sourcePath, nextName),
    deleteImageFile: (sourcePath) => ipcRenderer.invoke('fs:deleteImageFile', sourcePath),
    overwriteImageFile: (sourcePath, bytes) => ipcRenderer.invoke('fs:overwriteImageFile', sourcePath, bytes),
    batchFileOperation: (operation, sourcePaths, targetFolderPath) =>
        ipcRenderer.invoke('fs:batchFileOperation', operation, sourcePaths, targetFolderPath),
    batchRenameImages: (renames) => ipcRenderer.invoke('fs:batchRenameImages', renames),
    startWatchingDirectory: (dirPath) => ipcRenderer.invoke('fs:startWatchingDirectory', dirPath),
    stopWatchingDirectory: (watchId) => ipcRenderer.invoke('fs:stopWatchingDirectory', watchId),
    onDirectoryChanged: (callback) => {
        const listener = (_event, dirPath) => callback(dirPath);
        ipcRenderer.on('fs:directory-changed', listener);
        return () => ipcRenderer.removeListener('fs:directory-changed', listener);
    },
    onOpenFilesFromArgs: (callback) => {
        openFilesCallback = callback;
        if (pendingOpenFiles.length > 0) {
            const files = pendingOpenFiles;
            pendingOpenFiles = [];
            queueMicrotask(() => openFilesCallback?.(files));
        }
        return () => {
            if (openFilesCallback === callback) openFilesCallback = null;
        };
    },
    onOpenFolderFromArgs: (callback) => {
        openFolderCallback = callback;
        if (pendingOpenFolder) {
            const folder = pendingOpenFolder;
            pendingOpenFolder = null;
            queueMicrotask(() => openFolderCallback?.(folder));
        }
        return () => {
            if (openFolderCallback === callback) openFolderCallback = null;
        };
    },
    loadPreferences: () => ipcRenderer.invoke('preferences:load'),
    savePreferences: (preferences) => ipcRenderer.invoke('preferences:save', preferences),
    getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
    getAppEdition: () => ipcRenderer.invoke('app:getEdition'),
    rendererReady: () => ipcRenderer.invoke('app:rendererReady'),
    getUpdateOutcome: () => ipcRenderer.invoke('app:getUpdateOutcome'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    onUpdateAvailable: (callback) => {
        updateAvailableCallback = callback;
        if (pendingUpdate) {
            const update = pendingUpdate;
            pendingUpdate = null;
            queueMicrotask(() => updateAvailableCallback?.(update));
        }
        return () => {
            if (updateAvailableCallback === callback) updateAvailableCallback = null;
        };
    },
    onUpdateDownloadProgress: (callback) => {
        updateProgressCallback = callback;
        return () => {
            if (updateProgressCallback === callback) updateProgressCallback = null;
        };
    },
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    toggleMaximizeWindow: () => ipcRenderer.send('window:toggleMaximize'),
    closeWindow: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onWindowMaximizedChanged: (callback) => {
        const listener = (_event, isMaximized) => callback(isMaximized);
        ipcRenderer.on('window:maximized-changed', listener);
        return () => ipcRenderer.removeListener('window:maximized-changed', listener);
    },
});
