// Applies DashMate's settings to the native projects that `npx cap add` generates:
// permissions (with the reasons shown to the user), version numbers, icons and splash.
//   node scripts/patch-native.mjs android|ios
// BUILD_NUMBER (CI run number) becomes the Android versionCode / iOS build number.

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const build = String(Number(process.env.BUILD_NUMBER) || 1);
const res = (p) => join(root, 'resources', p);

function edit(file, fn) {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`patch had no effect on ${file}`);
  writeFileSync(file, after);
}

if (platform === 'android') {
  const main = join(root, 'android/app/src/main');
  edit(join(main, 'AndroidManifest.xml'), (s) => s.replace(
    /(\s*)<application/,
    `$1<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`
    + `$1<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`
    + `$1<uses-permission android:name="android.permission.CAMERA" />`
    + `$1<uses-feature android:name="android.hardware.camera" android:required="false" />`
    + `$1<uses-feature android:name="android.hardware.location.gps" android:required="false" />`
    + `$1<application`,
  ));
  // dashmate://pair?c=… links (the pairing QR code) open DashMate.
  edit(join(main, 'AndroidManifest.xml'), (s) => s.replace(
    /(<\/intent-filter>)/,
    `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="dashmate" />
            </intent-filter>`,
  ));
  edit(join(root, 'android/app/build.gradle'), (s) => s
    .replace(/versionCode \d+/, `versionCode ${build}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`));
  for (const d of readdirSync(res('android'))) {
    if (!d.startsWith('mipmap-')) continue;
    for (const f of readdirSync(res(`android/${d}`))) {
      const dst = join(main, 'res', d, f);
      if (existsSync(dirname(dst))) copyFileSync(res(`android/${d}/${f}`), dst);
    }
  }
  const bgXml = join(main, 'res/values/ic_launcher_background.xml');
  if (existsSync(bgXml)) edit(bgXml, (s) => s.replace(/#[0-9A-Fa-f]{6}/, '#141C38'));
  for (const d of readdirSync(join(main, 'res'))) {
    const splash = join(main, 'res', d, 'splash.png');
    if (existsSync(splash)) copyFileSync(res('android/splash.png'), splash);
  }
} else if (platform === 'ios') {
  const app = join(root, 'ios/App/App');
  edit(join(app, 'Info.plist'), (s) => s.replace(
    /<\/dict>\s*<\/plist>\s*$/,
    `\t<key>NSLocationWhenInUseUsageDescription</key>
\t<string>DashMate uses your location to show your speed, your position on the map and turn-by-turn directions. It stays on your device.</string>
\t<key>NSAppleMusicUsageDescription</key>
\t<string>DashMate shows and controls what's playing in Apple Music, and lists your playlists. Nothing is uploaded.</string>
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>DashMate pairing</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>dashmate</string>
\t\t\t</array>
\t\t</dict>
\t</array>
\t<key>NSCameraUsageDescription</key>
\t<string>DashMate uses the camera to read pairing codes and, if you turn it on, to spot traffic lights, cars and people. Images are processed on this device and never uploaded.</string>
</dict>
</plist>
`,
  ));
  edit(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), (s) => s
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`));
  const iconDir = join(app, 'Assets.xcassets/AppIcon.appiconset');
  const icons = readdirSync(iconDir).filter((f) => f.endsWith('.png'));
  if (!icons.length) throw new Error('no app icon slot found');
  for (const f of icons) copyFileSync(res('ios/AppIcon-1024.png'), join(iconDir, f));
  const splashDir = join(app, 'Assets.xcassets/Splash.imageset');
  if (existsSync(splashDir)) {
    for (const f of readdirSync(splashDir).filter((x) => x.endsWith('.png'))) copyFileSync(res('ios/splash-2732.png'), join(splashDir, f));
  }
} else {
  console.error('usage: node scripts/patch-native.mjs android|ios');
  process.exit(1);
}
console.log(`patched ${platform}: version ${version} (${build})`);
