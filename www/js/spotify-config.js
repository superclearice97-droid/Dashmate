// Spotify connection settings for this build.
// SPOTIFY_CLIENT_ID comes from the DashMate app in the owner's Spotify developer dashboard
// (developer.spotify.com). It is a public identifier, not a secret: sign-in uses PKCE.
// Empty = "Connect Spotify" is hidden and the app explains it isn't set up.
export const SPOTIFY_CLIENT_ID = '';

// Spotify only accepts https redirect addresses, so sign-in returns to this small page
// (docs/spotify-callback.html, served by GitHub Pages), which hands the result to the app.
export const SPOTIFY_REDIRECT_URI = 'https://superclearice97-droid.github.io/Dashmate/spotify-callback.html';
