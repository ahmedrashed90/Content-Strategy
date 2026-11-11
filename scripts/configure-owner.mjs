import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uid = process.argv[2]?.trim();
if (!uid || !/^[a-zA-Z0-9]{6,128}$/.test(uid)) {
  console.error('Usage: node scripts/configure-owner.mjs FIREBASE_AUTH_UID');
  process.exit(1);
}
const files = ['site/config.js', 'firestore.rules'];
for (const name of files) {
  const filePath = path.join(projectDir, name);
  const content = fs.readFileSync(filePath, 'utf8');
  const next = name === 'site/config.js'
    ? content.replace(/export const OWNER_UID = '[^']*';/, `export const OWNER_UID = '${uid}';`)
    : content.replace(/request\.auth\.uid == '[^']*';/, `request.auth.uid == '${uid}';`);
  if (content === next && !content.includes(uid)) throw Error(`Could not configure ${name}`);
  fs.writeFileSync(filePath, next);
}
console.log('Owner UID configured in site/config.js and firestore.rules.');
console.log('Next: publish firestore.rules in Firebase Console > Firestore Database > Rules.');
