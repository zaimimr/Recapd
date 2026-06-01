package com.zaimimran.recapd.uploader

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class RecapdUploaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecapdUploader")

    Events("onProgress", "onItemCompleted", "onItemFailed", "onQueueDrained", "onTokenRefreshed")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      UploadManager.attach(context, this@RecapdUploaderModule)
    }

    AsyncFunction("configure") { config: UploaderConfig ->
      UploadManager.configure(config)
    }

    AsyncFunction("enqueue") { items: List<UploadItemInput> ->
      UploadManager.enqueue(items)
    }

    AsyncFunction("cancel") { uploadId: String ->
      UploadManager.cancel(uploadId)
    }

    AsyncFunction("clearFailed") {
      UploadManager.clearFailed()
    }

    AsyncFunction("getQueueState") {
      UploadManager.snapshot()
    }

    AsyncFunction("retry") { uploadId: String ->
      UploadManager.retry(uploadId)
    }

    AsyncFunction("kick") {
      UploadManager.kick()
    }
  }
}

class UploaderConfig : Record {
  @Field var supabaseUrl: String = ""
  @Field var anonKey: String = ""
  @Field var bearerToken: String = ""
  @Field var refreshToken: String = ""
  @Field var bucket: String = "event-photos"
  @Field var maxConcurrentPhotos: Int = 2
  @Field var maxConcurrentVideos: Int = 1
  @Field var chunkBytes: Int = 1 * 1024 * 1024
}

class UploadItemInput : Record {
  @Field var uploadId: String = ""
  @Field var assetIdentifier: String? = null
  @Field var fileUri: String? = null
  @Field var objectName: String = ""
  @Field var contentType: String = ""
  @Field var mediaType: String = "photo"
  @Field var eventId: String = ""
  @Field var userId: String = ""
  @Field var fileFingerprint: String = ""
}
