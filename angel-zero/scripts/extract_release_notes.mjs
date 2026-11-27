// ANGELS ZERO — generate GitHub Release notes straight from src/patchnotes.js.
// Zero dependencies. Because the repo has no package.json, patchnotes.js is
// loaded through a data: module URL so its ES-module syntax is always valid.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(HERE, '..', 'src', 'patchnotes.js');
const args = process.argv.slice(2);
const requested = args.find(a => !a.startsWith('--'));
const highlights = args.includes('--highlights');

let PATCH_NOTES;
try {
  const code = fs.readFileSync(SOURCE, 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  PATCH_NOTES = mod.PATCH_NOTES;
} catch (err) {
  console.error('[RELEASE] could not load patchnotes.js: ' + (err && err.message ? err.message : err));
  process.exit(1);
}
if (!Array.isArray(PATCH_NOTES) || !PATCH_NOTES.length) {
  console.error('[RELEASE] PATCH_NOTES is empty');
  process.exit(1);
}

const version = requested || PATCH_NOTES[0].version;
const idx = PATCH_NOTES.findIndex(e => e && e.version === version);
if (idx < 0) {
  console.error(`[RELEASE] version ${version} not found in patchnotes.js (latest is ${PATCH_NOTES[0].version})`);
  process.exit(1);
}
const entry = PATCH_NOTES[idx];
const lines = [];
lines.push(`## ANGELS ZERO ${entry.version} — ${entry.title}`, '');
lines.push('▶ **[Play Live in Browser](https://angels-zero.pages.dev/) — Zero Installs**', '');
if (Array.isArray(entry.bullets) && entry.bullets.length) {
  for (const b of entry.bullets) lines.push(`- ${b}`);
  lines.push('');
}
if (highlights) {
  lines.push('### Highlights', '');
  for (const h of [
    'F-22A Raptor with a Blender-sculpted 3D cockpit',
    'F-15C Eagle, 6-DOF flight model and G-LOC physiology',
    'HUD-only Nose Cam and tactical radar',
    'Volumetric Cloud Sea, storms and carrier operations',
    'Real-World Free Flight over OSM/Esri terrain',
    'YouTube Music Player and procedural radio queue',
    'Automated headless CI smoke suite on every push and PR'
  ]) lines.push(`- ${h}`);
  lines.push('');
}
lines.push('---', '', `*Released from ANGELS ZERO \`${entry.version}\`. See the in-game patch notes for the full history.*`);
process.stdout.write(lines.join('\n') + '\n');
