import ExpoModulesCore
import Foundation
import Photos

final class UploadManager: NSObject, URLSessionDelegate, URLSessionTaskDelegate, URLSessionDataDelegate {
  static let shared = UploadManager()

  private let backgroundIdentifier = "com.zaimimran.recapd.upload.background"
  private let queueFileName = "recapd-upload-queue.json"
  private let stateDirName = "recapd-upload-state"
  private let stageDirName = "recapd-upload-stage"

  private weak var emitter: Module?

  private var supabaseUrl: String = ""
  private var anonKey: String = ""
  private var bearerToken: String = ""
  private var bucket: String = "event-photos"

  // How many jobs may be staged-to-disk and in flight at once (windowed staging
  // keeps disk + memory bounded; only staged files can upload in the background).
  private var stagingWindow: Int = 16
  // Free-disk safety margin before staging another file.
  private let minFreeDiskSafetyBytes: Int64 = 200 * 1024 * 1024
  private let minFreeDiskHeadroom: Double = 2.0

  private let queueLock = NSLock()
  private var queue: [UploadJob] = []
  private var stagingInProgress = Set<String>()

  // Set by the AppDelegate subscriber when iOS relaunches us for background events.
  private var backgroundCompletionHandler: (() -> Void)?

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: backgroundIdentifier)
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    config.allowsCellularAccess = true
    config.shouldUseExtendedBackgroundIdleMode = true
    config.waitsForConnectivity = true
    config.httpMaximumConnectionsPerHost = 4
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  override init() {
    super.init()
    loadQueue()
    // Touch the session so the background delegate reconnects to any tasks that
    // finished while we were suspended/killed.
    _ = session
  }

  func bind(emitter: Module) {
    self.emitter = emitter
  }

  func setBackgroundCompletionHandler(_ handler: @escaping () -> Void) {
    queueLock.lock()
    backgroundCompletionHandler = handler
    queueLock.unlock()
    kick()
  }

  func configure(_ config: UploaderConfig) {
    queueLock.lock()
    supabaseUrl = config.supabaseUrl
    anonKey = config.anonKey
    bearerToken = config.bearerToken
    bucket = config.bucket
    queueLock.unlock()
    kick()
  }

  func enqueue(items: [UploadItemInput]) throws -> [String] {
    queueLock.lock()
    var ids: [String] = []
    for item in items {
      if queue.contains(where: { $0.uploadId == item.uploadId }) {
        ids.append(item.uploadId)
        continue
      }
      queue.append(UploadJob(input: item))
      ids.append(item.uploadId)
    }
    persistLocked()
    queueLock.unlock()
    kick()
    return ids
  }

  func cancel(uploadId: String) {
    queueLock.lock()
    queue.removeAll { $0.uploadId == uploadId }
    persistLocked()
    queueLock.unlock()
    session.getAllTasks { tasks in
      for task in tasks where self.jobId(of: task) == uploadId {
        task.cancel()
      }
    }
  }

  func clearFailed() {
    queueLock.lock()
    let failed = queue.filter { $0.phase == .failed }
    queue.removeAll { $0.phase == .failed }
    persistLocked()
    queueLock.unlock()
    for job in failed { removeStagedFile(job) }
  }

  func retry(uploadId: String) {
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].phase = queue[idx].stagedPath != nil ? .staged : .queued
      queue[idx].lastError = nil
      queue[idx].attemptCount = 0
    }
    persistLocked()
    queueLock.unlock()
    kick()
  }

  func kick() {
    DispatchQueue.global(qos: .utility).async { [weak self] in
      self?.pump()
    }
  }

  func snapshot() -> [String: Any] {
    queueLock.lock()
    defer { queueLock.unlock() }
    let items = queue.map { job -> [String: Any] in
      [
        "uploadId": job.uploadId,
        "status": job.phase.rawValue,
        "objectName": job.objectName,
        "mediaType": job.mediaType,
        "eventId": job.eventId,
        "userId": job.userId,
        "bytesUploaded": job.offset,
        "totalBytes": job.totalBytes,
        "lastError": job.lastError ?? NSNull(),
        "attemptCount": job.attemptCount
      ]
    }
    return ["items": items]
  }

  // MARK: - Pump (foreground-driven staging + chain start)

  private func pump() {
    guard !supabaseUrl.isEmpty, !bearerToken.isEmpty else { return }

    queueLock.lock()
    let inWindow = queue.filter {
      $0.phase != .queued && $0.phase != .completed && $0.phase != .failed
    }.count
    var budget = max(0, stagingWindow - inWindow)
    let toStage = queue.filter { $0.phase == .queued }
    queueLock.unlock()

    for job in toStage {
      if budget <= 0 { break }
      queueLock.lock()
      let already = stagingInProgress.contains(job.uploadId)
      if !already { stagingInProgress.insert(job.uploadId) }
      queueLock.unlock()
      if already { continue }
      budget -= 1
      Task { await stageAndStart(job) }
    }
  }

  // MARK: - Staging (PHAsset / file -> disk). Foreground / wake-window only.

  private func stageAndStart(_ job: UploadJob) async {
    defer {
      queueLock.lock()
      stagingInProgress.remove(job.uploadId)
      queueLock.unlock()
    }
    do {
      let staged = try await materialize(job: job)
      let attrs = try FileManager.default.attributesOfItem(atPath: staged.path)
      let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
      if size <= 0 { throw UploaderError.assetUnavailable("staged file empty") }
      try ensureFreeDiskFor(size)

      queueLock.lock()
      guard let idx = queue.firstIndex(where: { $0.uploadId == job.uploadId }) else {
        queueLock.unlock()
        try? FileManager.default.removeItem(at: staged)
        return
      }
      queue[idx].stagedPath = staged.path
      queue[idx].totalBytes = size
      queue[idx].phase = .staged
      let started = queue[idx]
      persistLocked()
      queueLock.unlock()

      startCreate(started)
    } catch {
      finishFailure(uploadId: job.uploadId, error: error)
    }
  }

  private func materialize(job: UploadJob) async throws -> URL {
    let cacheDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(stageDirName, isDirectory: true)
    try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    let ext = (job.objectName as NSString).pathExtension.lowercased()
    let staged = cacheDir.appendingPathComponent("\(job.uploadId).\(ext.isEmpty ? "bin" : ext)")

    if FileManager.default.fileExists(atPath: staged.path) {
      return staged
    }

    if let assetId = job.assetIdentifier, !assetId.isEmpty {
      try await streamPHAsset(assetId: assetId, to: staged, mediaType: job.mediaType)
    } else if let fileUri = job.fileUri, !fileUri.isEmpty {
      let src = URL(fileURLWithPath: fileUri.replacingOccurrences(of: "file://", with: ""))
      try? FileManager.default.removeItem(at: staged)
      try FileManager.default.copyItem(at: src, to: staged)
    } else {
      throw UploaderError.invalidInput("missing asset identifier or file URI")
    }
    return staged
  }

  private func streamPHAsset(assetId: String, to destination: URL, mediaType: String) async throws {
    let fetched = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let asset = fetched.firstObject else {
      throw UploaderError.assetUnavailable("PHAsset not found: \(assetId)")
    }
    let resources = PHAssetResource.assetResources(for: asset)
    let target: PHAssetResource?
    if mediaType == "video" {
      target = resources.first(where: { $0.type == .video }) ?? resources.first(where: { $0.type == .fullSizeVideo })
    } else {
      target = resources.first(where: { $0.type == .photo }) ?? resources.first(where: { $0.type == .fullSizePhoto })
    }
    guard let resource = target ?? resources.first else {
      throw UploaderError.assetUnavailable("no resource on asset")
    }

    try? FileManager.default.removeItem(at: destination)
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      PHAssetResourceManager.default().writeData(for: resource, toFile: destination, options: options) { error in
        if let error = error {
          cont.resume(throwing: UploaderError.assetUnavailable("PHAssetResource write failed: \(error.localizedDescription)"))
        } else {
          cont.resume()
        }
      }
    }
  }

  // MARK: - Background task chain (create -> patch -> verify -> record)

  private func startCreate(_ job: UploadJob) {
    setPhase(job.uploadId, .creating)
    guard let url = URL(string: "\(supabaseUrl)/storage/v1/upload/resumable") else {
      finishFailure(uploadId: job.uploadId, error: UploaderError.config("invalid supabaseUrl"))
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
    request.setValue("\(job.totalBytes)", forHTTPHeaderField: "Upload-Length")
    let metadata = [
      "bucketName \(b64(bucket))",
      "objectName \(b64(job.objectName))",
      "contentType \(b64(job.contentType))",
      "cacheControl \(b64("3600"))"
    ].joined(separator: ",")
    request.setValue(metadata, forHTTPHeaderField: "Upload-Metadata")
    authorize(&request)
    startTask(request, job: job, phase: .creating, bodyFile: emptyBodyFile())
  }

  private func startHead(_ job: UploadJob) {
    setPhase(job.uploadId, .checking)
    guard let tus = job.tusUrl, let url = URL(string: tus) else {
      // No tus url yet -> (re)create.
      startCreate(job)
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "HEAD"
    request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
    authorize(&request)
    startTask(request, job: job, phase: .checking, bodyFile: nil)
  }

  private func startPatch(_ job: UploadJob) {
    guard let tus = job.tusUrl, let url = URL(string: tus),
          let stagedPath = job.stagedPath else {
      finishFailure(uploadId: job.uploadId, error: UploaderError.tus("missing tus url or staged file"))
      return
    }
    setPhase(job.uploadId, .uploading)
    let stagedURL = URL(fileURLWithPath: stagedPath)
    let bodyFile: URL
    if job.offset > 0 {
      // Resume: PATCH only the remaining bytes from a temp slice.
      guard let slice = makeSlice(of: stagedURL, from: job.offset, uploadId: job.uploadId) else {
        finishFailure(uploadId: job.uploadId, error: UploaderError.tus("could not slice for resume"))
        return
      }
      bodyFile = slice
    } else {
      bodyFile = stagedURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "PATCH"
    request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
    request.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
    request.setValue("\(job.offset)", forHTTPHeaderField: "Upload-Offset")
    authorize(&request)
    startTask(request, job: job, phase: .uploading, bodyFile: bodyFile)
  }

  private func startVerify(_ job: UploadJob) {
    setPhase(job.uploadId, .verifying)
    guard let url = URL(string: "\(supabaseUrl)/storage/v1/object/info/\(bucket)/\(escape(job.objectName))") else {
      finishFailure(uploadId: job.uploadId, error: UploaderError.config("invalid verify URL"))
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    authorize(&request)
    startTask(request, job: job, phase: .verifying, bodyFile: nil)
  }

  private func startRecord(_ job: UploadJob) {
    setPhase(job.uploadId, .recording)
    guard let url = URL(string: "\(supabaseUrl)/rest/v1/media_items"),
          let bodyFile = mediaItemBodyFile(job) else {
      finishFailure(uploadId: job.uploadId, error: UploaderError.config("invalid record request"))
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
    authorize(&request)
    startTask(request, job: job, phase: .recording, bodyFile: bodyFile)
  }

  private func startTask(_ request: URLRequest, job: UploadJob, phase: UploadPhase, bodyFile: URL?) {
    let task: URLSessionTask
    if let bodyFile = bodyFile {
      task = session.uploadTask(with: request, fromFile: bodyFile)
    } else {
      // Background sessions don't support data tasks; HEAD/GET ride a download task.
      task = session.downloadTask(with: request)
    }
    task.taskDescription = "\(job.uploadId)|\(phase.rawValue)"
    task.resume()
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    // We only need status/headers (read in didCompleteWithError); ignore the body.
  }

  // MARK: - Delegate routing

  private func jobId(of task: URLSessionTask) -> String? {
    task.taskDescription?.components(separatedBy: "|").first
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let desc = task.taskDescription else { return }
    let parts = desc.components(separatedBy: "|")
    guard parts.count == 2, let phase = UploadPhase(rawValue: parts[1]) else { return }
    let uploadId = parts[0]

    queueLock.lock()
    guard let job = queue.first(where: { $0.uploadId == uploadId }) else {
      queueLock.unlock()
      return
    }
    queueLock.unlock()

    if let error = error {
      finishFailure(uploadId: uploadId, error: error)
      return
    }
    guard let http = task.response as? HTTPURLResponse else {
      finishFailure(uploadId: uploadId, error: UploaderError.tus("no response in \(phase.rawValue)"))
      return
    }

    switch phase {
    case .creating:
      guard http.statusCode == 201, let location = http.value(forHTTPHeaderField: "Location") else {
        finishFailure(uploadId: uploadId, error: UploaderError.tus("create status \(http.statusCode)"))
        return
      }
      let tusUrl = absoluteTusUrl(location)
      setTusUrl(uploadId, tusUrl)
      if let updated = jobById(uploadId) { startPatch(updated) }

    case .checking:
      if http.statusCode == 404 {
        // tus upload expired -> recreate from scratch.
        setTusUrl(uploadId, nil)
        setOffset(uploadId, 0)
        if let updated = jobById(uploadId) { startCreate(updated) }
        return
      }
      let offset = Int64(http.value(forHTTPHeaderField: "Upload-Offset") ?? "") ?? 0
      setOffset(uploadId, offset)
      if let updated = jobById(uploadId) {
        if offset >= updated.totalBytes { startVerify(updated) } else { startPatch(updated) }
      }

    case .uploading:
      cleanupSlice(uploadId)
      guard (200..<300).contains(http.statusCode) else {
        // Re-check offset and resume rather than failing outright.
        if let updated = jobById(uploadId) { startHead(updated) }
        return
      }
      let newOffset = Int64(http.value(forHTTPHeaderField: "Upload-Offset") ?? "")
        ?? (jobById(uploadId)?.totalBytes ?? 0)
      setOffset(uploadId, newOffset)
      if let updated = jobById(uploadId) {
        emitProgress(uploadId: uploadId, bytes: newOffset, total: updated.totalBytes)
        if newOffset >= updated.totalBytes { startVerify(updated) } else { startPatch(updated) }
      }

    case .verifying:
      guard (200..<300).contains(http.statusCode) else {
        finishFailure(uploadId: uploadId, error: UploaderError.tus("verify status \(http.statusCode)"))
        return
      }
      if let updated = jobById(uploadId) { startRecord(updated) }

    case .recording:
      guard (200..<300).contains(http.statusCode) else {
        finishFailure(uploadId: uploadId, error: UploaderError.tus("record status \(http.statusCode)"))
        return
      }
      finishSuccess(uploadId: uploadId)

    default:
      break
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
    guard let uploadId = jobId(of: task), task.taskDescription?.hasSuffix("uploading") == true else { return }
    if let job = jobById(uploadId) {
      emitProgress(uploadId: uploadId, bytes: job.offset + totalBytesSent, total: job.totalBytes)
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    queueLock.lock()
    let handler = backgroundCompletionHandler
    backgroundCompletionHandler = nil
    queueLock.unlock()
    DispatchQueue.main.async { handler?() }
  }

  // MARK: - Completion

  private func finishSuccess(uploadId: String) {
    queueLock.lock()
    let objectName = queue.first(where: { $0.uploadId == uploadId })?.objectName ?? ""
    let job = queue.first(where: { $0.uploadId == uploadId })
    queue.removeAll { $0.uploadId == uploadId }
    persistLocked()
    queueLock.unlock()
    if let job = job { removeStagedFile(job) }
    emitter?.sendEvent("onItemCompleted", [
      "uploadId": uploadId,
      "objectName": objectName,
      "recorded": true
    ])
    kick()
  }

  private func finishFailure(uploadId: String, error: Error) {
    cleanupSlice(uploadId)
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].phase = .failed
      queue[idx].lastError = error.localizedDescription
    }
    persistLocked()
    queueLock.unlock()
    emitter?.sendEvent("onItemFailed", [
      "uploadId": uploadId,
      "error": error.localizedDescription
    ])
    kick()
  }

  private func emitProgress(uploadId: String, bytes: Int64, total: Int64) {
    emitter?.sendEvent("onProgress", [
      "uploadId": uploadId,
      "bytesUploaded": bytes,
      "totalBytes": total
    ])
  }

  // MARK: - Job state mutation helpers

  private func jobById(_ uploadId: String) -> UploadJob? {
    queueLock.lock(); defer { queueLock.unlock() }
    return queue.first(where: { $0.uploadId == uploadId })
  }

  private func setPhase(_ uploadId: String, _ phase: UploadPhase) {
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].phase = phase
      if phase == .uploading { queue[idx].attemptCount += 1 }
      persistLocked()
    }
    queueLock.unlock()
  }

  private func setTusUrl(_ uploadId: String, _ tusUrl: String?) {
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].tusUrl = tusUrl
      persistLocked()
    }
    queueLock.unlock()
  }

  private func setOffset(_ uploadId: String, _ offset: Int64) {
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].offset = offset
      persistLocked()
    }
    queueLock.unlock()
  }

  // MARK: - Helpers

  private func authorize(_ request: inout URLRequest) {
    request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
  }

  private func absoluteTusUrl(_ location: String) -> String {
    if location.hasPrefix("http") { return location }
    return "\(supabaseUrl)\(location.hasPrefix("/") ? "" : "/")\(location)"
  }

  private func emptyBodyFile() -> URL {
    let dir = FileManager.default.temporaryDirectory
    let url = dir.appendingPathComponent("recapd-empty-body")
    if !FileManager.default.fileExists(atPath: url.path) {
      FileManager.default.createFile(atPath: url.path, contents: Data())
    }
    return url
  }

  private func makeSlice(of file: URL, from offset: Int64, uploadId: String) -> URL? {
    do {
      let handle = try FileHandle(forReadingFrom: file)
      defer { try? handle.close() }
      try handle.seek(toOffset: UInt64(offset))
      let data = try handle.readToEnd() ?? Data()
      let slice = FileManager.default.temporaryDirectory.appendingPathComponent("\(uploadId)-resume.bin")
      try data.write(to: slice, options: .atomic)
      return slice
    } catch {
      return nil
    }
  }

  private func cleanupSlice(_ uploadId: String) {
    let slice = FileManager.default.temporaryDirectory.appendingPathComponent("\(uploadId)-resume.bin")
    try? FileManager.default.removeItem(at: slice)
  }

  private func mediaItemBodyFile(_ job: UploadJob) -> URL? {
    var payload: [String: Any] = [
      "event_id": job.eventId,
      "uploaded_by_user_id": job.userId,
      "captured_at": job.capturedAt,
      "media_type": job.mediaType,
      "width": job.width,
      "height": job.height,
      "storage_path": job.objectName,
      "visibility": "shared"
    ]
    payload["duration_milliseconds"] = job.mediaType == "video" ? job.durationMs : NSNull()
    payload["file_size_bytes"] = job.fileSizeBytes ?? NSNull()
    payload["thumbnail_path"] = job.thumbnailPath ?? NSNull()
    payload["latitude"] = job.latitude ?? NSNull()
    payload["longitude"] = job.longitude ?? NSNull()
    guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(job.uploadId)-record.json")
    do {
      try data.write(to: url, options: .atomic)
      return url
    } catch {
      return nil
    }
  }

  private func removeStagedFile(_ job: UploadJob) {
    if let path = job.stagedPath {
      try? FileManager.default.removeItem(at: URL(fileURLWithPath: path))
    }
    cleanupSlice(job.uploadId)
    let record = FileManager.default.temporaryDirectory.appendingPathComponent("\(job.uploadId)-record.json")
    try? FileManager.default.removeItem(at: record)
  }

  private func ensureFreeDiskFor(_ size: Int64) throws {
    let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    guard let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
          let free = values.volumeAvailableCapacityForImportantUsage else {
      return
    }
    let required = Int64(Double(size) * minFreeDiskHeadroom) + minFreeDiskSafetyBytes
    if free < required {
      throw UploaderError.disk("not enough free space (need \(required), have \(free))")
    }
  }

  private func b64(_ s: String) -> String {
    Data(s.utf8).base64EncodedString()
  }

  private func escape(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s
  }

  // MARK: - Persistence

  private func queueFileURL() -> URL {
    let docs = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(stateDirName, isDirectory: true)
    try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
    return docs.appendingPathComponent(queueFileName)
  }

  private func persistLocked() {
    let payload = queue.map { $0.toDict() }
    if let data = try? JSONSerialization.data(withJSONObject: payload) {
      try? data.write(to: queueFileURL(), options: .atomic)
    }
  }

  private func loadQueue() {
    guard let data = try? Data(contentsOf: queueFileURL()),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
    queue = arr.compactMap { UploadJob.fromDict($0) }
    // Any job that was mid-flight when we were killed: re-check offset and resume.
    for idx in queue.indices {
      switch queue[idx].phase {
      case .creating, .checking, .uploading, .verifying, .recording:
        queue[idx].phase = queue[idx].tusUrl != nil ? .checking : .staged
      default:
        break
      }
    }
  }
}

enum UploaderError: LocalizedError {
  case invalidInput(String)
  case assetUnavailable(String)
  case tus(String)
  case config(String)
  case disk(String)

  var errorDescription: String? {
    switch self {
    case .invalidInput(let s): return "InvalidInput: \(s)"
    case .assetUnavailable(let s): return "AssetUnavailable: \(s)"
    case .tus(let s): return "Tus: \(s)"
    case .config(let s): return "Config: \(s)"
    case .disk(let s): return "Disk: \(s)"
    }
  }
}

enum UploadPhase: String, Codable {
  case queued
  case staged
  case creating
  case checking
  case uploading
  case verifying
  case recording
  case completed
  case failed
}

struct UploadJob {
  let uploadId: String
  let assetIdentifier: String?
  let fileUri: String?
  let objectName: String
  let contentType: String
  let mediaType: String
  let eventId: String
  let userId: String
  let fileFingerprint: String

  let capturedAt: String
  let width: Int
  let height: Int
  let durationMs: Int
  let latitude: Double?
  let longitude: Double?
  let fileSizeBytes: Int?
  let thumbnailPath: String?

  var phase: UploadPhase
  var tusUrl: String?
  var offset: Int64
  var totalBytes: Int64
  var stagedPath: String?
  var lastError: String?
  var attemptCount: Int

  init(input: UploadItemInput) {
    self.uploadId = input.uploadId
    self.assetIdentifier = input.assetIdentifier
    self.fileUri = input.fileUri
    self.objectName = input.objectName
    self.contentType = input.contentType
    self.mediaType = input.mediaType
    self.eventId = input.eventId
    self.userId = input.userId
    self.fileFingerprint = input.fileFingerprint
    self.capturedAt = input.capturedAt
    self.width = input.width
    self.height = input.height
    self.durationMs = input.durationMs
    self.latitude = input.latitude
    self.longitude = input.longitude
    self.fileSizeBytes = input.fileSizeBytes
    self.thumbnailPath = input.thumbnailPath
    self.phase = .queued
    self.tusUrl = nil
    self.offset = 0
    self.totalBytes = 0
    self.stagedPath = nil
    self.lastError = nil
    self.attemptCount = 0
  }

  private init(dict d: [String: Any]) {
    uploadId = d["uploadId"] as? String ?? ""
    assetIdentifier = (d["assetIdentifier"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    fileUri = (d["fileUri"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    objectName = d["objectName"] as? String ?? ""
    contentType = d["contentType"] as? String ?? "application/octet-stream"
    mediaType = d["mediaType"] as? String ?? "photo"
    eventId = d["eventId"] as? String ?? ""
    userId = d["userId"] as? String ?? ""
    fileFingerprint = d["fileFingerprint"] as? String ?? ""
    capturedAt = d["capturedAt"] as? String ?? ""
    width = (d["width"] as? NSNumber)?.intValue ?? 0
    height = (d["height"] as? NSNumber)?.intValue ?? 0
    durationMs = (d["durationMs"] as? NSNumber)?.intValue ?? 0
    latitude = (d["latitude"] as? NSNumber)?.doubleValue
    longitude = (d["longitude"] as? NSNumber)?.doubleValue
    fileSizeBytes = (d["fileSizeBytes"] as? NSNumber)?.intValue
    thumbnailPath = (d["thumbnailPath"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    phase = UploadPhase(rawValue: d["phase"] as? String ?? "queued") ?? .queued
    tusUrl = (d["tusUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    offset = (d["offset"] as? NSNumber)?.int64Value ?? 0
    totalBytes = (d["totalBytes"] as? NSNumber)?.int64Value ?? 0
    stagedPath = (d["stagedPath"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    lastError = (d["lastError"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    attemptCount = (d["attemptCount"] as? NSNumber)?.intValue ?? 0
  }

  func toDict() -> [String: Any] {
    [
      "uploadId": uploadId,
      "assetIdentifier": assetIdentifier ?? "",
      "fileUri": fileUri ?? "",
      "objectName": objectName,
      "contentType": contentType,
      "mediaType": mediaType,
      "eventId": eventId,
      "userId": userId,
      "fileFingerprint": fileFingerprint,
      "capturedAt": capturedAt,
      "width": width,
      "height": height,
      "durationMs": durationMs,
      "latitude": latitude ?? NSNull(),
      "longitude": longitude ?? NSNull(),
      "fileSizeBytes": fileSizeBytes ?? NSNull(),
      "thumbnailPath": thumbnailPath ?? "",
      "phase": phase.rawValue,
      "tusUrl": tusUrl ?? "",
      "offset": offset,
      "totalBytes": totalBytes,
      "stagedPath": stagedPath ?? "",
      "lastError": lastError ?? "",
      "attemptCount": attemptCount
    ]
  }

  static func fromDict(_ d: [String: Any]) -> UploadJob? {
    guard let uploadId = d["uploadId"] as? String, !uploadId.isEmpty,
          let objectName = d["objectName"] as? String, !objectName.isEmpty else { return nil }
    _ = objectName
    return UploadJob(dict: d)
  }
}
