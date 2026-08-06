import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<string | { type?: string }>;
  repository?: string | { url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

interface QueueEntry {
  name: string;
  fromDirectory: string;
  optional: boolean;
}

interface PackageNotice {
  identifier: string;
  license: string;
  repository?: string;
  licenseTexts: Array<{ fileName: string; text: string }>;
}

const LICENSE_FILE_PATTERN = /^(license|copying|notice)(?:$|[.-])/i;
const PACKAGE_LICENSE_OVERRIDES: Record<string, string> = {
  'keyv@4.5.4': 'resources/licenses/npm-overrides/keyv-4.5.4-MIT.txt',
  'lazy-val@1.0.5': 'resources/licenses/npm-overrides/lazy-val-1.0.5-MIT.txt',
  'react-remove-scroll-bar@2.3.8':
    'resources/licenses/npm-overrides/react-remove-scroll-bar-2.3.8-MIT.txt',
};

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const LICENSE_NOTICES_PATH = path.join(
  PROJECT_ROOT,
  'resources/licenses/THIRD_PARTY_NOTICES.txt'
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function normalizeText(text: string): string {
  return text.replaceAll('\r\n', '\n').trim();
}

function resolvePackageDirectory(
  packageName: string,
  fromDirectory: string
): string | undefined {
  let currentDirectory: string | undefined = fromDirectory;

  while (currentDirectory) {
    const candidate = path.join(
      currentDirectory,
      'node_modules',
      ...packageName.split('/')
    );

    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return undefined;
    }

    currentDirectory = parentDirectory;
  }

  return undefined;
}

function normalizeLicense(manifest: PackageManifest): string {
  if (typeof manifest.license === 'string') {
    return manifest.license;
  }

  if (manifest.license?.type) {
    return manifest.license.type;
  }

  const licenses = manifest.licenses
    ?.map(license => (typeof license === 'string' ? license : license.type))
    .filter((license): license is string => Boolean(license));

  return licenses?.join(' OR ') ?? '';
}

function normalizeRepository(manifest: PackageManifest): string | undefined {
  const repository =
    typeof manifest.repository === 'string'
      ? manifest.repository
      : manifest.repository?.url;

  if (!repository) {
    return manifest.homepage;
  }

  if (!repository.includes('://') && repository.includes('/')) {
    return `https://github.com/${repository}`;
  }

  return repository
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
}

function readLicenseTexts(
  projectRoot: string,
  packageDirectory: string,
  identifier: string
): PackageNotice['licenseTexts'] {
  const licenseFiles = fs
    .readdirSync(packageDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort((first, second) => first.localeCompare(second));

  if (licenseFiles.length > 0) {
    return licenseFiles.map(fileName => ({
      fileName,
      text: normalizeText(
        fs.readFileSync(path.join(packageDirectory, fileName), 'utf8')
      ),
    }));
  }

  const overridePath = PACKAGE_LICENSE_OVERRIDES[identifier];
  if (!overridePath) {
    throw new Error(`No license text found for ${identifier}`);
  }

  return [
    {
      fileName: path.basename(overridePath),
      text: normalizeText(
        fs.readFileSync(path.join(projectRoot, overridePath), 'utf8')
      ),
    },
  ];
}

export function collectPackageNotices(
  projectRoot = PROJECT_ROOT
): PackageNotice[] {
  const rootManifest = readJson<PackageManifest>(
    path.join(projectRoot, 'package.json')
  );
  const queue: QueueEntry[] = [
    ...Object.keys(rootManifest.dependencies ?? {}).map(name => ({
      name,
      fromDirectory: projectRoot,
      optional: false,
    })),
    { name: 'electron', fromDirectory: projectRoot, optional: false },
  ];
  const notices = new Map<string, PackageNotice>();
  const visitedDirectories = new Set<string>();

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) {
      break;
    }

    const packageDirectory = resolvePackageDirectory(
      entry.name,
      entry.fromDirectory
    );
    if (!packageDirectory) {
      if (entry.optional) {
        continue;
      }

      throw new Error(`Installed package not found: ${entry.name}`);
    }

    const realPackageDirectory = fs.realpathSync(packageDirectory);
    if (visitedDirectories.has(realPackageDirectory)) {
      continue;
    }
    visitedDirectories.add(realPackageDirectory);

    const manifest = readJson<PackageManifest>(
      path.join(packageDirectory, 'package.json')
    );
    const packageName = manifest.name ?? entry.name;
    const packageVersion = manifest.version;
    if (!packageVersion) {
      throw new Error(`Package version not found: ${packageName}`);
    }

    const identifier = `${packageName}@${packageVersion}`;
    const license = normalizeLicense(manifest);
    if (!license) {
      throw new Error(`Package license not found: ${identifier}`);
    }

    if (!notices.has(identifier)) {
      notices.set(identifier, {
        identifier,
        license,
        repository: normalizeRepository(manifest),
        licenseTexts: readLicenseTexts(
          projectRoot,
          packageDirectory,
          identifier
        ),
      });
    }

    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      queue.push({
        name: dependencyName,
        fromDirectory: packageDirectory,
        optional: false,
      });
    }

    for (const dependencyName of Object.keys(
      manifest.optionalDependencies ?? {}
    )) {
      queue.push({
        name: dependencyName,
        fromDirectory: packageDirectory,
        optional: true,
      });
    }

    for (const dependencyName of Object.keys(manifest.peerDependencies ?? {})) {
      queue.push({
        name: dependencyName,
        fromDirectory: packageDirectory,
        optional:
          manifest.peerDependenciesMeta?.[dependencyName]?.optional ?? false,
      });
    }
  }

  return [...notices.values()].sort((first, second) =>
    first.identifier.localeCompare(second.identifier)
  );
}

function renderExternalComponents(): string {
  return [
    'NATIVE COMPONENTS AND MODEL WEIGHTS',
    '',
    'FFmpeg 7.1',
    'License: LGPL-3.0-or-later',
    'Source: https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz',
    'Build configuration: https://github.com/capty-app/capty/blob/main/scripts/build-ffmpeg.sh',
    'License texts: licenses/ffmpeg/COPYING.LGPLv3 and licenses/ffmpeg/COPYING.GPLv3',
    '',
    'The shipped FFmpeg executable is built with --disable-gpl, --disable-nonfree, and --enable-version3. The GPLv3 text is included because LGPLv3 incorporates GPLv3 terms.',
    '',
    'whisper.cpp v1.8.3',
    'License: MIT',
    'Source: https://github.com/ggerganov/whisper.cpp/tree/v1.8.3',
    'Build configuration: https://github.com/capty-app/capty/blob/main/scripts/build-whisper.sh',
    'License text: licenses/whisper.cpp/LICENSE',
    '',
    'OpenAI Whisper model weights',
    'License: MIT',
    'Source project: https://github.com/openai/whisper',
    'Downloaded from: https://huggingface.co/ggerganov/whisper.cpp',
    'License text: licenses/openai-whisper/LICENSE',
    '',
    'Electron and Chromium',
    'The Electron package notice is included below. Chromium and its bundled third-party notices are provided separately in licenses/Electron-Chromium-LICENSES.html.',
  ].join('\n');
}

function renderPackageNotice(notice: PackageNotice): string {
  const metadata = [
    notice.identifier,
    `License: ${notice.license}`,
    notice.repository ? `Source: ${notice.repository}` : undefined,
  ].filter((line): line is string => Boolean(line));
  const licenseTexts = notice.licenseTexts.flatMap(({ fileName, text }) => [
    '',
    `--- ${fileName} ---`,
    '',
    text,
  ]);

  return [...metadata, ...licenseTexts].join('\n');
}

export function generateLicenseNotices(projectRoot = PROJECT_ROOT): string {
  const separator = '='.repeat(80);
  const packageNotices = collectPackageNotices(projectRoot)
    .map(renderPackageNotice)
    .join(`\n\n${separator}\n\n`);

  return [
    'CAPTY THIRD-PARTY SOFTWARE NOTICES',
    '',
    'This file accompanies the Capty desktop application. Capty itself is licensed under AGPL-3.0-only; its license text is provided separately in licenses/Capty-AGPL-3.0.txt.',
    'Source code: https://github.com/capty-app/capty',
    '',
    renderExternalComponents(),
    '',
    separator,
    '',
    'JAVASCRIPT AND ELECTRON PACKAGES',
    '',
    packageNotices,
    '',
  ].join('\n');
}
