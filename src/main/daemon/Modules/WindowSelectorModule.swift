import Cocoa
import Foundation

class WindowSelectorModule: Module {
    let name = "window-selector"
    private var selector: WindowSelectorUI?
    private var currentRequestId: String?
    
    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "select":
            handleSelect(requestId: requestId)
        case "cancel":
            handleCancel(requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }
    
    private func handleSelect(requestId: String) {
        if selector != nil {
            respondError(id: requestId, code: "ALREADY_ACTIVE", message: "Window selector is already active")
            return
        }
        
        currentRequestId = requestId
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.selector = WindowSelectorUI(
                onSelect: { [weak self] info in
                    self?.handleSelection(info)
                },
                onCancel: { [weak self] in
                    self?.handleCancellation()
                },
                onError: { [weak self] message in
                    self?.handleError(message)
                }
            )
            self.selector?.start()
        }
    }
    
    private func handleCancel(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            self?.selector?.cleanup()
            self?.selector = nil
        }
        respond(id: requestId, result: ["cancelled": true])
    }
    
    private func handleSelection(_ info: WindowSelectorInfo) {
        guard let requestId = currentRequestId else { return }
        respond(id: requestId, result: [
            "status": "selected",
            "windowId": info.windowId,
            "windowTitle": info.title,
            "ownerName": info.ownerName,
            "ownerPid": info.ownerPid,
            "bounds": [
                "x": Int(info.bounds.origin.x),
                "y": Int(info.bounds.origin.y),
                "width": Int(info.bounds.width),
                "height": Int(info.bounds.height)
            ]
        ])
        cleanup()
    }
    
    private func handleCancellation() {
        guard let requestId = currentRequestId else { return }
        respond(id: requestId, result: ["status": "cancelled"])
        cleanup()
    }
    
    private func handleError(_ message: String) {
        guard let requestId = currentRequestId else { return }
        respondError(id: requestId, code: "NO_WINDOWS", message: message)
        cleanup()
    }
    
    private func cleanup() {
        DispatchQueue.main.async { [weak self] in
            self?.selector?.cleanup()
            self?.selector = nil
        }
        currentRequestId = nil
    }
}

struct WindowSelectorInfo {
    let windowId: Int
    let title: String
    let ownerName: String
    let ownerPid: Int
    let bounds: CGRect
}

class WindowSelectorOverlayView: NSView {
    var windowInfo: WindowSelectorInfo?
    var isHovered = false
    var onSelect: ((WindowSelectorInfo) -> Void)?
    var onCancel: (() -> Void)?
    
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if isHovered {
            NSColor.systemBlue.withAlphaComponent(0.3).setFill()
            bounds.fill()
            
            NSColor.systemBlue.withAlphaComponent(0.8).setStroke()
            let borderPath = NSBezierPath(rect: bounds.insetBy(dx: 2, dy: 2))
            borderPath.lineWidth = 4
            borderPath.stroke()
            
            drawSelectionPrompt()
        }
    }
    
    private func drawSelectionPrompt() {
        let text = "Click to select this window"
        let font = NSFont.systemFont(ofSize: 24, weight: .semibold)
        let textAttributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.white
        ]
        
        let textSize = text.size(withAttributes: textAttributes)
        let minWidth = textSize.width + 40
        let minHeight = textSize.height + 30
        
        if bounds.width < minWidth || bounds.height < minHeight {
            return
        }
        
        let padding: CGFloat = 16
        let cornerRadius: CGFloat = 12
        let boxWidth = textSize.width + padding * 2
        let boxHeight = textSize.height + padding
        
        let boxRect = NSRect(
            x: bounds.midX - boxWidth / 2,
            y: bounds.midY - boxHeight / 2,
            width: boxWidth,
            height: boxHeight
        )
        
        NSColor.black.withAlphaComponent(0.6).setFill()
        let boxPath = NSBezierPath(roundedRect: boxRect, xRadius: cornerRadius, yRadius: cornerRadius)
        boxPath.fill()
        
        let textPoint = NSPoint(
            x: boxRect.midX - textSize.width / 2,
            y: boxRect.midY - textSize.height / 2
        )
        text.draw(at: textPoint, withAttributes: textAttributes)
    }
    
    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        NSCursor.pointingHand.set()
        needsDisplay = true
    }
    
    override func mouseExited(with event: NSEvent) {
        isHovered = false
        NSCursor.arrow.set()
        needsDisplay = true
    }
    
    override func mouseDown(with event: NSEvent) {
        if let info = windowInfo {
            onSelect?(info)
        }
    }
    
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 {
            onCancel?()
        }
    }
    
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas {
            removeTrackingArea(area)
        }
        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
    }
}

class WindowSelectorOverlayWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

class WindowSelectorUI {
    private var overlayWindows: [WindowSelectorOverlayWindow] = []
    private var dimWindow: NSWindow?
    private var onSelect: ((WindowSelectorInfo) -> Void)?
    private var onCancel: (() -> Void)?
    private var onError: ((String) -> Void)?
    
    init(onSelect: @escaping (WindowSelectorInfo) -> Void, 
         onCancel: @escaping () -> Void,
         onError: @escaping (String) -> Void) {
        self.onSelect = onSelect
        self.onCancel = onCancel
        self.onError = onError
    }
    
    func start() {
        let windows = getVisibleWindows()
        
        if windows.isEmpty {
            onError?("No visible windows found")
            return
        }
        
        createDimOverlay()
        createWindowOverlays(windows)
        NSApp.activate(ignoringOtherApps: true)
    }
    
    private func getVisibleWindows() -> [WindowSelectorInfo] {
        var result: [WindowSelectorInfo] = []
        
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return result
        }
        
        let myPid = ProcessInfo.processInfo.processIdentifier
        
        for windowDict in windowList {
            guard let windowId = windowDict[kCGWindowNumber as String] as? Int,
                  let ownerPid = windowDict[kCGWindowOwnerPID as String] as? Int,
                  let boundsDict = windowDict[kCGWindowBounds as String] as? [String: Any],
                  let x = boundsDict["X"] as? CGFloat,
                  let y = boundsDict["Y"] as? CGFloat,
                  let width = boundsDict["Width"] as? CGFloat,
                  let height = boundsDict["Height"] as? CGFloat,
                  let layer = windowDict[kCGWindowLayer as String] as? Int
            else { continue }
            
            if ownerPid == Int(myPid) { continue }
            if layer != 0 { continue }
            if width < 50 || height < 50 { continue }
            
            let ownerName = windowDict[kCGWindowOwnerName as String] as? String ?? "Unknown"
            let title = windowDict[kCGWindowName as String] as? String ?? ""
            let displayTitle = title.isEmpty ? ownerName : title
            let bounds = CGRect(x: x, y: y, width: width, height: height)
            
            result.append(WindowSelectorInfo(
                windowId: windowId,
                title: displayTitle,
                ownerName: ownerName,
                ownerPid: ownerPid,
                bounds: bounds
            ))
        }
        
        return result
    }
    
    private func createDimOverlay() {
        var combinedFrame = CGRect.zero
        for screen in NSScreen.screens {
            combinedFrame = combinedFrame.union(screen.frame)
        }
        
        let window = NSWindow(
            contentRect: combinedFrame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.overlayWindow)) - 1)
        window.isOpaque = false
        window.backgroundColor = NSColor.black.withAlphaComponent(0.4)
        window.ignoresMouseEvents = true
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.hasShadow = false
        window.isReleasedWhenClosed = false
        window.orderFront(nil)
        
        dimWindow = window
    }
    
    private func createWindowOverlays(_ windows: [WindowSelectorInfo]) {
        let mainScreenHeight = NSScreen.screens.first?.frame.height ?? 0
        
        for windowInfo in windows {
            let flippedY = mainScreenHeight - windowInfo.bounds.origin.y - windowInfo.bounds.height
            
            let windowFrame = NSRect(
                x: windowInfo.bounds.origin.x,
                y: flippedY,
                width: windowInfo.bounds.width,
                height: windowInfo.bounds.height
            )
            
            let window = WindowSelectorOverlayWindow(
                contentRect: windowFrame,
                styleMask: .borderless,
                backing: .buffered,
                defer: false
            )
            
            window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.overlayWindow)))
            window.isOpaque = false
            window.backgroundColor = .clear
            window.ignoresMouseEvents = false
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.hasShadow = false
            window.isReleasedWhenClosed = false

            let overlayView = WindowSelectorOverlayView(frame: NSRect(
                x: 0, y: 0,
                width: windowFrame.width,
                height: windowFrame.height
            ))
            
            overlayView.windowInfo = windowInfo
            overlayView.onSelect = { [weak self] info in
                self?.onSelect?(info)
            }
            overlayView.onCancel = { [weak self] in
                self?.onCancel?()
            }
            
            window.contentView = overlayView
            window.makeKeyAndOrderFront(nil)
            window.makeFirstResponder(overlayView)
            
            overlayWindows.append(window)
        }
        
        if let firstWindow = overlayWindows.first {
            firstWindow.makeKey()
        }
    }
    
    func cleanup() {
        dimWindow?.orderOut(nil)
        dimWindow = nil
        
        for window in overlayWindows {
            window.orderOut(nil)
        }
        overlayWindows.removeAll()
    }
}
