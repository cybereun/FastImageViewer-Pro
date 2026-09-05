import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edition = String(process.argv[2] ?? '').trim().toLowerCase();
if (!['community', 'pro'].includes(edition)) {
  console.error('Usage: node scripts/build-edition.mjs <community|pro>');
  process.exit(2);
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const baseBuild = packageJson.build ?? {};
const isPro = edition === 'pro';
const productName = isPro ? 'FastImage Pro' : 'FastImage';
const appId = isPro ? 'com.antigravity.fastimage.pro' : 'com.antigravity.fastimage';
const outputDirectory = isPro ? 'dist-electron-pro' : 'dist-electron';

// Keep artifact names stable inside each edition's release repository. The
// app ID and output directory provide the isolation that prevents a Community
// updater from replacing a Pro installation.
const builderConfig = {
  ...baseBuild,
  appId,
  productName,
  directories: {
    ...(baseBuild.directories ?? {}),
    output: outputDirectory,
  },
  extraMetadata: {
    ...(baseBuild.extraMetadata ?? {}),
    edition,
  },
  nsis: {
    ...(baseBuild.nsis ?? {}),
    shortcutName: productName,
  },
};

const configPath = path.join(root, `.electron-builder-${edition}.json`);
writeFileSync(configPath, `${JSON.stringify(builderConfig, null, 2)}\n`, 'utf8');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status ?? 1}`);
}

try {
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit'], {
    VITE_EDITION: edition,
    FASTIMAGE_EDITION: edition,
  });
  run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    VITE_EDITION: edition,
    FASTIMAGE_EDITION: edition,
  });

  run(process.execPath, [require.resolve('electron-builder/cli'), '--config', configPath, '--publish', 'never'], {
    VITE_EDITION: edition,
    FASTIMAGE_EDITION: edition,
    ELECTRON_BUILDER_COMPRESSION_LEVEL: '1',
  });
} finally {
  rmSync(configPath, { force: true });
}
