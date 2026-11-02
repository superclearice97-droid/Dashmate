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
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise)
    ]

    // Phone side
    private var manager: CLLocationManager?
    private var sender: BeaconSender?
    private var sendKey: SymmetricKey?
    private var sendPort: UInt16 = 0
    private var sendHosts: [in_addr] = []
    private var counter: UInt64 = 0

    // Screen side
    private var receiver: BeaconReceiver?
    private var lastCounter: UInt64 = 0

    private static func key(_ call: CAPPluginCall) -> SymmetricKey? {
        guard let b64 = call.getString("key"), let d = Data(base64Encoded: b64), d.count == 32 else { return nil }
        return SymmetricKey(data: d)
    }

    // ------------------------------------------------------------------ phone side
    @objc func startSending(_ call: CAPPluginCall) {
        guard let key = DashLinkPlugin.key(call) else { call.reject("bad key"); return }
        let port = call.getInt("port") ?? 0
        let hosts = (call.getArray("hosts") ?? []).compactMap { $0 as? String }.compactMap { BeaconPacket.privateIPv4($0) }
        guard (1...65535).contains(port), !hosts.isEmpty else { call.reject("missing port or addresses"); return }
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
        DispatchQueue.main.async { call.resolve(["sending": self.manager != nil]) }
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
        guard let packet = try? BeaconPacket.seal(key: key, counter: counter, json: json) else { return }
        for h in sendHosts { sender.send(packet, to: h, port: sendPort) }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Temporary (no fix yet); Core Location keeps trying.
    }

    // ------------------------------------------------------------------ screen side
    @objc func listen(_ call: CAPPluginCall) {
        guard let key = DashLinkPlugin.key(call) else { call.reject("bad key"); return }
        receiver?.stop()
        lastCounter = 0
        let r = BeaconReceiver()
        let port = r.start { [weak self] data in
            guard let self = self, let opened = BeaconPacket.open(key: key, packet: data),
                  opened.0 > self.lastCounter,
                  let obj = try? JSONSerialization.jsonObject(with: opened.1) as? [String: Any] else { return }
            self.lastCounter = opened.0
            self.notifyListeners("fix", data: obj)
        }
        guard let p = port else { call.reject("could not listen"); return }
        receiver = r
        call.resolve(["port": Int(p), "addrs": BeaconPacket.localAddresses()])
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        receiver?.stop()
        receiver = nil
        call.resolve()
    }
}
