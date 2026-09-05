const path = require('path');

const DRIVE_KIND_BY_TYPE = Object.freeze({
    2: 'removable-drive',
    3: 'fixed-drive',
    4: 'network-drive',
    5: 'cdrom-drive',
    6: 'ram-drive',
});

function classifyDriveType(value) {
    return DRIVE_KIND_BY_TYPE[Number(value)] || 'unknown-drive';
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeDriveLetter(value) {
    const match = String(value ?? '').trim().match(/^([A-Za-z]):?$/);
    return match ? `${match[1].toUpperCase()}:` : '';
}

function displayDriveName(deviceId, volumeName, providerName) {
    const driveLetter = normalizeDriveLetter(deviceId);
    if (!driveLetter) return '';
    const label = String(volumeName ?? '').trim() || String(providerName ?? '').trim();
    return label ? `${label} (${driveLetter})` : driveLetter;
}

function normalizeStorageRoot(record) {
    if (!record || typeof record !== 'object') return null;
    const driveLetter = normalizeDriveLetter(record.DeviceID ?? record.deviceId);
    if (!driveLetter) return null;
    const pathValue = `${driveLetter}\\`;
    const volumeLabel = String(record.VolumeName ?? record.volumeName ?? '').trim() || null;
    const providerName = String(record.ProviderName ?? record.providerName ?? '').trim() || null;
    const totalBytes = finiteNumber(record.Size ?? record.size);
    const freeBytes = finiteNumber(record.FreeSpace ?? record.freeSpace);
    return {
        name: displayDriveName(driveLetter, volumeLabel, providerName),
        path: pathValue,
        kind: classifyDriveType(record.DriveType ?? record.driveType),
        driveLetter,
        volumeLabel,
        totalBytes,
        freeBytes,
        providerName,
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
    normalizeStorageRoot,
    specialFolderKind,
    isDrivePath,
};
