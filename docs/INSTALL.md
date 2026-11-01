# Installing DashMate

Download the files from the newest release on the [Releases](../../../releases/latest) page.

## Android (phone or tablet)

1. On the phone, open the release page and tap **DashMate.apk**.
2. When asked, allow your browser to **install unknown apps** (Android shows a switch for this).
3. Tap **Install**, then **Open**.
4. Allow **location** (for speed and the map). Camera is asked for only when you use pairing or road reading.

To update, install the newer APK the same way. Your settings and songs are kept.

## iPad / iPhone

Apple only lets you install apps from outside the App Store by *sideloading* them with your Apple ID. It's free, with two limits: **apps must be refreshed every 7 days**, and a free Apple ID can have **3 sideloaded apps** at a time. (A paid Apple Developer account, $99/year, removes the 7-day limit.)

The easiest way from a Linux PC (including CachyOS) is **iloader**, which installs **SideStore**. SideStore then installs DashMate and refreshes it on the iPad itself, without the computer.

1. On the PC, install **iloader** (on CachyOS/Arch, search the AUR for `iloader`; other systems: [iloader.app](https://iloader.app) or its [GitHub page](https://github.com/nab138/iloader)). It needs `usbmuxd`, which is in CachyOS's repositories.
2. Plug the iPad into the PC with a cable and tap **Trust** on the iPad.
3. Open iloader, sign in with your Apple ID and choose **Install SideStore**. It also sets up SideStore's pairing file.
4. On the iPad, go to **Settings › General › VPN & Device Management** and trust your Apple ID's developer profile. On iOS 16 or newer, also turn on **Settings › Privacy & Security › Developer Mode** and restart when asked.
5. Download **DashMate.ipa** on the iPad (Safari saves it to Files).
6. Open **SideStore** › **My Apps** › **+**, then choose **DashMate.ipa**.
7. Every few days, open SideStore and tap **Refresh All** (it shows how many days are left). Refreshing without the PC uses a small VPN helper app that SideStore asks you to install the first time.

SideStore's own guide has pictures and troubleshooting, and it is the place to check if a step changes: [docs.sidestore.io](https://docs.sidestore.io).

> **Simpler but needs the PC every week:** iloader can also install DashMate.ipa directly. Then plug the iPad in and reinstall it with iloader every 7 days.

## Using a Wi-Fi-only iPad with your phone's GPS (experimental)

1. **Install DashMate on the phone too** (the APK on Android, the .ipa on iPhone, as above). Open it once and accept the terms.
2. Turn on **Personal Hotspot** on the phone and connect the iPad to it. The iPad now has internet through the phone.
3. On the iPad tap the **pair** button (blue) › **This is the screen**. A QR code appears.
4. Point the **phone's normal Camera app** at the iPad's code and tap the banner. It opens DashMate on the phone. (Or in DashMate on the phone: **pair** › **This is the phone**, then scan.)
5. The phone shows its own code. Hold it up to the iPad's front camera.
6. Both say **Paired**. The iPad now shows the phone's speed and position.

If the phone says no app can open the code, DashMate isn't installed on the phone yet.

To also use road reading, mount the phone so its back camera sees the road and turn on **Road reading** on the phone. The iPad shows the results.

If the connection drops (for example, the hotspot turns off), pair again. Pairing needs iOS 16.4 or newer.

## Controlling Spotify, Apple Music and other music apps (experimental)

- **Android:** open the **Music** button › **Allow music control**, then turn on **DashMate** in the notification access list. Start music in any app once; DashMate's media card then shows and controls it. DashMate uses this permission only for media controls and doesn't read your notifications.
- **iPad / iPhone:** open the **Music** button › **Connect Apple Music** and allow access. DashMate controls Apple Music and lists your playlists. Apple doesn't let apps control Spotify or other music apps on iOS; use their own controls (or the Control Center).
