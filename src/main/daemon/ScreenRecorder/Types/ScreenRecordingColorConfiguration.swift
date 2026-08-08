import AVFoundation
import CoreGraphics
import CoreVideo
import ScreenCaptureKit

@available(macOS 12.3, *)
enum ScreenRecordingColorConfiguration {
    static let capturePixelFormat = kCVPixelFormatType_32BGRA
    static let captureColorSpaceName = CGColorSpace.sRGB

    static let videoColorProperties: [String: Any] = [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ]

    static func apply(to configuration: SCStreamConfiguration) {
        configuration.pixelFormat = capturePixelFormat
        configuration.colorSpaceName = captureColorSpaceName
    }

    static func pixelBufferAttributes(width: Int, height: Int) -> [String: Any] {
        [
            kCVPixelBufferPixelFormatTypeKey as String: capturePixelFormat,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
        ]
    }
}
