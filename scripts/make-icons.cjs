// Renders resources/icon.svg into every PNG the Android and iOS projects need.
// Run after changing the icon:  node scripts/make-icons.cjs   (needs Playwright + Chromium)
// The generated PNGs are committed so the build machines don't need a browser.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'resources');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const sized = (w, extra = '') => svg.replace('<svg ', `<svg width="${w}" height="${w}" ${extra}`);
const noBg = svg.replace('<rect width="1024" height="1024" fill="url(#bg)"/>', '');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (html, w, h, file) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0">${html}</body></html>`);
    await page.screenshot({ path: path.join(dir, file), omitBackground: true });
  };

  await shot(sized(1024), 1024, 1024, 'ios/AppIcon-1024.png');
  for (const [name, k] of Object.entries(DENSITIES)) {
    const legacy = Math.round(48 * k);
    const fg = Math.round(108 * k);
    await shot(sized(legacy, `style="border-radius:${legacy * 0.2}px"`), legacy, legacy, `android/mipmap-${name}/ic_launcher.png`);
    await shot(sized(legacy, 'style="border-radius:50%"'), legacy, legacy, `android/mipmap-${name}/ic_launcher_round.png`);
    // Adaptive icon foreground: artwork inside the central safe zone, transparent around it.
    await shot(`<div style="width:${fg}px;height:${fg}px;padding:${fg / 6}px;box-sizing:border-box">${noBg.replace('<svg ', `<svg width="${fg * 2 / 3}" height="${fg * 2 / 3}" `)}</div>`, fg, fg, `android/mipmap-${name}/ic_launcher_foreground.png`);
  }
  const splash = (s, icon) => `<div style="width:${s}px;height:${s}px;background:#0b1022;display:grid;place-items:center">${sized(icon, `style="border-radius:${icon * 0.22}px"`)}</div>`;
  await shot(splash(1280, 300), 1280, 1280, 'android/splash.png');
  await shot(splash(2732, 560), 2732, 2732, 'ios/splash-2732.png');
  await browser.close();
})();
