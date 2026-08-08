import Cocoa
import Foundation

class ActiveDisplayModule: Module {
    let name = "active-display"

    private var monitor: Any?
    private var lastDisplayId: CGDirectDisplayID?

    func handle(method: String, params: [String: AnyCodable]?, requestId: String) {
        switch method {
        case "start":
            handleStart(requestId: requestId)
        case "stop":
            handleStop(requestId: requestId)
        default:
            respondError(id: requestId, code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)")
        }
    }

    private func handleStart(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if self.monitor != nil {
                self.respond(id: requestId, result: ["monitoring": true])
                return
            }

            self.lastDisplayId = self.currentDisplayId()
            self.monitor = NSEvent.addGlobalMonitorForEvents(
                matching: [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged]
            ) { [weak self] _ in
                self?.handleMouseMoved()
            }

            self.respond(id: requestId, result: ["monitoring": true])
        }
    }

    private func handleStop(requestId: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if let monitor = self.monitor {
                NSEvent.removeMonitor(monitor)
                self.monitor = nil
            }

            self.lastDisplayId = nil
            self.respond(id: requestId, result: ["monitoring": false])
        }
    }

    private func handleMouseMoved() {
        guard let displayId = currentDisplayId() else { return }
        guard displayId != lastDisplayId else { return }

        lastDisplayId = displayId
        emit(event: "changed", data: ["displayId": Int(displayId)])
    }

    private func currentDisplayId() -> CGDirectDisplayID? {
        let location = NSEvent.mouseLocation

        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(location, $0.frame, false) }) else {
            return nil
        }

        return screen.deviceDescription[
            NSDeviceDescriptionKey("NSScreenNumber")
        ] as? CGDirectDisplayID
    }
}
