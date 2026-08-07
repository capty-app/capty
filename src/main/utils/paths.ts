import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { isProduction } from './env';

export function getConfigDir(): string {
  const dirName = isProduction ? 'capty' : 'capty-dev';
  return path.join(app.getPath('home'), '.config', dirName);
}

export function getNativeBinaryPath(binaryName: string): string {
  const isDaemon = binaryName === 'capty-daemon';
  const devBasePath = isDaemon
    ? 'src/main/daemon'
    : `src/main/binaries/${binaryName}`;
  const prodBasePath = isDaemon ? 'daemon' : `binaries/${binaryName}`;

  const devPath = path.join(app.getAppPath(), devBasePath, binaryName);
  const prodPath = path.join(
    process.resourcesPath || '',
    prodBasePath,
    binaryName
  );

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  return devPath;
}

export function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function getLicenseFilePath(): string {
  return path.join(getConfigDir(), 'license.json');
}

export function getLicenseNoticesPath(): string {
  const devPath = path.join(
    app.getAppPath(),
    'resources',
    'licenses',
    'THIRD_PARTY_NOTICES.txt'
  );

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return path.join(
    process.resourcesPath || '',
    'licenses',
    'THIRD_PARTY_NOTICES.txt'
  );
}

export function getHistoryFilePath(): string {
  return path.join(getConfigDir(), 'history.json');
}

export function ensureDirectoryExists(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function getPublicAssetPath(relativePath: string): string {
  const devPath = path.join(app.getAppPath(), 'public', relativePath);
  if (fs.existsSync(devPath)) return devPath;

  const prodPath = path.join(process.resourcesPath || '', relativePath);
  if (fs.existsSync(prodPath)) return prodPath;

  return devPath;
}

export function isExistingDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function isValidDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return isExistingDirectory(path.dirname(dirPath));
  }
}
