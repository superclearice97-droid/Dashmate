package io.github.superclearice97.dashmate.media;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Controls whatever music app is playing on the device (Spotify, Apple Music, YouTube
 * Music…) through Android's media sessions. Needs the user to turn on notification
 * access for DashMate once; nothing leaves the device.
 */
@CapacitorPlugin(name = "DashMedia")
public class DashMediaPlugin extends Plugin {

    private static final Map<String, String> KNOWN = new HashMap<>();

    static {
        KNOWN.put("com.spotify.music", "Spotify");
        KNOWN.put("com.apple.android.music", "Apple Music");
        KNOWN.put("com.google.android.apps.youtube.music", "YouTube Music");
        KNOWN.put("com.amazon.mp3", "Amazon Music");
        KNOWN.put("com.pandora.android", "Pandora");
        KNOWN.put("deezer.android.app", "Deezer");
        KNOWN.put("com.aspiro.tidal", "TIDAL");
        KNOWN.put("com.soundcloud.android", "SoundCloud");
        KNOWN.put("com.google.android.youtube", "YouTube");
        KNOWN.put("au.com.shiftyjelly.pocketcasts", "Pocket Casts");
    }

    private boolean allowed() {
        Context ctx = getContext();
        return NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName());
    }

    private MediaController pick() {
        if (!allowed()) return null;
        Context ctx = getContext();
        MediaSessionManager msm = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
        List<MediaController> sessions = msm.getActiveSessions(new ComponentName(ctx, MediaListener.class));
        MediaController first = null;
        for (MediaController c : sessions) {
            if (c.getPackageName().equals(ctx.getPackageName())) continue; // DashMate's own player
            PlaybackState s = c.getPlaybackState();
            if (s != null && s.getState() == PlaybackState.STATE_PLAYING) return c;
            if (first == null) first = c;
        }
        return first;
    }

    private String appName(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            String known = KNOWN.get(pkg);
            return known != null ? known : pkg;
        }
    }

    private static String dataUrl(Bitmap art) {
        int max = 256;
        float scale = Math.min(1f, (float) max / Math.max(art.getWidth(), art.getHeight()));
        Bitmap small = scale < 1f
            ? Bitmap.createScaledBitmap(art, Math.round(art.getWidth() * scale), Math.round(art.getHeight() * scale), true)
            : art;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.JPEG, 80, out);
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("platform", "android");
        r.put("kind", "any");
        r.put("allowed", allowed());
        call.resolve(r);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        JSObject r = new JSObject();
        r.put("allowed", allowed());
        call.resolve(r);
    }

    @PluginMethod
    public void nowPlaying(PluginCall call) {
        JSObject r = new JSObject();
        try {
            MediaController c = pick();
            if (c == null) {
                r.put("active", false);
                call.resolve(r);
                return;
            }
            r.put("active", true);
            r.put("app", appName(c.getPackageName()));
            MediaMetadata md = c.getMetadata();
            if (md != null) {
                String artist = md.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (artist == null) artist = md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                String title = md.getString(MediaMetadata.METADATA_KEY_TITLE);
                String album = md.getString(MediaMetadata.METADATA_KEY_ALBUM);
                r.put("title", title != null ? title : "");
                r.put("artist", artist != null ? artist : "");
                r.put("album", album != null ? album : "");
                r.put("artKey", c.getPackageName() + "|" + title + "|" + artist + "|" + album);
                r.put("duration", md.getLong(MediaMetadata.METADATA_KEY_DURATION) / 1000.0);
                if (call.getBoolean("art", false)) {
                    Bitmap art = md.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
                    if (art == null) art = md.getBitmap(MediaMetadata.METADATA_KEY_ART);
                    if (art != null) r.put("artwork", dataUrl(art));
                }
            }
            PlaybackState st = c.getPlaybackState();
            if (st != null) {
                boolean playing = st.getState() == PlaybackState.STATE_PLAYING;
                long pos = st.getPosition();
                if (playing && st.getLastPositionUpdateTime() > 0) {
                    pos += (long) ((SystemClock.elapsedRealtime() - st.getLastPositionUpdateTime()) * st.getPlaybackSpeed());
                }
                r.put("playing", playing);
                r.put("position", Math.max(0, pos) / 1000.0);
            }
            call.resolve(r);
        } catch (SecurityException e) {
            call.reject("Music control isn’t allowed yet");
        }
    }

    @PluginMethod
    public void control(PluginCall call) {
        MediaController c;
        try {
            c = pick();
        } catch (SecurityException e) {
            call.reject("Music control isn’t allowed yet");
            return;
        }
        if (c == null) {
            call.reject("Nothing is playing");
            return;
        }
        MediaController.TransportControls t = c.getTransportControls();
        String action = call.getString("action", "");
        PlaybackState st = c.getPlaybackState();
        boolean playing = st != null && st.getState() == PlaybackState.STATE_PLAYING;
        switch (action) {
            case "play": t.play(); break;
            case "pause": t.pause(); break;
            case "toggle": if (playing) t.pause(); else t.play(); break;
            case "next": t.skipToNext(); break;
            case "previous": t.skipToPrevious(); break;
            case "seek": t.seekTo((long) (call.getDouble("position", 0.0) * 1000)); break;
            default:
                call.reject("Unknown action");
                return;
        }
        call.resolve();
    }

    // Android has no shared playlist library; playlists live inside each app.
    @PluginMethod
    public void playlists(PluginCall call) {
        JSObject r = new JSObject();
        r.put("playlists", new JSArray());
        call.resolve(r);
    }
}
