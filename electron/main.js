const { app, BrowserWindow, ipcMain, dialog, protocol, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
    isSupportedImagePath,
    readDirectory,
    readImageFiles,
    createDirectory,
    getDisplayName,
    copyImageFile,
    moveImageFile,
    renameImageFile,
    deleteImageFile,
    overwriteImageFile,
    batchFileOperation,
    batchRenameImageFiles,
    getThumbnailDataUrl,
} = require('./file-system');
const { loadPreferences, savePreferences } = require('./preferences');
const { createUpdateManager } = require('./update-service');
const { detectEdition } = require('./edition');
const { mergeStorageRoot, normalizeStorageRoot } = require('./storage');

const execFileAsync = promisify(execFile);

const isDev = !app.isPackaged;
const appEdition = detectEdition(app);
// Keep an explicitly selected profile across updater relaunches.
const profileArgument = process.argv.find(value => value.startsWith('--user-data-dir='));
if (profileArgument) app.setPath('userData', path.resolve(profileArgument.slice('--user-data-dir='.length)));
else if (appEdition === 'pro') app.setPath('userData', path.join(app.getPath('appData'), 'FastImage Pro'));
const directoryWatchers = new Map();
let mainWindow = null;
const singleInstanceLock = app.requestSingleInstanceLock();
const updateManager = createUpdateManager({
    app,
    edition: appEdition,
    onUpdateAvailable: (update) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:update-available', update);
        }
    },
    onDownloadProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:update-download-progress', progress);
        }
    },
});

async function sendLaunchFiles(win, commandLine) {
    const folderCandidate = commandLine
        .filter((value) => typeof value === 'string' && !value.startsWith('-'))
        .map((value) => path.resolve(value))
        .find((value) => {
            try {
                return fs.statSync(value).isDirectory();
            } catch {
                return false;
            }
        });
    if (folderCandidate) {
        const content = await readDirectory(folderCandidate);
        if (!win.isDestroyed()) {
            win.webContents.send('app:open-folder', {
                path: folderCandidate,
                name: getDisplayName(folderCandidate),
                content,
            });
        }
        return;
    }
    const candidates = commandLine.filter((value) => isSupportedImagePath(value));
    if (candidates.length === 0 || win.isDestroyed()) return;
    const files = await readImageFiles(candidates);
    if (files.length > 0 && !win.isDestroyed()) win.webContents.send('app:open-files', files);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        frame: false,
        backgroundColor: '#1e1e1e',
        show: false,
    });
    mainWindow = win;

    Menu.setApplicationMenu(null);

    if (isDev) {
        win.loadURL('http://localhost:5173');
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    win.once('ready-to-show', () => {
        win.show();
        if (win.rendererReady) void updateManager.confirmLaunch().catch(error => console.warn('Update startup confirmation:', error.message));
        win.webContents.send('window:maximized-changed', win.isMaximized());
        void sendLaunchFiles(win, process.argv.slice(1));
    });

    win.on('maximize', () => win.webContents.send('window:maximized-changed', true));
    win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false));
    win.on('closed', () => {
        if (mainWindow === win) mainWindow = null;
    });
}

if (!singleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, commandLine) => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        void sendLaunchFiles(mainWindow, commandLine.slice(1));
    });

    app.whenReady().then(async () => {
        if (await updateManager.applyPendingUpdate()) {
            app.quit();
            return;
        }

        protocol.registerFileProtocol('local', (request, callback) => {
            try {
                const parsed = new URL(request.url);
                let encodedPath = parsed.pathname;
                if (encodedPath.startsWith('/')) encodedPath = encodedPath.slice(1);
                const decodedPath = path.normalize(decodeURIComponent(encodedPath));
                if (!isSupportedImagePath(decodedPath)) {
                    callback({ error: -6 });
                    return;
                }
                const stats = fs.statSync(decodedPath);
                if (!stats.isFile()) {
                    callback({ error: -6 });
                    return;
                }
                callback({ path: decodedPath });
            } catch (error) {
                console.warn('Local image protocol error:', error.message);
                callback({ error: -6 });
            }
        });

        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });

        setTimeout(() => {
            void updateManager.checkForUpdates();
        }, 4500);
    });
}

app.on('before-quit', () => {
    for (const entry of directoryWatchers.values()) entry.watcher.close();
    directoryWatchers.clear();
});

ipcMain.handle('app:rendererReady', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    mainWindow.rendererReady = true;
    if (mainWindow.isVisible()) await updateManager.confirmLaunch();
});
ipcMain.handle('app:getUpdateOutcome', () => updateManager.getUpdateOutcome());

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || !filePaths[0]) return null;
    const rootPath = path.resolve(filePaths[0]);
    const content = await readDirectory(rootPath);
    return { path: rootPath, name: getDisplayName(rootPath), content };
});

ipcMain.handle('dialog:chooseDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || !filePaths[0]) return null;
    const dirPath = path.resolve(filePaths[0]);
    return { path: dirPath, name: getDisplayName(dirPath) };
});

ipcMain.handle('dialog:openImageFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif'] }],
    });
    if (canceled) return [];
    return readImageFiles(filePaths);
});

ipcMain.handle('fs:readDirectory', async (_event, dirPath) => readDirectory(dirPath));
ipcMain.handle('fs:createDirectory', async (_event, parentPath, directoryName) => createDirectory(parentPath, directoryName));
ipcMain.handle('fs:getThumbnail', async (_event, filePath, size) => getThumbnailDataUrl(filePath, size));
ipcMain.handle('fs:copyImageFile', async (_event, sourcePath, targetFolderPath) => copyImageFile(sourcePath, targetFolderPath));
ipcMain.handle('fs:moveImageFile', async (_event, sourcePath, targetFolderPath) => moveImageFile(sourcePath, targetFolderPath));
ipcMain.handle('fs:renameImageFile', async (_event, sourcePath, nextName) => renameImageFile(sourcePath, nextName));
ipcMain.handle('fs:deleteImageFile', async (_event, sourcePath) => deleteImageFile(sourcePath));
ipcMain.handle('fs:overwriteImageFile', async (_event, sourcePath, bytes) => overwriteImageFile(sourcePath, bytes));
ipcMain.handle('fs:batchFileOperation', async (_event, operation, sourcePaths, targetFolderPath) => (
    batchFileOperation(operation, sourcePaths, targetFolderPath)
));
ipcMain.handle('fs:batchRenameImages', async (_event, renames) => batchRenameImageFiles(renames));

async function queryPowerShellJson(command) {
    try {
        const result = await execFileAsync('powershell.exe', [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            command,
        ], {
            windowsHide: true,
            timeout: 6000,
            maxBuffer: 256 * 1024,
        });
        const text = String(result.stdout ?? '').trim();
        if (!text) return [];
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
        console.warn('Windows storage metadata query failed:', error.message);
        return [];
    }
}

async function queryWindowsDrives() {
    if (process.platform !== 'win32') return [];

    // Win32_LogicalDisk includes drives even when an optical disk has no
    // media. Get-Volume supplies the user-facing volume label for devices
    // where the WMI label is empty, so both results are merged by letter.
    const logicalDiskCommand = [
        '$ErrorActionPreference = "Stop"',
        'Get-CimInstance -ClassName Win32_LogicalDisk',
        '| Where-Object { $_.DriveType -in 2,3,4,5,6 }',
        '| Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace,ProviderName',
        '| ConvertTo-Json -Compress',
    ].join(' ');
    const volumeCommand = [
        '$ErrorActionPreference = "Stop"',
        'Get-Volume',
        '| Where-Object { $_.DriveLetter }',
        '| Select-Object DriveLetter,FileSystemLabel,DriveType,Size,SizeRemaining',
        '| ConvertTo-Json -Compress',
    ].join(' ');

    const [logicalRecords, volumeRecords] = await Promise.all([
        queryPowerShellJson(logicalDiskCommand),
        queryPowerShellJson(volumeCommand),
    ]);
    const byLetter = new Map();
    logicalRecords.map(normalizeStorageRoot).filter(Boolean).forEach((root) => {
        byLetter.set(root.driveLetter.toLowerCase(), root);
    });
    volumeRecords.map(normalizeStorageRoot).filter(Boolean).forEach((root) => {
        const key = root.driveLetter.toLowerCase();
        byLetter.set(key, byLetter.has(key) ? mergeStorageRoot(byLetter.get(key), root) : root);
    });
    return [...byLetter.values()];
}

function createKnownFolderRoots() {
    const knownFolders = [
        { name: 'Desktop', path: app.getPath('desktop'), specialKind: 'desktop' },
        { name: 'Downloads', path: app.getPath('downloads'), specialKind: 'downloads' },
        { name: 'Documents', path: app.getPath('documents'), specialKind: 'documents' },
        { name: 'Pictures', path: app.getPath('pictures'), specialKind: 'pictures' },
        { name: 'Music', path: app.getPath('music'), specialKind: 'music' },
        { name: 'Videos', path: app.getPath('videos'), specialKind: 'videos' },
    ];
    return knownFolders
        .map((folder) => ({ ...folder, kind: 'special' }))
        .filter((folder) => typeof folder.path === 'string' && fs.existsSync(folder.path));
}

function createDriveRoots(queriedDrives) {
    const roots = [];
    const seen = new Set();
    const pushUnique = (root, allowMissing = false) => {
        if (!root || typeof root.path !== 'string') return;
        const normalized = path.resolve(root.path);
        if (!allowMissing && !fs.existsSync(normalized)) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        roots.push({ ...root, path: normalized });
    };

    queriedDrives.forEach((root) => pushUnique(root, true));

    // PowerShell can be unavailable on a locked-down machine. Preserve the
    // previous drive enumeration as a safe fallback. Query results are kept
    // even when a removable or optical volume is temporarily unavailable.
    if (process.platform === 'win32') {
        for (let code = 65; code <= 90; code += 1) {
            const letter = String.fromCharCode(code);
            const drivePath = `${letter}:\\`;
            if (!fs.existsSync(drivePath)) continue;
            const fallback = normalizeStorageRoot({ DeviceID: `${letter}:`, DriveType: 3 });
            if (fallback) pushUnique(fallback);
        }
    }
    return roots;
}

async function getStorageRoots() {
    const knownFolderRoots = createKnownFolderRoots();
    const driveRoots = createDriveRoots(await queryWindowsDrives());
    const homePath = app.getPath('home');
    const userName = path.basename(homePath) || 'User';
    const userRoot = {
        name: userName,
        path: homePath,
        kind: 'special',
        specialKind: 'user',
    };
    const picturesRoot = knownFolderRoots.find((root) => root.specialKind === 'pictures');

    // Keep shell-like roots in the renderer tree. Their children are real
    // filesystem paths, while the parents are navigation containers and are
    // never sent to readDirectory.
    const homeRoot = {
        id: 'shell:home',
        name: 'Home',
        path: 'shell:home',
        kind: 'virtual',
        isVirtual: true,
        virtualKind: 'home',
        children: [userRoot],
    };
    const galleryRoot = {
        id: 'shell:gallery',
        name: 'Gallery',
        path: 'shell:gallery',
        kind: 'virtual',
        isVirtual: true,
        virtualKind: 'gallery',
        children: picturesRoot ? [picturesRoot] : [],
    };
    const librariesRoot = {
        id: 'shell:libraries',
        name: 'Libraries',
        path: 'shell:libraries',
        kind: 'virtual',
        isVirtual: true,
        virtualKind: 'libraries',
        children: knownFolderRoots,
    };
    const thisPcRoot = {
        id: 'shell:this-pc',
        name: 'This PC',
        path: 'shell:this-pc',
        kind: 'virtual',
        isVirtual: true,
        virtualKind: 'this-pc',
        children: driveRoots,
    };
    return [homeRoot, galleryRoot, librariesRoot, thisPcRoot];
}

ipcMain.handle('fs:getInitialRoots', async () => getStorageRoots());

ipcMain.handle('fs:startWatchingDirectory', async (event, dirPath) => {
    const resolved = path.resolve(dirPath);
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) throw new Error('Watch target is not a directory.');

    const watchId = crypto.randomUUID();
    const watcher = fs.watch(resolved, { persistent: false }, () => {
        if (!event.sender.isDestroyed()) event.sender.send('fs:directory-changed', resolved);
    });
    watcher.on('error', (error) => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('fs:directory-watch-error', { dirPath: resolved, error: error.message });
        }
    });
    directoryWatchers.set(watchId, { watcher, webContents: event.sender, dirPath: resolved });
    event.sender.once('destroyed', () => {
        const entry = directoryWatchers.get(watchId);
        if (entry) {
            entry.watcher.close();
            directoryWatchers.delete(watchId);
        }
    });
    return watchId;
});

ipcMain.handle('fs:stopWatchingDirectory', async (event, watchId) => {
    const entry = directoryWatchers.get(watchId);
    if (!entry || entry.webContents !== event.sender) return;
    entry.watcher.close();
    directoryWatchers.delete(watchId);
});

ipcMain.handle('preferences:load', async () => loadPreferences(app.getPath('userData')));
ipcMain.handle('preferences:save', async (_event, preferences) => savePreferences(app.getPath('userData'), preferences));
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getEdition', () => appEdition);
ipcMain.handle('app:checkForUpdates', () => updateManager.checkForUpdates());
ipcMain.handle('app:downloadUpdate', () => updateManager.downloadUpdate());
ipcMain.handle('app:installUpdate', () => updateManager.installUpdate());

ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
});

ipcMain.on('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
});

ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
});

ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
});
