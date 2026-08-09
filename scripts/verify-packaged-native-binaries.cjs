const path = require('node:path');
const { execFileSync } = require('node:child_process');

const nativeBinaries = [
  ['capty-daemon', 'daemon', 'capty-daemon'],
  ['FFmpeg', 'binaries', 'ffmpeg', 'ffmpeg'],
  ['Whisper', 'binaries', 'whisper', 'whisper'],
];

function getPackagedNativeBinaries(context) {
  const resourcesPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources'
  );

  return nativeBinaries.map(([label, ...segments]) => ({
    label,
    binaryPath: path.join(resourcesPath, ...segments),
  }));
}

async function verifyPackagedNativeBinaries(context) {
  const verificationArguments = getPackagedNativeBinaries(context).flatMap(
    ({ label, binaryPath }) => [label, binaryPath]
  );

  try {
    execFileSync(
      path.join(__dirname, 'verify-native-binaries.sh'),
      verificationArguments,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch (error) {
    const details = error.stderr?.toString().trim();
    throw new Error(details || 'Packaged native binary verification failed');
  }
}

module.exports = verifyPackagedNativeBinaries;
module.exports.getPackagedNativeBinaries = getPackagedNativeBinaries;
