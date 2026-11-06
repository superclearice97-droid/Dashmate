import Foundation
import Capacitor
import CoreLocation
import CryptoKit

/// The phone ⇄ screen GPS link that keeps working in the background.
///  - Phone (iPhone): startSending reads GPS with background updates (the blue location
///    indicator shows) and sends each position, encrypted, straight to the screen.
///  - Screen (iPad): listen opens a UDP port and emits "fix" for every authentic packet.
/// The key, port and addresses are exchanged over the encrypted pairing link.
@objc(DashLinkPlugin)
public class DashLinkPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "DashLinkPlugin"
    public let jsName = "DashLink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startSending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listenStatus", returnType: CAPPluginReturnPromise)
    ]

    // Phone side
    private var manager: CLLocationManager?
    private var sender: BeaconSender?
    private var sendKey: SymmetricKey?
    private var sendPort: UInt16 = 0
    private var sendHosts: [in_addr] = []
    private var counter: UInt64 = 0
    private var sweep: [in_addr] = []
    private var sweptAt = Date.distantPast
    private var fixes = 0
    private var sent = 0
    private var failed = 0
    private var lastError: String?

    // Screen side
    private var receiver: BeaconReceiver?
    private var lastCounter: UInt64 = 0
    private var received = 0
    private var rejected = 0

    private static func key(_ call: CAPPluginCall) -> SymmetricKey? {
        guard let b64 = call.getString("key"), let d = Data(base64Encoded: b64), d.count == 32 else { return nil }
        return SymmetricKey(data: d)
    }

    // ------------------------------------------------------------------ phone side
    @objc func startSending(_ call: CAPPluginCall) {
        guard let key = DashLinkPlugin.key(call) else { call.reject("bad key"); return }
        let port = call.getInt("port") ?? 0
        // Addresses are only hints now: the phone also sweeps its own hotspot network.
        let hosts = (call.getArray("hosts") ?? []).compactMap { $0 as? String }.compactMap { BeaconPacket.privateIPv4($0) }
        guard (1...65535).contains(port) else { call.reject("missing port"); return }
        DispatchQueue.main.async {
            let m = self.manager ?? CLLocationManager()
            let status = m.authorizationStatus
            guard status == .authorizedWhenInUse || status == .authorizedAlways else {
                call.reject("location permission is off", "NO_LOCATION")
                return
            }
            guard let s = self.sender ?? BeaconSender() else { call.reject("could not open a network socket"); return }
            self.sender = s
            self.sendKey = key
            self.sendPort = UInt16(port)
            self.sendHosts = hosts
            self.counter = UInt64(Date().timeIntervalSince1970 * 1000) * 1000
            (self.fixes, self.sent, self.failed, self.lastError) = (0, 0, 0, nil)
            for h in (hosts + BeaconPacket.sweepHosts()).prefix(1) { BeaconSender.askForLocalNetwork(h, UInt16(port)) }
            self.sweep = []
            self.sweptAt = .distantPast
            if self.manager == nil {
                m.delegate = self
                m.desiredAccuracy = kCLLocationAccuracyBest
                m.distanceFilter = kCLDistanceFilterNone
                m.activityType = .automotiveNavigation
                m.pausesLocationUpdatesAutomatically = false
                m.allowsBackgroundLocationUpdates = true
                m.showsBackgroundLocationIndicator = true
                self.manager = m
                m.startUpdatingLocation()
            }
            call.resolve(["sending": true])
        }
    }

    @objc func stopSending(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.manager?.stopUpdatingLocation()
            self.manager?.allowsBackgroundLocationUpdates = false
            self.manager = nil
            self.sender = nil
            self.sendKey = nil
            call.resolve()
        }
    }

    @objc func isSending(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var r: [String: Any] = ["sending": self.manager != nil, "fixes": self.fixes, "sent": self.sent, "failed": self.failed]
            if let e = self.lastError { r["lastError"] = e }
            call.resolve(r)
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last, let key = sendKey, let sender = sender else { return }
        let json = BeaconPacket.fixJson(
            lat: l.coordinate.latitude, lon: l.coordinate.longitude,
            acc: l.horizontalAccuracy >= 0 ? l.horizontalAccuracy : 50,
            spd: l.speed >= 0 ? l.speed : nil,
            hdg: l.course >= 0 ? l.course : nil,
            t: Int64(l.timestamp.timeIntervalSince1970 * 1000))
        counter += 1
        fixes += 1
        guard let packet = try? BeaconPacket.seal(key: key, counter: counter, json: json) else { return }
        var ok = false
        for h in targets() {
            if let err = sender.send(packet, to: h, port: sendPort) { lastError = err } else { ok = true }
        }
        if ok { sent += 1 } else { failed += 1 }
    }

    /// The screen's addresses from pairing plus the whole hotspot network, re-read every
    /// few seconds (the hotspot can be switched off and on, giving the screen a new address).
    private func targets() -> [in_addr] {
        if Date().timeIntervalSince(sweptAt) > 5 {
            sweep = BeaconPacket.sweepHosts()
            sweptAt = Date()
        }
        return sendHosts + sweep.filter { s in !sendHosts.contains { $0.s_addr == s.s_addr } }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Temporary (no fix yet); Core Location keeps trying.
    }

    // ------------------------------------------------------------------ screen side
    @objc func listen(_ call: CAPPluginCall) {
        guard let key = DashLinkPlugin.key(call) else { call.reject("bad key"); return }
        receiver?.stop()
        lastCounter = 0
        received = 0
        rejected = 0
        let r = BeaconReceiver()
        // A fixed port, so the phone can find this screen again with no new pairing.
        let want = UInt16(clamping: call.getInt("port") ?? 0)
        let port = r.start(port: want) { [weak self] data in
            guard let self = self else { return }
            guard let opened = BeaconPacket.open(key: key, packet: data), opened.0 > self.lastCounter,
                  let obj = try? JSONSerialization.jsonObject(with: opened.1) as? [String: Any] else {
                self.rejected += 1
                return
            }
            self.lastCounter = opened.0
            self.received += 1
            self.notifyListeners("fix", data: obj)
        }
        guard let p = port else { call.reject("could not listen"); return }
        receiver = r
        call.resolve(["port": Int(p), "addrs": BeaconPacket.localAddresses()])
    }

    @objc func listenStatus(_ call: CAPPluginCall) {
        call.resolve(["listening": receiver != nil, "received": received, "rejected": rejected])
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        receiver?.stop()
        receiver = nil
        call.resolve()
    }
}
