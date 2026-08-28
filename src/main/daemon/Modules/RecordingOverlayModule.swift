import Cocoa
import Foundation

class RecordingOverlayModule: Module {
    let name = "recording-overlay"
    private var windows: [RecordingOverlayWindow] = []
    private var overlayViews: [NSScreen: RecordingOverlayView] = [:]
    
    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "show":
            handleShow(params: params, requestId: requestId)
        case "hide":
            handleHide(requestId: requestId)
        case "status":
            handleStatus(requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }
    
    private func handleShow(params: [String: AnyCodable]?, requestId: String) {
        guard let params = params,
              let x = params["x"]?.int(),
              let y = params["y"]?.int(),
              let width = params["width"]?.int(),
              let height = params["height"]?.int() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "show requires x, y, width, height")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.showOverlay(x: x, y: y, width: width, height: height)
            self.respond(id: requestId, result: ["visible": true])
        }
    }
    
    private func handleHide(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.hideOverlay()
            self.respond(id: requestId, result: ["visible": false])
        }
    }
    
    private func handleStatus(requestId: String) {
        respond(id: requestId, result: ["visible": !windows.isEmpty])
    }
    
    private func showOverlay(x: Int, y: Int, width: Int, height: Int) {
        hideOverlay()
        
        let mainScreenHeight = NSScreen.screens.first?.frame.height ?? 0
        let cocoaY = mainScreenHeight - CGFloat(y) - CGFloat(height)
        
        let globalRecordingRect = NSRect(
            x: CGFloat(x),
            y: cocoaY,
            width: CGFloat(width),
            height: CGFloat(height)
        )
        
        for screen in NSScreen.screens {
            let window = RecordingOverlayWindow(
                contentRect: screen.frame,
                styleMask: .borderless,
                backing: .buffered,
                defer: false
            )
            
            window.level = .screenSaver
            window.isOpaque = false
            window.backgroundColor = .clear
            window.ignoresMouseEvents = true
            window.hasShadow = false
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            window.isReleasedWhenClosed = false
            
            let overlayView = RecordingOverlayView(frame: screen.frame)
            
            let localRect = NSRect(
                x: globalRecordingRect.origin.x - screen.frame.origin.x,
                y: globalRecordingRect.origin.y - screen.frame.origin.y,
                width: globalRecordingRect.width,
                height: globalRecordingRect.height
            )
            
            if screen.frame.intersects(globalRecordingRect) {
                overlayView.updateRecordingRect(localRect)
            } else {
                overlayView.updateRecordingRect(.zero)
            }
            
            window.contentView = overlayView
            window.orderFrontRegardless()
            
            windows.append(window)
            overlayViews[screen] = overlayView
        }
    }
    
    private func hideOverlay() {
        for window in windows {
            window.orderOut(nil)
        }
        windows.removeAll()
        overlayViews.removeAll()
    }
}

private class RecordingOverlayWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private class RecordingOverlayView: NSView {
    var recordingRect: NSRect = .zero
    
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }
    
    func updateRecordingRect(_ rect: NSRect) {
        recordingRect = rect
        needsDisplay = true
    }
    
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        
        guard recordingRect.width > 0 && recordingRect.height > 0 else { return }
        
        NSColor.black.withAlphaComponent(0.5).setFill()
        
        let topRect = NSRect(
            x: 0,
            y: recordingRect.maxY,
            width: bounds.width,
            height: bounds.height - recordingRect.maxY
        )
        topRect.fill()
        
        let bottomRect = NSRect(
            x: 0,
            y: 0,
            width: bounds.width,
            height: recordingRect.minY
        )
        bottomRect.fill()
        
        let leftRect = NSRect(
            x: 0,
            y: recordingRect.minY,
            width: recordingRect.minX,
            height: recordingRect.height
        )
        leftRect.fill()
        
        let rightRect = NSRect(
            x: recordingRect.maxX,
            y: recordingRect.minY,
            width: bounds.width - recordingRect.maxX,
            height: recordingRect.height
        )
        rightRect.fill()
    }
    
    override func hitTest(_ point: NSPoint) -> NSView? {
        return nil
    }
}
