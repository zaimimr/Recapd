package com.zaimimran.recapd.uploader

import android.content.Context
import android.net.Uri
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.modules.Module
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

object UploadManager {
  private const val WORK_NAME_PREFIX = "recapd-upload-"
  private const val QUEUE_PREFS = "recapd-upload-queue"

  private var context: Context? = null
  private var module: Module? = null

  @Volatile var supabaseUrl: String = ""
  @Volatile var anonKey: String = ""
  @Volatile var bearerToken: String = ""
  @Volatile var refreshToken: String = ""
  @Volatile var bucket: String = "event-photos"
  @Volatile var maxConcurrentPhotos: Int = 2
  @Volatile var maxConcurrentVideos: Int = 1
  @Volatile var chunkBytes: Int = 1 * 1024 * 1024

  private val queue = ConcurrentHashMap<String, UploadJob>()

  private val refreshLock = Any()
  @Volatile private var refreshInProgress = false
  private val refreshClient by lazy {
    OkHttpClient.Builder()
      .callTimeout(30, TimeUnit.SECONDS)
      .build()
  }

  fun attach(ctx: Context, mod: Module) {
    context = ctx.applicationContext
    module = mod
    loadQueue()
  }

  fun configure(config: UploaderConfig) {
    supabaseUrl = config.supabaseUrl
    anonKey = config.anonKey
    bearerToken = config.bearerToken
    if (config.refreshToken.isNotEmpty()) {
      refreshToken = config.refreshToken
    }
    bucket = config.bucket
    maxConcurrentPhotos = maxOf(1, config.maxConcurrentPhotos)
    maxConcurrentVideos = maxOf(1, config.maxConcurrentVideos)
    chunkBytes = maxOf(256 * 1024, config.chunkBytes)
    kick()
  }

  fun enqueue(items: List<UploadItemInput>): List<String> {
    val ids = mutableListOf<String>()
    for (item in items) {
      val job = UploadJob.fromInput(item)
      queue[item.uploadId] = job
      ids.add(item.uploadId)
    }
    saveQueue()
    kick()
    return ids
  }

  fun cancel(uploadId: String) {
    context?.let {
      WorkManager.getInstance(it).cancelUniqueWork(WORK_NAME_PREFIX + uploadId)
    }
    queue.remove(uploadId)
    saveQueue()
  }

  fun clearFailed() {
    val toRemove = queue.values.filter { it.status == JobStatus.FAILED }.map { it.uploadId }
    toRemove.forEach { queue.remove(it) }
    saveQueue()
  }

  fun retry(uploadId: String) {
    val job = queue[uploadId] ?: return
    job.status = JobStatus.QUEUED
    job.lastError = null
    job.attemptCount = 0
    saveQueue()
    enqueueWork(job)
  }

  fun kick() {
    val ctx = context ?: return
    var photos = 0
    var videos = 0
    for (job in queue.values) {
      if (job.status == JobStatus.COMPLETED || job.status == JobStatus.FAILED) continue
      if (job.mediaType == "video") {
        if (videos < maxConcurrentVideos) {
          enqueueWork(job)
          videos++
        }
      } else {
        if (photos < maxConcurrentPhotos) {
          enqueueWork(job)
          photos++
        }
      }
    }
  }

  private fun enqueueWork(job: UploadJob) {
    val ctx = context ?: return
    val data = Data.Builder()
      .putString("uploadId", job.uploadId)
      .putString("objectName", job.objectName)
      .putString("contentType", job.contentType)
      .putString("mediaType", job.mediaType)
      .putString("eventId", job.eventId)
      .putString("userId", job.userId)
      .putString("fingerprint", job.fileFingerprint)
      .putString("assetIdentifier", job.assetIdentifier ?: "")
      .putString("fileUri", job.fileUri ?: "")
      .putString("supabaseUrl", supabaseUrl)
      .putString("anonKey", anonKey)
      .putString("bearerToken", bearerToken)
      .putString("refreshToken", refreshToken)
      .putString("bucket", bucket)
      .putInt("chunkBytes", chunkBytes)
      .build()
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()
    val request = OneTimeWorkRequestBuilder<UploadWorker>()
      .setConstraints(constraints)
      .setInputData(data)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
      .addTag("recapd-upload")
      .build()
    WorkManager.getInstance(ctx).enqueueUniqueWork(
      WORK_NAME_PREFIX + job.uploadId,
      ExistingWorkPolicy.KEEP,
      request
    )
  }

  fun snapshot(): Map<String, Any> {
    val items = queue.values.map {
      mapOf(
        "uploadId" to it.uploadId,
        "status" to it.status.value,
        "objectName" to it.objectName,
        "mediaType" to it.mediaType,
        "eventId" to it.eventId,
        "userId" to it.userId,
        "bytesUploaded" to it.bytesUploaded,
        "totalBytes" to it.totalBytes,
        "lastError" to (it.lastError ?: ""),
        "attemptCount" to it.attemptCount
      )
    }
    return mapOf("items" to items)
  }

  fun emitProgress(uploadId: String, bytes: Long, total: Long) {
    queue[uploadId]?.also {
      it.bytesUploaded = bytes
      it.totalBytes = total
    }
    saveQueue()
    module?.sendEvent("onProgress", mapOf(
      "uploadId" to uploadId,
      "bytesUploaded" to bytes,
      "totalBytes" to total
    ))
  }

  fun emitCompleted(uploadId: String, objectName: String, thumbnailPath: String? = null) {
    queue.remove(uploadId)
    saveQueue()
    module?.sendEvent("onItemCompleted", mapOf(
      "uploadId" to uploadId,
      "objectName" to objectName,
      "thumbnailPath" to (thumbnailPath ?: "")
    ))
    pingDrainIfEmpty()
  }

  fun emitFailed(uploadId: String, error: String) {
    queue[uploadId]?.also {
      it.status = JobStatus.FAILED
      it.lastError = error
    }
    saveQueue()
    module?.sendEvent("onItemFailed", mapOf(
      "uploadId" to uploadId,
      "error" to error
    ))
    pingDrainIfEmpty()
  }

  private fun emitTokenRefreshed(accessToken: String, refreshToken: String, expiresIn: Int) {
    module?.sendEvent("onTokenRefreshed", mapOf(
      "accessToken" to accessToken,
      "refreshToken" to refreshToken,
      "expiresIn" to expiresIn
    ))
  }

  private fun pingDrainIfEmpty() {
    val active = queue.values.any { it.status == JobStatus.QUEUED || it.status == JobStatus.SYNCING }
    if (!active) {
      module?.sendEvent("onQueueDrained", mapOf<String, Any>())
    }
  }

  fun currentBearerToken(): String = bearerToken

  fun isBearerStale(token: String): Boolean {
    val expiry = jwtExpiryMillis(token) ?: return true
    return expiry - System.currentTimeMillis() < 60_000
  }

  private fun jwtExpiryMillis(token: String): Long? {
    val segments = token.split(".")
    if (segments.size != 3) return null
    return try {
      var payload = segments[1].replace('-', '+').replace('_', '/')
      while (payload.length % 4 != 0) payload += "="
      val decoded = android.util.Base64.decode(payload, android.util.Base64.DEFAULT)
      val json = JSONObject(String(decoded, Charsets.UTF_8))
      if (!json.has("exp")) return null
      json.getLong("exp") * 1000L
    } catch (e: Exception) {
      null
    }
  }

  fun refreshAccessTokenIfStale(seenBearer: String): String? {
    synchronized(refreshLock) {
      while (refreshInProgress) {
        try {
          (refreshLock as Object).wait()
        } catch (e: InterruptedException) {
          Thread.currentThread().interrupt()
          return null
        }
      }
      val current = bearerToken
      if (current.isNotEmpty() && current != seenBearer) {
        return current
      }
      refreshInProgress = true
    }

    var result: String? = null
    try {
      result = performTokenRefresh()
    } finally {
      synchronized(refreshLock) {
        refreshInProgress = false
        (refreshLock as Object).notifyAll()
      }
    }
    return result
  }

  private fun performTokenRefresh(): String? {
    val base = supabaseUrl
    val key = anonKey
    val token = refreshToken
    if (base.isEmpty() || token.isEmpty()) return null
    return try {
      val url = "$base/auth/v1/token?grant_type=refresh_token"
      val payload = JSONObject().put("refresh_token", token).toString()
      val req = Request.Builder()
        .url(url)
        .post(payload.toRequestBody("application/json".toMediaTypeOrNull()))
        .header("apikey", key)
        .header("Content-Type", "application/json")
        .build()
      refreshClient.newCall(req).execute().use { resp ->
        if (!resp.isSuccessful) return null
        val bodyStr = resp.body?.string() ?: return null
        val json = JSONObject(bodyStr)
        val access = json.optString("access_token", "")
        if (access.isEmpty()) return null
        bearerToken = access
        val newRefresh = json.optString("refresh_token", "")
        if (newRefresh.isNotEmpty()) {
          refreshToken = newRefresh
        }
        val expiresIn = json.optInt("expires_in", 3600)
        emitTokenRefreshed(access, refreshToken, expiresIn)
        access
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun queueFile(): File {
    val dir = File(context!!.filesDir, "recapd-upload-state")
    if (!dir.exists()) dir.mkdirs()
    return File(dir, "queue.json")
  }

  private fun saveQueue() {
    val ctx = context ?: return
    val arr = JSONArray()
    for (job in queue.values) {
      arr.put(JSONObject(job.toMap()))
    }
    runCatching { queueFile().writeText(arr.toString()) }
  }

  private fun loadQueue() {
    val ctx = context ?: return
    val file = queueFile()
    if (!file.exists()) return
    runCatching {
      val arr = JSONArray(file.readText())
      for (i in 0 until arr.length()) {
        val obj = arr.getJSONObject(i)
        val job = UploadJob.fromJson(obj) ?: continue
        queue[job.uploadId] = job
      }
    }
  }
}

enum class JobStatus(val value: String) {
  QUEUED("queued"),
  SYNCING("syncing"),
  COMPLETED("completed"),
  FAILED("failed");

  companion object {
    fun of(v: String?): JobStatus = values().firstOrNull { it.value == v } ?: QUEUED
  }
}

data class UploadJob(
  val uploadId: String,
  val assetIdentifier: String?,
  val fileUri: String?,
  val objectName: String,
  val contentType: String,
  val mediaType: String,
  val eventId: String,
  val userId: String,
  val fileFingerprint: String,
  var status: JobStatus = JobStatus.QUEUED,
  var bytesUploaded: Long = 0,
  var totalBytes: Long = 0,
  var lastError: String? = null,
  var attemptCount: Int = 0
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "uploadId" to uploadId,
    "assetIdentifier" to (assetIdentifier ?: ""),
    "fileUri" to (fileUri ?: ""),
    "objectName" to objectName,
    "contentType" to contentType,
    "mediaType" to mediaType,
    "eventId" to eventId,
    "userId" to userId,
    "fileFingerprint" to fileFingerprint,
    "status" to status.value,
    "bytesUploaded" to bytesUploaded,
    "totalBytes" to totalBytes,
    "lastError" to (lastError ?: ""),
    "attemptCount" to attemptCount
  )

  companion object {
    fun fromInput(input: UploadItemInput) = UploadJob(
      uploadId = input.uploadId,
      assetIdentifier = input.assetIdentifier?.takeIf { it.isNotEmpty() },
      fileUri = input.fileUri?.takeIf { it.isNotEmpty() },
      objectName = input.objectName,
      contentType = input.contentType,
      mediaType = input.mediaType,
      eventId = input.eventId,
      userId = input.userId,
      fileFingerprint = input.fileFingerprint
    )

    fun fromJson(o: JSONObject): UploadJob? {
      val uploadId = o.optString("uploadId").takeIf { it.isNotEmpty() } ?: return null
      return UploadJob(
        uploadId = uploadId,
        assetIdentifier = o.optString("assetIdentifier").takeIf { it.isNotEmpty() },
        fileUri = o.optString("fileUri").takeIf { it.isNotEmpty() },
        objectName = o.optString("objectName"),
        contentType = o.optString("contentType"),
        mediaType = o.optString("mediaType", "photo"),
        eventId = o.optString("eventId"),
        userId = o.optString("userId"),
        fileFingerprint = o.optString("fileFingerprint"),
        status = JobStatus.of(o.optString("status")),
        bytesUploaded = o.optLong("bytesUploaded"),
        totalBytes = o.optLong("totalBytes"),
        lastError = o.optString("lastError").takeIf { it.isNotEmpty() },
        attemptCount = o.optInt("attemptCount")
      )
    }
  }
}
