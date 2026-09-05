import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyDriveType,
  displayDriveName,
  normalizeStorageRoot,
  specialFolderKind,
  isDrivePath,
} = require('./storage.js');

describe('storage metadata', () => {
  it('classifies Windows logical disk types for Explorer-style icons', () => {
    expect(classifyDriveType(2)).toBe('removable-drive');
    expect(classifyDriveType(3)).toBe('fixed-drive');
    expect(classifyDriveType(4)).toBe('network-drive');
    expect(classifyDriveType(5)).toBe('cdrom-drive');
    expect(classifyDriveType(6)).toBe('ram-drive');
    expect(classifyDriveType(99)).toBe('unknown-drive');
  });

  it('normalizes drive metadata and preserves capacity values', () => {
    expect(normalizeStorageRoot({
      DeviceID: 'd:',
      VolumeName: 'Photos',
      DriveType: 2,
      Size: '1000',
      FreeSpace: '250',
      ProviderName: '',
    })).toEqual({
      name: 'Photos (D:)',
      path: 'D:\\',
      kind: 'removable-drive',
      driveLetter: 'D:',
      volumeLabel: 'Photos',
      totalBytes: 1000,
      freeBytes: 250,
      providerName: null,
    });
    expect(displayDriveName('Z:', '', '\\\\server\\share')).toBe('\\\\server\\share (Z:)');
  });

  it('recognizes special folders and drive roots', () => {
    expect(specialFolderKind('Pictures')).toBe('pictures');
    expect(specialFolderKind('unknown')).toBeNull();
    expect(isDrivePath('C:\\')).toBe(true);
    expect(isDrivePath('C:\\Photos')).toBe(false);
  });
});
