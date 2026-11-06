package io.github.superclearice97.dashmate.media;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.ArrayList;
import java.util.List;

/**
 * Runs on the paired phone. Reads GPS once a second and sends each position, encrypted
 * (BeaconPacket), straight to the screen over the hotspot. It is a foreground service so
 * it keeps going with the phone locked or another app open; Android shows its
 * notification the whole time, with a Stop button.
 */
public class BeaconService extends Service implements LocationListener {
    static final String ACTION_START = "io.github.superclearice97.dashmate.BEACON_START";
    static final String ACTION_STOP = "io.github.superclearice97.dashmate.BEACON_STOP";
    static final String EXTRA_KEY = "key";
    static final String EXTRA_PORT = "port";
    static final String EXTRA_HOSTS = "hosts";
    private static final String CHANNEL = "dashmate_gps";
    private static final int NOTIFICATION_ID = 7301;
    private static final String TAG = "DashMateBeacon";

    static volatile boolean running = false;
    // What happened, for the app's "is the screen receiving?" check.
    static volatile int fixes = 0;
    static volatile int sent = 0;
    static volatile int failed = 0;
    static volatile String lastError = null;

    private HandlerThread thread;
    private LocationManager locations;
    private DatagramSocket socket;
    private PowerManager.WakeLock wakeLock;
    private byte[] key;
    private int port;
    private final List<InetAddress> hosts = new ArrayList<>();
    private long counter;
    private List<InetAddress> sweep;
    private long sweptAt;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction()) || !configure(intent)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(),
            Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
        if (!startUpdates()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        // If Android has to stop the service, it restarts it with the same key and address.
        return START_REDELIVER_INTENT;
    }

    private boolean configure(Intent intent) {
        try {
            byte[] k = Base64.decode(intent.getStringExtra(EXTRA_KEY), Base64.NO_WRAP);
            int p = intent.getIntExtra(EXTRA_PORT, 0);
            ArrayList<String> hs = intent.getStringArrayListExtra(EXTRA_HOSTS);
            if (k.length != 32 || p < 1 || p > 65535) {
                lastError = "bad key or port";
                return false;
            }
            // Addresses are only hints now: the phone also sweeps its own hotspot network.
            List<InetAddress> addrs = new ArrayList<>();
            if (hs != null) {
                for (String h : hs) {
                    byte[] b = BeaconPacket.privateIPv4(h);
                    if (b != null) addrs.add(InetAddress.getByAddress(b));
                }
            }
            synchronized (hosts) {
                hosts.clear();
                hosts.addAll(addrs);
            }
            key = k;
            port = p;
            // Counts up from the clock, so it keeps rising even if the service restarts.
            counter = System.currentTimeMillis() * 1000;
            fixes = 0;
            sent = 0;
            failed = 0;
            lastError = null;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean startUpdates() {
        if (thread != null) return true; // already reading GPS; new key/address applies
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            lastError = "precise location permission is off";
            return false;
        }
        try {
            socket = new DatagramSocket();
            thread = new HandlerThread("DashMateBeacon");
            thread.start();
            locations = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            String provider = locations.getAllProviders().contains(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            locations.requestLocationUpdates(provider, 1000, 0, this, thread.getLooper());
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DashMate:gps");
            wakeLock.acquire();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "start", e);
            lastError = "could not start: " + e;
            cleanUp();
            return false;
        }
    }

    @Override
    public void onLocationChanged(Location l) {
        try {
            String json = BeaconPacket.fixJson(l.getLatitude(), l.getLongitude(),
                l.hasAccuracy() ? l.getAccuracy() : 50,
                l.hasSpeed() ? (double) l.getSpeed() : null,
                l.hasBearing() ? (double) l.getBearing() : null,
                l.getTime());
            fixes++;
            byte[] packet = BeaconPacket.seal(key, ++counter, json);
            boolean ok = false;
            for (InetAddress a : targets()) {
                try {
                    socket.send(new DatagramPacket(packet, packet.length, a, port));
                    ok = true;
                } catch (Exception e) {
                    // That address isn't reachable right now (e.g. hotspot off); keep trying the others.
                    lastError = String.valueOf(e.getMessage());
                }
            }
            if (ok) sent++;
            else failed++;
        } catch (Exception e) {
            Log.w(TAG, "send", e);
            lastError = String.valueOf(e);
        }
    }

    /**
     * Where to send: the screen's addresses from pairing, plus every other address on the
     * hotspot network this phone is hosting (re-read every few seconds, since the hotspot
     * can be switched off and on). This is what lets the screen be found again with a new
     * address, or after an app restart, with no new pairing.
     */
    private List<InetAddress> targets() {
        long now = System.currentTimeMillis();
        if (sweep == null || now - sweptAt > 5000) {
            List<InetAddress> found = new ArrayList<>();
            try {
                for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                    if (!ni.isUp() || !BeaconPacket.isSweepInterface(ni.getName())) continue;
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        if (!(ia.getAddress() instanceof Inet4Address)) continue;
                        for (byte[] h : BeaconPacket.sweepHosts(ia.getAddress().getAddress(), ia.getNetworkPrefixLength())) {
                            found.add(InetAddress.getByAddress(h));
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "interfaces", e);
            }
            sweep = found;
            sweptAt = now;
        }
        List<InetAddress> all;
        synchronized (hosts) {
            all = new ArrayList<>(hosts);
        }
        for (InetAddress a : sweep) if (!all.contains(a)) all.add(a);
        return all;
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Sharing GPS with your screen", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        Intent stop = new Intent(this, BeaconService.class).setAction(ACTION_STOP);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_dashmate)
            .setContentTitle("DashMate is sharing GPS")
            .setContentText("Sending this phone’s location to your DashMate screen.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, "Stop sharing", PendingIntent.getService(this, 1, stop, immutable | PendingIntent.FLAG_UPDATE_CURRENT));
        if (open != null) b.setContentIntent(PendingIntent.getActivity(this, 0, open, immutable | PendingIntent.FLAG_UPDATE_CURRENT));
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void cleanUp() {
        running = false;
        if (locations != null) {
            try { locations.removeUpdates(this); } catch (Exception ignored) {}
        }
        if (thread != null) thread.quitSafely();
        if (socket != null) socket.close();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        thread = null;
        socket = null;
        wakeLock = null;
        locations = null;
    }

    @Override
    public void onDestroy() {
        cleanUp();
        super.onDestroy();
    }
}
