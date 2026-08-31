import AVFoundation
import Cocoa
import Foundation

class CameraPreviewModule: Module {
    let name = "camera-preview"
    
    private var panel: NSPanel?
    private var contentView: CameraPreviewContentView?
    
    private var deviceId: String?
    private var deviceName: String?
    private var resolution: String = "720p"
    private var isContentProtected: Bool = false
    
    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "show":
            handleShow(params: params, requestId: requestId)
        case "hide":
            handleHide(requestId: requestId)
        case "update":
            handleUpdate(params: params, requestId: requestId)
        case "setContentProtection":
            handleSetContentProtection(params: params, requestId: requestId)
        case "getPosition":
            handleGetPosition(requestId: requestId)
        case "status":
            handleStatus(requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }
    
    private func handleShow(params: [String: AnyCodable]?, requestId: String) {
        let newDeviceId = params?["deviceId"]?.string()
        let newDeviceName = params?["deviceName"]?.string()
        let newResolution = params?["resolution"]?.string() ?? "720p"
        
        let deviceChanged = newDeviceId != deviceId || newDeviceName != deviceName
        let resolutionChanged = newResolution != resolution
        
        deviceId = newDeviceId
        deviceName = newDeviceName
        resolution = newResolution
        
        let x = params?["x"]?.int()
        let y = params?["y"]?.int()
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.showPanel(x: x, y: y)
            
            if (deviceChanged || resolutionChanged) && self.contentView != nil {
                self.contentView?.updateCamera(
                    deviceId: self.deviceId,
                    deviceName: self.deviceName,
                    resolution: self.resolution
                )
            }
            
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
        let deviceChanged = params?["deviceId"] != nil || params?["deviceName"] != nil
        let resolutionChanged = params?["resolution"] != nil
        
        if let newDeviceId = params?["deviceId"]?.string() {
            deviceId = newDeviceId
        }
        if let newDeviceName = params?["deviceName"]?.string() {
            deviceName = newDeviceName
        }
        if let newResolution = params?["resolution"]?.string() {
            resolution = newResolution
        }
        
        if let x = params?["x"]?.int(), let y = params?["y"]?.int() {
            DispatchQueue.main.async { [weak self] in
                self?.updatePosition(x: x, y: y)
            }
        }
        
        if deviceChanged || resolutionChanged {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.contentView?.updateCamera(
                    deviceId: self.deviceId,
                    deviceName: self.deviceName,
                    resolution: self.resolution
                )
            }
        }
        
        respond(id: requestId, result: ["updated": true])
    }
    
    private func handleSetContentProtection(params: [String: AnyCodable]?, requestId: String) {
        isContentProtected = params?["enabled"]?.bool() ?? false
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.panel?.sharingType = self.isContentProtected ? .none : .readOnly
            self.respond(id: requestId, result: ["protected": self.isContentProtected])
        }
    }
    
    private func handleGetPosition(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let panel = self.panel else {
                self?.respond(id: requestId, result: ["x": nil, "y": nil])
                return
            }
            
            let mainScreenHeight = NSScreen.main?.frame.height ?? 0
            let x = Int(panel.frame.origin.x)
            let y = Int(mainScreenHeight - panel.frame.origin.y - panel.frame.height)
            
            self.respond(id: requestId, result: ["x": x, "y": y])
        }
    }
    
    private func handleStatus(requestId: String) {
        let isVisible = panel != nil && panel?.isVisible == true
        respond(id: requestId, result: ["visible": isVisible])
    }
    
    private func showPanel(x: Int?, y: Int?) {
        if panel != nil {
            if let x = x, let y = y {
                updatePosition(x: x, y: y)
            }
            panel?.orderFrontRegardless()
            return
        }
        
        let previewSize: CGFloat = 230
        let shadowPadding: CGFloat = 20
        let totalSize = previewSize + shadowPadding * 2
        
        let position = calculatePosition(x: x, y: y, width: totalSize, height: totalSize)
        
        panel = NSPanel(
            contentRect: NSRect(x: position.x, y: position.y, width: totalSize, height: totalSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        panel?.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)) + 1)
        panel?.isOpaque = false
        panel?.backgroundColor = .clear
        panel?.hasShadow = false
        panel?.isMovableByWindowBackground = true
        panel?.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel?.hidesOnDeactivate = false
        panel?.sharingType = isContentProtected ? .none : .readOnly
        
        contentView = CameraPreviewContentView(
            frame: NSRect(x: 0, y: 0, width: totalSize, height: totalSize),
            deviceId: deviceId,
            deviceName: deviceName,
            resolution: resolution,
            padding: shadowPadding
        )
        
        panel?.contentView = contentView
        panel?.orderFrontRegardless()
        
        setupMoveTracking()
    }
    
    private func hidePanel() {
        contentView?.stopCamera()
        panel?.contentView = nil
        panel?.orderOut(nil)
        panel?.close()
        panel = nil
        contentView = nil
    }
    
    private func updatePosition(x: Int, y: Int) {
        guard let panel = panel else { return }
        let mainScreenHeight = NSScreen.main?.frame.height ?? 0
        let cocoaY = mainScreenHeight - CGFloat(y) - panel.frame.height
        panel.setFrameOrigin(NSPoint(x: CGFloat(x), y: cocoaY))
    }
    
    private func calculatePosition(x: Int?, y: Int?, width: CGFloat, height: CGFloat) -> NSPoint {
        let mainScreenHeight = NSScreen.main?.frame.height ?? 0
        
        if let x = x, let y = y {
            let cocoaY = mainScreenHeight - CGFloat(y) - height
            return NSPoint(x: CGFloat(x), y: cocoaY)
        }
        
        guard let screen = NSScreen.main else {
            return NSPoint(x: 100, y: 100)
        }
        
        let screenWidth = screen.visibleFrame.width
        let screenHeight = screen.visibleFrame.height
        let margin: CGFloat = 32
        
        let defaultX = screenWidth - width - margin + screen.visibleFrame.origin.x
        let defaultY = screen.visibleFrame.origin.y + margin
        
        return NSPoint(x: defaultX, y: defaultY)
    }
    
    private func setupMoveTracking() {
        NotificationCenter.default.addObserver(
            forName: NSWindow.didMoveNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            guard let self = self, let panel = self.panel else { return }
            
            let mainScreenHeight = NSScreen.main?.frame.height ?? 0
            let x = Int(panel.frame.origin.x)
            let y = Int(mainScreenHeight - panel.frame.origin.y - panel.frame.height)
            
            self.emit(event: "position-changed", data: ["x": x, "y": y])
        }
    }
}

private class CameraPreviewContentView: NSView {
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var containerView: NSView!
    
    private var deviceId: String?
    private var deviceName: String?
    private var resolution: String
    private let padding: CGFloat
    private let cornerRadius: CGFloat = 65
    
    private let cameraQueue = DispatchQueue(label: "com.capty.camera-preview")
    private var isStopped: Bool = false
    
    init(frame: NSRect, deviceId: String?, deviceName: String?, resolution: String, padding: CGFloat) {
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.resolution = resolution
        self.padding = padding
        super.init(frame: frame)
        setupView()
        startCamera()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupView() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        
        let contentRect = NSRect(
            x: padding,
            y: padding,
            width: bounds.width - padding * 2,
            height: bounds.height - padding * 2
        )
        
        containerView = NSView(frame: contentRect)
        containerView.wantsLayer = true
        containerView.layer?.cornerRadius = cornerRadius
        containerView.layer?.masksToBounds = true
        containerView.layer?.backgroundColor = NSColor.black.cgColor
        
        let shadowView = NSView(frame: contentRect)
        shadowView.wantsLayer = true
        shadowView.layer?.cornerRadius = cornerRadius
        shadowView.layer?.shadowColor = NSColor.black.cgColor
        shadowView.layer?.shadowOffset = CGSize(width: 0, height: -4)
        shadowView.layer?.shadowRadius = 10
        shadowView.layer?.shadowOpacity = 0.4
        shadowView.layer?.backgroundColor = NSColor.black.cgColor
        
        addSubview(shadowView)
        addSubview(containerView)
    }
    
    func startCamera() {
        cameraQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.stopCameraInternal()
            self.isStopped = false
            
            guard let camera = self.findCamera() else {
                DispatchQueue.main.async { [weak self] in
                    self?.showError("No camera found")
                }
                return
            }
            
            guard !self.isStopped else { return }
            
            let session = AVCaptureSession()
            session.sessionPreset = .high
            
            do {
                let input = try AVCaptureDeviceInput(device: camera)
                if session.canAddInput(input) {
                    session.addInput(input)
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    self?.showError("Camera access denied")
                }
                return
            }
            
            guard !self.isStopped else {
                self.cleanupSession(session)
                return
            }
            
            session.startRunning()
            
            guard !self.isStopped else {
                self.cleanupSession(session)
                return
            }
            
            DispatchQueue.main.async { [weak self] in
                guard let self = self, !self.isStopped else {
                    self?.cleanupSession(session)
                    return
                }
                
                self.captureSession = session
                
                let previewLayer = AVCaptureVideoPreviewLayer(session: session)
                previewLayer.videoGravity = .resizeAspectFill
                previewLayer.frame = self.containerView.bounds
                previewLayer.setAffineTransform(CGAffineTransform(scaleX: -1, y: 1))
                
                self.containerView.layer?.addSublayer(previewLayer)
                self.previewLayer = previewLayer
            }
        }
    }
    
    private func cleanupSession(_ session: AVCaptureSession) {
        if session.isRunning {
            session.stopRunning()
        }
        for input in session.inputs {
            session.removeInput(input)
        }
        for output in session.outputs {
            session.removeOutput(output)
        }
    }
    
    private func stopCameraInternal() {
        isStopped = true
        
        if let session = captureSession {
            cleanupSession(session)
        }
        captureSession = nil
        
        DispatchQueue.main.async { [weak self] in
            self?.previewLayer?.removeFromSuperlayer()
            self?.previewLayer = nil
        }
    }
    
    func stopCamera() {
        cameraQueue.async { [weak self] in
            self?.stopCameraInternal()
        }
    }
    
    func updateCamera(deviceId: String?, deviceName: String?, resolution: String) {
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.resolution = resolution
        startCamera()
    }
    
    private func findCamera() -> AVCaptureDevice? {
        let discoverySession: AVCaptureDevice.DiscoverySession
        if #available(macOS 14.0, *) {
            discoverySession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera],
                mediaType: .video,
                position: .unspecified
            )
        } else {
            discoverySession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInWideAngleCamera, .externalUnknown],
                mediaType: .video,
                position: .unspecified
            )
        }
        
        if let deviceName = deviceName {
            if let device = discoverySession.devices.first(where: { $0.localizedName == deviceName }) {
                return device
            }
            if let device = discoverySession.devices.first(where: { 
                deviceName.contains($0.localizedName) || $0.localizedName.contains(deviceName) 
            }) {
                return device
            }
        }
        
        if let deviceId = deviceId {
            if let device = discoverySession.devices.first(where: { $0.uniqueID == deviceId }) {
                return device
            }
        }
        
        return AVCaptureDevice.default(for: .video)
    }
    
    private func showError(_ message: String) {
        let label = NSTextField(labelWithString: message)
        label.textColor = .secondaryLabelColor
        label.font = NSFont.systemFont(ofSize: 12)
        label.alignment = .center
        label.frame = containerView.bounds
        containerView.addSubview(label)
    }
    
    override func layout() {
        super.layout()
        
        let contentRect = NSRect(
            x: padding,
            y: padding,
            width: bounds.width - padding * 2,
            height: bounds.height - padding * 2
        )
        
        containerView?.frame = contentRect
        previewLayer?.frame = containerView?.bounds ?? .zero
        
        if let shadowView = subviews.first {
            shadowView.frame = contentRect
        }
    }
}
