const path = require('path');

const DRIVE_KIND_BY_TYPE = Object.freeze({
    1: 'unknown-drive',
    2: 'removable-drive',
    3: 'fixed-drive',
    4: 'network-drive',
    5: 'cdrom-drive',
    6: 'ram-drive',
});

const DRIVE_KIND_BY_NAME = Object.freeze({
    fixed: 'fixed-drive',
    local: 'fixed-drive',
    removable: 'removable-drive',
    'cd-rom': 'cdrom-drive',
    cdrom: 'cdrom-drive',
    optical: 'cdrom-drive',
    network: 'network-drive',
    ram: 'ram-drive',
});

const DEFAULT_DRIVE_LABELS = Object.freeze({
    'fixed-drive': 'Local Disk',
    'removable-drive': 'Removable Disk',
    'cdrom-drive': 'CD/DVD Drive',
    'network-drive': 'Network Drive',
    'ram-drive': 'RAM Disk',
    'unknown-drive': 'Drive',
});

function classifyDriveType(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && DRIVE_KIND_BY_TYPE[numeric]) return DRIVE_KIND_BY_TYPE[numeric];
    const normalized = String(value ?? '').trim().toLowerCase();
    return DRIVE_KIND_BY_NAME[normalized] || 'unknown-drive';
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeDriveLetter(value) {
    const match = String(value ?? '').trim().match(/^([A-Za-z]):?$/);
    return match ? `${match[1].toUpperCase()}:` : '';
}

function displayDriveName(deviceId, volumeName, providerName, kind = 'unknown-drive') {
    const driveLetter = normalizeDriveLetter(deviceId);
    if (!driveLetter) return '';
    const label = String(volumeName ?? '').trim()
        || String(providerName ?? '').trim()
        || DEFAULT_DRIVE_LABELS[kind]
        || DEFAULT_DRIVE_LABELS['unknown-drive'];
    return `${label} (${driveLetter})`;
}

function normalizeStorageRoot(record) {
    if (!record || typeof record !== 'object') return null;
    const driveLetter = normalizeDriveLetter(record.DeviceID ?? record.deviceId ?? record.DriveLetter ?? record.driveLetter);
    if (!driveLetter) return null;
    const kind = classifyDriveType(record.DriveType ?? record.driveType);
    const pathValue = `${driveLetter}\\`;
    const volumeLabel = String(record.VolumeName ?? record.volumeName ?? record.FileSystemLabel ?? record.fileSystemLabel ?? '').trim() || null;
    const providerName = String(record.ProviderName ?? record.providerName ?? '').trim() || null;
    const totalBytes = finiteNumber(record.Size ?? record.size);
    const freeBytes = finiteNumber(record.FreeSpace ?? record.freeSpace ?? record.SizeRemaining ?? record.sizeRemaining);
    return {
        name: displayDriveName(driveLetter, volumeLabel, providerName, kind),
        path: pathValue,
        kind,
        driveLetter,
        volumeLabel,
        totalBytes,
        freeBytes,
        providerName,
    };
}

function mergeStorageRoot(primary, supplement) {
    const left = primary && typeof primary === 'object' ? primary : null;
    const right = supplement && typeof supplement === 'object' ? supplement : null;
    if (!left) return right;
    if (!right) return left;
    const kind = left.kind === 'unknown-drive' ? right.kind : left.kind;
    const driveLetter = left.driveLetter || right.driveLetter;
    const volumeLabel = left.volumeLabel || right.volumeLabel || null;
    const providerName = left.providerName || right.providerName || null;
    return {
        ...left,
        ...right,
        name: displayDriveName(driveLetter, volumeLabel, providerName, kind),
        path: left.path || right.path,
        kind,
        driveLetter,
        volumeLabel,
        providerName,
        totalBytes: left.totalBytes ?? right.totalBytes ?? null,
        freeBytes: left.freeBytes ?? right.freeBytes ?? null,
    };
}

function specialFolderKind(name) {
    const normalized = path.basename(String(name ?? '')).trim().toLowerCase();
    const aliases = {
        desktop: 'desktop',
        downloads: 'downloads',
        documents: 'documents',
        pictures: 'pictures',
        music: 'music',
        videos: 'videos',
    };
    return aliases[normalized] || null;
}

function isDrivePath(value) {
    return /^[A-Za-z]:\\?$/.test(String(value ?? '').trim());
}

module.exports = {
    classifyDriveType,
    displayDriveName,
    mergeStorageRoot,
    normalizeStorageRoot,
    specialFolderKind,
    isDrivePath,
};
