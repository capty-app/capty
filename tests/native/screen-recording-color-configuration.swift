import AVFoundation
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

@main
struct ScreenRecordingColorConfigurationTests {
    static func main() async throws {
        let configuration = SCStreamConfiguration()
        ScreenRecordingColorConfiguration.apply(to: configuration)

        precondition(
            configuration.pixelFormat == kCVPixelFormatType_32BGRA
        )
        precondition(configuration.colorSpaceName == CGColorSpace.sRGB)

        let properties = ScreenRecordingColorConfiguration.videoColorProperties
        precondition(properties.count == 3)
        precondition(
            properties[AVVideoColorPrimariesKey] as? String
                == AVVideoColorPrimaries_ITU_R_709_2
        )
        precondition(
            properties[AVVideoTransferFunctionKey] as? String
                == AVVideoTransferFunction_ITU_R_709_2
        )
        precondition(
            properties[AVVideoYCbCrMatrixKey] as? String
                == AVVideoYCbCrMatrix_ITU_R_709_2
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mov")

        defer {
            try? FileManager.default.removeItem(at: outputURL)
        }

        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
        let dimensions = 64
        let input = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: dimensions,
                AVVideoHeightKey: dimensions,
                AVVideoColorPropertiesKey: properties,
            ]
        )
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: ScreenRecordingColorConfiguration.pixelBufferAttributes(
                width: dimensions,
                height: dimensions
            )
        )

        precondition(writer.canAdd(input))
        writer.add(input)
        precondition(writer.startWriting())
        writer.startSession(atSourceTime: .zero)

        guard let pool = adaptor.pixelBufferPool else {
            preconditionFailure("Pixel buffer pool was not created")
        }

        var pixelBuffer: CVPixelBuffer?
        precondition(CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBuffer) == kCVReturnSuccess)

        guard let pixelBuffer else {
            preconditionFailure("Pixel buffer was not created")
        }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        if let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) {
            memset(baseAddress, 16, CVPixelBufferGetDataSize(pixelBuffer))
        }
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

        precondition(adaptor.append(pixelBuffer, withPresentationTime: .zero))
        input.markAsFinished()
        await writer.finishWriting()
        precondition(writer.status == .completed)

        let asset = AVURLAsset(url: outputURL)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        precondition(tracks.count == 1)

        let descriptions = try await tracks[0].load(.formatDescriptions)
        precondition(descriptions.count == 1)

        guard let extensions = CMFormatDescriptionGetExtensions(descriptions[0]) as? [String: Any]
        else {
            preconditionFailure("Video format extensions were not created")
        }

        precondition(
            extensions[kCMFormatDescriptionExtension_ColorPrimaries as String] as? String
                == AVVideoColorPrimaries_ITU_R_709_2
        )
        precondition(
            extensions[kCMFormatDescriptionExtension_TransferFunction as String] as? String
                == AVVideoTransferFunction_ITU_R_709_2
        )
        precondition(
            extensions[kCMFormatDescriptionExtension_YCbCrMatrix as String] as? String
                == AVVideoYCbCrMatrix_ITU_R_709_2
        )
    }
}
