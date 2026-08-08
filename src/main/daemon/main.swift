import Foundation
import Cocoa

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let router = Router()
router.register(OCRModule())
router.register(QRCodeModule())
router.register(DesktopWallpaperModule())
router.register(DisplaySelectorModule())
router.register(WindowSelectorModule())
router.register(FreezeScreenModule())
router.register(DesktopHelperModule())
router.register(RecordingOverlayModule())
router.register(AllInOneModule())
router.register(AreaSelectorModule())
router.register(RecordingControlModule())
router.register(TimerControlModule())
router.register(CameraPreviewModule())
router.register(PrintModule())
router.register(ScrollCaptureModule())
router.register(ActiveDisplayModule())
if #available(macOS 12.3, *) {
    router.register(ScreenRecorderModule())
}

func setupSignalHandlers() {
    signal(SIGINT) { _ in
        exit(0)
    }
    signal(SIGTERM) { _ in
        exit(0)
    }
}

func startStdinReader() {
    DispatchQueue.global(qos: .userInitiated).async {
        while let line = readLine() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            
            guard let request = parseRequest(trimmed) else {
                DispatchQueue.main.async {
                    sendResponse(.error(
                        id: "unknown",
                        code: "PARSE_ERROR",
                        message: "Failed to parse request"
                    ))
                }
                continue
            }
            
            DispatchQueue.main.async {
                router.route(request)
            }
        }
        
        DispatchQueue.main.async {
            NSApp.terminate(nil)
        }
    }
}

setupSignalHandlers()
sendEvent(Event(event: "system:ready", data: ["pid": getpid()]))
startStdinReader()
app.run()
