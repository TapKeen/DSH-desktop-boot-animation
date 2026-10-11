/**
 * embed-audio.mjs — build step, NOT shipped in the package.
 *
 * Replaces the `__DSH_AUDIO_B64__` placeholder in client/client.js with the
 * base64 of a supplied audio file. Run with the Electron-bundled node:
 *
 *   "DSH Desktop.exe" scripts/embed-audio.mjs . <path/to/chime.mp3>
 *   (with ELECTRON_RUN_AS_NODE=1)
 *
 * Idempotent: re-running swaps an already-embedded payload for the new one.
 */
import fs from 'node:fs';
import path from 'node:path';

const pkgDir = path.resolve(process.argv[2] ?? '.');
const audioPath = process.argv[3];
if (!audioPath) {
  console.error('usage: embed-audio.mjs <package-dir> <audio-file>');
  process.exit(2);
}

const target = path.join(pkgDir, 'client', 'client.js');
if (!fs.existsSync(target)) { console.error('client bundle not found: ' + target); process.exit(2); }
if (!fs.existsSync(audioPath)) { console.error('audio file not found: ' + audioPath); process.exit(2); }

const audio = fs.readFileSync(audioPath);
console.log(`audio: ${audioPath}`);
console.log(`  bytes: ${audio.length} (${(audio.length / 1024).toFixed(1)} KB)`);

// Refuse to embed something that is obviously not audio.
const head = audio.subarray(0, 4).toString('latin1');
const isMp3 = head.startsWith('ID3') || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
const isWav = head === 'RIFF';
const isOgg = head === 'OggS';
if (!isMp3 && !isWav && !isOgg) {
  console.error(`refusing to embed: unrecognised container (first bytes ${JSON.stringify(head)})`);
  process.exit(1);
}
console.log(`  container: ${isMp3 ? 'MPEG audio (ID3/frame sync)' : isWav ? 'RIFF/WAV' : 'Ogg'}`);

const b64 = audio.toString('base64');
console.log(`  base64: ${b64.length} chars (${(b64.length / 1024).toFixed(0)} KB)`);

const original = fs.readFileSync(target, 'utf8');
const before = original.length;

// Matches either the build placeholder or an already-embedded payload, so the
// script can be re-run safely.
const re = /const AUDIO_B64 = '(?:__DSH_AUDIO_B64__|[A-Za-z0-9+/=]+)';/;
if (!re.test(original)) {
  console.error('FAIL: could not locate the AUDIO_B64 declaration in client.js');
  process.exit(1);
}

const updated = original.replace(re, `const AUDIO_B64 = '${b64}';`);
if (updated === original) { console.error('FAIL: replacement produced no change'); process.exit(1); }

// Back up once so a bad embed is recoverable.
const backup = target + '.pre-embed';
if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log(`  backup written: ${path.basename(backup)}`);
}

fs.writeFileSync(target, updated, 'utf8');
console.log(`\nclient.js: ${before} -> ${updated.length} chars (+${updated.length - before})`);

// Re-read and confirm the payload decodes back to the exact input.
const check = fs.readFileSync(target, 'utf8');
const m = check.match(/const AUDIO_B64 = '([A-Za-z0-9+/=]+)';/);
if (!m) { console.error('FAIL: payload not found after write'); process.exit(1); }
const roundTrip = Buffer.from(m[1], 'base64');
const identical = roundTrip.length === audio.length && roundTrip.equals(audio);
console.log(`round-trip: ${roundTrip.length} bytes, identical=${identical}`);
console.log(identical ? '\nEMBED OK' : '\nEMBED FAILED');
process.exit(identical ? 0 : 1);
