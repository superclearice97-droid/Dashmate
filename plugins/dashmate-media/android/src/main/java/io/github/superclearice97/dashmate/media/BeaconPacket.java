package io.github.superclearice97.dashmate.media;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * One GPS position sent from the phone to the screen over the hotspot, encrypted and
 * authenticated so nobody else on the network can read or fake it.
 *
 *   "DMB1" (4 bytes) | counter (8 bytes, big-endian) | nonce (12 bytes) | AES-256-GCM(json) + tag (16)
 *
 * The header (magic + counter) is authenticated as associated data. The key is a fresh
 * random 32 bytes per pairing, handed over through the encrypted pairing link. The
 * counter only ever goes up, so a recorded packet can't be replayed. Pure Java (no
 * Android classes) so it can be unit-tested on a computer; iOS mirrors it in Swift.
 */
public final class BeaconPacket {
    static final byte[] MAGIC = { 'D', 'M', 'B', '1' };
    static final int HEADER = 4 + 8 + 12;
    static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private BeaconPacket() {}

    private static byte[] aad(long counter) {
        return ByteBuffer.allocate(12).put(MAGIC).putLong(counter).array();
    }

    public static byte[] seal(byte[] key, long counter, byte[] nonce, String json) throws GeneralSecurityException {
        if (key.length != 32 || nonce.length != 12) throw new GeneralSecurityException("bad key or nonce");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, nonce));
        c.updateAAD(aad(counter));
        byte[] body = c.doFinal(json.getBytes(StandardCharsets.UTF_8));
        return ByteBuffer.allocate(HEADER + body.length).put(MAGIC).putLong(counter).put(nonce).put(body).array();
    }

    public static byte[] seal(byte[] key, long counter, String json) throws GeneralSecurityException {
        byte[] nonce = new byte[12];
        RANDOM.nextBytes(nonce);
        return seal(key, counter, nonce, json);
    }

    /** Returns {counter, json} or null when the packet isn't a valid, authentic DashMate packet. */
    public static Object[] open(byte[] key, byte[] packet, int length) {
        if (key == null || key.length != 32 || length < HEADER + 16 || length > packet.length) return null;
        if (!Arrays.equals(Arrays.copyOfRange(packet, 0, 4), MAGIC)) return null;
        long counter = ByteBuffer.wrap(packet, 4, 8).getLong();
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, packet, 12, 12));
            c.updateAAD(aad(counter));
            byte[] plain = c.doFinal(packet, HEADER, length - HEADER);
            return new Object[] { counter, new String(plain, StandardCharsets.UTF_8) };
        } catch (GeneralSecurityException | RuntimeException e) {
            return null;
        }
    }

    private static String num(Double v) {
        return v == null || v.isNaN() || v.isInfinite() ? "null" : String.format(Locale.US, "%.6f", v);
    }

    /** The position as JSON: {"lat":..,"lon":..,"acc":..,"spd":..|null,"hdg":..|null,"t":ms}. */
    public static String fixJson(double lat, double lon, double acc, Double spd, Double hdg, long t) {
        return String.format(Locale.US, "{\"lat\":%.7f,\"lon\":%.7f,\"acc\":%s,\"spd\":%s,\"hdg\":%s,\"t\":%d}",
            lat, lon, num(acc), num(spd), num(hdg), t);
    }

    /**
     * Parses a dotted IPv4 literal (never a host name, so no DNS lookup) and returns its
     * 4 bytes only when it is a private or link-local address: positions are only ever
     * sent within the local network (the phone's hotspot), never to the internet.
     */
    public static byte[] privateIPv4(String s) {
        if (s == null || !s.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return null;
        String[] parts = s.split("\\.");
        byte[] b = new byte[4];
        int[] v = new int[4];
        for (int i = 0; i < 4; i++) {
            v[i] = Integer.parseInt(parts[i]);
            if (v[i] > 255) return null;
            b[i] = (byte) v[i];
        }
        boolean ok = v[0] == 10
            || (v[0] == 172 && v[1] >= 16 && v[1] <= 31)
            || (v[0] == 192 && v[1] == 168)
            || (v[0] == 169 && v[1] == 254);
        return ok ? b : null;
    }

    /** Accepts only counters newer than any seen before (per pairing). */
    public static final class Replay {
        private long last = Long.MIN_VALUE;
        public synchronized boolean accept(long counter) {
            if (counter <= last) return false;
            last = counter;
            return true;
        }
    }
}
