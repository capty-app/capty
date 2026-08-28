import Cocoa
import Foundation
import QuartzCore

class ScrollCaptureModule: Module {
    let name = "scroll-capture"
    
    private var panel: FloatingPanel?
    private var contentView: ScrollCaptureControlView?
    private var boundaryWindow: NSWindow?
    private var previewWindow: NSPanel?
    private var previewView: ScrollCapturePreviewView?
    private var previewImage: CGImage?
    
    private var captureArea: NSRect = .zero
    private var displayId: CGDirectDisplayID = CGMainDisplayID()
    private var targetScreen: NSScreen?
    private var capturedFrames: [CapturedFrame] = []
    private var isCapturing = false
    private var isAutoScrolling = false
    private var autoScrollTimer: Timer?
    private var cursorMonitorTimer: Timer?
    private var isCursorOutside = false
    private var autoScrollSpeed: ScrollSpeed = .medium
    private var maxHeight: Int = 20000
    private var lastFrameHash: Int = 0
    private var duplicateFrameCount: Int = 0
    private var currentScrollStep: Int = 0
    private var scrollDeltaPerStep: Int32 = 0
    private var scrollStepPoints: Int = 0
    private var scrollStepRemainder: Int32 = 0
    private var scrollStepsPerFrame: Int = 0
    
    private let frameOverlapRatio: CGFloat = 0.3
    private let maxDuplicateFrames = 3
    
    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "start":
            handleStart(params: params, requestId: requestId)
        case "startAutoScroll":
            handleStartAutoScroll(params: params, requestId: requestId)
        case "stopAutoScroll":
            handleStopAutoScroll(requestId: requestId)
        case "captureFrame":
            handleCaptureFrame(requestId: requestId)
        case "finish":
            handleFinish(params: params, requestId: requestId)
        case "cancel":
            handleCancel(requestId: requestId)
        case "status":
            handleStatus(requestId: requestId)
        case "hide":
            handleHide(requestId: requestId)
        case "show":
            handleShow(requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }
    
    private func handleStart(params: [String: AnyCodable]?, requestId: String) {
        guard let x = params?["x"]?.int(),
              let y = params?["y"]?.int(),
              let width = params?["width"]?.int(),
              let height = params?["height"]?.int() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "start requires x, y, width, height")
            return
        }
        
        if let display = params?["displayId"]?.int() {
            displayId = CGDirectDisplayID(display)
        }
        
        targetScreen = screenForDisplayId(displayId)
        
        if let speed = params?["autoScrollSpeed"]?.string() {
            autoScrollSpeed = ScrollSpeed(rawValue: speed) ?? .medium
        }
        
        if let max = params?["maxHeight"]?.int() {
            maxHeight = max
        }
        
        let screen = targetScreen ?? NSScreen.main ?? NSScreen.screens.first!
        let screenFrame = screen.frame
        let cocoaY = screenFrame.maxY - CGFloat(y) - CGFloat(height)
        
        captureArea = NSRect(x: CGFloat(x), y: cocoaY, width: CGFloat(width), height: CGFloat(height))
        capturedFrames.removeAll()
        isCapturing = true
        lastFrameHash = 0
        duplicateFrameCount = 0
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.showBoundaryOverlay()
            self.showControlPanel()
            self.respond(id: requestId, result: ["started": true])
        }
    }
    
    private func handleStartAutoScroll(params: [String: AnyCodable]?, requestId: String) {
        guard isCapturing else {
            respondError(id: requestId, code: "NOT_CAPTURING", message: "Not in capture mode")
            return
        }
        
        if let speed = params?["speed"]?.string() {
            autoScrollSpeed = ScrollSpeed(rawValue: speed) ?? autoScrollSpeed
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.startAutoScroll()
            self.respond(id: requestId, result: ["autoScrolling": true])
        }
    }
    
    private func handleStopAutoScroll(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopAutoScroll()
            self.respond(id: requestId, result: ["autoScrolling": false])
        }
    }
    
    private func handleCaptureFrame(requestId: String) {
        guard isCapturing else {
            respondError(id: requestId, code: "NOT_CAPTURING", message: "Not in capture mode")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let frameIndex = self.captureCurrentFrame()
            self.respond(id: requestId, result: [
                "captured": true,
                "frameCount": self.capturedFrames.count,
                "frameIndex": frameIndex ?? -1
            ])
        }
    }
    
    private func handleFinish(params: [String: AnyCodable]?, requestId: String) {
        guard let outputPath = params?["outputPath"]?.string() else {
            respondError(id: requestId, code: "INVALID_PARAMS", message: "finish requires outputPath")
            return
        }
        
        guard isCapturing else {
            respondError(id: requestId, code: "NOT_CAPTURING", message: "Not in capture mode")
            return
        }
        
        stopAutoScroll()
        
        let frameCount = capturedFrames.count
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let result = self.stitchFrames(outputPath: outputPath)
            
            DispatchQueue.main.async {
                self.cleanup()
                
                if let (width, height) = result {
                    self.respond(id: requestId, result: [
                        "success": true,
                        "outputPath": outputPath,
                        "width": width,
                        "height": height,
                        "frameCount": frameCount
                    ])
                } else {
                    self.respondError(id: requestId, code: "STITCH_ERROR", message: "Failed to stitch frames")
                }
            }
        }
    }
    
    private func handleCancel(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopAutoScroll()
            self.cleanup()
            self.emit(event: "cancelled")
            self.respond(id: requestId, result: ["cancelled": true])
        }
    }
    
    private func handleStatus(requestId: String) {
        let estimatedHeight = calculateEstimatedHeight()
        respond(id: requestId, result: [
            "isCapturing": isCapturing,
            "isAutoScrolling": isAutoScrolling,
            "frameCount": capturedFrames.count,
            "estimatedHeight": estimatedHeight
        ])
    }
    
    private func handleHide(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.panel?.orderOut(nil)
            self.boundaryWindow?.orderOut(nil)
            self.previewWindow?.orderOut(nil)
            self.respond(id: requestId, result: ["hidden": true])
        }
    }
    
    private func handleShow(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.panel?.makeKeyAndOrderFront(nil)
            self.boundaryWindow?.orderFront(nil)
            self.previewWindow?.orderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            self.respond(id: requestId, result: ["visible": true])
        }
    }
    
    private var previewSide: CGFloat = 1
    private var maxPreviewHeight: CGFloat = 0
    private let previewMaxWidth: CGFloat = 240
    private let previewGap: CGFloat = 16
    private let headerHeight: CGFloat = ScrollCapturePreviewView.headerHeight

    private func createPreviewWindow(imageWidth: Int, imageHeight: Int) {
        previewWindow?.orderOut(nil)

        let screen = targetScreen ?? NSScreen.main ?? NSScreen.screens.first!
        let screenFrame = screen.visibleFrame
        maxPreviewHeight = screenFrame.height * 0.75

        let spaceRight = screenFrame.maxX - captureArea.maxX
        let spaceLeft = captureArea.minX - screenFrame.minX
        previewSide = spaceRight >= spaceLeft ? 1 : -1

        let aspect = CGFloat(imageWidth) / CGFloat(imageHeight)
        let imageHeight = previewMaxWidth / aspect
        let windowHeight = min(imageHeight + headerHeight, maxPreviewHeight)
        let frame = previewFrame(height: windowHeight)

        let panel = NSPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.overlayWindow)) - 1)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hasShadow = true
        panel.sharingType = .none

        let view = ScrollCapturePreviewView(
            frame: NSRect(x: 0, y: 0, width: frame.width, height: frame.height)
        )
        panel.contentView = view
        panel.orderFront(nil)

        previewWindow = panel
        previewView = view
    }

    private func previewFrame(height: CGFloat) -> NSRect {
        let x: CGFloat
        if previewSide > 0 {
            x = captureArea.maxX + previewGap
        } else {
            x = captureArea.minX - previewMaxWidth - previewGap
        }
        let y = captureArea.maxY - height
        return NSRect(x: x, y: y, width: previewMaxWidth, height: height)
    }

    private func resizePreviewWindow(imageWidth: Int, imageHeight: Int) {
        guard let window = previewWindow else { return }

        let aspect = CGFloat(imageWidth) / CGFloat(imageHeight)
        let imageHeight = previewMaxWidth / aspect
        let windowHeight = min(imageHeight + headerHeight, maxPreviewHeight)

        guard windowHeight > window.frame.height else { return }

        let frame = previewFrame(height: windowHeight)
        window.setFrame(frame, display: true, animate: false)
        previewView?.frame = NSRect(x: 0, y: 0, width: frame.width, height: frame.height)
    }

    private func updatePreviewImage() {
        guard capturedFrames.count > 0 else { return }

        if capturedFrames.count == 1 {
            let image = capturedFrames[0].image
            previewImage = image
            createPreviewWindow(imageWidth: image.width, imageHeight: image.height)
            previewView?.updatePreview(image: image, frameCount: 1)
            return
        }

        let latestFrame = capturedFrames.last!
        guard let previousImage = previewImage else { return }

        let frameWidth = previousImage.width
        let pixelScale = CGFloat(latestFrame.image.height) / captureArea.height
        let scrollStepPixels = Int(CGFloat(scrollStepPoints) * pixelScale)
        let newContentHeight = min(latestFrame.image.height, scrollStepPixels)

        guard newContentHeight > 0 else { return }

        let cropRect = CGRect(
            x: 0,
            y: 0,
            width: latestFrame.image.width,
            height: newContentHeight
        )
        guard let croppedNew = latestFrame.image.cropping(to: cropRect) else { return }

        let totalHeight = previousImage.height + newContentHeight

        guard let context = CGContext(
            data: nil,
            width: frameWidth,
            height: totalHeight,
            bitsPerComponent: 8,
            bytesPerRow: frameWidth * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return }

        context.draw(previousImage, in: CGRect(
            x: 0,
            y: newContentHeight,
            width: previousImage.width,
            height: previousImage.height
        ))

        context.draw(croppedNew, in: CGRect(
            x: 0,
            y: 0,
            width: croppedNew.width,
            height: newContentHeight
        ))

        guard let stitched = context.makeImage() else { return }
        previewImage = stitched

        resizePreviewWindow(imageWidth: stitched.width, imageHeight: stitched.height)
        previewView?.updatePreview(image: stitched, frameCount: capturedFrames.count)
    }

    private func showBoundaryOverlay() {
        boundaryWindow?.orderOut(nil)
        
        let padding: CGFloat = 2
        let windowFrame = NSRect(
            x: captureArea.origin.x - padding,
            y: captureArea.origin.y - padding,
            width: captureArea.width + padding * 2,
            height: captureArea.height + padding * 2
        )
        
        let window = NSWindow(
            contentRect: windowFrame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.overlayWindow)) - 2)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.ignoresMouseEvents = true
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.hasShadow = false
        window.sharingType = .none
        window.isReleasedWhenClosed = false
        
        let boundaryView = ScrollCaptureBoundaryView(frame: NSRect(origin: .zero, size: windowFrame.size))
        window.contentView = boundaryView
        window.orderFront(nil)
        
        boundaryWindow = window
    }
    
    private func showControlPanel() {
        panel?.orderOut(nil)
        
        let panelWidth: CGFloat = 192
        let panelHeight: CGFloat = 48
        let panelGap: CGFloat = 16
        
        let screen = targetScreen ?? NSScreen.main ?? NSScreen.screens.first!
        let screenFrame = screen.visibleFrame
        
        let panelX = captureArea.midX - panelWidth / 2
        let preferredY = captureArea.minY - panelHeight - panelGap
        
        let panelY: CGFloat
        if preferredY >= screenFrame.minY {
            panelY = preferredY
        } else {
            panelY = captureArea.minY + panelGap
        }
        
        var config = FloatingPanelConfig()
        config.escapeToClose = true
        config.onEscape = { [weak self] in
            self?.stopAutoScroll()
            self?.cleanup()
            self?.emit(event: "cancelled")
        }
        
        panel = FloatingPanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
            config: config
        )
        
        contentView = ScrollCaptureControlView(
            frame: NSRect(x: 0, y: 0, width: panelWidth, height: panelHeight),
            callbacks: ScrollCaptureCallbacks(
                onToggleAutoScroll: { [weak self] in
                    guard let self = self else { return }
                    if self.isAutoScrolling {
                        self.stopAutoScroll()
                    } else {
                        self.startAutoScroll()
                    }
                },
                onDone: { [weak self] in
                    self?.emit(event: "done")
                },
                onCancel: { [weak self] in
                    self?.stopAutoScroll()
                    self?.cleanup()
                    self?.emit(event: "cancelled")
                }
            )
        )
        
        panel?.setThemedContentView(contentView!)
        panel?.makeKeyAndOrderFront(nil)
        panel?.makeFirstResponder(contentView)
        
        NSApp.activate(ignoringOtherApps: true)
    }
    
    private func startAutoScroll() {
        guard !isAutoScrolling else { return }
        
        isAutoScrolling = true
        isCursorOutside = false
        contentView?.setAutoScrolling(true)
        currentScrollStep = 0
        
        let frameHeight = Int(captureArea.height)
        scrollStepPoints = max(1, Int(Double(frameHeight) * (1.0 - frameOverlapRatio)))
        scrollStepsPerFrame = max(1, min(autoScrollSpeed.scrollStepsPerFrame, scrollStepPoints))

        let stepAmount = max(1, scrollStepPoints / scrollStepsPerFrame)
        scrollDeltaPerStep = -Int32(stepAmount)
        scrollStepRemainder = -Int32(scrollStepPoints - (stepAmount * scrollStepsPerFrame))
        
        warpCursorToCaptureCenter()
        captureCurrentFrame()
        startCursorMonitor()
        
        let interval = autoScrollSpeed.stepInterval
        autoScrollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.performAutoScrollStep()
        }
    }
    
    private func stopAutoScroll() {
        isAutoScrolling = false
        isCursorOutside = false
        autoScrollTimer?.invalidate()
        autoScrollTimer = nil
        stopCursorMonitor()
        contentView?.setAutoScrolling(false)
        if let boundaryView = boundaryWindow?.contentView as? ScrollCaptureBoundaryView {
            boundaryView.showReturnMessage(false)
        }
    }
    
    private func performAutoScrollStep() {
        guard !isCursorOutside else { return }
        
        let stepsPerFrame = scrollStepsPerFrame
        let isFinalStep = currentScrollStep == stepsPerFrame - 1
        let delta = isFinalStep ? scrollDeltaPerStep + scrollStepRemainder : scrollDeltaPerStep
        simulateScroll(delta: delta)
        currentScrollStep += 1

        guard currentScrollStep >= stepsPerFrame else { return }

        currentScrollStep = 0
        autoScrollTimer?.invalidate()
        autoScrollTimer = nil

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self = self, self.isAutoScrolling else { return }

            let frameIndex = self.captureCurrentFrame()

            if frameIndex == nil {
                self.stopAutoScroll()
                self.emit(event: "scroll-ended", data: [
                    "reason": "duplicate",
                    "frameCount": self.capturedFrames.count
                ])
                return
            }

            let estimatedHeight = self.calculateEstimatedHeight()
            if estimatedHeight >= self.maxHeight {
                self.stopAutoScroll()
                self.emit(event: "scroll-ended", data: [
                    "reason": "max-height",
                    "frameCount": self.capturedFrames.count,
                    "estimatedHeight": estimatedHeight
                ])
                return
            }

            self.emit(event: "frame-captured", data: [
                "frameCount": self.capturedFrames.count,
                "estimatedHeight": estimatedHeight
            ])

            let interval = self.autoScrollSpeed.stepInterval
            self.autoScrollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                self?.performAutoScrollStep()
            }
        }
    }
    
    private func warpCursorToCaptureCenter() {
        let screen = targetScreen ?? NSScreen.main ?? NSScreen.screens.first!
        let centerX = captureArea.midX
        let centerY = screen.frame.maxY - captureArea.midY
        CGWarpMouseCursorPosition(CGPoint(x: centerX, y: centerY))
    }
    
    private func isCursorInsideCaptureArea() -> Bool {
        let mouseLocation = NSEvent.mouseLocation
        return captureArea.contains(mouseLocation)
    }
    
    private func startCursorMonitor() {
        stopCursorMonitor()
        cursorMonitorTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.checkCursorPosition()
        }
    }
    
    private func stopCursorMonitor() {
        cursorMonitorTimer?.invalidate()
        cursorMonitorTimer = nil
    }
    
    private func checkCursorPosition() {
        guard isAutoScrolling else { return }
        
        let isInside = isCursorInsideCaptureArea()
        
        guard isInside != !isCursorOutside else { return }
        
        isCursorOutside = !isInside
        
        if let boundaryView = boundaryWindow?.contentView as? ScrollCaptureBoundaryView {
            boundaryView.showReturnMessage(isCursorOutside)
        }
    }
    
    private func simulateScroll(delta: Int32) {
        let mouseLocation = NSEvent.mouseLocation
        let screen = targetScreen ?? NSScreen.main ?? NSScreen.screens.first!
        let cgMouseY = screen.frame.maxY - mouseLocation.y
        let cgPoint = CGPoint(x: mouseLocation.x, y: cgMouseY)
        
        if let scrollEvent = CGEvent(scrollWheelEvent2Source: nil,
                                      units: .pixel,
                                      wheelCount: 1,
                                      wheel1: delta,
                                      wheel2: 0,
                                      wheel3: 0) {
            scrollEvent.location = cgPoint
            scrollEvent.post(tap: .cghidEventTap)
        }
    }
    
    @discardableResult
    private func captureCurrentFrame() -> Int? {
        let screen = targetScreen ?? NSScreen.main ?? NSScreen.screens.first!
        let captureRect = CGRect(
            x: captureArea.origin.x,
            y: screen.frame.maxY - captureArea.origin.y - captureArea.height,
            width: captureArea.width,
            height: captureArea.height
        )
        
        CGDisplayHideCursor(displayId)
        
        let cgImage = CGWindowListCreateImage(
            captureRect,
            .optionOnScreenOnly,
            kCGNullWindowID,
            [.bestResolution, .boundsIgnoreFraming]
        )
        
        CGDisplayShowCursor(displayId)
        
        guard let cgImage = cgImage else {
            return nil
        }
        
        let frameHash = computeFrameHash(cgImage)
        
        if frameHash == lastFrameHash {
            duplicateFrameCount += 1
            if duplicateFrameCount >= maxDuplicateFrames {
                return nil
            }
            return capturedFrames.count - 1
        }
        
        duplicateFrameCount = 0
        lastFrameHash = frameHash
        
        let frame = CapturedFrame(
            image: cgImage,
            index: capturedFrames.count
        )
        capturedFrames.append(frame)

        updatePreviewImage()

        return frame.index
    }
    
    private func computeFrameHash(_ image: CGImage) -> Int {
        let sampleWidth = 100
        let sampleHeight = 50
        
        guard let context = CGContext(
            data: nil,
            width: sampleWidth,
            height: sampleHeight,
            bitsPerComponent: 8,
            bytesPerRow: sampleWidth * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return 0
        }
        
        let bottomRect = CGRect(
            x: 0,
            y: 0,
            width: image.width,
            height: min(image.height / 4, 100)
        )
        
        guard let croppedImage = image.cropping(to: bottomRect) else {
            return 0
        }
        
        context.draw(croppedImage, in: CGRect(x: 0, y: 0, width: sampleWidth, height: sampleHeight))
        
        guard let data = context.data else { return 0 }
        let buffer = data.bindMemory(to: UInt8.self, capacity: sampleWidth * sampleHeight * 4)
        
        var hash = 0
        let strideAmount = 16
        for i in Swift.stride(from: 0, to: sampleWidth * sampleHeight * 4, by: strideAmount) {
            hash = hash &* 31 &+ Int(buffer[i])
        }
        
        return hash
    }
    
    private func calculateEstimatedHeight() -> Int {
        guard capturedFrames.count > 0 else { return 0 }

        let frameHeight = Int(captureArea.height)
        return frameHeight + (capturedFrames.count - 1) * scrollStepPoints
    }
    
    private func stitchFrames(outputPath: String) -> (width: Int, height: Int)? {
        guard capturedFrames.count > 0 else { return nil }
        
        if capturedFrames.count == 1 {
            return saveSingleFrame(outputPath: outputPath)
        }
        
        let frameWidth = capturedFrames[0].image.width
        let frameHeight = capturedFrames[0].image.height

        let scale = CGFloat(frameHeight) / captureArea.height
        let scrollStepPixels = Int(CGFloat(scrollStepPoints) * scale)
        let clampedScrollStep = min(max(scrollStepPixels, 1), frameHeight)
        let expectedOverlapPixels = frameHeight - clampedScrollStep

        var overlaps = [Int]()
        for i in 1..<capturedFrames.count {
            let overlap = findOverlap(
                topFrame: capturedFrames[i - 1].image,
                bottomFrame: capturedFrames[i].image,
                expectedOverlap: expectedOverlapPixels
            )
            overlaps.append(overlap)
        }

        var totalHeight = frameHeight
        for i in 0..<overlaps.count {
            let newContent = capturedFrames[i + 1].image.height - overlaps[i]
            if newContent > 0 {
                totalHeight += newContent
            }
        }
        
        guard let context = CGContext(
            data: nil,
            width: frameWidth,
            height: totalHeight,
            bitsPerComponent: 8,
            bytesPerRow: frameWidth * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return nil
        }
        
        var currentY = totalHeight - frameHeight
        context.draw(capturedFrames[0].image, in: CGRect(x: 0, y: currentY, width: frameWidth, height: frameHeight))
        
        for i in 1..<capturedFrames.count {
            let frame = capturedFrames[i]
            let overlap = overlaps[i - 1]
            let newContentHeight = frame.image.height - overlap

            guard newContentHeight > 0 else { continue }

            let cropRect = CGRect(x: 0, y: overlap, width: frame.image.width, height: newContentHeight)
            guard let croppedImage = frame.image.cropping(to: cropRect) else { continue }

            currentY -= newContentHeight
            context.draw(croppedImage, in: CGRect(x: 0, y: currentY, width: frameWidth, height: newContentHeight))
        }
        
        guard let outputImage = context.makeImage() else { return nil }
        
        let url = URL(fileURLWithPath: outputPath)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, kUTTypePNG, 1, nil) else {
            return nil
        }
        
        CGImageDestinationAddImage(destination, outputImage, nil)
        
        if CGImageDestinationFinalize(destination) {
            return (width: frameWidth, height: totalHeight)
        }
        
        return nil
    }
    
    private func saveSingleFrame(outputPath: String) -> (width: Int, height: Int)? {
        guard let frame = capturedFrames.first else { return nil }
        
        let url = URL(fileURLWithPath: outputPath)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, kUTTypePNG, 1, nil) else {
            return nil
        }
        
        CGImageDestinationAddImage(destination, frame.image, nil)
        
        if CGImageDestinationFinalize(destination) {
            return (width: frame.image.width, height: frame.image.height)
        }
        
        return nil
    }

    private func findOverlap(topFrame: CGImage, bottomFrame: CGImage, expectedOverlap: Int) -> Int {
        let stripWidth = min(topFrame.width, 800)
        let stripHeight = 40

        guard let topStrip = extractBottomStrip(from: topFrame, height: stripHeight, width: stripWidth) else {
            return expectedOverlap
        }

        // Search a much wider range to handle Retina scaling issues or variable scroll speeds
        // We allow finding overlaps from very small (large scroll) to very large (small scroll)
        let minOverlap = stripHeight
        let maxOverlap = max(minOverlap, bottomFrame.height - stripHeight)

        var bestMatch = expectedOverlap
        var bestScore = Double.infinity
        
        let step = 4
        
        // Helper to update best match
        let checkMatch = { (overlap: Int, score: Double) in
            // If significant improvement
            if score < bestScore - 1.0 {
                bestScore = score
                bestMatch = overlap
            }
            // If rough tie, prefer the one closer to expectation
            else if abs(score - bestScore) <= 1.0 {
                if abs(overlap - expectedOverlap) < abs(bestMatch - expectedOverlap) {
                    bestMatch = overlap
                }
            }
        }

        // Coarse search
        for overlap in stride(from: minOverlap, through: maxOverlap, by: step) {
            guard let bottomStrip = extractTopStrip(from: bottomFrame, overlap: overlap, height: stripHeight, width: stripWidth) else {
                continue
            }

            let score = compareStrips(topStrip, bottomStrip)
            checkMatch(overlap, score)
        }

        // Fine search around best match
        let fineMin = max(minOverlap, bestMatch - step)
        let fineMax = min(maxOverlap, bestMatch + step)
        
        for overlap in fineMin...fineMax {
            guard let bottomStrip = extractTopStrip(from: bottomFrame, overlap: overlap, height: stripHeight, width: stripWidth) else {
                continue
            }

            let score = compareStrips(topStrip, bottomStrip)
            checkMatch(overlap, score)
        }

        return bestMatch
    }

    private func extractBottomStrip(from image: CGImage, height: Int, width: Int) -> [UInt8]? {
        let startX = (image.width - width) / 2
        let startY = image.height - height

        let rect = CGRect(x: startX, y: startY, width: width, height: height)
        guard let cropped = image.cropping(to: rect) else { return nil }

        return extractPixelData(from: cropped)
    }

    private func extractTopStrip(from image: CGImage, overlap: Int, height: Int, width: Int) -> [UInt8]? {
        let startX = (image.width - width) / 2
        let startY = overlap - height

        guard startY >= 0 else { return nil }

        let rect = CGRect(x: startX, y: startY, width: width, height: height)
        guard let cropped = image.cropping(to: rect) else { return nil }

        return extractPixelData(from: cropped)
    }

    private func extractPixelData(from image: CGImage) -> [UInt8]? {
        let width = image.width
        let height = image.height
        let bytesPerRow = width * 4

        var pixelData = [UInt8](repeating: 0, count: width * height * 4)

        guard let context = CGContext(
            data: &pixelData,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return nil
        }

        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        return pixelData
    }

    private func compareStrips(_ strip1: [UInt8], _ strip2: [UInt8]) -> Double {
        guard strip1.count == strip2.count else { return Double.infinity }

        var totalDiff: Int = 0
        let strideAmount = 4

        for i in Swift.stride(from: 0, to: strip1.count, by: strideAmount) {
            let r1 = Int(strip1[i])
            let g1 = Int(strip1[i + 1])
            let b1 = Int(strip1[i + 2])

            let r2 = Int(strip2[i])
            let g2 = Int(strip2[i + 1])
            let b2 = Int(strip2[i + 2])

            totalDiff += abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
        }

        return Double(totalDiff) / Double(strip1.count / strideAmount)
    }
    
    private func screenForDisplayId(_ displayId: CGDirectDisplayID) -> NSScreen? {
        return NSScreen.screens.first { screen in
            guard let screenNumber = screen.deviceDescription[
                NSDeviceDescriptionKey("NSScreenNumber")
            ] as? CGDirectDisplayID else {
                return false
            }
            return screenNumber == displayId
        }
    }
    
    private func cleanup() {
        stopAutoScroll()
        stopCursorMonitor()
        
        TooltipManager.shared.hide()
        panel?.orderOut(nil)
        panel = nil
        contentView = nil
        
        previewWindow?.orderOut(nil)
        previewWindow = nil
        previewView = nil
        previewImage = nil

        boundaryWindow?.orderOut(nil)
        boundaryWindow = nil
        
        capturedFrames.removeAll()
        isCapturing = false
        isCursorOutside = false
        lastFrameHash = 0
        duplicateFrameCount = 0
        currentScrollStep = 0
        scrollDeltaPerStep = 0
        scrollStepPoints = 0
        scrollStepRemainder = 0
        scrollStepsPerFrame = 0
        targetScreen = nil
    }
}

private struct CapturedFrame {
    let image: CGImage
    let index: Int
}


enum ScrollSpeed: String {
    case slow
    case medium
    case fast
    
    var scrollStepsPerFrame: Int {
        switch self {
        case .slow: return 10
        case .medium: return 6
        case .fast: return 3
        }
    }
    
    var stepInterval: TimeInterval {
        switch self {
        case .slow: return 0.04
        case .medium: return 0.03
        case .fast: return 0.02
        }
    }
}

struct ScrollCaptureCallbacks {
    var onToggleAutoScroll: (() -> Void)?
    var onDone: (() -> Void)?
    var onCancel: (() -> Void)?
}

private class ScrollCaptureControlView: BlurredPanelView {
    private static let buttonSize: CGFloat = 48
    
    private var callbacks: ScrollCaptureCallbacks
    private var buttons: [IconButton] = []
    private var separators: [VerticalSeparator] = []
    private var autoScrollButton: IconButton?
    private var isAutoScrolling = false
    
    private var trackingArea: NSTrackingArea?
    
    init(frame: NSRect, callbacks: ScrollCaptureCallbacks) {
        self.callbacks = callbacks
        super.init(frame: frame)
        setupContent()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupContent() {
        let buttonSize = Self.buttonSize
        var xOffset: CGFloat = 0
        
        autoScrollButton = IconButton(symbol: "arrow.down.circle", size: 16, tooltip: "Start Auto-Scroll")
        autoScrollButton?.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        autoScrollButton?.onClick = { [weak self] in
            self?.callbacks.onToggleAutoScroll?()
        }
        addSubview(autoScrollButton!)
        buttons.append(autoScrollButton!)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let doneButton = IconButton(symbol: "checkmark", size: 16, tooltip: "Done (Enter)")
        doneButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        doneButton.variant = .normal
        doneButton.onClick = { [weak self] in
            self?.callbacks.onDone?()
        }
        addSubview(doneButton)
        buttons.append(doneButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let cancelButton = IconButton(symbol: "xmark", size: 16, tooltip: "Cancel (Esc)")
        cancelButton.frame = NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize)
        cancelButton.onClick = { [weak self] in
            self?.callbacks.onCancel?()
        }
        addSubview(cancelButton)
        buttons.append(cancelButton)
        xOffset += buttonSize
        
        addSeparator(at: xOffset)
        
        let dragHandle = DragHandle(frame: NSRect(x: xOffset, y: 0, width: buttonSize, height: buttonSize))
        addSubview(dragHandle)
        
        applyTheme()
    }
    
    private func addSeparator(at x: CGFloat) {
        let separator = VerticalSeparator(height: 32, at: x)
        addSubview(separator)
        separators.append(separator)
    }
    
    func setAutoScrolling(_ scrolling: Bool) {
        isAutoScrolling = scrolling
        autoScrollButton?.setSymbol(scrolling ? "stop.circle" : "arrow.down.circle")
        autoScrollButton?.tooltipText = scrolling ? "Stop Auto-Scroll" : "Start Auto-Scroll"
    }
    
    
    override func applyTheme() {
        super.applyTheme()
        
        for button in buttons {
            button.applyTheme()
        }
        
        for separator in separators {
            separator.applyTheme()
        }
    }
    
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 36 {
            callbacks.onDone?()
        } else {
            super.keyDown(with: event)
        }
    }
    
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        
        if let existing = trackingArea {
            removeTrackingArea(existing)
        }
        
        trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea!)
    }
    
    override func mouseEntered(with event: NSEvent) {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    
    override func mouseExited(with event: NSEvent) {
        TooltipManager.shared.hide()
    }
    
    override var acceptsFirstResponder: Bool { true }
}

private class ScrollCaptureBoundaryView: NSView {
    private var returnMessageVisible = false
    private var messageLabel: NSTextField?
    private var messageBacking: NSView?
    
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        setupReturnMessage()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupReturnMessage() {
        let backing = NSView(frame: .zero)
        backing.wantsLayer = true
        backing.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.75).cgColor
        backing.layer?.cornerRadius = 8
        backing.isHidden = true
        addSubview(backing)
        messageBacking = backing
        
        let label = NSTextField(labelWithString: "Move cursor here to continue")
        label.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        label.textColor = .white
        label.alignment = .center
        label.isHidden = true
        addSubview(label)
        messageLabel = label
    }
    
    func showReturnMessage(_ show: Bool) {
        guard returnMessageVisible != show else { return }
        returnMessageVisible = show
        messageLabel?.isHidden = !show
        messageBacking?.isHidden = !show
        needsDisplay = true
        
        guard show else { return }
        layoutReturnMessage()
    }
    
    private func layoutReturnMessage() {
        guard let label = messageLabel, let backing = messageBacking else { return }
        label.sizeToFit()
        let padding: CGFloat = 12
        let backingWidth = label.frame.width + padding * 2
        let backingHeight = label.frame.height + padding
        let backingX = (bounds.width - backingWidth) / 2
        let backingY = (bounds.height - backingHeight) / 2
        backing.frame = NSRect(x: backingX, y: backingY, width: backingWidth, height: backingHeight)
        label.frame = NSRect(
            x: (bounds.width - label.frame.width) / 2,
            y: (bounds.height - label.frame.height) / 2,
            width: label.frame.width,
            height: label.frame.height
        )
    }
    
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        
        let borderPath = NSBezierPath(rect: bounds.insetBy(dx: 1, dy: 1))
        borderPath.lineWidth = 2
        
        let dashPattern: [CGFloat] = [6, 4]
        borderPath.setLineDash(dashPattern, count: 2, phase: 0)
        
        let borderColor: NSColor = returnMessageVisible ? .systemOrange : .systemBlue
        borderColor.withAlphaComponent(0.8).setStroke()
        borderPath.stroke()
        
        NSColor.systemBlue.withAlphaComponent(0.05).setFill()
        bounds.insetBy(dx: 2, dy: 2).fill()
    }
}
