import Cocoa
import Foundation

extension Notification.Name {
    static let areaSelectorShouldHide = Notification.Name("area-selector:hide")
    static let areaSelectorShouldShow = Notification.Name("area-selector:show")
}

class AreaSelectorModule: Module {
    let name = "area-selector"
    
    private var selector: AreaSelector?
    private var activeRequestId: String?
    private var hideObserver: NSObjectProtocol?
    private var showObserver: NSObjectProtocol?

    init() {
        hideObserver = NotificationCenter.default.addObserver(
            forName: .areaSelectorShouldHide,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.selector?.hide()
        }

        showObserver = NotificationCenter.default.addObserver(
            forName: .areaSelectorShouldShow,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.selector?.show()
        }
    }

    deinit {
        if let hideObserver = hideObserver {
            NotificationCenter.default.removeObserver(hideObserver)
        }
        if let showObserver = showObserver {
            NotificationCenter.default.removeObserver(showObserver)
        }
    }
    
    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "start":
            handleStart(params: params, requestId: requestId)
        case "confirm":
            handleConfirm(requestId: requestId)
        case "cancel":
            handleCancel(requestId: requestId)
        case "update":
            handleUpdate(params: params, requestId: requestId)
        case "hide":
            handleHide(requestId: requestId)
        case "show":
            handleShow(requestId: requestId)
        case "status":
            handleStatus(requestId: requestId)
        case "setAspectRatio":
            handleSetAspectRatio(params: params, requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }
    
    private func handleSetAspectRatio(params: [String: AnyCodable]?, requestId: String) {
        let ratioWidth = params?["width"]?.int() ?? 0
        let ratioHeight = params?["height"]?.int() ?? 0
        
        let ratio: Double? = (ratioWidth > 0 && ratioHeight > 0) ? Double(ratioWidth) / Double(ratioHeight) : nil
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.selector?.setAspectRatio(ratio)
            self.respond(id: requestId, result: ["updated": true])
        }
    }
    
    private func handleStart(params: [String: AnyCodable]?, requestId: String) {
        let fullscreen = params?["fullscreen"]?.bool() ?? false
        let displayId = params?["displayId"]?.int()
        let presetX = params?["presetX"]?.int()
        let presetY = params?["presetY"]?.int()
        let presetWidth = params?["presetWidth"]?.int()
        let presetHeight = params?["presetHeight"]?.int()
        let showPrompt = params?["showPrompt"]?.bool() ?? true
        let style = params?["style"]?.string() ?? "default"
        
        var presetBounds: NSRect? = nil
        if let x = presetX, let y = presetY, let w = presetWidth, let h = presetHeight {
            presetBounds = NSRect(x: x, y: y, width: w, height: h)
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            if self.selector != nil {
                self.selector?.cleanup()
            }
            
            self.activeRequestId = requestId
            self.selector = AreaSelector()
            
            self.selector?.onInitialSelectionComplete = { [weak self] rect, screen in
                self?.emitSelectionEvent(rect: rect, screen: screen, status: "selected")
            }
            
            self.selector?.onSelectionChanged = { [weak self] rect, screen in
                self?.emitSelectionEvent(rect: rect, screen: screen, status: "updated")
            }
            
            self.selector?.onCancel = { [weak self] in
                self?.emit(event: "cancelled")
                self?.cleanup()
            }
            
            let targetDisplayId: CGDirectDisplayID? = displayId.map { CGDirectDisplayID($0) }
            let useSimpleStyle = style == "simple"
            self.selector?.start(fullscreen: fullscreen, targetDisplayId: targetDisplayId, presetBounds: presetBounds, showPrompt: showPrompt, simpleStyle: useSimpleStyle)
            
            self.respond(id: requestId, result: ["started": true])
        }
    }
    
    private func handleConfirm(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let selector = self.selector else {
                self?.respondError(id: requestId, code: "NOT_ACTIVE", message: "No active selection")
                return
            }
            
            if let result = selector.confirmSelection() {
                self.emitSelectionEvent(rect: result.rect, screen: result.screen, status: "confirmed")
                self.respond(id: requestId, result: ["confirmed": true])
            } else {
                self.respondError(id: requestId, code: "NO_SELECTION", message: "No selection to confirm")
            }
            
            self.cleanup()
        }
    }
    
    private func handleCancel(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.selector?.cleanup()
            self.emit(event: "cancelled")
            self.cleanup()
            self.respond(id: requestId, result: ["cancelled": true])
        }
    }
    
    private func handleUpdate(params: [String: AnyCodable]?, requestId: String) {
        guard let x = params?["x"]?.int(),
              let y = params?["y"]?.int(),
              let width = params?["width"]?.int(),
              let height = params?["height"]?.int() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "update requires x, y, width, height")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.selector?.updateSelection(x: x, y: y, width: width, height: height)
            self.respond(id: requestId, result: ["updated": true])
        }
    }
    
    private func handleHide(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.selector?.hide()
            self.respond(id: requestId, result: ["hidden": true])
        }
    }
    
    private func handleShow(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.selector?.show()
            self.respond(id: requestId, result: ["visible": true])
        }
    }
    
    private func handleStatus(requestId: String) {
        let isActive = selector != nil && !(selector?.isHidden ?? true)
        respond(id: requestId, result: ["active": isActive])
    }
    
    private func emitSelectionEvent(rect: NSRect, screen: NSScreen, status: String) {
        let mainScreenHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
        let screenFrame = screen.frame
        
        let globalRect = NSRect(
            x: screenFrame.origin.x + rect.origin.x,
            y: screenFrame.origin.y + rect.origin.y,
            width: rect.width,
            height: rect.height
        )
        
        let topLeftY = mainScreenHeight - globalRect.origin.y - globalRect.height
        let screenId = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? Int ?? 0
        
        emit(event: status, data: [
            "x": Int(globalRect.origin.x),
            "y": Int(topLeftY),
            "width": Int(globalRect.width),
            "height": Int(globalRect.height),
            "screenId": screenId
        ])
    }
    
    private func cleanup() {
        selector = nil
        activeRequestId = nil
    }
}

private enum HandlePosition {
    case topLeft, topRight, bottomLeft, bottomRight
    case top, bottom, left, right
    case none
}

private class SelectionOverlayView: NSView {
    var startPoint: NSPoint?
    var currentPoint: NSPoint?
    var selectionRect: NSRect?
    var isSelectionComplete = false
    var isDragging = false
    var isResizing = false
    var activeHandle: HandlePosition = .none
    var dragOffset: NSPoint = .zero
    var showPrompt: Bool = true
    var simpleStyle: Bool = false
    var aspectRatio: Double? = nil
    
    static let overlayOpacity: CGFloat = 0.25
    
    let handleSize: CGFloat = 10
    let handleLength: CGFloat = 20
    let handleThickness: CGFloat = 4
    
    var onSelectionChanged: ((NSRect) -> Void)?
    var onSelectionCancelled: (() -> Void)?
    var onInitialSelectionComplete: ((NSRect) -> Void)?
    
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }
    
    private func setupView() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }
    
    func configure(showPrompt: Bool, simpleStyle: Bool) {
        self.showPrompt = showPrompt
        self.simpleStyle = simpleStyle
        if simpleStyle {
            layer?.backgroundColor = NSColor.clear.cgColor
        } else {
            layer?.backgroundColor = NSColor.black.withAlphaComponent(Self.overlayOpacity).cgColor
        }
    }
    
    func setAspectRatio(_ ratio: Double?) {
        self.aspectRatio = ratio
        
        guard let ratio = ratio, let rect = selectionRect, isSelectionComplete else { return }
        
        let adjustedRect = adjustRectToAspectRatio(rect, ratio: ratio, anchor: .center)
        selectionRect = adjustedRect
        needsDisplay = true
        onSelectionChanged?(adjustedRect)
    }
    
    private enum AnchorPosition {
        case center
        case topLeft
        case topRight
        case bottomLeft
        case bottomRight
        case top
        case bottom
        case left
        case right
    }
    
    private func adjustRectToAspectRatio(_ rect: NSRect, ratio: Double, anchor: AnchorPosition) -> NSRect {
        let currentRatio = rect.width / rect.height
        var newRect = rect
        
        if currentRatio > ratio {
            let newWidth = rect.height * ratio
            switch anchor {
            case .center:
                newRect.origin.x = rect.midX - newWidth / 2
            case .topRight, .bottomRight, .right:
                newRect.origin.x = rect.maxX - newWidth
            case .topLeft, .bottomLeft, .left, .top, .bottom:
                break
            }
            newRect.size.width = newWidth
        } else {
            let newHeight = rect.width / ratio
            switch anchor {
            case .center:
                newRect.origin.y = rect.midY - newHeight / 2
            case .topLeft, .topRight, .top:
                newRect.origin.y = rect.maxY - newHeight
            case .bottomLeft, .bottomRight, .bottom, .left, .right:
                break
            }
            newRect.size.height = newHeight
        }
        
        return newRect
    }
    
    private func anchorForHandle(_ handle: HandlePosition) -> AnchorPosition {
        switch handle {
        case .topLeft: return .bottomRight
        case .topRight: return .bottomLeft
        case .bottomLeft: return .topRight
        case .bottomRight: return .topLeft
        case .top: return .bottom
        case .bottom: return .top
        case .left: return .right
        case .right: return .left
        case .none: return .center
        }
    }
    
    private func handleRect(for position: HandlePosition, in rect: NSRect) -> NSRect {
        let hitPadding: CGFloat = 6
        let length = handleLength + hitPadding
        let edgeHitSize: CGFloat = 24
        
        switch position {
        case .topLeft:
            return NSRect(x: rect.minX - hitPadding/2, y: rect.maxY - length, width: length, height: length)
        case .topRight:
            return NSRect(x: rect.maxX - length + hitPadding/2, y: rect.maxY - length, width: length, height: length)
        case .bottomLeft:
            return NSRect(x: rect.minX - hitPadding/2, y: rect.minY, width: length, height: length)
        case .bottomRight:
            return NSRect(x: rect.maxX - length + hitPadding/2, y: rect.minY, width: length, height: length)
        case .top:
            let edgeLength = handleLength * 0.8 + edgeHitSize
            return NSRect(x: rect.midX - edgeLength/2, y: rect.maxY - edgeHitSize/2, width: edgeLength, height: edgeHitSize)
        case .bottom:
            let edgeLength = handleLength * 0.8 + edgeHitSize
            return NSRect(x: rect.midX - edgeLength/2, y: rect.minY - edgeHitSize/2, width: edgeLength, height: edgeHitSize)
        case .left:
            let edgeLength = handleLength * 0.8 + edgeHitSize
            return NSRect(x: rect.minX - edgeHitSize/2, y: rect.midY - edgeLength/2, width: edgeHitSize, height: edgeLength)
        case .right:
            let edgeLength = handleLength * 0.8 + edgeHitSize
            return NSRect(x: rect.maxX - edgeHitSize/2, y: rect.midY - edgeLength/2, width: edgeHitSize, height: edgeLength)
        case .none:
            return .zero
        }
    }
    
    private func normalizedSelectionRect() -> NSRect? {
        guard let rect = selectionRect else { return nil }
        return NSRect(
            x: min(rect.origin.x, rect.origin.x + rect.width),
            y: min(rect.origin.y, rect.origin.y + rect.height),
            width: abs(rect.width),
            height: abs(rect.height)
        )
    }
    
    private func hitTestHandle(at point: NSPoint) -> HandlePosition {
        guard let rect = normalizedSelectionRect() else { return .none }
        
        let handles: [HandlePosition] = [.topLeft, .topRight, .bottomLeft, .bottomRight, .top, .bottom, .left, .right]
        
        for handle in handles {
            let handleFrame = handleRect(for: handle, in: rect)
            if handleFrame.contains(point) {
                return handle
            }
        }
        
        return .none
    }
    
    private func cursorForHandle(_ handle: HandlePosition) -> NSCursor {
        switch handle {
        case .topLeft, .bottomRight:
            return createDiagonalResizeCursor(nwse: true)
        case .topRight, .bottomLeft:
            return createDiagonalResizeCursor(nwse: false)
        case .top, .bottom:
            return NSCursor.resizeUpDown
        case .left, .right:
            return NSCursor.resizeLeftRight
        case .none:
            return NSCursor.arrow
        }
    }
    
    private func createDiagonalResizeCursor(nwse: Bool) -> NSCursor {
        let size: CGFloat = 16
        let image = NSImage(size: NSSize(width: size, height: size))
        
        image.lockFocus()
        
        NSColor.white.setStroke()
        NSColor.black.setFill()
        
        let path = NSBezierPath()
        path.lineWidth = 1.5
        
        if nwse {
            path.move(to: NSPoint(x: 2, y: size - 2))
            path.line(to: NSPoint(x: size - 2, y: 2))
            
            path.move(to: NSPoint(x: 2, y: size - 2))
            path.line(to: NSPoint(x: 6, y: size - 2))
            path.move(to: NSPoint(x: 2, y: size - 2))
            path.line(to: NSPoint(x: 2, y: size - 6))
            
            path.move(to: NSPoint(x: size - 2, y: 2))
            path.line(to: NSPoint(x: size - 6, y: 2))
            path.move(to: NSPoint(x: size - 2, y: 2))
            path.line(to: NSPoint(x: size - 2, y: 6))
        } else {
            path.move(to: NSPoint(x: size - 2, y: size - 2))
            path.line(to: NSPoint(x: 2, y: 2))
            
            path.move(to: NSPoint(x: size - 2, y: size - 2))
            path.line(to: NSPoint(x: size - 6, y: size - 2))
            path.move(to: NSPoint(x: size - 2, y: size - 2))
            path.line(to: NSPoint(x: size - 2, y: size - 6))
            
            path.move(to: NSPoint(x: 2, y: 2))
            path.line(to: NSPoint(x: 6, y: 2))
            path.move(to: NSPoint(x: 2, y: 2))
            path.line(to: NSPoint(x: 2, y: 6))
        }
        
        NSColor.black.withAlphaComponent(0.5).setStroke()
        path.lineWidth = 3
        path.stroke()
        
        NSColor.white.setStroke()
        path.lineWidth = 1.5
        path.stroke()
        
        image.unlockFocus()
        
        return NSCursor(image: image, hotSpot: NSPoint(x: size/2, y: size/2))
    }
    
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        
        var rectToDraw: NSRect
        
        if let selection = selectionRect {
            rectToDraw = selection
        } else if let start = startPoint, let current = currentPoint {
            var previewRect = NSRect(
                x: min(start.x, current.x),
                y: min(start.y, current.y),
                width: abs(current.x - start.x),
                height: abs(current.y - start.y)
            )
            if let ratio = aspectRatio, previewRect.width > 10, previewRect.height > 10 {
                previewRect = adjustRectToAspectRatio(previewRect, ratio: ratio, anchor: .center)
            }
            rectToDraw = previewRect
        } else {
            if showPrompt {
                drawInstructionPrompt()
            }
            return
        }
        
        if simpleStyle {
            drawSimpleSelection(for: rectToDraw)
        } else {
            drawDefaultSelection(for: rectToDraw)
        }
    }
    
    private func drawSimpleSelection(for rect: NSRect) {
        NSColor.gray.withAlphaComponent(0.2).setFill()
        rect.fill()
        
        let borderPath = NSBezierPath(rect: rect)
        borderPath.lineWidth = 1.5
        NSColor.white.setStroke()
        borderPath.stroke()
        
        drawDimensionLabel(for: rect)
    }
    
    private func drawDefaultSelection(for rectToDraw: NSRect) {
        NSColor.black.withAlphaComponent(Self.overlayOpacity).setFill()
        
        let topRect = NSRect(x: 0, y: rectToDraw.maxY, width: bounds.width, height: bounds.height - rectToDraw.maxY)
        topRect.fill()
        
        let bottomRect = NSRect(x: 0, y: 0, width: bounds.width, height: rectToDraw.minY)
        bottomRect.fill()
        
        let leftRect = NSRect(x: 0, y: rectToDraw.minY, width: rectToDraw.minX, height: rectToDraw.height)
        leftRect.fill()
        
        let rightRect = NSRect(x: rectToDraw.maxX, y: rectToDraw.minY, width: bounds.width - rectToDraw.maxX, height: rectToDraw.height)
        rightRect.fill()
        
        NSColor.clear.setFill()
        rectToDraw.fill()
        
        drawHandles(for: rectToDraw)
        drawDimensionLabel(for: rectToDraw)
    }
    
    private func drawHandles(for rect: NSRect) {
        NSColor.white.setStroke()
        
        let length = handleLength
        let thickness = handleThickness
        
        drawCornerHandle(at: NSPoint(x: rect.minX, y: rect.maxY),
                        horizontal: (dx: 1, length: length),
                        vertical: (dy: -1, length: length),
                        thickness: thickness)
        
        drawCornerHandle(at: NSPoint(x: rect.maxX, y: rect.maxY),
                        horizontal: (dx: -1, length: length),
                        vertical: (dy: -1, length: length),
                        thickness: thickness)
        
        drawCornerHandle(at: NSPoint(x: rect.minX, y: rect.minY),
                        horizontal: (dx: 1, length: length),
                        vertical: (dy: 1, length: length),
                        thickness: thickness)
        
        drawCornerHandle(at: NSPoint(x: rect.maxX, y: rect.minY),
                        horizontal: (dx: -1, length: length),
                        vertical: (dy: 1, length: length),
                        thickness: thickness)
        
        let edgeLength = length * 0.8
        
        drawEdgeHandle(at: NSPoint(x: rect.midX, y: rect.maxY),
                      isHorizontal: true,
                      length: edgeLength,
                      thickness: thickness)
        
        drawEdgeHandle(at: NSPoint(x: rect.midX, y: rect.minY),
                      isHorizontal: true,
                      length: edgeLength,
                      thickness: thickness)
        
        drawEdgeHandle(at: NSPoint(x: rect.minX, y: rect.midY),
                      isHorizontal: false,
                      length: edgeLength,
                      thickness: thickness)
        
        drawEdgeHandle(at: NSPoint(x: rect.maxX, y: rect.midY),
                      isHorizontal: false,
                      length: edgeLength,
                      thickness: thickness)
    }
    
    private func drawCornerHandle(at point: NSPoint,
                                  horizontal: (dx: CGFloat, length: CGFloat),
                                  vertical: (dy: CGFloat, length: CGFloat),
                                  thickness: CGFloat) {
        let hPath = NSBezierPath()
        hPath.lineWidth = thickness
        hPath.lineCapStyle = .round
        hPath.move(to: point)
        hPath.line(to: NSPoint(x: point.x + horizontal.dx * horizontal.length, y: point.y))
        hPath.stroke()
        
        let vPath = NSBezierPath()
        vPath.lineWidth = thickness
        vPath.lineCapStyle = .round
        vPath.move(to: point)
        vPath.line(to: NSPoint(x: point.x, y: point.y + vertical.dy * vertical.length))
        vPath.stroke()
    }
    
    private func drawEdgeHandle(at point: NSPoint,
                                isHorizontal: Bool,
                                length: CGFloat,
                                thickness: CGFloat) {
        let path = NSBezierPath()
        path.lineWidth = thickness
        path.lineCapStyle = .round
        
        if isHorizontal {
            path.move(to: NSPoint(x: point.x - length / 2, y: point.y))
            path.line(to: NSPoint(x: point.x + length / 2, y: point.y))
        } else {
            path.move(to: NSPoint(x: point.x, y: point.y - length / 2))
            path.line(to: NSPoint(x: point.x, y: point.y + length / 2))
        }
        
        path.stroke()
    }
    
    private func drawInstructionPrompt() {
        let text = "Please select an area to begin"
        
        let font = NSFont.systemFont(ofSize: 16, weight: .medium)
        let textAttributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.black
        ]
        
        let textSize = text.size(withAttributes: textAttributes)
        let padding: CGFloat = 16
        let cornerRadius: CGFloat = 10
        
        let boxWidth = textSize.width + padding * 2
        let boxHeight = textSize.height + padding * 2
        
        let boxRect = NSRect(
            x: bounds.midX - boxWidth / 2,
            y: bounds.midY - boxHeight / 2,
            width: boxWidth,
            height: boxHeight
        )
        
        NSColor.white.setFill()
        let boxPath = NSBezierPath(roundedRect: boxRect, xRadius: cornerRadius, yRadius: cornerRadius)
        boxPath.fill()
        
        let textPoint = NSPoint(
            x: boxRect.midX - textSize.width / 2,
            y: boxRect.midY - textSize.height / 2
        )
        text.draw(at: textPoint, withAttributes: textAttributes)
    }
    
    private func drawDimensionLabel(for rect: NSRect) {
        let width = Int(rect.width)
        let height = Int(rect.height)
        let dimensionText = "\(width) x \(height)"
        
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: .medium),
            .foregroundColor: NSColor.white,
            .backgroundColor: NSColor.black.withAlphaComponent(0.7)
        ]
        
        let textSize = dimensionText.size(withAttributes: attributes)
        let textRect = NSRect(
            x: rect.midX - textSize.width / 2,
            y: rect.maxY + 8,
            width: textSize.width + 8,
            height: textSize.height + 4
        )
        
        NSColor.black.withAlphaComponent(0.7).setFill()
        let bgRect = NSRect(
            x: textRect.origin.x - 4,
            y: textRect.origin.y - 2,
            width: textRect.width,
            height: textRect.height
        )
        NSBezierPath(roundedRect: bgRect, xRadius: 4, yRadius: 4).fill()
        
        dimensionText.draw(at: NSPoint(x: bgRect.origin.x + 4, y: bgRect.origin.y + 2), withAttributes: attributes)
    }
    
    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        
        if isSelectionComplete, let rect = normalizedSelectionRect() {
            activeHandle = hitTestHandle(at: point)
            
            if activeHandle != .none {
                isResizing = true
                NSCursor.closedHand.set()
                return
            }
            
            if rect.contains(point) {
                isDragging = true
                dragOffset = NSPoint(x: point.x - rect.origin.x, y: point.y - rect.origin.y)
                NSCursor.closedHand.set()
                return
            }
            
            isSelectionComplete = false
            selectionRect = nil
        }
        
        startPoint = point
        currentPoint = point
        needsDisplay = true
    }
    
    override func mouseDragged(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        
        if isDragging, var rect = selectionRect {
            let newX = max(0, min(bounds.width - rect.width, point.x - dragOffset.x))
            let newY = max(0, min(bounds.height - rect.height, point.y - dragOffset.y))
            rect.origin = NSPoint(x: newX, y: newY)
            selectionRect = rect
            needsDisplay = true
            onSelectionChanged?(rect)
            return
        }
        
        if isResizing, var rect = selectionRect {
            let minSize: CGFloat = 20
            
            switch activeHandle {
            case .topLeft:
                let newX = min(point.x, rect.maxX - minSize)
                let newMaxY = max(point.y, rect.minY + minSize)
                rect = NSRect(x: newX, y: rect.minY, width: rect.maxX - newX, height: newMaxY - rect.minY)
            case .topRight:
                let newWidth = max(minSize, point.x - rect.minX)
                let newMaxY = max(point.y, rect.minY + minSize)
                rect = NSRect(x: rect.minX, y: rect.minY, width: newWidth, height: newMaxY - rect.minY)
            case .bottomLeft:
                let newX = min(point.x, rect.maxX - minSize)
                let newY = min(point.y, rect.maxY - minSize)
                rect = NSRect(x: newX, y: newY, width: rect.maxX - newX, height: rect.maxY - newY)
            case .bottomRight:
                let newWidth = max(minSize, point.x - rect.minX)
                let newHeight = max(minSize, rect.maxY - point.y)
                rect = NSRect(x: rect.minX, y: point.y, width: newWidth, height: newHeight)
            case .top:
                let newMaxY = max(point.y, rect.minY + minSize)
                rect = NSRect(x: rect.minX, y: rect.minY, width: rect.width, height: newMaxY - rect.minY)
            case .bottom:
                let newY = min(point.y, rect.maxY - minSize)
                rect = NSRect(x: rect.minX, y: newY, width: rect.width, height: rect.maxY - newY)
            case .left:
                let newX = min(point.x, rect.maxX - minSize)
                rect = NSRect(x: newX, y: rect.minY, width: rect.maxX - newX, height: rect.height)
            case .right:
                let newWidth = max(minSize, point.x - rect.minX)
                rect = NSRect(x: rect.minX, y: rect.minY, width: newWidth, height: rect.height)
            case .none:
                break
            }
            
            if let ratio = aspectRatio {
                let anchor = anchorForHandle(activeHandle)
                rect = adjustRectToAspectRatio(rect, ratio: ratio, anchor: anchor)
            }
            
            selectionRect = rect
            needsDisplay = true
            onSelectionChanged?(rect)
            return
        }
        
        currentPoint = point
        needsDisplay = true
    }
    
    override func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        
        if isDragging {
            isDragging = false
            if let rect = selectionRect {
                onSelectionChanged?(rect)
                if rect.contains(point) {
                    NSCursor.openHand.set()
                }
            }
            return
        }
        
        if isResizing {
            isResizing = false
            activeHandle = .none
            if let rect = selectionRect {
                onSelectionChanged?(rect)
                let handle = hitTestHandle(at: point)
                if handle != .none {
                    cursorForHandle(handle).set()
                } else if rect.contains(point) {
                    NSCursor.openHand.set()
                }
            }
            return
        }
        
        guard let start = startPoint, let current = currentPoint else {
            onSelectionCancelled?()
            return
        }
        
        let rect = NSRect(
            x: min(start.x, current.x),
            y: min(start.y, current.y),
            width: abs(current.x - start.x),
            height: abs(current.y - start.y)
        )
        
        if rect.width > 10 && rect.height > 10 {
            var finalRect = rect
            if let ratio = aspectRatio {
                finalRect = adjustRectToAspectRatio(rect, ratio: ratio, anchor: .center)
            }
            selectionRect = finalRect
            isSelectionComplete = true
            startPoint = nil
            currentPoint = nil
            
            needsDisplay = true
            displayIfNeeded()
            
            NSCursor.openHand.set()
            
            onInitialSelectionComplete?(finalRect)
        } else {
            onSelectionCancelled?()
        }
    }
    
    override func mouseMoved(with event: NSEvent) {
        guard isSelectionComplete, let rect = selectionRect else { return }
        
        let point = convert(event.locationInWindow, from: nil)
        let handle = hitTestHandle(at: point)
        
        if handle != .none {
            cursorForHandle(handle).set()
        } else if rect.contains(point) {
            NSCursor.openHand.set()
        } else {
            NSCursor.crosshair.set()
        }
    }
    
    override func mouseEntered(with event: NSEvent) {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if !isSelectionComplete {
            NSCursor.crosshair.set()
        }
    }
    
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 {
            onSelectionCancelled?()
        }
    }
    
    override var acceptsFirstResponder: Bool { true }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        return true
    }
    
    override func resetCursorRects() {
        super.resetCursorRects()
        addCursorRect(bounds, cursor: .crosshair)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        
        for area in trackingAreas {
            removeTrackingArea(area)
        }
        
        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseMoved, .mouseEnteredAndExited],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
    }
    
    func updateSelection(_ rect: NSRect) {
        selectionRect = rect
        isSelectionComplete = true
        needsDisplay = true
    }
}

private class SelectionWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    override init(
        contentRect: NSRect,
        styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType,
        defer flag: Bool
    ) {
        super.init(contentRect: contentRect, styleMask: style, backing: backingStoreType, defer: flag)
        self.acceptsMouseMovedEvents = true
    }
}

private class AreaSelector {
    var windows: [SelectionWindow] = []
    var overlayViews: [NSScreen: SelectionOverlayView] = [:]
    var currentScreen: NSScreen?
    var currentRect: NSRect?
    var isHidden = false
    
    var onSelectionChanged: ((NSRect, NSScreen) -> Void)?
    var onInitialSelectionComplete: ((NSRect, NSScreen) -> Void)?
    var onCancel: (() -> Void)?
    
    func start(fullscreen: Bool = false, targetDisplayId: CGDirectDisplayID? = nil, presetBounds: NSRect? = nil, showPrompt: Bool = true, simpleStyle: Bool = false) {
        let targetScreen: NSScreen? = {
            if let displayId = targetDisplayId {
                return NSScreen.screens.first { screen in
                    guard let screenNumber = screen.deviceDescription[
                        NSDeviceDescriptionKey("NSScreenNumber")
                    ] as? CGDirectDisplayID else {
                        return false
                    }
                    return screenNumber == displayId
                }
            }
            return NSScreen.main
        }()

        let screensToShow: [NSScreen] = (fullscreen && targetDisplayId != nil && targetScreen != nil)
            ? [targetScreen!]
            : NSScreen.screens

        for screen in screensToShow {
            let window = SelectionWindow(
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

            let viewBounds = NSRect(x: 0, y: 0, width: screen.frame.width, height: screen.frame.height)
            let overlayView = SelectionOverlayView(frame: viewBounds)
            overlayView.configure(showPrompt: showPrompt, simpleStyle: simpleStyle)

            overlayView.onInitialSelectionComplete = { [weak self] rect in
                self?.currentScreen = screen
                self?.currentRect = rect
                self?.handleInitialSelection(rect: rect, screen: screen)
            }

            overlayView.onSelectionChanged = { [weak self] rect in
                self?.currentRect = rect
                self?.handleSelectionChanged(rect: rect, screen: screen)
            }

            overlayView.onSelectionCancelled = { [weak self] in
                self?.cancelSelection()
            }

            window.contentView = overlayView
            window.makeKeyAndOrderFront(nil)
            window.makeFirstResponder(overlayView)

            windows.append(window)
            overlayViews[screen] = overlayView

            if fullscreen && screen == targetScreen {
                let fullRect = viewBounds
                overlayView.selectionRect = fullRect
                overlayView.isSelectionComplete = true
                overlayView.needsDisplay = true
                currentScreen = screen
                currentRect = fullRect

                DispatchQueue.main.async { [weak self] in
                    self?.handleInitialSelection(rect: fullRect, screen: screen)
                }
            }
            
            if let preset = presetBounds, screen == targetScreen {
                let mainScreenHeight = NSScreen.screens.first?.frame.height ?? 0
                let screenFrame = screen.frame
                
                let cocoaY = mainScreenHeight - preset.origin.y - preset.height
                
                let localRect = NSRect(
                    x: preset.origin.x - screenFrame.origin.x,
                    y: cocoaY - screenFrame.origin.y,
                    width: preset.width,
                    height: preset.height
                )
                
                overlayView.selectionRect = localRect
                overlayView.isSelectionComplete = true
                overlayView.needsDisplay = true
                currentScreen = screen
                currentRect = localRect
                
                DispatchQueue.main.async { [weak self] in
                    self?.handleInitialSelection(rect: localRect, screen: screen)
                }
            }
        }

        NSApp.activate(ignoringOtherApps: true)
        
        for window in windows {
            window.invalidateCursorRects(for: window.contentView!)
        }

        let cursor: NSCursor = fullscreen ? .openHand : .crosshair
        cursor.push()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            cursor.set()
        }
    }
    
    func handleInitialSelection(rect: NSRect, screen: NSScreen) {
        hideOtherScreens(except: screen)
        onInitialSelectionComplete?(rect, screen)
    }

    func hideOtherScreens(except activeScreen: NSScreen) {
        for (screen, view) in overlayViews {
            if screen != activeScreen {
                if let window = windows.first(where: { $0.contentView == view }) {
                    window.orderOut(nil)
                }
            }
        }
    }
    
    func handleSelectionChanged(rect: NSRect, screen: NSScreen) {
        onSelectionChanged?(rect, screen)
    }
    
    func cancelSelection() {
        cleanup()
        onCancel?()
    }
    
    func confirmSelection() -> (rect: NSRect, screen: NSScreen)? {
        guard let rect = currentRect, let screen = currentScreen else { return nil }
        cleanup()
        return (rect, screen)
    }
    
    func cleanup() {
        for window in windows {
            window.contentView = nil
            window.orderOut(nil)
            window.close()
        }
        windows.removeAll()
        overlayViews.removeAll()
        NSCursor.pop()
        NSCursor.arrow.set()
    }
    
    func updateSelection(x: Int, y: Int, width: Int, height: Int) {
        guard let screen = currentScreen, let view = overlayViews[screen] else { return }
        
        let mainScreenHeight = NSScreen.screens.first?.frame.height ?? 0
        let cocoaY = mainScreenHeight - CGFloat(y) - CGFloat(height)
        
        let globalRect = NSRect(
            x: CGFloat(x),
            y: cocoaY,
            width: CGFloat(width),
            height: CGFloat(height)
        )
        
        let localRect = NSRect(
            x: globalRect.origin.x - screen.frame.origin.x,
            y: globalRect.origin.y - screen.frame.origin.y,
            width: globalRect.width,
            height: globalRect.height
        )
        
        currentRect = localRect
        view.updateSelection(localRect)
    }
    
    func hide() {
        guard !isHidden else { return }
        isHidden = true
        for window in windows {
            window.alphaValue = 0
            window.ignoresMouseEvents = true
            window.orderOut(nil)
        }
        NSCursor.arrow.set()
    }
    
    func show() {
        guard isHidden else { return }
        isHidden = false
        for window in windows {
            window.alphaValue = 1
            window.ignoresMouseEvents = false
            window.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
    }
    
    func setAspectRatio(_ ratio: Double?) {
        for (_, view) in overlayViews {
            view.setAspectRatio(ratio)
        }
    }
}
