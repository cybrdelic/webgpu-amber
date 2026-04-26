import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = '/tmp/emerald-frames';
const GIF_OUTPUT = '/tmp/emerald.gif';
const FRAME_COUNT = 72;   // 6 seconds at 12fps
const DELAY_MS = 83;      // ~12fps

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-zygote',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });

console.log('Navigating to emerald sim...');
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });

// Wait for Three.js canvas to appear and render a few frames
await new Promise(r => setTimeout(r, 4000));

console.log(`Capturing ${FRAME_COUNT} frames...`);
for (let i = 0; i < FRAME_COUNT; i++) {
  const framePath = path.join(OUTPUT_DIR, `frame_${String(i).padStart(4, '0')}.png`);
  await page.screenshot({ path: framePath, type: 'png' });
  process.stdout.write(`\r  frame ${i + 1}/${FRAME_COUNT}`);
  await new Promise(r => setTimeout(r, DELAY_MS));
}
console.log('\nCapture complete. Encoding GIF...');

await browser.close();

// Encode GIF with ffmpeg (palette + dither for quality)
const paletteFile = '/tmp/emerald-palette.png';
execSync(
  `ffmpeg -y -framerate 12 -i "${OUTPUT_DIR}/frame_%04d.png" ` +
  `-vf "fps=12,scale=640:-1:flags=lanczos,palettegen=stats_mode=diff" "${paletteFile}"`,
  { stdio: 'inherit' }
);
execSync(
  `ffmpeg -y -framerate 12 -i "${OUTPUT_DIR}/frame_%04d.png" -i "${paletteFile}" ` +
  `-lavfi "fps=12,scale=640:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" ` +
  `"${GIF_OUTPUT}"`,
  { stdio: 'inherit' }
);

console.log(`\nGIF saved to ${GIF_OUTPUT}`);
