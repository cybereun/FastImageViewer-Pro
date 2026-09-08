import { describe, expect, it } from 'vitest';
import {
  buildUpdateInfo,
  compareVersions,
  getPortableAssetName,
  getInstallerAssetName,
  normalizeVersion,
  parseSha256Digest,
  selectReleaseAsset,
} from './update-utils.js';

describe('update version rules', () => {
  it('normalizes and compares stable and prerelease versions', () => {
    expect(normalizeVersion('v2.0.1')).toBe('2.0.1');
    expect(compareVersions('2.0.1', '2.0.0')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('2.0.0-beta.2', '2.0.0-beta.10')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0-rc.1')).toBe(1);
  });

  it('accepts only valid SHA-256 digest formats', () => {
    const hash = 'A'.repeat(64);
    expect(parseSha256Digest(`sha256:${hash}`)).toBe(hash.toLowerCase());
    expect(parseSha256Digest(hash)).toBe(hash.toLowerCase());
    expect(parseSha256Digest('sha1:123')).toBeNull();
  });

  it('selects the exact portable asset for a newer release', () => {
    const release = {
      tag_name: 'v2.0.1',
      name: 'FastImage 2.0.1',
      body: 'Update support',
      published_at: '2026-08-30T00:00:00Z',
      assets: [
        { name: 'FastImage-2.0.1-Windows-Portable.exe', browser_download_url: 'https://example.com/update.exe', size: 42 },
        { name: 'FastImage-2.0.1-Windows-Portable.exe.zip', browser_download_url: 'https://example.com/update.zip', size: 42 },
      ],
    };
    expect(getPortableAssetName('v2.0.1')).toBe('FastImage-2.0.1-Windows-Portable.exe');
    expect(selectReleaseAsset(release, '2.0.1')?.name).toBe('FastImage-2.0.1-Windows-Portable.exe');
    expect(buildUpdateInfo(release, '2.0.0')).toMatchObject({
      version: '2.0.1',
      assetName: 'FastImage-2.0.1-Windows-Portable.exe',
      downloadUrl: 'https://example.com/update.exe',
    });
    expect(buildUpdateInfo(release, '2.0.1')).toBeNull();
  });

  it('selects the installer asset for installed builds', () => {
    const release = {
      tag_name: 'v2.0.6',
      name: 'FastImage 2.0.6',
      body: 'Installer release',
      assets: [
        { name: 'FastImage-2.0.6-Windows-Portable.exe', browser_download_url: 'https://example.com/portable.exe', size: 42 },
        { name: 'FastImage-2.0.6-Windows-Setup.exe', browser_download_url: 'https://example.com/setup.exe', size: 43 },
      ],
    };
    expect(getInstallerAssetName('v2.0.6')).toBe('FastImage-2.0.6-Windows-Setup.exe');
    expect(selectReleaseAsset(release, '2.0.6', 'installer')?.name).toBe('FastImage-2.0.6-Windows-Setup.exe');
    expect(buildUpdateInfo(release, '2.0.5', 'installer')).toMatchObject({
      version: '2.0.6',
      assetName: 'FastImage-2.0.6-Windows-Setup.exe',
      downloadUrl: 'https://example.com/setup.exe',
    });
  });

  it('selects Pro assets without accepting Community assets', () => {
    const release = {
      tag_name: 'v2.3.3',
      assets: [
        { name: 'FastImage-2.3.3-Windows-Portable.exe', browser_download_url: 'https://example.com/community.exe', size: 42 },
        { name: 'FastImage-Pro-2.3.3-Windows-Portable.exe', browser_download_url: 'https://example.com/pro.exe', size: 43 },
      ],
    };

    expect(getPortableAssetName('2.3.3', 'pro')).toBe('FastImage-Pro-2.3.3-Windows-Portable.exe');
    expect(selectReleaseAsset(release, '2.3.3', 'portable', 'pro')?.name).toBe('FastImage-Pro-2.3.3-Windows-Portable.exe');
  });
});
