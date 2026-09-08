const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const PORTABLE_ASSET_PATTERN = /^FastImage-[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-Windows-Portable\.exe$/;
const INSTALLER_ASSET_PATTERN = /^FastImage-[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-Windows-Setup\.exe$/;
const PRO_PORTABLE_ASSET_PATTERN = /^FastImage-Pro-[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-Windows-Portable\.exe$/;
const PRO_INSTALLER_ASSET_PATTERN = /^FastImage-Pro-[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-Windows-Setup\.exe$/;
const ASSET_PATTERN = PORTABLE_ASSET_PATTERN;

function parseVersion(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(SEMVER_PATTERN);
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split('.') : [],
    };
}

function normalizeVersion(value) {
    const parsed = parseVersion(value);
    if (!parsed) return null;
    const suffix = parsed.prerelease.length > 0 ? `-${parsed.prerelease.join('.')}` : '';
    return `${parsed.major}.${parsed.minor}.${parsed.patch}${suffix}`;
}

function comparePrerelease(left, right) {
    if (left.length === 0 && right.length === 0) return 0;
    if (left.length === 0) return 1;
    if (right.length === 0) return -1;

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        if (index >= left.length) return -1;
        if (index >= right.length) return 1;

        const leftPart = left[index];
        const rightPart = right[index];
        if (leftPart === rightPart) continue;

        const leftIsNumeric = /^\d+$/.test(leftPart);
        const rightIsNumeric = /^\d+$/.test(rightPart);
        if (leftIsNumeric && rightIsNumeric) return Number(leftPart) - Number(rightPart);
        if (leftIsNumeric) return -1;
        if (rightIsNumeric) return 1;
        return leftPart < rightPart ? -1 : 1;
    }
    return 0;
}

function compareVersions(left, right) {
    const leftVersion = parseVersion(left);
    const rightVersion = parseVersion(right);
    if (!leftVersion || !rightVersion) return null;

    for (const key of ['major', 'minor', 'patch']) {
        if (leftVersion[key] !== rightVersion[key]) {
            return leftVersion[key] > rightVersion[key] ? 1 : -1;
        }
    }
    return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

function normalizeEdition(edition) {
    return String(edition ?? '').trim().toLowerCase() === 'pro' ? 'pro' : 'community';
}

function getAssetPrefix(edition) {
    return normalizeEdition(edition) === 'pro' ? 'FastImage-Pro' : 'FastImage';
}

function getPortableAssetName(version, edition = 'community') {
    const normalized = normalizeVersion(version);
    return normalized ? `${getAssetPrefix(edition)}-${normalized}-Windows-Portable.exe` : null;
}

function getInstallerAssetName(version, edition = 'community') {
    const normalized = normalizeVersion(version);
    return normalized ? `${getAssetPrefix(edition)}-${normalized}-Windows-Setup.exe` : null;
}

function parseSha256Digest(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(?:sha256:)?([a-f0-9]{64})$/i);
    return match ? match[1].toLowerCase() : null;
}

function selectReleaseAsset(release, version, distribution = 'portable', edition = 'community') {
    if (!release || !Array.isArray(release.assets)) return null;
    const expectedName = distribution === 'installer'
        ? getInstallerAssetName(version, edition)
        : getPortableAssetName(version, edition);
    const normalizedEdition = normalizeEdition(edition);
    const assetPattern = distribution === 'installer'
        ? (normalizedEdition === 'pro' ? PRO_INSTALLER_ASSET_PATTERN : INSTALLER_ASSET_PATTERN)
        : (normalizedEdition === 'pro' ? PRO_PORTABLE_ASSET_PATTERN : PORTABLE_ASSET_PATTERN);
    if (!expectedName) return null;
    return release.assets.find((asset) => (
        asset
        && asset.name === expectedName
        && assetPattern.test(asset.name)
        && typeof asset.browser_download_url === 'string'
    )) ?? null;
}

function buildUpdateInfo(release, currentVersion, distribution = 'portable', edition = 'community') {
    if (!release || typeof release !== 'object') return null;
    const version = normalizeVersion(release.tag_name);
    const comparison = compareVersions(version, currentVersion);
    if (!version || comparison === null || comparison <= 0) return null;

    const asset = selectReleaseAsset(release, version, distribution, edition);
    if (!asset) return null;

    return {
        currentVersion: normalizeVersion(currentVersion) ?? currentVersion,
        version,
        tagName: String(release.tag_name),
        name: typeof release.name === 'string' && release.name.trim() ? release.name.trim() : `FastImage ${version}`,
        notes: typeof release.body === 'string' ? release.body.slice(0, 12000) : '',
        publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
        assetName: asset.name,
        downloadUrl: asset.browser_download_url,
        size: Number.isFinite(asset.size) ? asset.size : null,
        digest: parseSha256Digest(asset.digest),
    };
}

module.exports = {
    ASSET_PATTERN,
    INSTALLER_ASSET_PATTERN,
    PRO_INSTALLER_ASSET_PATTERN,
    PRO_PORTABLE_ASSET_PATTERN,
    buildUpdateInfo,
    compareVersions,
    getInstallerAssetName,
    getPortableAssetName,
    normalizeVersion,
    parseSha256Digest,
    parseVersion,
    selectReleaseAsset,
};
