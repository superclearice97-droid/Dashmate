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
    + `$1<uses-feature android:name="android.hardware.location.gps" android:required="false" tools:replace="android:required" />`
    + `$1<application`,
  ));
  edit(join(main, 'AndroidManifest.xml'), (s) => s.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
  ));
  // Background GPS (phone paired with a screen): notification text and a proper
  // single-colour icon, as Android requires for the "sharing GPS" notification.
  writeFileSync(join(main, 'res/drawable/ic_stat_dashmate.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,4A9,9 0,0 0,4.2 17.5l1.7,-1A7,7 0,1 1,19 12a7,7 0,0 1,-0.9 3.5l1.7,1A9,9 0,0 0,12 4zM15.7,7.9l-4.6,4.3a1.5,1.5 0,1 0,1.8 1.8z"/>
</vector>
`);
  edit(join(main, 'res/values/strings.xml'), (s) => s.replace('</resources>', `    <string name="capacitor_background_geolocation_notification_channel_name">Sharing GPS with your screen</string>
    <string name="capacitor_background_geolocation_notification_icon">drawable/ic_stat_dashmate</string>
</resources>`));
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
\t<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
\t<string>When this phone is paired as the GPS for your DashMate screen, it keeps sending its location to that screen while locked, so it can stay in your pocket. It goes only to your screen.</string>
\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>location</string>
\t</array>
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
