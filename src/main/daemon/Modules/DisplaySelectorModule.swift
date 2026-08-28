import Cocoa
import Foundation

class DisplaySelectorModule: Module {
    let name = "display-selector"
    private var selector: DisplaySelectorUI?
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
            respondError(id: requestId, code: "ALREADY_ACTIVE", message: "Display selector is already active")
            return
        }
        
        currentRequestId = requestId
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.selector = DisplaySelectorUI(
                onSelect: { [weak self] displayNumber, screenId in
                    self?.handleSelection(displayNumber: displayNumber, screenId: screenId)
                },
                onCancel: { [weak self] in
                    self?.handleCancellation()
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
    
    private func handleSelection(displayNumber: Int, screenId: Int) {
        guard let requestId = currentRequestId else { return }
        respond(id: requestId, result: [
            "status": "selected",
            "displayNumber": displayNumber,
            "screenId": screenId
        ])
        cleanup()
    }
    
    private func handleCancellation() {
        guard let requestId = currentRequestId else { return }
        respond(id: requestId, result: [
            "status": "cancelled"
        ])
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

class DisplayOverlayView: NSView {
    var isHovered = false
    var onSelect: (() -> Void)?
    var onCancel: (() -> Void)?
    
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if isHovered {
            NSColor.black.withAlphaComponent(0.5).setFill()
            bounds.fill()
        }
    }
    
    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }
    
    override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }
    
    override func mouseDown(with event: NSEvent) {
        onSelect?()
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

class DisplaySelectorWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

class DisplaySelectorUI {
    private var windows: [DisplaySelectorWindow] = []
    private var screenDisplayNumbers: [NSScreen: Int] = [:]
    private var onSelect: ((Int, Int) -> Void)?
    private var onCancel: (() -> Void)?
    
    init(onSelect: @escaping (Int, Int) -> Void, onCancel: @escaping () -> Void) {
        self.onSelect = onSelect
        self.onCancel = onCancel
    }
    
    func start() {
        buildDisplayMapping()
        createOverlayWindows()
        NSApp.activate(ignoringOtherApps: true)
    }
    
    private func buildDisplayMapping() {
        var displayCount: UInt32 = 0
        CGGetActiveDisplayList(0, nil, &displayCount)
        guard displayCount > 0 else { return }
        
        var displays = [CGDirectDisplayID](repeating: 0, count: Int(displayCount))
        CGGetActiveDisplayList(displayCount, &displays, &displayCount)
        
        let mainDisplayId = CGMainDisplayID()
        
        for screen in NSScreen.screens {
            guard let screenNumber = screen.deviceDescription[
                NSDeviceDescriptionKey("NSScreenNumber")
            ] as? CGDirectDisplayID else {
                screenDisplayNumbers[screen] = 1
                continue
            }
            
            if screenNumber == mainDisplayId {
                screenDisplayNumbers[screen] = 1
            } else {
                var displayIndex = 2
                for display in displays {
                    if display == mainDisplayId { continue }
                    if display == screenNumber {
                        screenDisplayNumbers[screen] = displayIndex
                        break
                    }
                    displayIndex += 1
                }
                if screenDisplayNumbers[screen] == nil {
                    screenDisplayNumbers[screen] = 1
                }
            }
        }
    }
    
    private func createOverlayWindows() {
        for screen in NSScreen.screens {
            let window = DisplaySelectorWindow(
                contentRect: screen.frame,
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

            let viewBounds = NSRect(x: 0, y: 0, width: screen.frame.width, height: screen.frame.height)
            let overlayView = DisplayOverlayView(frame: viewBounds)
            
            let displayNumber = screenDisplayNumbers[screen] ?? 1
            let screenId = screen.deviceDescription[
                NSDeviceDescriptionKey("NSScreenNumber")
            ] as? Int ?? 0
            
            overlayView.onSelect = { [weak self] in
                self?.onSelect?(displayNumber, screenId)
            }
            
            overlayView.onCancel = { [weak self] in
                self?.onCancel?()
            }
            
            window.contentView = overlayView
            window.makeKeyAndOrderFront(nil)
            window.makeFirstResponder(overlayView)
            
            windows.append(window)
        }
        
        if let mainWindow = windows.first {
            mainWindow.makeKey()
        }
    }
    
    func cleanup() {
        for window in windows {
            window.orderOut(nil)
        }
        windows.removeAll()
    }
}
