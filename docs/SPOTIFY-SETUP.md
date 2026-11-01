# Setting up "Connect Spotify" (one time, for the DashMate owner)

Spotify only lets an app control playback if the app is registered with Spotify. Registering is free, but Spotify's current rules for personal projects are:

- **You (the owner) need Spotify Premium.** If it lapses, Connect Spotify stops working.
- **Up to 5 people** can use it, and you add each person's Spotify email yourself.
- Everyone who wants to **control** playback needs Premium too (seeing what's playing works without it).

## 1. Turn on the sign-in return page (GitHub Pages)

1. Open the DashMate repository on GitHub › **Settings** › **Pages**.
2. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: main**, folder **/docs**, then **Save**.
3. After a minute, this page should load (it will just say "Nothing to pass to DashMate"):
   `https://superclearice97-droid.github.io/Dashmate/spotify-callback.html`

## 2. Register DashMate with Spotify

1. Go to <https://developer.spotify.com/dashboard> and sign in with your Spotify account. Accept the developer terms if asked.
2. **Create app**:
   - App name: `DashMate`
   - Description: `Personal car dashboard`
   - Redirect URI: `https://superclearice97-droid.github.io/Dashmate/spotify-callback.html` (tap **Add**)
   - APIs used: tick **Web API**
3. Save. Open the app's **Settings** and copy the **Client ID** (a long string of letters and numbers). It isn't a password; it's safe to share with the developer.
4. In **User Management**, add yourself and up to four family members (name + the email of their Spotify account).

## 3. Put the Client ID into DashMate

Send the Client ID to whoever builds DashMate. It goes into `www/js/spotify-config.js` (`SPOTIFY_CLIENT_ID`), and the next release has a working **Connect Spotify** button in the Music panel and in Controls › Sound & media.
