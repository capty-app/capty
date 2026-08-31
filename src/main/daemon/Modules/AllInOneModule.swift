import Cocoa
import Foundation

class AllInOneModule: Module {
    let name = "all-in-one"

    private var panel: FloatingPanel?
    private var contentView: AllInOneContentView?
    private var keyMonitor: Any?
    private var currentAspectRatio: AspectRatio = .free
    private var currentSelectionWidth: Int = 0
    private var currentSelectionHeight: Int = 0

    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "show":
            handleShow(params: params, requestId: requestId)
        case "hide":
            handleHide(requestId: requestId)
        case "update":
            handleUpdate(params: params, requestId: requestId)
        case "focus":
            handleFocus(requestId: requestId)
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

        if let ratio = AspectRatio.all.first(where: { $0.width == ratioWidth && $0.height == ratioHeight }) {
            currentAspectRatio = ratio
        } else {
            currentAspectRatio = .free
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.contentView?.setAspectRatio(self.currentAspectRatio)
            self.respond(id: requestId, result: ["updated": true])
        }
    }

    private func handleShow(params: [String: AnyCodable]?, requestId: String) {
        let x = params?["x"]?.int() ?? 100
        let y = params?["y"]?.int() ?? 100
        let selectionWidth = params?["selectionWidth"]?.int()
        let selectionHeight = params?["selectionHeight"]?.int()

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.updateSelectionSize(width: selectionWidth, height: selectionHeight)
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
        let selectionWidth = params?["selectionWidth"]?.int()
        let selectionHeight = params?["selectionHeight"]?.int()

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.updateSelectionSize(width: selectionWidth, height: selectionHeight)
            self.updatePosition(x: x, y: y)
            self.respond(id: requestId, result: ["updated": true])
        }
    }

    private func handleFocus(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.focusPanel()
            self.respond(id: requestId, result: ["focused": true])
        }
    }

    private func handleStatus(requestId: String) {
        let isVisible = panel != nil && panel?.isVisible == true
        respond(id: requestId, result: ["visible": isVisible])
    }

    private func showPanel(x: Int, y: Int) {
        if panel != nil {
            updatePosition(x: x, y: y)
            contentView?.setSelectionSize(width: currentSelectionWidth, height: currentSelectionHeight)
            focusPanel()
            return
        }

        let width: CGFloat = 288
        let height: CGFloat = 48

        let mainScreenHeight = NSScreen.main?.frame.height ?? 0
        let cocoaY = mainScreenHeight - CGFloat(y) - height

        var config = FloatingPanelConfig()
        config.escapeToClose = true
        config.onEscape = { [weak self] in
            self?.emitCloseEvent()
        }

        panel = FloatingPanel(
            contentRect: NSRect(x: CGFloat(x), y: cocoaY, width: width, height: height),
            config: config
        )

        contentView = AllInOneContentView(
            frame: NSRect(x: 0, y: 0, width: width, height: height),
            onClose: { [weak self] in self?.emitCloseEvent() },
            onScreenshot: { [weak self] in self?.emitTerminalEvent("screenshot") },
            onRecord: { [weak self] in self?.emitTerminalEvent("record") },
            onSelectAspectRatio: { [weak self] ratio in self?.handleAspectRatioSelected(ratio) },
            onUpdateSize: { [weak self] width, height in self?.handleSizeUpdated(width: width, height: height) },
            onSizeEditorOpened: { [weak self] in self?.emitEvent("size-editor-opened") },
            onSizeEditorClosed: { [weak self] in self?.emitEvent("size-editor-closed") }
        )
        contentView?.setAspectRatio(currentAspectRatio)
        contentView?.setSelectionSize(width: currentSelectionWidth, height: currentSelectionHeight)

        panel?.setThemedContentView(contentView!)
        panel?.makeKeyAndOrderFront(nil)
        panel?.makeFirstResponder(contentView)

        setupKeyMonitor()

        NSApp.activate(ignoringOtherApps: true)
    }

    private func handleAspectRatioSelected(_ ratio: AspectRatio) {
        currentAspectRatio = ratio
        emit(event: "select-aspect-ratio", data: [
            "width": ratio.width,
            "height": ratio.height,
            "name": ratio.name
        ])
    }

    private func handleSizeUpdated(width: Int, height: Int) {
        currentSelectionWidth = width
        currentSelectionHeight = height
        emit(event: "update-size", data: [
            "width": width,
            "height": height
        ])
    }

    private func hidePanel() {
        removeKeyMonitor()
        TooltipManager.shared.hide()
        contentView?.closeSizePopover()
        panel?.ignoresMouseEvents = true
        panel?.contentView = nil
        panel?.orderOut(nil)
        panel?.close()
        panel = nil
        contentView = nil
    }

    private func updateSelectionSize(width: Int?, height: Int?) {
        if let width = width, width > 0 {
            currentSelectionWidth = width
        }

        if let height = height, height > 0 {
            currentSelectionHeight = height
        }

        contentView?.setSelectionSize(width: currentSelectionWidth, height: currentSelectionHeight)
    }

    private func updatePosition(x: Int, y: Int) {
        panel?.setPosition(x: x, y: y)
    }

    private func focusPanel() {
        panel?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func emitCloseEvent() {
        hidePanel()
        emit(event: "close")
    }

    private func emitEvent(_ event: String) {
        emit(event: event)
    }

    private func emitTerminalEvent(_ event: String) {
        hidePanel()
        emit(event: event)
    }

    private func setupKeyMonitor() {
        removeKeyMonitor()

        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                self?.emitCloseEvent()
                return nil
            }
            return event
        }
    }

    private func removeKeyMonitor() {
        if let monitor = keyMonitor {
            NSEvent.removeMonitor(monitor)
            keyMonitor = nil
        }
    }
}

private class AllInOneContentView: BlurredPanelView, NSPopoverDelegate {
    private var closeButton: IconButton!
    private var aspectRatioButton: AspectRatioButton!
    private var sizeButton: IconButton!
    private var screenshotButton: IconButton!
    private var recordButton: IconButton!
    private var dragHandle: DragHandle!
    private var separators: [VerticalSeparator] = []
    private var trackingArea: NSTrackingArea?
    private var sizePopover: NSPopover?
    private var sizeInputView: SizeInputPopoverView?
    private var selectionWidth: Int = 0
    private var selectionHeight: Int = 0

    private var onClose: (() -> Void)?
    private var onScreenshot: (() -> Void)?
    private var onRecord: (() -> Void)?
    private var onSelectAspectRatio: ((AspectRatio) -> Void)?
    private var onUpdateSize: ((Int, Int) -> Void)?
    private var onSizeEditorOpened: (() -> Void)?
    private var onSizeEditorClosed: (() -> Void)?

    init(
        frame: NSRect,
        onClose: @escaping () -> Void,
        onScreenshot: @escaping () -> Void,
        onRecord: @escaping () -> Void,
        onSelectAspectRatio: @escaping (AspectRatio) -> Void,
        onUpdateSize: @escaping (Int, Int) -> Void,
        onSizeEditorOpened: @escaping () -> Void,
        onSizeEditorClosed: @escaping () -> Void
    ) {
        self.onClose = onClose
        self.onScreenshot = onScreenshot
        self.onRecord = onRecord
        self.onSelectAspectRatio = onSelectAspectRatio
        self.onUpdateSize = onUpdateSize
        self.onSizeEditorOpened = onSizeEditorOpened
        self.onSizeEditorClosed = onSizeEditorClosed
        super.init(frame: frame)
        setupContent()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupContent()
    }

    func setAspectRatio(_ ratio: AspectRatio) {
        aspectRatioButton.setRatio(ratio)
    }

    func setSelectionSize(width: Int, height: Int) {
        selectionWidth = width
        selectionHeight = height
        sizeInputView?.setSize(width: width, height: height)
    }

    func closeSizePopover() {
        sizePopover?.performClose(nil)
    }

    private func setupContent() {
        let buttonWidth: CGFloat = 48
        let buttonHeight: CGFloat = 48

        closeButton = IconButton(symbol: "xmark", tooltip: "Close (Esc)")
        closeButton.frame = NSRect(x: 0, y: 0, width: buttonWidth, height: buttonHeight)
        closeButton.onClick = { [weak self] in self?.onClose?() }
        addSubview(closeButton)

        let sep1 = VerticalSeparator(height: 32, at: buttonWidth)
        separators.append(sep1)
        addSubview(sep1)

        aspectRatioButton = AspectRatioButton(size: 16, tooltip: "Aspect Ratio")
        aspectRatioButton.frame = NSRect(x: buttonWidth, y: 0, width: buttonWidth, height: buttonHeight)
        aspectRatioButton.onSelectRatio = { [weak self] ratio in
            self?.onSelectAspectRatio?(ratio)
        }
        addSubview(aspectRatioButton)

        let sep2 = VerticalSeparator(height: 32, at: buttonWidth * 2)
        separators.append(sep2)
        addSubview(sep2)

        sizeButton = IconButton(symbol: "ruler", tooltip: "Size")
        sizeButton.frame = NSRect(x: buttonWidth * 2, y: 0, width: buttonWidth, height: buttonHeight)
        sizeButton.onClick = { [weak self] in self?.showSizePopover() }
        addSubview(sizeButton)

        let sep3 = VerticalSeparator(height: 32, at: buttonWidth * 3)
        separators.append(sep3)
        addSubview(sep3)

        screenshotButton = IconButton(symbol: "camera", tooltip: "Screenshot (C)")
        screenshotButton.frame = NSRect(x: buttonWidth * 3, y: 0, width: buttonWidth, height: buttonHeight)
        screenshotButton.onClick = { [weak self] in self?.onScreenshot?() }
        addSubview(screenshotButton)

        recordButton = IconButton(symbol: "video", tooltip: "Record (R)")
        recordButton.frame = NSRect(x: buttonWidth * 4, y: 0, width: buttonWidth, height: buttonHeight)
        recordButton.onClick = { [weak self] in self?.onRecord?() }
        addSubview(recordButton)

        let sep4 = VerticalSeparator(height: 32, at: buttonWidth * 5)
        separators.append(sep4)
        addSubview(sep4)

        dragHandle = DragHandle(frame: NSRect(x: buttonWidth * 5, y: 0, width: buttonWidth, height: buttonHeight))
        addSubview(dragHandle)

        applyTheme()
    }

    override func applyTheme() {
        super.applyTheme()

        closeButton.applyTheme()
        aspectRatioButton.applyTheme()
        sizeButton.applyTheme()
        screenshotButton.applyTheme()
        recordButton.applyTheme()
        dragHandle.applyTheme()
        sizeInputView?.applyTheme()

        for separator in separators {
            separator.applyTheme()
        }
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
        if dragHandle.frame.contains(point) {
            return
        }
        NSCursor.arrow.set()
    }

    private func showSizePopover() {
        TooltipManager.shared.hide()

        if let sizePopover = sizePopover, sizePopover.isShown {
            sizePopover.performClose(nil)
            return
        }

        let popover = NSPopover()
        let sizeView = SizeInputPopoverView(
            width: selectionWidth,
            height: selectionHeight
        ) { [weak self] width, height in
            self?.onUpdateSize?(width, height)
            self?.closeSizePopover()
        }
        let viewController = NSViewController()
        viewController.view = sizeView

        popover.behavior = .transient
        popover.contentSize = sizeView.frame.size
        popover.contentViewController = viewController
        popover.delegate = self

        sizePopover = popover
        sizeInputView = sizeView
        onSizeEditorOpened?()
        popover.show(relativeTo: sizeButton.bounds, of: sizeButton, preferredEdge: .maxY)

        DispatchQueue.main.async {
            sizeView.focusWidthField()
        }
    }

    func popoverDidClose(_ notification: Notification) {
        sizePopover = nil
        sizeInputView = nil
        onSizeEditorClosed?()
    }

    override func mouseEntered(with event: NSEvent) {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        let point = convert(event.locationInWindow, from: nil)
        if !dragHandle.frame.contains(point) {
            NSCursor.arrow.set()
        }
    }

    override func mouseExited(with event: NSEvent) {
        TooltipManager.shared.hide()
    }

    override var acceptsFirstResponder: Bool { true }
}
