import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<string | { type?: string }>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

interface QueueEntry {
  name: string;
  fromDirectory: string;
  optional: boolean;
  traverseDependencies: boolean;
}

interface PackageNotice {
  identifier: string;
  license: string;
  licenseTexts: Array<{ fileName: string; text: string }>;
}

interface PackageNoticeGroup {
  identifiers: string[];
  license: string;
  licenseTexts: PackageNotice['licenseTexts'];
}

const LICENSE_FILE_PATTERN = /^(license|copying|notice)(?:$|[.-])/i;
const TYPES_PACKAGE_PREFIX = '@types/';
const BUNDLED_DEV_PACKAGES = ['electron', 'tailwindcss', 'tw-animate-css'];
const PACKAGE_LICENSE_OVERRIDES: Record<string, string> = {
  'lazy-val@1.0.5': 'scripts/license-overrides/lazy-val-1.0.5-MIT.txt',
  'react-remove-scroll-bar@2.3.8':
    'scripts/license-overrides/react-remove-scroll-bar-2.3.8-MIT.txt',
};

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const LICENSE_NOTICES_PATH = path.join(
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
  fromDirectory: string,
  projectRoot: string
): string | undefined {
  const segments = packageName.split('/');
  let currentDirectory = fromDirectory;

  while (currentDirectory.startsWith(projectRoot)) {
    const candidate = path.join(currentDirectory, 'node_modules', ...segments);

    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }

    currentDirectory = path.dirname(currentDirectory);
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
    throw new Error(
      `No license text found for ${identifier}. Save a copy under scripts/license-overrides and register it in PACKAGE_LICENSE_OVERRIDES.`
    );
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

function collectDependencyEntries(
  manifest: PackageManifest,
  packageDirectory: string
): QueueEntry[] {
  const dependencyGroups: Array<
    [Record<string, string> | undefined, (name: string) => boolean]
  > = [
    [manifest.dependencies, () => false],
    [manifest.optionalDependencies, () => true],
    [
      manifest.peerDependencies,
      name => manifest.peerDependenciesMeta?.[name]?.optional ?? false,
    ],
  ];

  return dependencyGroups.flatMap(([dependencies, isOptional]) =>
    Object.keys(dependencies ?? {})
      .filter(name => !name.startsWith(TYPES_PACKAGE_PREFIX))
      .map(name => ({
        name,
        fromDirectory: packageDirectory,
        optional: isOptional(name),
        traverseDependencies: true,
      }))
  );
}

function collectPackageNotices(projectRoot: string): PackageNotice[] {
  const rootManifest = readJson<PackageManifest>(
    path.join(projectRoot, 'package.json')
  );
  const queue: QueueEntry[] = [
    ...collectDependencyEntries(rootManifest, projectRoot),
    ...BUNDLED_DEV_PACKAGES.map(name => ({
      name,
      fromDirectory: projectRoot,
      optional: false,
      traverseDependencies: false,
    })),
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
      entry.fromDirectory,
      projectRoot
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
        licenseTexts: readLicenseTexts(
          projectRoot,
          packageDirectory,
          identifier
        ),
      });
    }

    if (entry.traverseDependencies) {
      queue.push(...collectDependencyEntries(manifest, packageDirectory));
    }
  }

  return [...notices.values()].sort((first, second) =>
    first.identifier.localeCompare(second.identifier)
  );
}

function groupPackageNotices(notices: PackageNotice[]): PackageNoticeGroup[] {
  const groups = new Map<string, PackageNoticeGroup>();

  for (const notice of notices) {
    const key = JSON.stringify([notice.license, notice.licenseTexts]);
    const group = groups.get(key);

    if (group) {
      group.identifiers.push(notice.identifier);
      continue;
    }

    groups.set(key, {
      identifiers: [notice.identifier],
      license: notice.license,
      licenseTexts: notice.licenseTexts,
    });
  }

  return [...groups.values()];
}

function renderExternalComponents(): string {
  return [
    'NATIVE COMPONENTS AND MODEL WEIGHTS',
    '',
    'FFmpeg 7.1',
    'License: LGPL-3.0-or-later',
    'Source: https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz',
    'Build configuration: https://github.com/capty-app/capty/blob/main/scripts/build-ffmpeg.sh',
    'License texts: ffmpeg/COPYING.LGPLv3 and ffmpeg/COPYING.GPLv3, alongside this file.',
    '',
    'The shipped FFmpeg executable is built with --disable-gpl, --disable-nonfree, and --enable-version3. The GPLv3 text is included because LGPLv3 incorporates GPLv3 terms.',
    '',
    'whisper.cpp v1.8.3',
    'License: MIT',
    'Source: https://github.com/ggerganov/whisper.cpp/tree/v1.8.3',
    'Build configuration: https://github.com/capty-app/capty/blob/main/scripts/build-whisper.sh',
    'License text: whisper.cpp/LICENSE, alongside this file.',
    '',
    'OpenAI Whisper model weights',
    'License: MIT',
    'Source project: https://github.com/openai/whisper',
    'Downloaded from: https://huggingface.co/ggerganov/whisper.cpp',
    'License text: openai-whisper/LICENSE, alongside this file.',
    '',
    'Electron and Chromium',
    'The Electron package notice is included below. Chromium and its bundled third-party notices are provided separately in Electron-Chromium-LICENSES.html, alongside this file.',
  ].join('\n');
}

function renderPackageNotice(group: PackageNoticeGroup): string {
  const identifiers =
    group.identifiers.length === 1
      ? group.identifiers
      : [
          'Packages:',
          ...group.identifiers.map(identifier => `- ${identifier}`),
        ];
  const licenseTexts = group.licenseTexts.flatMap(({ fileName, text }) => [
    '',
    `--- ${fileName} ---`,
    '',
    text,
  ]);

  return [...identifiers, `License: ${group.license}`, ...licenseTexts].join(
    '\n'
  );
}

function generateLicenseNotices(projectRoot: string): string {
  const separator = '='.repeat(80);
  const packageNotices = groupPackageNotices(collectPackageNotices(projectRoot))
    .map(renderPackageNotice)
    .join(`\n\n${separator}\n\n`);

  return [
    'CAPTY THIRD-PARTY SOFTWARE NOTICES',
    '',
    'This file accompanies the Capty desktop application. Capty itself is licensed under AGPL-3.0-only; its license text is provided as Capty-AGPL-3.0.txt, alongside this file.',
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

fs.mkdirSync(path.dirname(LICENSE_NOTICES_PATH), { recursive: true });
fs.writeFileSync(LICENSE_NOTICES_PATH, generateLicenseNotices(PROJECT_ROOT));
console.log(`License notices written to ${LICENSE_NOTICES_PATH}.`);
