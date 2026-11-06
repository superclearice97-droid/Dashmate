import Foundation
import CryptoKit

/// One GPS position sent from the phone to the screen over the hotspot, encrypted and
/// authenticated. Same format as the Android code (BeaconPacket.java):
///   "DMB1" | counter (8 bytes, big-endian) | nonce (12) | AES-256-GCM(json) + tag (16)
/// The header (magic + counter) is authenticated too; the counter only goes up, so a
/// recorded packet can't be replayed.
enum BeaconPacket {
    static let magic: [UInt8] = Array("DMB1".utf8)
    static let header = 24

    static func aad(_ counter: UInt64) -> Data {
        var d = Data(magic)
        withUnsafeBytes(of: counter.bigEndian) { d.append(contentsOf: $0) }
        return d
    }

    static func seal(key: SymmetricKey, counter: UInt64, json: String) throws -> Data {
        let box = try AES.GCM.seal(Data(json.utf8), using: key, nonce: AES.GCM.Nonce(), authenticating: aad(counter))
        var out = aad(counter)
        box.nonce.withUnsafeBytes { out.append(contentsOf: $0) }
        out.append(box.ciphertext)
        out.append(box.tag)
        return out
    }

    /// The counter and JSON text, or nil if it isn't an authentic DashMate packet.
    static func open(key: SymmetricKey, packet raw: Data) -> (UInt64, Data)? {
        let p = Data(raw)
        guard p.count >= header + 16, Array(p.prefix(4)) == magic else { return nil }
        var counter: UInt64 = 0
        for b in p[4..<12] { counter = counter << 8 | UInt64(b) }
        guard let nonce = try? AES.GCM.Nonce(data: p[12..<24]),
              let box = try? AES.GCM.SealedBox(nonce: nonce, ciphertext: p[24..<(p.count - 16)], tag: p[(p.count - 16)...]),
              let plain = try? AES.GCM.open(box, using: key, authenticating: aad(counter)) else { return nil }
        return (counter, plain)
    }

    static func fixJson(lat: Double, lon: Double, acc: Double, spd: Double?, hdg: Double?, t: Int64) -> String {
        func num(_ v: Double?) -> String {
            guard let v = v, v.isFinite else { return "null" }
            return String(format: "%.6f", v)
        }
        return String(format: "{\"lat\":%.7f,\"lon\":%.7f,\"acc\":%@,\"spd\":%@,\"hdg\":%@,\"t\":%lld}",
                      lat, lon, num(acc), num(spd), num(hdg), t)
    }

    /// A dotted IPv4 literal (never a host name) that is private or link-local:
    /// positions are only sent within the local network, never to the internet.
    static func privateIPv4(_ s: String) -> in_addr? {
        var a = in_addr()
        guard inet_pton(AF_INET, s, &a) == 1 else { return nil }
        let b = withUnsafeBytes(of: a.s_addr) { Array($0) } // network order: b[0] is the first number
        let ok = b[0] == 10 || (b[0] == 172 && (16...31).contains(b[1])) || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254)
        return ok ? a : nil
    }

    /// This device's private IPv4 addresses, for the phone to send to.
    static func localAddresses() -> [String] {
        var out: [String] = []
        var ifap: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifap) == 0, let first = ifap else { return out }
        defer { freeifaddrs(ifap) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            guard let sa = ptr.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET),
                  flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0 else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let s = String(cString: host)
            if privateIPv4(s) != nil, !out.contains(s), out.count < 8 { out.append(s) }
        }
        return out
    }
}

extension BeaconPacket {
    /// Every other host address on the hotspot network this iPhone is hosting (iOS names it
    /// "bridge100") or the Wi-Fi it has joined, at most a /24, so the phone finds the screen without knowing its
    /// address, even after the hotspot gives it a new one. Only the screen holds the key.
    static func sweepHosts() -> [in_addr] {
        var out: [in_addr] = []
        var ifap: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifap) == 0, let first = ifap else { return out }
        defer { freeifaddrs(ifap) }
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            guard flags & IFF_UP != 0, isSweepInterface(String(cString: ptr.pointee.ifa_name)),
                  let sa = ptr.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET),
                  let mask = ptr.pointee.ifa_netmask else { continue }
            let selfAddr = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            let netmask = mask.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            guard privateIPv4(ipString(selfAddr)) != nil else { continue }
            let effective = max(netmask, 0xFFFF_FF00) // a longer prefix is a bigger mask; never wider than a /24
            let net = selfAddr & effective
            let size = ~effective // number of host bits as a mask
            guard size >= 3, size <= 255 else { continue }
            for h in 1..<size where net | h != selfAddr {
                out.append(in_addr(s_addr: (net | h).bigEndian))
            }
        }
        return out
    }

    /// The hotspot this iPhone hosts ("bridge100") or the Wi-Fi it has joined ("en0"); never
    /// mobile data ("pdp_ip"), tunnels or loopback.
    private static func isSweepInterface(_ name: String) -> Bool {
        name.hasPrefix("bridge") || name.hasPrefix("en")
    }

    private static func ipString(_ a: UInt32) -> String {
        "\(a >> 24).\((a >> 16) & 255).\((a >> 8) & 255).\(a & 255)"
    }
}

/// Receives packets on a UDP port (screen side).
final class BeaconReceiver {
    private var source: DispatchSourceRead?
    private let queue = DispatchQueue(label: "dashmate.beacon.receive")

    /// Opens the given port (0 = chosen by the system) and returns the port in use.
    func start(port: UInt16, onPacket: @escaping (Data) -> Void) -> UInt16? {
        let fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard fd >= 0 else { return nil }
        var reuse: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr = in_addr(s_addr: INADDR_ANY)
        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        var actual = sockaddr_in()
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &actual) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) }
        }
        guard bound == 0, named == 0 else { Darwin.close(fd); return nil }
        let src = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        src.setEventHandler {
            var buf = [UInt8](repeating: 0, count: 2048)
            let n = Darwin.recv(fd, &buf, buf.count, 0)
            if n > 0 { onPacket(Data(buf[0..<n])) }
        }
        src.setCancelHandler { Darwin.close(fd) }
        src.resume()
        source = src
        return UInt16(bigEndian: actual.sin_port)
    }

    func stop() {
        source?.cancel()
        source = nil
    }
}

/// Sends packets over UDP (phone side).
final class BeaconSender {
    private let fd: Int32

    init?() {
        let s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard s >= 0 else { return nil }
        fd = s
    }

    /// nil when sent, otherwise the system's reason (e.g. local network access not allowed).
    @discardableResult
    func send(_ data: Data, to host: in_addr, port: UInt16) -> String? {
        var sa = BeaconSender.address(host, port)
        let n = data.withUnsafeBytes { buf in
            withUnsafePointer(to: &sa) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.sendto(fd, buf.baseAddress, buf.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
        }
        return n < 0 ? String(cString: strerror(errno)) : nil
    }

    static func address(_ host: in_addr, _ port: UInt16) -> sockaddr_in {
        var sa = sockaddr_in()
        sa.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        sa.sin_family = sa_family_t(AF_INET)
        sa.sin_port = port.bigEndian
        sa.sin_addr = host
        return sa
    }

    /// Asks iOS for local network access now, while the phone is in your hand: connecting a
    /// UDP socket to the screen shows the "find devices on your local network" alert without
    /// sending anything (Apple TN3179). Without it, iOS silently blocks sends made later
    /// from the background.
    static func askForLocalNetwork(_ host: in_addr, _ port: UInt16) {
        let s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard s >= 0 else { return }
        defer { Darwin.close(s) }
        var sa = address(host, port)
        _ = withUnsafePointer(to: &sa) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
    }

    deinit { Darwin.close(fd) }
}
