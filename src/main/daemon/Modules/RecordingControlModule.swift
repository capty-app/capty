import Cocoa
import Foundation
import AVFoundation
import CoreMediaIO

class RecordingControlModule: Module {
    let name = "recording-control"
    
    private var panel: FloatingPanel?
    private var contentView: RecordingControlContentView?
    private var keyMonitor: Any?
    
    private var currentMode: RecordingControlMode = .preRecording
    private var elapsedSeconds: Int = 0
    private var isPaused: Bool = false
    private var isStarting: Bool = false
    
    private var settings: RecordingControlSettings = RecordingControlSettings()
    private var micDevices: [MediaDevice] = []
    private var cameraDevices: [MediaDevice] = []
    private var iosDevices: [MediaDevice] = []
    
    private let audioLevelMonitor = AudioLevelMonitor()
    
    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "show":
            handleShow(params: params, requestId: requestId)
        case "hide":
            handleHide(requestId: requestId)
        case "update":
            handleUpdate(params: params, requestId: requestId)
        case "setMode":
            handleSetMode(params: params, requestId: requestId)
        case "updateTimer":
            handleUpdateTimer(params: params, requestId: requestId)
        case "updateState":
            handleUpdateState(params: params, requestId: requestId)
        case "updateSettings":
            handleUpdateSettings(params: params, requestId: requestId)
        case "updateDevices":
            handleUpdateDevices(params: params, requestId: requestId)
        case "status":
            handleStatus(requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }
    
    private func handleShow(params: [String: AnyCodable]?, requestId: String) {
        let x = params?["x"]?.int() ?? 100
        let y = params?["y"]?.int() ?? 100
        let mode = params?["mode"]?.string() ?? "pre-recording"
        
        currentMode = mode == "recording" ? .recording : .preRecording
        
        if let settingsDict = params?["settings"]?.value as? [String: Any] {
            updateSettingsFromDict(settingsDict)
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.enumerateDevices()
            self.showPanel(x: x, y: y)
            self.respond(id: requestId, result: ["visible": true])
        }
    }
    
    private func handleHide(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.hidePanel()
            self.respond(id: requestId, result: ["visible": false])
        }
    }
    
    private func handleUpdate(params: [String: AnyCodable]?, requestId: String) {
        guard let x = params?["x"]?.int(),
              let y = params?["y"]?.int() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "update requires x, y")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.updatePosition(x: x, y: y)
            self.respond(id: requestId, result: ["updated": true])
        }
    }
    
    private func handleSetMode(params: [String: AnyCodable]?, requestId: String) {
        guard let mode = params?["mode"]?.string() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "setMode requires mode")
            return
        }
        
        let newMode: RecordingControlMode = mode == "recording" ? .recording : .preRecording
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.currentMode = newMode
            if newMode == .recording {
                self.isStarting = false
            }
            
            if self.panel != nil {
                self.rebuildPanel()
            } else {
                let position = self.calculateBottomCenterPosition()
                self.showPanel(x: position.x, y: position.y)
            }
            
            self.respond(id: requestId, result: ["mode": mode])
        }
    }
    
    private func calculateBottomCenterPosition() -> (x: Int, y: Int) {
        guard let screen = NSScreen.main else {
            return (x: 100, y: 100)
        }
        
        let width = RecordingControlContentView.calculateWidth(for: currentMode, micEnabled: settings.micEnabled)
        let height: CGFloat = 48
        let bottomMargin: CGFloat = 80
        
        let screenFrame = screen.visibleFrame
        let x = Int(screenFrame.midX - width / 2)
        let y = Int(screen.frame.height - screenFrame.origin.y - height - bottomMargin)
        
        return (x: x, y: y)
    }
    
    private func handleUpdateTimer(params: [String: AnyCodable]?, requestId: String) {
        guard let seconds = params?["seconds"]?.int() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "updateTimer requires seconds")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.elapsedSeconds = seconds
            self.contentView?.updateTimer(seconds: seconds)
            self.respond(id: requestId, result: ["updated": true])
        }
    }
    
    private func handleUpdateState(params: [String: AnyCodable]?, requestId: String) {
        let isPaused = params?["isPaused"]?.bool() ?? false
        let isStarting = params?["isStarting"]?.bool()

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.isPaused = isPaused
            self.contentView?.updatePausedState(isPaused: isPaused)
            if let isStarting = isStarting {
                self.isStarting = isStarting
                self.contentView?.updateStartingState(isStarting: isStarting)
            }
            self.respond(id: requestId, result: ["updated": true])
        }
    }
    
    private func handleUpdateSettings(params: [String: AnyCodable]?, requestId: String) {
        if let settingsDict = params?.reduce(into: [String: Any](), { result, pair in
            result[pair.key] = pair.value.value
        }) {
            updateSettingsFromDict(settingsDict)
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.contentView?.updateSettings(self.settings)
            self.updateAudioMonitorState()
            self.respond(id: requestId, result: ["updated": true])
        }
    }
    
    private func handleUpdateDevices(params: [String: AnyCodable]?, requestId: String) {
        if let micsArray = params?["microphones"]?.value as? [[String: Any]] {
            micDevices = micsArray.compactMap { dict -> MediaDevice? in
                guard let id = dict["id"] as? String,
                      let label = dict["label"] as? String else { return nil }
                return MediaDevice(id: id, label: label)
            }
        }
        
        if let camerasArray = params?["cameras"]?.value as? [[String: Any]] {
            cameraDevices = camerasArray.compactMap { dict -> MediaDevice? in
                guard let id = dict["id"] as? String,
                      let label = dict["label"] as? String else { return nil }
                return MediaDevice(id: id, label: label)
            }
        }
        
        respond(id: requestId, result: ["updated": true])
    }
    
    private func handleStatus(requestId: String) {
        let isVisible = panel != nil && panel?.isVisible == true
        respond(id: requestId, result: [
            "visible": isVisible,
            "mode": currentMode == .recording ? "recording" : "pre-recording",
            "isPaused": isPaused,
            "elapsedSeconds": elapsedSeconds
        ])
    }
    
    private func updateSettingsFromDict(_ dict: [String: Any]) {
        settings.systemAudio = dict["systemAudio"] as? Bool ?? settings.systemAudio
        settings.micEnabled = dict["micEnabled"] as? Bool ?? settings.micEnabled
        settings.micMuted = dict["micMuted"] as? Bool ?? settings.micMuted
        settings.cameraEnabled = dict["cameraEnabled"] as? Bool ?? settings.cameraEnabled
        settings.keyboardEnabled = dict["keyboardEnabled"] as? Bool ?? settings.keyboardEnabled
        settings.selectedMicId = dict["selectedMicId"] as? String ?? settings.selectedMicId
        settings.selectedMicName = dict["selectedMicName"] as? String ?? settings.selectedMicName
        settings.selectedCameraId = dict["selectedCameraId"] as? String ?? settings.selectedCameraId
        settings.selectedCameraName = dict["selectedCameraName"] as? String ?? settings.selectedCameraName
        settings.cameraSize = dict["cameraSize"] as? String ?? settings.cameraSize
        settings.cameraShape = dict["cameraShape"] as? String ?? settings.cameraShape
        settings.cameraFlipped = dict["cameraFlipped"] as? Bool ?? settings.cameraFlipped
        
        if let iosDeviceId = dict["selectedIOSDeviceId"] {
            settings.selectedIOSDeviceId = iosDeviceId as? String
        }
        if let iosDeviceName = dict["selectedIOSDeviceName"] {
            settings.selectedIOSDeviceName = iosDeviceName as? String
        }
    }
    
    private func enumerateDevices() {
        micDevices = []
        cameraDevices = []
        iosDevices = []
        
        let audioSession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInMicrophone, .externalUnknown],
            mediaType: .audio,
            position: .unspecified
        )
        
        for device in audioSession.devices {
            micDevices.append(MediaDevice(id: device.uniqueID, label: device.localizedName))
        }
        
        let videoSession: AVCaptureDevice.DiscoverySession
        if #available(macOS 14.0, *) {
            videoSession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera],
                mediaType: .video,
                position: .unspecified
            )
        } else {
            videoSession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInWideAngleCamera, .externalUnknown],
                mediaType: .video,
                position: .unspecified
            )
        }
        
        for device in videoSession.devices {
            cameraDevices.append(MediaDevice(id: device.uniqueID, label: device.localizedName))
        }
        
        enumerateIOSDevices()
    }
    
    private func enumerateIOSDevices() {
        enableScreenCaptureDevices()
        
        let muxedSession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.externalUnknown],
            mediaType: .muxed,
            position: .unspecified
        )
        
        for device in muxedSession.devices {
            let name = device.localizedName.lowercased()
            if name.contains("iphone") || name.contains("ipad") {
                iosDevices.append(MediaDevice(id: device.uniqueID, label: device.localizedName))
            }
        }
    }
    
    private func enableScreenCaptureDevices() {
        var property = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain)
        )
        
        var allow: UInt32 = 1
        let dataSize = UInt32(MemoryLayout<UInt32>.size)
        
        CMIOObjectSetPropertyData(
            CMIOObjectID(kCMIOObjectSystemObject),
            &property,
            0,
            nil,
            dataSize,
            &allow
        )
    }
    
    private func showPanel(x: Int, y: Int) {
        if panel != nil {
            updatePosition(x: x, y: y)
            panel?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        
        let width = RecordingControlContentView.calculateWidth(for: currentMode, micEnabled: settings.micEnabled)
        let height: CGFloat = 48
        
        let mainScreenHeight = NSScreen.main?.frame.height ?? 0
        let cocoaY = mainScreenHeight - CGFloat(y) - height
        
        var config = FloatingPanelConfig()
        config.escapeToClose = currentMode == .preRecording
        config.onEscape = { [weak self] in
            if self?.currentMode == .preRecording {
                self?.emitTerminalEvent("cancel")
            }
        }
        
        panel = FloatingPanel(
            contentRect: NSRect(x: CGFloat(x), y: cocoaY, width: width, height: height),
            config: config
        )
        
        contentView = RecordingControlContentView(
            frame: NSRect(x: 0, y: 0, width: width, height: height),
            mode: currentMode,
            isStarting: isStarting,
            settings: settings,
            micDevices: micDevices,
            cameraDevices: cameraDevices,
            iosDevices: iosDevices,
            callbacks: createCallbacks()
        )
        contentView?.updateTimer(seconds: elapsedSeconds)
        contentView?.updatePausedState(isPaused: isPaused)
        
        setupAudioLevelMonitor()
        
        panel?.setThemedContentView(contentView!)
        panel?.makeKeyAndOrderFront(nil)
        panel?.makeFirstResponder(contentView)
        
        NSApp.activate(ignoringOtherApps: true)
    }
    
    private func hidePanel() {
        TooltipManager.shared.hide()
        audioLevelMonitor.stop()
        panel?.ignoresMouseEvents = true
        panel?.contentView = nil
        panel?.orderOut(nil)
        panel?.close()
        panel = nil
        contentView = nil
        elapsedSeconds = 0
        isPaused = false
        isStarting = false
    }
    
    private func updatePosition(x: Int, y: Int) {
        panel?.setPosition(x: x, y: y)
    }
    
    private func rebuildPanel() {
        guard let currentPanel = panel else { return }
        
        let width = RecordingControlContentView.calculateWidth(for: currentMode, micEnabled: settings.micEnabled)
        let height: CGFloat = 48
        
        let position = calculateBottomCenterPosition()
        
        currentPanel.setContentSize(NSSize(width: width, height: height))
        
        contentView = RecordingControlContentView(
            frame: NSRect(x: 0, y: 0, width: width, height: height),
            mode: currentMode,
            isStarting: isStarting,
            settings: settings,
            micDevices: micDevices,
            cameraDevices: cameraDevices,
            iosDevices: iosDevices,
            callbacks: createCallbacks()
        )
        contentView?.updateTimer(seconds: elapsedSeconds)
        contentView?.updatePausedState(isPaused: isPaused)
        
        setupAudioLevelMonitor()
        
        currentPanel.setThemedContentView(contentView!)
        currentPanel.makeFirstResponder(contentView)
        
        updatePosition(x: position.x, y: position.y)
    }
    
    private func createCallbacks() -> RecordingControlCallbacks {
        RecordingControlCallbacks(
            onToggleSystemAudio: { [weak self] in self?.emitEvent("toggle-system-audio") },
            onToggleMic: { [weak self] in self?.emitEvent("toggle-mic") },
            onToggleCamera: { [weak self] in self?.emitEvent("toggle-camera") },
            onStart: { [weak self] in self?.emitEvent("start") },
            onCancel: { [weak self] in self?.emitTerminalEvent("cancel") },
            onPause: { [weak self] in self?.emitEvent("pause") },
            onResume: { [weak self] in self?.emitEvent("resume") },
            onStop: { [weak self] in self?.emitTerminalEvent("stop") },
            onRestart: { [weak self] in self?.handleRestartWithConfirmation() },
            onDelete: { [weak self] in self?.handleDeleteWithConfirmation() },
            onSelectMic: { [weak self] deviceId, deviceName in
                self?.emit(event: "select-mic", data: ["deviceId": deviceId as Any, "deviceName": deviceName as Any])
            },
            onSelectCamera: { [weak self] deviceId, deviceName in
                self?.emit(event: "select-camera", data: ["deviceId": deviceId as Any, "deviceName": deviceName as Any])
            },
            onToggleMicMute: { [weak self] in self?.emitEvent("toggle-mic-mute") },
            onSelectAspectRatio: { [weak self] ratio in
                self?.emit(event: "select-aspect-ratio", data: [
                    "width": ratio.width,
                    "height": ratio.height,
                    "name": ratio.name
                ])
            },
            onOpenIOSHelp: { [weak self] in self?.emitTerminalEvent("open-ios-help") },
            onSelectIOSDevice: { [weak self] deviceId, deviceName in
                self?.emit(event: "select-ios-device", data: ["deviceId": deviceId as Any, "deviceName": deviceName as Any])
            },
            onRefreshIOSDevices: { [weak self] in
                guard let self = self else { return [] }
                self.iosDevices = []
                self.enumerateIOSDevices()
                return self.iosDevices
            }
        )
    }
    
    private func handleRestartWithConfirmation() {
        showConfirmationAlert(
            title: "Restart Recording?",
            message: "Are you sure you want to restart? Current recording will be discarded.",
            confirmButton: "Restart",
            onConfirm: { [weak self] in
                self?.emitTerminalEvent("restart")
            }
        )
    }
    
    private func handleDeleteWithConfirmation() {
        showConfirmationAlert(
            title: "Delete Recording?",
            message: "Are you sure you want to delete this recording? This action cannot be undone.",
            confirmButton: "Delete",
            onConfirm: { [weak self] in
                self?.emitTerminalEvent("delete")
            }
        )
    }
    
    private func showConfirmationAlert(title: String, message: String, confirmButton: String, onConfirm: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: confirmButton)
        alert.addButton(withTitle: "Cancel")
        
        NSApp.activate(ignoringOtherApps: true)
        
        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            onConfirm()
        }
    }
    
    private func emitEvent(_ event: String) {
        emit(event: event)
    }

    private func emitTerminalEvent(_ event: String) {
        hidePanel()
        emit(event: event)
    }
    
    private func setupAudioLevelMonitor() {
        audioLevelMonitor.onLevelUpdate = { [weak self] level in
            self?.contentView?.updateAudioLevel(level)
        }
        
        if settings.micEnabled {
            audioLevelMonitor.start(deviceId: settings.selectedMicId)
        }
    }
    
    private func updateAudioMonitorState() {
        if settings.micEnabled {
            audioLevelMonitor.updateDevice(deviceId: settings.selectedMicId)
        } else {
            audioLevelMonitor.stop()
        }
    }
}

struct MediaDevice {
    let id: String
    let label: String
}

enum RecordingControlMode {
    case preRecording
    case recording
}

struct RecordingControlSettings {
    var systemAudio: Bool = true
    var micEnabled: Bool = false
    var micMuted: Bool = false
    var cameraEnabled: Bool = false
    var keyboardEnabled: Bool = false
    var selectedMicId: String?
    var selectedMicName: String?
    var selectedCameraId: String?
    var selectedCameraName: String?
    var cameraSize: String = "medium"
    var cameraShape: String = "circle"
    var cameraFlipped: Bool = false
    var aspectRatio: AspectRatio = .free
    var selectedIOSDeviceId: String?
    var selectedIOSDeviceName: String?
}

struct RecordingControlCallbacks {
    var onToggleSystemAudio: (() -> Void)?
    var onToggleMic: (() -> Void)?
    var onToggleCamera: (() -> Void)?
    var onStart: (() -> Void)?
    var onCancel: (() -> Void)?
    var onPause: (() -> Void)?
    var onResume: (() -> Void)?
    var onStop: (() -> Void)?
    var onRestart: (() -> Void)?
    var onDelete: (() -> Void)?
    var onSelectMic: ((String?, String?) -> Void)?
    var onSelectCamera: ((String?, String?) -> Void)?
    var onToggleMicMute: (() -> Void)?
    var onSelectAspectRatio: ((AspectRatio) -> Void)?
    var onOpenIOSHelp: (() -> Void)?
    var onSelectIOSDevice: ((String?, String?) -> Void)?
    var onRefreshIOSDevices: (() -> [MediaDevice])?
}

private class RecordingControlContentView: BlurredPanelView {
    private static let buttonSize: CGFloat = 48
    private static let timerWidth: CGFloat = 84
    private static let preRecordingButtonCount = 8
    private static let recordingBaseButtonCount = 5
    
    static func calculateWidth(for mode: RecordingControlMode, micEnabled: Bool = false) -> CGFloat {
        var buttonCount = mode == .preRecording ? preRecordingButtonCount : recordingBaseButtonCount
        if mode == .recording && micEnabled {
            buttonCount += 1
        }
        return CGFloat(buttonCount) * buttonSize + timerWidth
    }
    
    private var mode: RecordingControlMode
    private var isStarting: Bool
    private var settings: RecordingControlSettings
    private var micDevices: [MediaDevice]
    private var cameraDevices: [MediaDevice]
    private var iosDevices: [MediaDevice]
    private var callbacks: RecordingControlCallbacks
    
    private var isPaused: Bool = false
    private var elapsedSeconds: Int = 0
    
    private var buttons: [IconButton] = []
    private var separators: [VerticalSeparator] = []
    private var statusIndicator: StatusIndicator?
    private var timerLabel: TimerLabel?
    private var dragHandle: DragHandle?
    private var micButton: MicButton?
    private var micMuteButton: MicButton?
    private var aspectRatioButton: AspectRatioButton?
    private var startButton: IconButton?
    private var startSpinner: NSProgressIndicator?
    
    private var trackingArea: NSTrackingArea?
    
    init(frame: NSRect, mode: RecordingControlMode, isStarting: Bool, settings: RecordingControlSettings, micDevices: [MediaDevice], cameraDevices: [MediaDevice], iosDevices: [MediaDevice], callbacks: RecordingControlCallbacks) {
        self.mode = mode
        self.isStarting = isStarting
        self.settings = settings
        self.micDevices = micDevices
        self.cameraDevices = cameraDevices
        self.iosDevices = iosDevices
        self.callbacks = callbacks
        super.init(frame: frame)
        setupContent()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupContent() {
        buttons.removeAll()
        separators.removeAll()
        
        for subview in subviews where !(subview is NSVisualEffectView) {
            subview.removeFromSuperview()
        }
        
        if mode == .preRecording {
            setupPreRecordingUI()
        } else {
            setupRecordingUI()
        }
        
        applyTheme()
    }
    
    private func setupPreRecordingUI() {
        let buttonSize = Self.buttonSize
        var xOffset: CGFloat = 0
        
        let systemAudioButton = createButton(
            symbol: settings.systemAudio ? "speaker.wave.2" : "speaker.slash",
            tooltip: settings.systemAudio ? "Disable System Audio" : "Enable System Audio",
            action: callbacks.onToggleSystemAudio
        )
        systemAudioButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(systemAudioButton)
        buttons.append(systemAudioButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        micButton = MicButton(
            enabled: settings.micEnabled,
            size: 16,
            tooltip: "Microphone"
        )
        micButton?.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        micButton?.onRightClick = { [weak self] in
            guard let self = self, let btn = self.micButton else { return }
            self.showMicMenu(from: btn)
        }
        micButton?.onClick = { [weak self] in
            guard let self = self, let btn = self.micButton else { return }
            self.showMicMenu(from: btn)
        }
        addSubview(micButton!)
        
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let cameraButton = createButton(
            symbol: settings.cameraEnabled ? "video" : "video.slash",
            tooltip: "Camera",
            action: nil
        )
        cameraButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        cameraButton.onRightClick = { [weak self] in self?.showCameraMenu(from: cameraButton) }
        cameraButton.onClick = { [weak self] in self?.showCameraMenu(from: cameraButton) }
        addSubview(cameraButton)
        buttons.append(cameraButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        aspectRatioButton = AspectRatioButton(size: 16, tooltip: "Aspect Ratio")
        aspectRatioButton?.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        aspectRatioButton?.setRatio(settings.aspectRatio)
        aspectRatioButton?.onSelectRatio = { [weak self] ratio in
            guard let self = self else { return }
            self.settings.aspectRatio = ratio
            if self.settings.selectedIOSDeviceId != nil {
                self.settings.selectedIOSDeviceId = nil
                self.settings.selectedIOSDeviceName = nil
                self.setupContent()
            }
            NotificationCenter.default.post(name: .areaSelectorShouldShow, object: nil)
            self.callbacks.onSelectAspectRatio?(ratio)
        }
        addSubview(aspectRatioButton!)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let deviceTooltip = settings.selectedIOSDeviceName ?? "Device"
        let deviceButton = createButton(
            symbol: "iphone",
            tooltip: deviceTooltip,
            action: nil
        )
        deviceButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        deviceButton.onClick = { [weak self] in self?.showDeviceMenu(from: deviceButton) }
        if settings.selectedIOSDeviceId != nil {
            deviceButton.contentTintColor = NSColor.systemBlue
        }
        addSubview(deviceButton)
        buttons.append(deviceButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        setupTimerSection(at: xOffset, width: Self.timerWidth, status: .idle)
        xOffset += Self.timerWidth
        
        addSeparator(at: xOffset)
        
        let startButton = createButton(
            symbol: "circle.fill",
            tooltip: "Start Recording",
            variant: .danger,
            action: callbacks.onStart
        )
        startButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(startButton)
        self.startButton = startButton
        buttons.append(startButton)
        updateStartingState(isStarting: isStarting)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let cancelButton = createButton(
            symbol: "xmark",
            tooltip: "Cancel",
            action: callbacks.onCancel
        )
        cancelButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(cancelButton)
        buttons.append(cancelButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        setupDragHandle(at: xOffset, width: buttonSize)
    }
    
    private func setupRecordingUI() {
        let buttonSize = Self.buttonSize
        var xOffset: CGFloat = 0
        
        if settings.micEnabled {
            micMuteButton = MicButton(
                enabled: !settings.micMuted,
                size: 16,
                tooltip: settings.micMuted ? "Unmute Microphone" : "Mute Microphone"
            )
            micMuteButton?.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
            micMuteButton?.onClick = { [weak self] in
                guard let self = self else { return }
                self.settings.micMuted = !self.settings.micMuted
                self.micMuteButton?.setEnabled(!self.settings.micMuted)
                self.micMuteButton?.tooltipText = self.settings.micMuted ? "Unmute Microphone" : "Mute Microphone"
                self.callbacks.onToggleMicMute?()
            }
            addSubview(micMuteButton!)
            xOffset += buttonSize
            
            addSeparator(at: xOffset)
        }
        
        setupTimerSection(at: xOffset, width: Self.timerWidth, status: isPaused ? .paused : .active)
        xOffset += Self.timerWidth
        
        addSeparator(at: xOffset)
        
        let pauseResumeButton = createButton(
            symbol: isPaused ? "play.fill" : "pause",
            tooltip: isPaused ? "Resume" : "Pause",
            action: { [weak self] in
                guard let self = self else { return }
                if self.isPaused {
                    self.callbacks.onResume?()
                } else {
                    self.callbacks.onPause?()
                }
            }
        )
        pauseResumeButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(pauseResumeButton)
        buttons.append(pauseResumeButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let stopButton = createButton(
            symbol: "stop.fill",
            tooltip: "Stop",
            variant: .danger,
            action: callbacks.onStop
        )
        stopButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(stopButton)
        buttons.append(stopButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let restartButton = createButton(
            symbol: "arrow.counterclockwise",
            tooltip: "Restart Recording",
            action: callbacks.onRestart
        )
        restartButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(restartButton)
        buttons.append(restartButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let deleteButton = createButton(
            symbol: "trash",
            tooltip: "Delete Recording",
            action: callbacks.onDelete
        )
        deleteButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        addSubview(deleteButton)
        buttons.append(deleteButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        setupDragHandle(at: xOffset, width: buttonSize)
    }
    
    private func showMicMenu(from view: NSView) {
        TooltipManager.shared.hide()
        
        let menu = NSMenu()
        menu.autoenablesItems = false
        
        let headerItem = NSMenuItem(title: "Microphone", action: nil, keyEquivalent: "")
        headerItem.isEnabled = false
        menu.addItem(headerItem)
        
        let noneItem = NSMenuItem(title: "None", action: #selector(micNoneSelected), keyEquivalent: "")
        noneItem.target = self
        noneItem.state = !settings.micEnabled ? .on : .off
        menu.addItem(noneItem)
        
        for device in micDevices {
            let item = NSMenuItem(title: device.label, action: #selector(micDeviceSelected(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = device
            item.state = (settings.micEnabled && settings.selectedMicId == device.id) ? .on : .off
            menu.addItem(item)
        }
        
        let point = NSPoint(x: 0, y: view.bounds.height)
        menu.popUp(positioning: nil, at: point, in: view)
    }
    
    @objc private func micNoneSelected() {
        settings.micEnabled = false
        callbacks.onSelectMic?(nil, nil)
        setupContent()
    }
    
    @objc private func micDeviceSelected(_ sender: NSMenuItem) {
        guard let device = sender.representedObject as? MediaDevice else { return }
        settings.micEnabled = true
        settings.selectedMicId = device.id
        settings.selectedMicName = device.label
        callbacks.onSelectMic?(device.id, device.label)
        setupContent()
    }
    
    private func showCameraMenu(from button: IconButton) {
        TooltipManager.shared.hide()
        
        let menu = NSMenu()
        menu.autoenablesItems = false
        
        let cameraHeader = NSMenuItem(title: "Camera", action: nil, keyEquivalent: "")
        cameraHeader.isEnabled = false
        menu.addItem(cameraHeader)
        
        let noneItem = NSMenuItem(title: "None", action: #selector(cameraNoneSelected), keyEquivalent: "")
        noneItem.target = self
        noneItem.state = !settings.cameraEnabled ? .on : .off
        menu.addItem(noneItem)
        
        for device in cameraDevices {
            let item = NSMenuItem(title: device.label, action: #selector(cameraDeviceSelected(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = device
            item.state = (settings.cameraEnabled && settings.selectedCameraId == device.id) ? .on : .off
            menu.addItem(item)
        }
        
        let point = NSPoint(x: 0, y: button.bounds.height)
        menu.popUp(positioning: nil, at: point, in: button)
    }
    
    @objc private func cameraNoneSelected() {
        settings.cameraEnabled = false
        callbacks.onSelectCamera?(nil, nil)
        setupContent()
    }
    
    @objc private func cameraDeviceSelected(_ sender: NSMenuItem) {
        guard let device = sender.representedObject as? MediaDevice else { return }
        settings.cameraEnabled = true
        settings.selectedCameraId = device.id
        settings.selectedCameraName = device.label
        callbacks.onSelectCamera?(device.id, device.label)
        setupContent()
    }
    
    private func showDeviceMenu(from button: IconButton) {
        TooltipManager.shared.hide()

        if let refreshedDevices = callbacks.onRefreshIOSDevices?() {
            iosDevices = refreshedDevices
        }

        if let selectedDeviceId = settings.selectedIOSDeviceId,
           !iosDevices.contains(where: { $0.id == selectedDeviceId }) {
            settings.selectedIOSDeviceId = nil
            settings.selectedIOSDeviceName = nil
            NotificationCenter.default.post(name: .areaSelectorShouldShow, object: nil)
            callbacks.onSelectIOSDevice?(nil, nil)
        }
        
        let menu = NSMenu()
        menu.autoenablesItems = false
        
        let headerItem = NSMenuItem(title: "Connected Devices", action: nil, keyEquivalent: "")
        headerItem.isEnabled = false
        menu.addItem(headerItem)
        
        let noneItem = NSMenuItem(title: "None", action: #selector(iosDeviceNoneSelected), keyEquivalent: "")
        noneItem.target = self
        noneItem.state = settings.selectedIOSDeviceId == nil ? .on : .off
        menu.addItem(noneItem)
        
        if iosDevices.isEmpty {
            let noDevicesItem = NSMenuItem(title: "No devices found", action: nil, keyEquivalent: "")
            noDevicesItem.isEnabled = false
            menu.addItem(noDevicesItem)
        } else {
            for device in iosDevices {
                let item = NSMenuItem(title: device.label, action: #selector(iosDeviceSelected(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = device
                item.state = settings.selectedIOSDeviceId == device.id ? .on : .off
                menu.addItem(item)
            }
        }
        
        menu.addItem(NSMenuItem.separator())
        
        let helpItem = NSMenuItem(title: "How to record iPhone or iPad?", action: #selector(openIOSHelp), keyEquivalent: "")
        helpItem.target = self
        menu.addItem(helpItem)
        
        let point = NSPoint(x: 0, y: button.bounds.height)
        menu.popUp(positioning: nil, at: point, in: button)
    }
    
    @objc private func iosDeviceNoneSelected() {
        settings.selectedIOSDeviceId = nil
        settings.selectedIOSDeviceName = nil
        NotificationCenter.default.post(name: .areaSelectorShouldShow, object: nil)
        callbacks.onSelectIOSDevice?(nil, nil)
        setupContent()
    }
    
    @objc private func iosDeviceSelected(_ sender: NSMenuItem) {
        guard let device = sender.representedObject as? MediaDevice else { return }
        settings.selectedIOSDeviceId = device.id
        settings.selectedIOSDeviceName = device.label
        settings.aspectRatio = .free
        NotificationCenter.default.post(name: .areaSelectorShouldHide, object: nil)
        callbacks.onSelectIOSDevice?(device.id, device.label)
        setupContent()
    }
    
    @objc private func openIOSHelp() {
        callbacks.onOpenIOSHelp?()
    }
    
    private func createButton(
        symbol: String,
        tooltip: String,
        variant: IconButtonVariant = .normal,
        action: (() -> Void)?
    ) -> IconButton {
        let button = IconButton(symbol: symbol, size: 16, tooltip: tooltip)
        button.variant = variant
        button.onClick = action
        return button
    }
    
    private func addSeparator(at x: CGFloat) {
        let separator = VerticalSeparator(height: 32, at: x)
        addSubview(separator)
        separators.append(separator)
    }
    
    private func setupTimerSection(at x: CGFloat, width: CGFloat, status: StatusIndicatorState) {
        let height: CGFloat = 48
        let padding: CGFloat = 12
        let indicatorSize: CGFloat = 12
        let spacing: CGFloat = 6
        let timerHeight: CGFloat = 16
        let centerY = height / 2
        
        statusIndicator = StatusIndicator()
        statusIndicator?.status = status
        statusIndicator?.pulse = status == .active
        statusIndicator?.frame = NSRect(x: x + padding, y: centerY - indicatorSize / 2, width: indicatorSize, height: indicatorSize)
        addSubview(statusIndicator!)
        
        let timerX = x + padding + indicatorSize + spacing
        timerLabel = TimerLabel(frame: NSRect(x: timerX, y: centerY - timerHeight / 2 - 0.5, width: width - padding - indicatorSize - spacing, height: timerHeight))
        timerLabel?.elapsedSeconds = elapsedSeconds
        addSubview(timerLabel!)
    }
    
    private func setupDragHandle(at x: CGFloat, width: CGFloat) {
        dragHandle = DragHandle(frame: NSRect(x: x, y: 0, width: width, height: 48))
        addSubview(dragHandle!)
    }
    
    func updateTimer(seconds: Int) {
        elapsedSeconds = seconds
        timerLabel?.elapsedSeconds = seconds
    }
    
    func updatePausedState(isPaused: Bool) {
        self.isPaused = isPaused
        
        if mode == .recording {
            statusIndicator?.status = isPaused ? .paused : .active
            statusIndicator?.pulse = !isPaused
            
            if let pauseButton = buttons.first(where: { $0.tooltipText == "Resume" || $0.tooltipText == "Pause" }) {
                pauseButton.setSymbol(isPaused ? "play.fill" : "pause")
                pauseButton.tooltipText = isPaused ? "Resume" : "Pause"
            }
        }
    }
    
    func updateSettings(_ newSettings: RecordingControlSettings) {
        settings = newSettings
        
        if mode == .preRecording {
            setupContent()
        }
    }
    
    func updateAudioLevel(_ level: Float) {
        micButton?.level = level
    }

    func updateStartingState(isStarting: Bool) {
        self.isStarting = isStarting
        guard mode == .preRecording, let startButton = startButton else { return }

        if isStarting {
            startButton.isEnabled = false
            startButton.image = nil

            if startSpinner == nil {
                let spinner = NSProgressIndicator(frame: NSRect(x: 0, y: 0, width: 16, height: 16))
                spinner.style = .spinning
                spinner.controlSize = .small
                spinner.isIndeterminate = true
                spinner.isDisplayedWhenStopped = false
                startSpinner = spinner
                addSubview(spinner)
            }

            startSpinner?.frame = NSRect(
                x: startButton.frame.midX - 8,
                y: startButton.frame.midY - 8,
                width: 16,
                height: 16
            )
            startSpinner?.startAnimation(nil)
            return
        }

        startSpinner?.stopAnimation(nil)
        startButton.setSymbol("circle.fill")
        startButton.isEnabled = true
    }
    
    override func applyTheme() {
        super.applyTheme()
        
        for button in buttons {
            button.applyTheme()
        }
        
        for separator in separators {
            separator.applyTheme()
        }
        
        statusIndicator?.applyTheme()
        timerLabel?.applyTheme()
        dragHandle?.applyTheme()
        micButton?.applyTheme()
        micMuteButton?.applyTheme()
        aspectRatioButton?.applyTheme()
    }
    
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        applyTheme()
        ThemeManager.shared.notifyThemeChange()
    }
    
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        
        if let existing = trackingArea {
            removeTrackingArea(existing)
        }
        
        trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited, .cursorUpdate],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea!)
    }
    
    override func cursorUpdate(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if let dh = dragHandle, dh.frame.contains(point) {
            return
        }
        NSCursor.arrow.set()
    }
    
    override func mouseEntered(with event: NSEvent) {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        let point = convert(event.locationInWindow, from: nil)
        if let dh = dragHandle, !dh.frame.contains(point) {
            NSCursor.arrow.set()
        }
    }
    
    override func mouseExited(with event: NSEvent) {
        TooltipManager.shared.hide()
    }
    
    override var acceptsFirstResponder: Bool { true }
}
