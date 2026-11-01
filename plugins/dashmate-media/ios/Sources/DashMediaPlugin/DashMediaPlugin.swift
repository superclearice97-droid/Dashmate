import Foundation
import Capacitor
import MediaPlayer
import UIKit

/// Controls the Music app (Apple Music) from DashMate: now playing, play/pause/skip,
/// and the user's library playlists. iOS doesn't let apps control other music apps.
@objc(DashMediaPlugin)
public class DashMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DashMediaPlugin"
    public let jsName = "DashMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "control", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playlists", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playPlaylist", returnType: CAPPluginReturnPromise)
    ]

    private var player: MPMusicPlayerController { MPMusicPlayerController.systemMusicPlayer }
    private var allowed: Bool { MPMediaLibrary.authorizationStatus() == .authorized }

    @objc func status(_ call: CAPPluginCall) {
        let s = MPMediaLibrary.authorizationStatus()
        call.resolve(["platform": "ios", "kind": "apple-music", "allowed": s == .authorized, "asked": s != .notDetermined])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        if MPMediaLibrary.authorizationStatus() == .denied {
            // Already refused once: iOS only lets the user change it in Settings.
            DispatchQueue.main.async {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                call.resolve(["allowed": false])
            }
            return
        }
        MPMediaLibrary.requestAuthorization { s in call.resolve(["allowed": s == .authorized]) }
    }

    @objc func nowPlaying(_ call: CAPPluginCall) {
        guard allowed else { call.resolve(["active": false]); return }
        let wantArt = call.getBool("art") ?? false
        DispatchQueue.main.async {
            let p = self.player
            guard let item = p.nowPlayingItem else { call.resolve(["active": false]); return }
            var r: [String: Any] = [
                "active": true,
                "app": "Apple Music",
                "title": item.title ?? "",
                "artist": item.artist ?? item.albumArtist ?? "",
                "album": item.albumTitle ?? "",
                "artKey": String(item.persistentID),
                "duration": item.playbackDuration,
                "position": p.currentPlaybackTime.isFinite ? p.currentPlaybackTime : 0,
                "playing": p.playbackState == .playing
            ]
            if wantArt, let img = item.artwork?.image(at: CGSize(width: 256, height: 256)),
               let data = img.jpegData(compressionQuality: 0.8) {
                r["artwork"] = "data:image/jpeg;base64," + data.base64EncodedString()
            }
            call.resolve(r)
        }
    }

    @objc func control(_ call: CAPPluginCall) {
        guard allowed else { call.reject("Apple Music isn’t connected"); return }
        let action = call.getString("action") ?? ""
        let position = call.getDouble("position") ?? 0
        DispatchQueue.main.async {
            let p = self.player
            switch action {
            case "play": p.play()
            case "pause": p.pause()
            case "toggle": p.playbackState == .playing ? p.pause() : p.play()
            case "next": p.skipToNextItem()
            case "previous": p.skipToPreviousItem()
            case "seek": p.currentPlaybackTime = position
            default: call.reject("Unknown action"); return
            }
            call.resolve()
        }
    }

    @objc func playlists(_ call: CAPPluginCall) {
        guard allowed else { call.resolve(["playlists": []]); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let lists = (MPMediaQuery.playlists().collections as? [MPMediaPlaylist]) ?? []
            let out: [[String: Any]] = lists.prefix(100).map {
                ["id": String($0.persistentID), "name": $0.name ?? "Playlist", "count": $0.count]
            }
            call.resolve(["playlists": out])
        }
    }

    @objc func playPlaylist(_ call: CAPPluginCall) {
        guard allowed, let idText = call.getString("id"), let id = UInt64(idText) else {
            call.reject("Unknown playlist"); return
        }
        DispatchQueue.main.async {
            let q = MPMediaQuery.playlists()
            q.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: id), forProperty: MPMediaPlaylistPropertyPersistentID))
            self.player.setQueue(with: q)
            self.player.play()
            call.resolve()
        }
    }
}
