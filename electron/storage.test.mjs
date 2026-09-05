import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyDriveType,
  displayDriveName,
  mergeStorageRoot,
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
    expect(classifyDriveType('Fixed')).toBe('fixed-drive');
    expect(classifyDriveType('CD-ROM')).toBe('cdrom-drive');
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
    expect(normalizeStorageRoot({ DeviceID: 'c:', DriveType: 3, Size: 100, FreeSpace: 10 }).name).toBe('Local Disk (C:)');
    const logical = normalizeStorageRoot({ DeviceID: 'l:', DriveType: 3 });
    const volume = normalizeStorageRoot({ DriveLetter: 'L', FileSystemLabel: 'SM1-500G', DriveType: 'Fixed' });
    expect(mergeStorageRoot(logical, volume)).toMatchObject({
      name: 'SM1-500G (L:)',
      driveLetter: 'L:',
      volumeLabel: 'SM1-500G',
      kind: 'fixed-drive',
    });
  });

  it('recognizes special folders and drive roots', () => {
    expect(specialFolderKind('Pictures')).toBe('pictures');
    expect(specialFolderKind('unknown')).toBeNull();
    expect(isDrivePath('C:\\')).toBe(true);
    expect(isDrivePath('C:\\Photos')).toBe(false);
  });
});
