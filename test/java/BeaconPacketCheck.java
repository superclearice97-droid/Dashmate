import io.github.superclearice97.dashmate.media.BeaconPacket;

// Command-line checks for BeaconPacket, driven by test/beacon.test.mjs:
//   seal <keyHex> <counter> <nonceHex> <json>   -> packet hex
//   open <keyHex> <packetHex>                    -> "counter json" or "REJECTED"
//   fix                                          -> fixJson sample
//   replay                                       -> replay check results
//   ip <addr>...                                 -> y/n per address (private IPv4 literal?)
public class BeaconPacketCheck {
    static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }
    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
    public static void main(String[] a) throws Exception {
        switch (a[0]) {
            case "seal" -> System.out.println(hex(BeaconPacket.seal(hex(a[1]), Long.parseLong(a[2]), hex(a[3]), a[4])));
            case "open" -> {
                byte[] p = hex(a[2]);
                Object[] r = BeaconPacket.open(hex(a[1]), p, p.length);
                System.out.println(r == null ? "REJECTED" : r[0] + " " + r[1]);
            }
            case "fix" -> System.out.println(BeaconPacket.fixJson(41.8781, -87.6298, 4.5, 13.4, null, 1700000000000L));
            case "replay" -> {
                BeaconPacket.Replay r = new BeaconPacket.Replay();
                System.out.println(r.accept(5) + " " + r.accept(6) + " " + r.accept(6) + " " + r.accept(3) + " " + r.accept(7));
            }
            case "ip" -> {
                StringBuilder sb = new StringBuilder();
                for (int i = 1; i < a.length; i++) sb.append(BeaconPacket.privateIPv4(a[i]) != null ? "y" : "n");
                System.out.println(sb);
            }
            case "sweep" -> {
                StringBuilder sb = new StringBuilder();
                String[] ip = a[1].split("\\.");
                byte[] self = { (byte) Integer.parseInt(ip[0]), (byte) Integer.parseInt(ip[1]), (byte) Integer.parseInt(ip[2]), (byte) Integer.parseInt(ip[3]) };
                var hosts = BeaconPacket.sweepHosts(self, Integer.parseInt(a[2]));
                sb.append(hosts.size());
                if (!hosts.isEmpty()) sb.append(' ').append(hosts.get(0)[3] & 255).append(' ').append(hosts.get(hosts.size() - 1)[3] & 255);
                System.out.println(sb);
            }
            case "iface" -> {
                StringBuilder sb = new StringBuilder();
                for (int i = 1; i < a.length; i++) sb.append(BeaconPacket.isHotspotInterface(a[i]) ? "y" : "n");
                System.out.println(sb);
            }
            default -> throw new IllegalArgumentException(a[0]);
        }
    }
}
