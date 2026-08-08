import AVFoundation
import AppKit
import CoreMedia
import Foundation
import ScreenCaptureKit

@available(macOS 12.3, *)
class ScreenCaptureRecorder: NSObject, SCStreamDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    private var stream: SCStream?
    private var assetWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?

    private var systemAudioAssetWriter: AVAssetWriter?
    private var systemAudioInput: AVAssetWriterInput?
    private var systemAudioSessionStarted = false
    private var systemAudioOutputPath: String?

    private var micAudioAssetWriter: AVAssetWriter?
    private var micAudioInput: AVAssetWriterInput?
    private var micAudioSessionStarted = false
    private var micAudioOutputPath: String?

    private var sessionStarted = false
    private var firstFrameTime: CMTime?
    private var lastFrameTime: CMTime = .zero
    private var pauseStartTime: CMTime?
    private var totalPauseDuration: CMTime = .zero

    private let videoQueue = DispatchQueue(label: "com.capty.screen-recorder.video")
    private let audioQueue = DispatchQueue(label: "com.capty.screen-recorder.audio")
    private let writerQueue = DispatchQueue(label: "com.capty.screen-recorder.writer")
    private let audioWriterQueue = DispatchQueue(label: "com.capty.screen-recorder.audio-writer")

    private(set) var state: RecorderState = .idle
    private var config: RecordingConfig?
    private var recordingDuration: Double = 0
    private var videoWidth: Int = 1920
    private var videoHeight: Int = 1080

    private var micEnabled: Bool = false
    private var micMuted: Bool = false
    private var micCaptureSession: AVCaptureSession?
    private var micAudioOutput: AVCaptureAudioDataOutput?
    private let micQueue = DispatchQueue(label: "com.capty.screen-recorder.mic")
    private var micSampleCount: Int = 0
    private var firstMicTime: CMTime?
    private var micWriteCount: Int = 0

    private var videoFrameCount: Int = 0
    private var lastVideoTime: CMTime = .zero

    private let cursorTracker = CursorTracker()
    private var keyboardEnabled: Bool = false
    private let keyboardTracker = KeyboardTracker()

    private var cameraEnabled: Bool = false
    private let cameraRecorder = CameraRecorder()
    
    var onFirstFrame: (() -> Void)?

    func configure(_ config: RecordingConfig) {
        self.config = config
    }

    func start() async throws {
        guard state == .idle else {
            throw RecorderError.invalidState("Cannot start: recorder is \(state.rawValue)")
        }

        guard let config = config else {
            throw RecorderError.configuration("Recording config not set")
        }

        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: config.outputPath) {
            try fileManager.removeItem(atPath: config.outputPath)
        }

        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )

        let displayID = config.displayID ?? CGMainDisplayID()
        guard let display = content.displays.first(where: { $0.displayID == displayID })
                ?? content.displays.first
        else {
            throw RecorderError.configuration("No display found")
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        var scaleFactor: CGFloat = 2.0
        var targetScreen: NSScreen?
        if let screens = NSScreen.screens as [NSScreen]? {
            for screen in screens {
                let screenNumber = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
                    as? CGDirectDisplayID
                if screenNumber == display.displayID {
                    scaleFactor = screen.backingScaleFactor
                    targetScreen = screen
                    break
                }
            }
        }

        let streamConfig = SCStreamConfiguration()

        if let rect = config.captureRect {
            videoWidth = Int(rect.width * scaleFactor)
            videoHeight = Int(rect.height * scaleFactor)

            let screenFrame = targetScreen?.frame
                ?? CGRect(
                    x: CGFloat(display.frame.origin.x),
                    y: CGFloat(display.frame.origin.y),
                    width: CGFloat(display.width),
                    height: CGFloat(display.height)
                )

            let mainScreenHeight = NSScreen.screens.first?.frame.height ?? screenFrame.height
            let screenTopY = mainScreenHeight - screenFrame.origin.y - screenFrame.height

            let displayLocalRect = CGRect(
                x: rect.origin.x - screenFrame.origin.x,
                y: rect.origin.y - screenTopY,
                width: rect.width,
                height: rect.height
            )

            streamConfig.sourceRect = displayLocalRect
        } else {
            videoWidth = Int(CGFloat(display.width) * scaleFactor)
            videoHeight = Int(CGFloat(display.height) * scaleFactor)
        }

        videoWidth = (videoWidth / 2) * 2
        videoHeight = (videoHeight / 2) * 2

        streamConfig.width = videoWidth
        streamConfig.height = videoHeight
        streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(config.frameRate))
        ScreenRecordingColorConfiguration.apply(to: streamConfig)
        streamConfig.showsCursor = false
        streamConfig.queueDepth = 8

        if #available(macOS 14.0, *) {
            streamConfig.captureResolution = .best
        }

        if #available(macOS 13.0, *) {
            streamConfig.capturesAudio = config.includeAudio
            streamConfig.sampleRate = 48000
            streamConfig.channelCount = 2
            streamConfig.scalesToFit = false
        }

        let outputURL = URL(fileURLWithPath: config.outputPath)
        assetWriter = try AVAssetWriter(outputURL: outputURL, fileType: .mov)

        let pixelCount = videoWidth * videoHeight
        let bitsPerPixel = 12.0
        let rawBitrate = Int(Double(pixelCount) * bitsPerPixel * Double(config.frameRate))
        let bitrate = min(max(rawBitrate, 50_000_000), 200_000_000)

        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: videoWidth,
            AVVideoHeightKey: videoHeight,
            AVVideoColorPropertiesKey: ScreenRecordingColorConfiguration.videoColorProperties,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: config.frameRate,
                AVVideoAllowFrameReorderingKey: false,
            ],
        ]

        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput?.expectsMediaDataInRealTime = true

        let sourcePixelBufferAttributes = ScreenRecordingColorConfiguration.pixelBufferAttributes(
            width: videoWidth,
            height: videoHeight
        )

        pixelBufferAdaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: videoInput!,
            sourcePixelBufferAttributes: sourcePixelBufferAttributes
        )

        if let videoInput = videoInput, assetWriter?.canAdd(videoInput) == true {
            assetWriter?.add(videoInput)
        }

        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48000,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 320000,
        ]

        let hasSystemAudio = config.includeAudio
        let hasMicAudio = config.micEnabled
        let videoDir = (config.outputPath as NSString).deletingLastPathComponent

        if #available(macOS 13.0, *), hasSystemAudio {
            systemAudioOutputPath = (videoDir as NSString).appendingPathComponent("system.m4a")
            let systemAudioURL = URL(fileURLWithPath: systemAudioOutputPath!)

            if fileManager.fileExists(atPath: systemAudioOutputPath!) {
                try fileManager.removeItem(atPath: systemAudioOutputPath!)
            }

            systemAudioAssetWriter = try AVAssetWriter(outputURL: systemAudioURL, fileType: .m4a)

            systemAudioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            systemAudioInput?.expectsMediaDataInRealTime = true

            if let systemAudioInput = systemAudioInput, systemAudioAssetWriter?.canAdd(systemAudioInput) == true {
                systemAudioAssetWriter?.add(systemAudioInput)
            }

            guard systemAudioAssetWriter?.startWriting() == true else {
                throw RecorderError.capture(
                    "Failed to start system audio writer: \(systemAudioAssetWriter?.error?.localizedDescription ?? "unknown error")"
                )
            }
        }

        micEnabled = hasMicAudio
        if hasMicAudio {
            micAudioOutputPath = (videoDir as NSString).appendingPathComponent("mic.m4a")
            let micAudioURL = URL(fileURLWithPath: micAudioOutputPath!)

            if fileManager.fileExists(atPath: micAudioOutputPath!) {
                try fileManager.removeItem(atPath: micAudioOutputPath!)
            }

            micAudioAssetWriter = try AVAssetWriter(outputURL: micAudioURL, fileType: .m4a)

            micAudioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            micAudioInput?.expectsMediaDataInRealTime = true

            if let micAudioInput = micAudioInput, micAudioAssetWriter?.canAdd(micAudioInput) == true {
                micAudioAssetWriter?.add(micAudioInput)
            }

            guard micAudioAssetWriter?.startWriting() == true else {
                throw RecorderError.capture(
                    "Failed to start mic audio writer: \(micAudioAssetWriter?.error?.localizedDescription ?? "unknown error")"
                )
            }

            try setupMicrophoneCapture(config: config)
        }

        guard assetWriter?.startWriting() == true else {
            throw RecorderError.capture(
                "Failed to start asset writer: \(assetWriter?.error?.localizedDescription ?? "unknown error")"
            )
        }

        cameraEnabled = config.cameraEnabled
        if config.cameraEnabled {
            let videoDir = (config.outputPath as NSString).deletingLastPathComponent
            let cameraOutputPath = (videoDir as NSString).appendingPathComponent("camera.mov")
            cameraRecorder.configure(
                deviceId: config.cameraDeviceId,
                deviceName: config.cameraDeviceName,
                frameRate: 30,
                outputPath: cameraOutputPath
            )
            do {
                try cameraRecorder.start()
            } catch {
                // Don't fail the entire recording if camera fails
            }
        }

        if let rect = config.captureRect {
            cursorTracker.start(bounds: rect, videoPath: config.outputPath)
        } else {
            let screen = NSScreen.screens.first { screen in
                guard let screenNumber = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID else {
                    return false
                }
                return screenNumber == displayID
            } ?? NSScreen.main

            if let screen = screen {
                let mainScreenHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
                let displayBounds = CGRect(
                    x: screen.frame.origin.x,
                    y: mainScreenHeight - screen.frame.origin.y - screen.frame.height,
                    width: screen.frame.width,
                    height: screen.frame.height
                )
                cursorTracker.start(bounds: displayBounds, videoPath: config.outputPath)
            }
        }

        keyboardEnabled = config.keyboardEnabled
        if config.keyboardEnabled {
            keyboardTracker.start(videoPath: config.outputPath)
        }

        stream = SCStream(filter: filter, configuration: streamConfig, delegate: self)

        try stream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: videoQueue)

        if #available(macOS 13.0, *), config.includeAudio {
            try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        }

        try await stream?.startCapture()

        state = .recording
        sessionStarted = false
        firstFrameTime = nil
        lastFrameTime = .zero
        pauseStartTime = nil
        totalPauseDuration = .zero
        recordingDuration = 0
        micSampleCount = 0
        micWriteCount = 0
        videoFrameCount = 0
        lastVideoTime = .zero
        firstMicTime = nil
    }

    private func setupMicrophoneCapture(config: RecordingConfig) throws {
        micCaptureSession = AVCaptureSession()

        var micDevice: AVCaptureDevice?

        let discoverySession: AVCaptureDevice.DiscoverySession
        if #available(macOS 14.0, *) {
            discoverySession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.microphone, .external, .continuityCamera],
                mediaType: .audio,
                position: .unspecified
            )
        } else {
            discoverySession = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInMicrophone, .externalUnknown],
                mediaType: .audio,
                position: .unspecified
            )
        }

        if let deviceName = config.micDeviceName {
            micDevice = discoverySession.devices.first { $0.localizedName == deviceName }

            if micDevice == nil {
                micDevice = discoverySession.devices.first { device in
                    deviceName.contains(device.localizedName)
                        || device.localizedName.contains(deviceName)
                }
            }
        }

        if micDevice == nil, let deviceId = config.micDeviceId {
            micDevice = discoverySession.devices.first { $0.uniqueID == deviceId }
        }

        if micDevice == nil {
            micDevice = AVCaptureDevice.default(for: .audio)
        }

        guard let mic = micDevice else {
            throw RecorderError.configuration("No microphone found")
        }

        let micDeviceInput = try AVCaptureDeviceInput(device: mic)
        if micCaptureSession?.canAddInput(micDeviceInput) == true {
            micCaptureSession?.addInput(micDeviceInput)
        } else {
            throw RecorderError.configuration("Cannot add microphone input to capture session")
        }

        micAudioOutput = AVCaptureAudioDataOutput()
        micAudioOutput?.setSampleBufferDelegate(self, queue: micQueue)

        if let output = micAudioOutput, micCaptureSession?.canAddOutput(output) == true {
            micCaptureSession?.addOutput(output)
        } else {
            throw RecorderError.configuration("Cannot add audio output to capture session")
        }

        micCaptureSession?.startRunning()
    }

    func captureOutput(
        _ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard state == .recording else { return }
        guard sessionStarted else { return }
        guard micAudioSessionStarted else { return }

        micSampleCount += 1
        
        if micMuted {
            if let mutedBuffer = createMutedSampleBuffer(from: sampleBuffer) {
                writeMicAudioSample(mutedBuffer)
            } else {
                writeMicAudioSample(sampleBuffer)
            }
        } else {
            writeMicAudioSample(sampleBuffer)
        }
    }

    private func writeMicAudioSample(_ sampleBuffer: CMSampleBuffer) {
        guard let micAudioInput = micAudioInput,
            micAudioInput.isReadyForMoreMediaData
        else { return }

        guard videoFrameCount > 0 else { return }

        let micTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        if firstMicTime == nil {
            firstMicTime = micTime
        }

        guard let firstMic = firstMicTime else { return }

        let micRelativeTime = CMTimeSubtract(micTime, firstMic)
        var adjustedTime = micRelativeTime
        adjustedTime = CMTimeSubtract(adjustedTime, totalPauseDuration)

        if CMTimeCompare(adjustedTime, .zero) < 0 {
            adjustedTime = .zero
        }

        let maxTime = CMTimeAdd(lastVideoTime, CMTimeMake(value: 1, timescale: 10))
        if CMTimeCompare(adjustedTime, maxTime) > 0 {
            adjustedTime = maxTime
        }

        if let adjustedBuffer = createAdjustedSampleBuffer(sampleBuffer, newTime: adjustedTime) {
            audioWriterQueue.sync {
                guard micAudioAssetWriter?.status == .writing else { return }
                if micAudioInput.append(adjustedBuffer) {
                    micWriteCount += 1
                }
            }
        }
    }

    private func stopMicrophoneCapture() {
        if let session = micCaptureSession {
            if session.isRunning {
                session.stopRunning()
            }
            for input in session.inputs {
                session.removeInput(input)
            }
            for output in session.outputs {
                session.removeOutput(output)
            }
        }
        micCaptureSession = nil
        micAudioOutput = nil
    }

    func setMicMuted(_ muted: Bool) {
        micMuted = muted
    }
    
    func isMicMuted() -> Bool {
        return micMuted
    }
    
    private func createMutedSampleBuffer(from originalBuffer: CMSampleBuffer) -> CMSampleBuffer? {
        guard let formatDescription = CMSampleBufferGetFormatDescription(originalBuffer),
              let originalBlockBuffer = CMSampleBufferGetDataBuffer(originalBuffer) else {
            return nil
        }
        
        var totalLength: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        
        let getStatus = CMBlockBufferGetDataPointer(
            originalBlockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: nil,
            totalLengthOut: &totalLength,
            dataPointerOut: &dataPointer
        )
        
        guard getStatus == kCMBlockBufferNoErr, totalLength > 0 else {
            return nil
        }
        
        var newBlockBuffer: CMBlockBuffer?
        var status = CMBlockBufferCreateWithMemoryBlock(
            allocator: kCFAllocatorDefault,
            memoryBlock: nil,
            blockLength: totalLength,
            blockAllocator: kCFAllocatorDefault,
            customBlockSource: nil,
            offsetToData: 0,
            dataLength: totalLength,
            flags: kCMBlockBufferAssureMemoryNowFlag,
            blockBufferOut: &newBlockBuffer
        )
        
        guard status == kCMBlockBufferNoErr, let silentBlock = newBlockBuffer else {
            return nil
        }
        
        status = CMBlockBufferFillDataBytes(with: 0, blockBuffer: silentBlock, offsetIntoDestination: 0, dataLength: totalLength)
        guard status == kCMBlockBufferNoErr else {
            return nil
        }
        
        let numSamples = CMSampleBufferGetNumSamples(originalBuffer)
        let duration = CMSampleBufferGetDuration(originalBuffer)
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(originalBuffer)
        
        var timing = CMSampleTimingInfo(
            duration: duration,
            presentationTimeStamp: presentationTime,
            decodeTimeStamp: .invalid
        )
        
        var sampleSizeArray: [Int] = []
        for i in 0..<numSamples {
            sampleSizeArray.append(CMSampleBufferGetSampleSize(originalBuffer, at: i))
        }
        
        var newSampleBuffer: CMSampleBuffer?
        status = CMSampleBufferCreate(
            allocator: kCFAllocatorDefault,
            dataBuffer: silentBlock,
            dataReady: true,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: formatDescription,
            sampleCount: numSamples,
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleSizeEntryCount: sampleSizeArray.count,
            sampleSizeArray: sampleSizeArray,
            sampleBufferOut: &newSampleBuffer
        )
        
        guard status == noErr else {
            return nil
        }
        
        return newSampleBuffer
    }

    func pause() throws {
        guard state == .recording else {
            throw RecorderError.invalidState("Cannot pause: recorder is \(state.rawValue)")
        }

        pauseStartTime = lastFrameTime
        state = .paused

        cursorTracker.pause()

        if keyboardEnabled {
            keyboardTracker.pause()
        }

        if cameraEnabled {
            cameraRecorder.pause()
        }
    }

    func resume() throws {
        guard state == .paused else {
            throw RecorderError.invalidState("Cannot resume: recorder is \(state.rawValue)")
        }

        state = .recording

        cursorTracker.resume()

        if keyboardEnabled {
            keyboardTracker.resume()
        }

        if cameraEnabled {
            cameraRecorder.resume()
        }
    }

    func stop() async throws -> RecordingResult {
        guard state == .recording || state == .paused else {
            throw RecorderError.invalidState("Cannot stop: recorder is \(state.rawValue)")
        }

        state = .idle

        let cursorFilePath = cursorTracker.stop()

        var keysFilePath: String? = nil
        if keyboardEnabled {
            keysFilePath = keyboardTracker.stop()
        }

        var cameraFilePath: String? = nil
        if cameraEnabled {
            if let result = cameraRecorder.stop() {
                cameraFilePath = result.videoPath
            }
        }

        stopMicrophoneCapture()

        do {
            try await stream?.stopCapture()
        } catch {
            // Ignore stop errors
        }
        stream = nil

        try await Task.sleep(nanoseconds: 100_000_000)

        videoInput?.markAsFinished()
        systemAudioInput?.markAsFinished()
        micAudioInput?.markAsFinished()

        let finalPath = config?.outputPath ?? ""
        let finalDuration = recordingDuration
        let finalSystemAudioPath = systemAudioOutputPath
        let finalMicAudioPath = micAudioOutputPath

        if assetWriter?.status == .writing {
            await assetWriter?.finishWriting()
        }

        if assetWriter?.status == .failed, let error = assetWriter?.error {
            throw RecorderError.capture("Asset writer error: \(error.localizedDescription)")
        }

        if systemAudioAssetWriter?.status == .writing {
            await systemAudioAssetWriter?.finishWriting()
        }

        if systemAudioAssetWriter?.status == .failed, let error = systemAudioAssetWriter?.error {
            throw RecorderError.capture("System audio writer error: \(error.localizedDescription)")
        }

        if micAudioAssetWriter?.status == .writing {
            await micAudioAssetWriter?.finishWriting()
        }

        if micAudioAssetWriter?.status == .failed, let error = micAudioAssetWriter?.error {
            throw RecorderError.capture("Mic audio writer error: \(error.localizedDescription)")
        }

        assetWriter = nil
        videoInput = nil
        pixelBufferAdaptor = nil
        systemAudioAssetWriter = nil
        systemAudioInput = nil
        systemAudioOutputPath = nil
        systemAudioSessionStarted = false
        micAudioAssetWriter = nil
        micAudioInput = nil
        micAudioOutputPath = nil
        micAudioSessionStarted = false
        sessionStarted = false
        firstFrameTime = nil
        pauseStartTime = nil
        totalPauseDuration = .zero
        recordingDuration = 0

        return RecordingResult(
            outputPath: finalPath,
            cursorPath: cursorFilePath,
            cameraPath: cameraFilePath,
            keysPath: keysFilePath,
            systemAudioPath: finalSystemAudioPath,
            micAudioPath: finalMicAudioPath,
            duration: finalDuration
        )
    }

    func getStatus() -> (state: RecorderState, duration: Double) {
        return (state, recordingDuration)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        // Stream stopped with error - handled externally
    }
}

@available(macOS 12.3, *)
extension ScreenCaptureRecorder: SCStreamOutput {
    func stream(
        _ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }

        let currentTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        if state == .paused {
            if type == .screen {
                if pauseStartTime == nil {
                    pauseStartTime = currentTime
                }
            }
            return
        }

        guard state == .recording else { return }

        if let pauseStart = pauseStartTime {
            let pauseDuration = CMTimeSubtract(currentTime, pauseStart)
            totalPauseDuration = CMTimeAdd(totalPauseDuration, pauseDuration)
            pauseStartTime = nil
        }

        if !sessionStarted {
            firstFrameTime = currentTime
            assetWriter?.startSession(atSourceTime: .zero)
            sessionStarted = true
            cursorTracker.syncWithVideoStart()
            if keyboardEnabled {
                keyboardTracker.syncWithVideoStart()
            }
            if cameraEnabled {
                cameraRecorder.syncWithVideoStart()
            }
            onFirstFrame?()
        }

        if !systemAudioSessionStarted && systemAudioAssetWriter != nil {
            systemAudioAssetWriter?.startSession(atSourceTime: .zero)
            systemAudioSessionStarted = true
        }

        if !micAudioSessionStarted && micAudioAssetWriter != nil {
            micAudioAssetWriter?.startSession(atSourceTime: .zero)
            micAudioSessionStarted = true
        }

        guard let firstTime = firstFrameTime else { return }

        var presentationTime = CMTimeSubtract(currentTime, firstTime)
        presentationTime = CMTimeSubtract(presentationTime, totalPauseDuration)

        if CMTimeCompare(presentationTime, .zero) < 0 {
            presentationTime = .zero
        }

        if type == .screen {
            lastFrameTime = currentTime
            recordingDuration = CMTimeGetSeconds(presentationTime)

            guard let videoInput = videoInput,
                let pixelBufferAdaptor = pixelBufferAdaptor
            else { return }

            guard videoInput.isReadyForMoreMediaData else { return }

            if videoFrameCount > 0 && CMTimeCompare(presentationTime, lastVideoTime) <= 0 {
                return
            }

            guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

            let time = presentationTime
            writerQueue.sync {
                guard assetWriter?.status == .writing else { return }
                if pixelBufferAdaptor.append(imageBuffer, withPresentationTime: time) {
                    videoFrameCount += 1
                    lastVideoTime = time
                }
            }
        } else if #available(macOS 13.0, *), type == .audio {
            guard let systemAudioInput = systemAudioInput,
                systemAudioInput.isReadyForMoreMediaData
            else { return }

            if let adjustedBuffer = createAdjustedSampleBuffer(
                sampleBuffer, newTime: presentationTime)
            {
                audioWriterQueue.sync {
                    guard systemAudioAssetWriter?.status == .writing else { return }
                    systemAudioInput.append(adjustedBuffer)
                }
            }
        }
    }

    private func createAdjustedSampleBuffer(_ buffer: CMSampleBuffer, newTime: CMTime)
        -> CMSampleBuffer?
    {
        var timing = CMSampleTimingInfo(
            duration: CMSampleBufferGetDuration(buffer),
            presentationTimeStamp: newTime,
            decodeTimeStamp: .invalid
        )

        var newBuffer: CMSampleBuffer?
        let status = CMSampleBufferCreateCopyWithNewTiming(
            allocator: kCFAllocatorDefault,
            sampleBuffer: buffer,
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleBufferOut: &newBuffer
        )

        return status == noErr ? newBuffer : nil
    }
}
