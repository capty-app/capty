import fs from 'node:fs';
import path from 'node:path';
import {
  generateLicenseNotices,
  LICENSE_NOTICES_PATH,
} from './license-notices';

const generatedNotices = generateLicenseNotices();
const isCheck = process.argv.includes('--check');

if (isCheck) {
  const existingNotices = fs.existsSync(LICENSE_NOTICES_PATH)
    ? fs.readFileSync(LICENSE_NOTICES_PATH, 'utf8')
    : undefined;

  if (existingNotices !== generatedNotices) {
    console.error(
      'License notices are stale. Run `bun run licenses:generate` and commit the result.'
    );
    process.exit(1);
  }

  console.log('License notices are up to date.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(LICENSE_NOTICES_PATH), { recursive: true });
fs.writeFileSync(LICENSE_NOTICES_PATH, generatedNotices);
console.log(`License notices written to ${LICENSE_NOTICES_PATH}.`);
