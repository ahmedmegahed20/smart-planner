/**
 * Generates assets/alarm.wav — a short, attention-grabbing two-tone rising alarm.
 * Plain 16-bit mono PCM WAV so Android (res/raw) and iOS (bundle) can both play it.
 */
const fs = require('fs');
const path = require('path');

function writeWAV(filePath, samples, sampleRate) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function render(sampleRate, duration) {
  const total = Math.floor(sampleRate * duration);
  const out = new Float32Array(total);
  const freqs = [880, 1174.66, 1567.98]; // A5, D6, G6 — staccato rising alarm
  const sectionLen = Math.floor(total / 3);
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const idx = Math.min(2, Math.floor(i / sectionLen));
    phase += (2 * Math.PI * freqs[idx]) / sampleRate;
    const local = i % sectionLen;
    const attack = Math.min(1, local / (0.008 * sampleRate));
    const release = Math.min(1, (sectionLen - local) / (0.07 * sampleRate));
    const master = i > total * 0.88 ? (total - i) / (total * 0.12) : 1;
    out[i] = 0.5 * attack * release * master * Math.sin(phase);
  }
  return out;
}

const sampleRate = 22050;
const duration = 1.5;
const dest = process.argv[2] || path.join(__dirname, '..', 'assets', 'alarm.wav');
writeWAV(dest, render(sampleRate, duration), sampleRate);
console.log('alarm.wav written:', dest, `(${fs.statSync(dest).size} bytes)`);