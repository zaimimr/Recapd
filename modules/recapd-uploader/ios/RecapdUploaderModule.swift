import ExpoModulesCore
import Foundation
import Photos

public class RecapdUploaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RecapdUploader")

    Events("onProgress", "onItemCompleted", "onItemFailed", "onQueueDrained")

    OnCreate {
      UploadManager.shared.bind(emitter: self)
    }

    AsyncFunction("configure") { (config: UploaderConfig) -> Void in
      UploadManager.shared.configure(config)
    }

    AsyncFunction("enqueue") { (items: [UploadItemInput]) -> [String] in
      return try UploadManager.shared.enqueue(items: items)
    }

    AsyncFunction("cancel") { (uploadId: String) -> Void in
      UploadManager.shared.cancel(uploadId: uploadId)
    }

    AsyncFunction("clearFailed") { () -> Void in
      UploadManager.shared.clearFailed()
    }

    AsyncFunction("getQueueState") { () -> [String: Any] in
      return UploadManager.shared.snapshot()
    }

    AsyncFunction("retry") { (uploadId: String) -> Void in
      UploadManager.shared.retry(uploadId: uploadId)
    }

    AsyncFunction("kick") { () -> Void in
      UploadManager.shared.kick()
    }
  }
}

struct UploaderConfig: Record {
  @Field var supabaseUrl: String = ""
  @Field var anonKey: String = ""
  @Field var bearerToken: String = ""
  @Field var bucket: String = "event-photos"
  @Field var maxConcurrentPhotos: Int = 2
  @Field var maxConcurrentVideos: Int = 1
  @Field var chunkBytes: Int = 1 * 1024 * 1024
}

struct UploadItemInput: Record {
  @Field var uploadId: String = ""
  @Field var assetIdentifier: String? = nil
  @Field var fileUri: String? = nil
  @Field var objectName: String = ""
  @Field var contentType: String = ""
  @Field var mediaType: String = "photo"
  @Field var eventId: String = ""
  @Field var userId: String = ""
  @Field var fileFingerprint: String = ""
}
