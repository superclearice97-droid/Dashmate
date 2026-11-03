package io.github.superclearice97.dashmate.media;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import org.json.JSONObject;

/**
 * The phone ⇄ screen GPS link that keeps working in the background.
 *  - Phone: startSending / stopSending run BeaconService.
 *  - Screen: listen opens a UDP port on the local network and emits "fix" for every
 *    authentic packet (wrong key, tampered or replayed packets are dropped).
 * The key, port and addresses are exchanged over the encrypted pairing link.
 */
@CapacitorPlugin(name = "DashLink")
public class DashLinkPlugin extends Plugin {

    private DatagramSocket receiver;
    private Thread receiverThread;
    private volatile int received = 0;
    private volatile int rejected = 0;

    // ------------------------------------------------------------------ phone side
    @PluginMethod
    public void startSending(PluginCall call) {
        String key = call.getString("key");
        Integer port = call.getInt("port");
        JSArray hostArray = call.getArray("hosts");
        ArrayList<String> hosts = new ArrayList<>();
        try {
            for (Object h : hostArray.toList()) if (h instanceof String) hosts.add((String) h);
        } catch (Exception e) {
            call.reject("bad hosts");
            return;
        }
        if (key == null || port == null || hosts.isEmpty()) {
            call.reject("missing key, port or hosts");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("location permission is off", "NO_LOCATION");
            return;
        }
        // Android 13+ hides the "sharing GPS" notification unless allowed; ask once.
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7302);
        }
        Intent i = new Intent(getContext(), BeaconService.class)
            .setAction(BeaconService.ACTION_START)
            .putExtra(BeaconService.EXTRA_KEY, key)
            .putExtra(BeaconService.EXTRA_PORT, (int) port)
            .putStringArrayListExtra(BeaconService.EXTRA_HOSTS, hosts);
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve(new JSObject().put("sending", true));
        } catch (Exception e) {
            call.reject("could not start: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopSending(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BeaconService.class));
        call.resolve();
    }

    @PluginMethod
    public void isSending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sending", BeaconService.running);
        r.put("fixes", BeaconService.fixes);
        r.put("sent", BeaconService.sent);
        r.put("failed", BeaconService.failed);
        if (BeaconService.lastError != null) r.put("lastError", BeaconService.lastError);
        call.resolve(r);
    }

    // ------------------------------------------------------------------ screen side
    @PluginMethod
    public void listen(PluginCall call) {
        byte[] key;
        try {
            key = android.util.Base64.decode(call.getString("key", ""), android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            key = new byte[0];
        }
        if (key.length != 32) {
            call.reject("bad key");
            return;
        }
        closeReceiver();
        received = 0;
        rejected = 0;
        try {
            DatagramSocket s = new DatagramSocket(0);
            receiver = s;
            final byte[] k = key;
            receiverThread = new Thread(() -> receiveLoop(s, k), "DashMateReceiver");
            receiverThread.start();
            JSObject r = new JSObject();
            r.put("port", s.getLocalPort());
            r.put("addrs", new JSArray(localAddresses()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("could not listen: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listenStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("listening", receiver != null);
        r.put("received", received);
        r.put("rejected", rejected);
        call.resolve(r);
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        closeReceiver();
        call.resolve();
    }

    private void receiveLoop(DatagramSocket s, byte[] key) {
        BeaconPacket.Replay replay = new BeaconPacket.Replay();
        byte[] buf = new byte[2048];
        while (!s.isClosed()) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                s.receive(p);
                Object[] r = BeaconPacket.open(key, p.getData(), p.getLength());
                if (r == null || !replay.accept((Long) r[0])) {
                    rejected++;
                    continue;
                }
                received++;
                notifyListeners("fix", JSObject.fromJSONObject(new JSONObject((String) r[1])));
            } catch (Exception e) {
                if (s.isClosed()) return;
            }
        }
    }

    private void closeReceiver() {
        if (receiver != null) receiver.close();
        receiver = null;
        receiverThread = null;
    }

    /** This device's private IPv4 addresses, for the phone to send to. */
    private static ArrayList<String> localAddresses() {
        ArrayList<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    String h = a.getHostAddress();
                    if (a instanceof Inet4Address && BeaconPacket.privateIPv4(h) != null && out.size() < 8) out.add(h);
                }
            }
        } catch (Exception ignored) {
            // No addresses: the app falls back to sending over the pairing link.
        }
        return out;
    }

    @Override
    protected void handleOnDestroy() {
        closeReceiver();
    }
}
