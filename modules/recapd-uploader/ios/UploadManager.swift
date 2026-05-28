import ExpoModulesCore
import Foundation
import Photos

final class UploadManager: NSObject, URLSessionDelegate, URLSessionTaskDelegate, URLSessionDataDelegate {
  static let shared = UploadManager()

  private let backgroundIdentifier = "com.zaimimran.recapd.upload.background"
  private let queueFileName = "recapd-upload-queue.json"
  private let stateDirName = "recapd-upload-state"

  private weak var emitter: Module?

  private var supabaseUrl: String = ""
  private var anonKey: String = ""
  private var bearerToken: String = ""
  private var bucket: String = "event-photos"
  private var maxConcurrentPhotos: Int = 2
  private var maxConcurrentVideos: Int = 1
  private var chunkBytes: Int = 1 * 1024 * 1024

  private let queueLock = NSLock()
  private var queue: [UploadJob] = []
  private var inflight: [String: UploadInflight] = [:]
  private var taskToUpload: [Int: String] = [:]

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
  }

  func bind(emitter: Module) {
    self.emitter = emitter
  }

  func configure(_ config: UploaderConfig) {
    queueLock.lock()
    defer { queueLock.unlock() }
    supabaseUrl = config.supabaseUrl
    anonKey = config.anonKey
    bearerToken = config.bearerToken
    bucket = config.bucket
    maxConcurrentPhotos = max(1, config.maxConcurrentPhotos)
    maxConcurrentVideos = max(1, config.maxConcurrentVideos)
    chunkBytes = max(256 * 1024, config.chunkBytes)
    DispatchQueue.global(qos: .utility).async { [weak self] in
      self?.pump()
    }
  }

  func enqueue(items: [UploadItemInput]) throws -> [String] {
    queueLock.lock()
    var ids: [String] = []
    for item in items {
      if queue.contains(where: { $0.uploadId == item.uploadId }) {
        ids.append(item.uploadId)
        continue
      }
      let job = UploadJob(input: item)
      queue.append(job)
      ids.append(item.uploadId)
    }
    persistLocked()
    queueLock.unlock()
    DispatchQueue.global(qos: .utility).async { [weak self] in
      self?.pump()
    }
    return ids
  }

  func cancel(uploadId: String) {
    queueLock.lock()
    if let inflight = inflight[uploadId] {
      inflight.task.cancel()
    }
    queue.removeAll { $0.uploadId == uploadId }
    inflight.removeValue(forKey: uploadId)
    persistLocked()
    queueLock.unlock()
  }

  func clearFailed() {
    queueLock.lock()
    queue.removeAll { $0.status == .failed }
    persistLocked()
    queueLock.unlock()
  }

  func retry(uploadId: String) {
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].status = .queued
      queue[idx].lastError = nil
      queue[idx].attemptCount = 0
    }
    persistLocked()
    queueLock.unlock()
    DispatchQueue.global(qos: .utility).async { [weak self] in
      self?.pump()
    }
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
        "status": job.status.rawValue,
        "objectName": job.objectName,
        "mediaType": job.mediaType,
        "eventId": job.eventId,
        "userId": job.userId,
        "bytesUploaded": job.bytesUploaded,
        "totalBytes": job.totalBytes,
        "lastError": job.lastError ?? NSNull(),
        "attemptCount": job.attemptCount
      ]
    }
    return [
      "items": items,
      "inflight": Array(inflight.keys)
    ]
  }

  // MARK: - Queue pump

  private func pump() {
    queueLock.lock()
    let activePhotos = inflight.values.filter { $0.job.mediaType == "photo" }.count
    let activeVideos = inflight.values.filter { $0.job.mediaType == "video" }.count
    let needPhotos = max(0, maxConcurrentPhotos - activePhotos)
    let needVideos = max(0, maxConcurrentVideos - activeVideos)
    var toStart: [UploadJob] = []
    var photosBudget = needPhotos
    var videosBudget = needVideos
    for job in queue where job.status == .queued || job.status == .syncing {
      guard inflight[job.uploadId] == nil else { continue }
      if job.mediaType == "video" && videosBudget > 0 {
        toStart.append(job)
        videosBudget -= 1
      } else if job.mediaType != "video" && photosBudget > 0 {
        toStart.append(job)
        photosBudget -= 1
      }
      if photosBudget == 0 && videosBudget == 0 { break }
    }
    queueLock.unlock()
    for job in toStart {
      Task { await start(job: job) }
    }
  }

  // MARK: - Single-job state machine

  private func start(job: UploadJob) async {
    do {
      queueLock.lock()
      if let idx = queue.firstIndex(where: { $0.uploadId == job.uploadId }) {
        queue[idx].status = .syncing
        queue[idx].attemptCount += 1
        persistLocked()
      }
      queueLock.unlock()
      let materialized = try await materialize(job: job)
      let tusUrl = try await ensureTusUpload(job: job, fileURL: materialized.fileURL, totalBytes: materialized.size)
      let startOffset = try await fetchOffset(tusUrl: tusUrl)
      try await uploadChunks(job: job, fileURL: materialized.fileURL, tusUrl: tusUrl, totalBytes: materialized.size, startOffset: startOffset)
      try await verifyExists(job: job)
      finishSuccess(uploadId: job.uploadId, materialized: materialized)
    } catch {
      finishFailure(uploadId: job.uploadId, error: error)
    }
  }

  // MARK: - PHAsset / file source materialization

  private struct Materialized {
    let fileURL: URL
    let size: Int64
    let cleanup: () -> Void
  }

  private func materialize(job: UploadJob) async throws -> Materialized {
    let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("recapd-upload-stage", isDirectory: true)
    try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    let ext = (job.objectName as NSString).pathExtension.lowercased()
    let staged = cacheDir.appendingPathComponent("\(job.uploadId).\(ext.isEmpty ? "bin" : ext)")

    if let assetId = job.assetIdentifier, !assetId.isEmpty {
      try await streamPHAsset(assetId: assetId, to: staged, mediaType: job.mediaType)
    } else if let fileUri = job.fileUri, !fileUri.isEmpty {
      let src = URL(fileURLWithPath: fileUri.replacingOccurrences(of: "file://", with: ""))
      if staged != src {
        try? FileManager.default.removeItem(at: staged)
        try FileManager.default.copyItem(at: src, to: staged)
      }
    } else {
      throw UploaderError.invalidInput("missing asset identifier or file URI")
    }

    let attrs = try FileManager.default.attributesOfItem(atPath: staged.path)
    let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
    return Materialized(fileURL: staged, size: size) {
      try? FileManager.default.removeItem(at: staged)
    }
  }

  private func streamPHAsset(assetId: String, to destination: URL, mediaType: String) async throws {
    let fetched = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let asset = fetched.firstObject else {
      throw UploaderError.assetUnavailable("PHAsset not found: \(assetId)")
    }
    try? FileManager.default.removeItem(at: destination)
    FileManager.default.createFile(atPath: destination.path, contents: nil)
    guard let handle = try? FileHandle(forWritingTo: destination) else {
      throw UploaderError.assetUnavailable("Cannot open destination for writing")
    }
    defer { try? handle.close() }

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

    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      PHAssetResourceManager.default().requestData(for: resource, options: options) { data in
        handle.write(data)
      } completionHandler: { error in
        if let error = error {
          cont.resume(throwing: UploaderError.assetUnavailable("PHAssetResource read failed: \(error.localizedDescription)"))
        } else {
          cont.resume()
        }
      }
    }
  }

  // MARK: - TUS protocol

  private func tusCreateURL() -> URL? {
    URL(string: "\(supabaseUrl)/storage/v1/upload/resumable")
  }

  private func ensureTusUpload(job: UploadJob, fileURL: URL, totalBytes: Int64) async throws -> URL {
    if let url = loadTusUrl(fingerprint: job.fileFingerprint), totalBytes > 0 {
      return url
    }
    guard let createUrl = tusCreateURL() else {
      throw UploaderError.config("invalid supabaseUrl")
    }
    var request = URLRequest(url: createUrl)
    request.httpMethod = "POST"
    request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
    request.setValue("\(totalBytes)", forHTTPHeaderField: "Upload-Length")
    request.setValue("\(totalBytes)", forHTTPHeaderField: "Content-Length")
    let metadataValue = [
      "bucketName \(base64(bucket))",
      "objectName \(base64(job.objectName))",
      "contentType \(base64(job.contentType))",
      "cacheControl \(base64("3600"))"
    ].joined(separator: ",")
    request.setValue(metadataValue, forHTTPHeaderField: "Upload-Metadata")
    request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")

    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 201,
          let location = http.value(forHTTPHeaderField: "Location") else {
      throw UploaderError.tus("TUS create failed status \((response as? HTTPURLResponse)?.statusCode ?? -1)")
    }
    let url: URL
    if location.hasPrefix("http") {
      url = URL(string: location)!
    } else if let base = URL(string: supabaseUrl) {
      url = base.appendingPathComponent(location)
    } else {
      throw UploaderError.tus("invalid Location header")
    }
    saveTusUrl(fingerprint: job.fileFingerprint, url: url, totalBytes: totalBytes)
    return url
  }

  private func fetchOffset(tusUrl: URL) async throws -> Int64 {
    var request = URLRequest(url: tusUrl)
    request.httpMethod = "HEAD"
    request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
    request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw UploaderError.tus("HEAD failed")
    }
    if http.statusCode == 404 {
      throw UploaderError.tus("tus upload expired (404)")
    }
    guard let offsetStr = http.value(forHTTPHeaderField: "Upload-Offset"),
          let offset = Int64(offsetStr) else {
      throw UploaderError.tus("missing Upload-Offset header")
    }
    return offset
  }

  private func uploadChunks(job: UploadJob, fileURL: URL, tusUrl: URL, totalBytes: Int64, startOffset: Int64) async throws {
    var offset = startOffset
    let handle = try FileHandle(forReadingFrom: fileURL)
    defer { try? handle.close() }
    try handle.seek(toOffset: UInt64(offset))

    while offset < totalBytes {
      let remaining = totalBytes - offset
      let length = Int(min(Int64(chunkBytes), remaining))
      let chunkData = try handle.read(upToCount: length) ?? Data()
      guard chunkData.count > 0 else {
        throw UploaderError.tus("read returned empty chunk")
      }
      let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("\(job.uploadId)-chunk-\(offset).bin")
      try chunkData.write(to: tmp, options: .atomic)
      defer { try? FileManager.default.removeItem(at: tmp) }

      var request = URLRequest(url: tusUrl)
      request.httpMethod = "PATCH"
      request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
      request.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
      request.setValue("\(offset)", forHTTPHeaderField: "Upload-Offset")
      request.setValue("\(chunkData.count)", forHTTPHeaderField: "Content-Length")
      request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
      request.setValue(anonKey, forHTTPHeaderField: "apikey")
      request.timeoutInterval = 90

      let task = session.uploadTask(with: request, fromFile: tmp)
      let inflightRecord = UploadInflight(job: job, task: task)
      queueLock.lock()
      inflight[job.uploadId] = inflightRecord
      taskToUpload[task.taskIdentifier] = job.uploadId
      queueLock.unlock()
      let (response, _) = try await runTaskAwaitable(task: task)
      queueLock.lock()
      inflight.removeValue(forKey: job.uploadId)
      taskToUpload.removeValue(forKey: task.taskIdentifier)
      queueLock.unlock()
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
        throw UploaderError.tus("PATCH non-2xx status \((response as? HTTPURLResponse)?.statusCode ?? -1)")
      }
      let advance = Int64(http.value(forHTTPHeaderField: "Upload-Offset") ?? "")
        ?? (offset + Int64(chunkData.count))
      if advance <= offset {
        throw UploaderError.tus("non-advancing offset")
      }
      offset = advance
      emitProgress(uploadId: job.uploadId, bytes: offset, total: totalBytes)
      queueLock.lock()
      if let idx = queue.firstIndex(where: { $0.uploadId == job.uploadId }) {
        queue[idx].bytesUploaded = offset
        queue[idx].totalBytes = totalBytes
        persistLocked()
      }
      queueLock.unlock()
    }
  }

  private func verifyExists(job: UploadJob) async throws {
    guard let url = URL(string: "\(supabaseUrl)/storage/v1/object/info/\(bucket)/\(escape(job.objectName))") else {
      throw UploaderError.config("invalid verify URL")
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    let (_, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw UploaderError.tus("verify failed status \((response as? HTTPURLResponse)?.statusCode ?? -1)")
    }
  }

  // MARK: - Completion

  private func finishSuccess(uploadId: String, materialized: Materialized) {
    materialized.cleanup()
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].status = .completed
    }
    let objectName = queue.first(where: { $0.uploadId == uploadId })?.objectName ?? ""
    queue.removeAll { $0.uploadId == uploadId }
    persistLocked()
    queueLock.unlock()
    emitter?.sendEvent("onItemCompleted", [
      "uploadId": uploadId,
      "objectName": objectName
    ])
    pump()
    pingDrainIfEmpty()
  }

  private func finishFailure(uploadId: String, error: Error) {
    queueLock.lock()
    if let idx = queue.firstIndex(where: { $0.uploadId == uploadId }) {
      queue[idx].status = .failed
      queue[idx].lastError = error.localizedDescription
    }
    persistLocked()
    queueLock.unlock()
    emitter?.sendEvent("onItemFailed", [
      "uploadId": uploadId,
      "error": error.localizedDescription
    ])
    pump()
    pingDrainIfEmpty()
  }

  private func pingDrainIfEmpty() {
    queueLock.lock()
    let active = queue.contains(where: { $0.status == .queued || $0.status == .syncing }) || !inflight.isEmpty
    queueLock.unlock()
    if !active {
      emitter?.sendEvent("onQueueDrained", [:])
    }
  }

  private func emitProgress(uploadId: String, bytes: Int64, total: Int64) {
    emitter?.sendEvent("onProgress", [
      "uploadId": uploadId,
      "bytesUploaded": bytes,
      "totalBytes": total
    ])
  }

  // MARK: - URLSession bridging

  private struct AwaitResult {
    let response: URLResponse?
    let data: Data?
  }

  private var taskContinuations: [Int: CheckedContinuation<(URLResponse, Data), Error>] = [:]
  private let continuationLock = NSLock()

  private func runTaskAwaitable(task: URLSessionUploadTask) async throws -> (URLResponse, Data) {
    return try await withCheckedThrowingContinuation { cont in
      continuationLock.lock()
      taskContinuations[task.taskIdentifier] = cont
      continuationLock.unlock()
      task.resume()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let id = task.taskIdentifier
    continuationLock.lock()
    let cont = taskContinuations.removeValue(forKey: id)
    continuationLock.unlock()
    guard let cont = cont else { return }
    if let error = error {
      cont.resume(throwing: error)
    } else {
      let response = task.response ?? URLResponse()
      cont.resume(returning: (response, Data()))
    }
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
    guard let data = try? Data(contentsOf: queueFileURL()) else { return }
    guard let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
    queue = arr.compactMap { UploadJob.fromDict($0) }
  }

  private func loadTusUrl(fingerprint: String) -> URL? {
    let key = "recapd.tus.\(fingerprint)"
    guard let str = UserDefaults.standard.string(forKey: key) else { return nil }
    return URL(string: str)
  }

  private func saveTusUrl(fingerprint: String, url: URL, totalBytes: Int64) {
    let key = "recapd.tus.\(fingerprint)"
    UserDefaults.standard.set(url.absoluteString, forKey: key)
  }

  private func base64(_ s: String) -> String {
    Data(s.utf8).base64EncodedString()
  }

  private func escape(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s
  }
}

enum UploaderError: LocalizedError {
  case invalidInput(String)
  case assetUnavailable(String)
  case tus(String)
  case config(String)

  var errorDescription: String? {
    switch self {
    case .invalidInput(let s): return "InvalidInput: \(s)"
    case .assetUnavailable(let s): return "AssetUnavailable: \(s)"
    case .tus(let s): return "Tus: \(s)"
    case .config(let s): return "Config: \(s)"
    }
  }
}

struct UploadInflight {
  let job: UploadJob
  let task: URLSessionUploadTask
}

enum UploadJobStatus: String, Codable {
  case queued
  case syncing
  case completed
  case failed
}

struct UploadJob: Codable {
  let uploadId: String
  let assetIdentifier: String?
  let fileUri: String?
  let objectName: String
  let contentType: String
  let mediaType: String
  let eventId: String
  let userId: String
  let fileFingerprint: String
  var status: UploadJobStatus
  var bytesUploaded: Int64
  var totalBytes: Int64
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
    self.status = .queued
    self.bytesUploaded = 0
    self.totalBytes = 0
    self.lastError = nil
    self.attemptCount = 0
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
      "status": status.rawValue,
      "bytesUploaded": bytesUploaded,
      "totalBytes": totalBytes,
      "lastError": lastError ?? "",
      "attemptCount": attemptCount
    ]
  }

  static func fromDict(_ d: [String: Any]) -> UploadJob? {
    guard let uploadId = d["uploadId"] as? String,
          let objectName = d["objectName"] as? String,
          let contentType = d["contentType"] as? String,
          let mediaType = d["mediaType"] as? String,
          let eventId = d["eventId"] as? String,
          let userId = d["userId"] as? String,
          let fileFingerprint = d["fileFingerprint"] as? String,
          let statusStr = d["status"] as? String,
          let status = UploadJobStatus(rawValue: statusStr) else { return nil }
    var input = UploadItemInput()
    input.uploadId = uploadId
    input.assetIdentifier = (d["assetIdentifier"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    input.fileUri = (d["fileUri"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    input.objectName = objectName
    input.contentType = contentType
    input.mediaType = mediaType
    input.eventId = eventId
    input.userId = userId
    input.fileFingerprint = fileFingerprint
    var job = UploadJob(input: input)
    job.status = status
    job.bytesUploaded = (d["bytesUploaded"] as? NSNumber)?.int64Value ?? 0
    job.totalBytes = (d["totalBytes"] as? NSNumber)?.int64Value ?? 0
    job.lastError = (d["lastError"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    job.attemptCount = (d["attemptCount"] as? NSNumber)?.intValue ?? 0
    return job
  }
}
