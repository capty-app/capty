import Cocoa

class TooltipWindow: NSWindow {
    private let label: NSTextField
    private let padding: CGFloat = 8
    
    override init(
        contentRect: NSRect,
        styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType,
        defer flag: Bool
    ) {
        label = NSTextField(labelWithString: "")
        label.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        label.alignment = .center
        
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 100, height: 28),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        
        isOpaque = false
        backgroundColor = .clear
        level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)) + 2)
        ignoresMouseEvents = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        sharingType = .none
        isReleasedWhenClosed = false
        
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 100, height: 28))
        container.wantsLayer = true
        container.layer?.cornerRadius = 6
        
        label.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(label)
        
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])
        
        contentView = container
        applyTheme()
    }
    
    convenience init() {
        self.init(
            contentRect: .zero,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
    }
    
    func applyTheme() {
        let theme = Theme.current
        contentView?.layer?.backgroundColor = theme.tooltipBackground.cgColor
        label.textColor = theme.tooltipForeground
        
        contentView?.shadow = NSShadow()
        contentView?.layer?.shadowColor = NSColor.black.withAlphaComponent(0.3).cgColor
        contentView?.layer?.shadowOffset = CGSize(width: 0, height: -2)
        contentView?.layer?.shadowRadius = 4
        contentView?.layer?.shadowOpacity = 1
    }
    
    func show(text: String, below view: NSView, in parentWindow: NSWindow) {
        label.stringValue = text
        label.sizeToFit()
        
        let textWidth = label.frame.width + padding * 2
        let textHeight: CGFloat = 28
        
        let viewFrameInWindow = view.convert(view.bounds, to: nil)
        let viewFrameInScreen = parentWindow.convertToScreen(viewFrameInWindow)
        
        let x = viewFrameInScreen.midX - textWidth / 2
        let y = viewFrameInScreen.minY - textHeight - 6
        
        setFrame(NSRect(x: x, y: y, width: textWidth, height: textHeight), display: true)
        contentView?.frame = NSRect(x: 0, y: 0, width: textWidth, height: textHeight)
        
        applyTheme()
        orderFront(nil)
    }
    
    func hide() {
        orderOut(nil)
    }
}

class TooltipManager: ThemeObserver {
    static let shared = TooltipManager()
    
    private var tooltipWindow: TooltipWindow?
    private weak var currentView: NSView?
    
    private init() {
        tooltipWindow = TooltipWindow()
        ThemeManager.shared.addObserver(self)
    }
    
    func show(text: String, for view: NSView, in window: NSWindow) {
        currentView = view
        tooltipWindow?.show(text: text, below: view, in: window)
    }
    
    func hide() {
        tooltipWindow?.hide()
        currentView = nil
    }
    
    func themeDidChange() {
        tooltipWindow?.applyTheme()
    }
}
