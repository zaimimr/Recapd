package com.zaimimran.recapd.uploader

import android.content.Context
import android.net.Uri
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.io.File
import java.io.InputStream
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class UploadWorker(
  appContext: Context,
  workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

  private val client by lazy {
    OkHttpClient.Builder()
      .callTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
      .readTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
      .writeTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
      .build()
  }

  override suspend fun doWork(): Result {
    val data = inputData
    val uploadId = data.getString("uploadId") ?: return Result.failure()
    val objectName = data.getString("objectName") ?: ""
    val contentType = data.getString("contentType") ?: "application/octet-stream"
    val mediaType = data.getString("mediaType") ?: "photo"
    val eventId = data.getString("eventId") ?: ""
    val userId = data.getString("userId") ?: ""
    val fingerprint = data.getString("fingerprint") ?: uploadId
    val assetIdentifier = data.getString("assetIdentifier") ?: ""
    val fileUri = data.getString("fileUri") ?: ""
    val supabaseUrl = data.getString("supabaseUrl") ?: ""
    val anonKey = data.getString("anonKey") ?: ""
    val refreshToken = data.getString("refreshToken") ?: ""
    val bucket = data.getString("bucket") ?: "event-photos"
    var bearerToken = UploadManager.currentBearerToken().ifEmpty { data.getString("bearerToken") ?: "" }
    val chunkBytes = data.getInt("chunkBytes", 1 * 1024 * 1024)

    if (supabaseUrl.isEmpty() || anonKey.isEmpty()) {
      UploadManager.emitFailed(uploadId, "uploader not configured")
      return Result.failure()
    }

    val staged = try {
      stageSource(uploadId, assetIdentifier, fileUri, objectName)
    } catch (e: Exception) {
      UploadManager.emitFailed(uploadId, "source unavailable: ${e.message}")
      return Result.failure()
    }
    val totalBytes = staged.length()

    val thumbnailPath = generateAndUploadThumbnail(
      supabaseUrl = supabaseUrl,
      anonKey = anonKey,
      bearerToken = bearerToken,
      objectName = objectName,
      staged = staged,
      contentType = contentType
    )

    return try {
      val tusUrl = try {
        ensureTusUpload(
          supabaseUrl = supabaseUrl,
          anonKey = anonKey,
          bearerToken = bearerToken,
          bucket = bucket,
          objectName = objectName,
          contentType = contentType,
          totalBytes = totalBytes,
          fingerprint = fingerprint
        )
      } catch (e: Exception) {
        val msg = e.message ?: ""
        val authShaped =
          msg.contains("401") || (msg.contains("403") && UploadManager.isBearerStale(bearerToken))
        if (authShaped && refreshToken.isNotEmpty()) {
          val fresh = UploadManager.refreshAccessTokenIfStale(bearerToken)
          if (fresh != null && fresh != bearerToken) {
            bearerToken = fresh
            ensureTusUpload(
              supabaseUrl = supabaseUrl,
              anonKey = anonKey,
              bearerToken = bearerToken,
              bucket = bucket,
              objectName = objectName,
              contentType = contentType,
              totalBytes = totalBytes,
              fingerprint = fingerprint
            )
          } else throw e
        } else throw e
      }
      var offset = fetchOffset(tusUrl, anonKey, bearerToken)
      val input = staged.inputStream()
      input.skip(offset)
      input.use { stream ->
        val buf = ByteArray(chunkBytes)
        while (offset < totalBytes) {
          val read = stream.read(buf, 0, minOf(chunkBytes.toLong(), totalBytes - offset).toInt())
          if (read <= 0) break
          val body = buf.copyOf(read).toRequestBody("application/offset+octet-stream".toMediaTypeOrNull())
          val req = Request.Builder()
            .url(tusUrl)
            .patch(body)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", offset.toString())
            .header("Authorization", "Bearer $bearerToken")
            .header("apikey", anonKey)
            .build()
          val resp = client.newCall(req).execute()
          var patchCode = resp.code
          var nextOffsetHeader = resp.header("Upload-Offset")
          resp.close()

          val patchAuthShaped =
            patchCode == 401 || (patchCode == 403 && UploadManager.isBearerStale(bearerToken))
          if (patchAuthShaped && refreshToken.isNotEmpty()) {
            val fresh = UploadManager.refreshAccessTokenIfStale(bearerToken)
            if (fresh != null && fresh != bearerToken) {
              bearerToken = fresh
              val retryReq = Request.Builder()
                .url(tusUrl)
                .patch(buf.copyOf(read).toRequestBody("application/offset+octet-stream".toMediaTypeOrNull()))
                .header("Tus-Resumable", "1.0.0")
                .header("Upload-Offset", offset.toString())
                .header("Authorization", "Bearer $bearerToken")
                .header("apikey", anonKey)
                .build()
              val retryResp = client.newCall(retryReq).execute()
              patchCode = retryResp.code
              nextOffsetHeader = retryResp.header("Upload-Offset")
              retryResp.close()
            }
          }

          if (patchCode !in 200..299) {
            throw RuntimeException("PATCH $patchCode")
          }
          val nextOffset = nextOffsetHeader?.toLongOrNull() ?: (offset + read.toLong())
          if (nextOffset <= offset) throw RuntimeException("non-advancing offset")
          offset = nextOffset
          UploadManager.emitProgress(uploadId, offset, totalBytes)
        }
      }
      verifyExists(
        supabaseUrl = supabaseUrl,
        anonKey = anonKey,
        bearerToken = bearerToken,
        bucket = bucket,
        objectName = objectName
      )
      staged.delete()
      UploadManager.emitCompleted(uploadId, objectName, thumbnailPath)
      Result.success()
    } catch (e: Exception) {
      UploadManager.emitFailed(uploadId, e.message ?: "unknown")
      Result.retry()
    } finally {
      runCatching { if (staged.exists()) staged.delete() }
    }
  }

  private fun thumbnailObjectName(objectName: String): String {
    val base = objectName.substringBeforeLast('.', objectName)
    return "${base}_thumb.jpg"
  }

  private fun generateAndUploadThumbnail(
    supabaseUrl: String,
    anonKey: String,
    bearerToken: String,
    objectName: String,
    staged: File,
    contentType: String
  ): String? {
    return try {
      val isVideo = contentType.startsWith("video/")
      val jpeg = (if (isVideo) videoFrameJpeg(staged, 512, 60) else downsampledJpeg(staged, 512, 60))
        ?: return null
      val path = thumbnailObjectName(objectName)
      val url = "$supabaseUrl/storage/v1/object/thumbnails/" +
        java.net.URLEncoder.encode(path, "UTF-8").replace("+", "%20")
      val body = jpeg.toRequestBody("image/jpeg".toMediaTypeOrNull())
      val req = Request.Builder()
        .url(url)
        .post(body)
        .header("Authorization", "Bearer $bearerToken")
        .header("apikey", anonKey)
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "3600")
        .build()
      client.newCall(req).execute().use { resp ->
        if (resp.code == 409 || resp.isSuccessful) path else null
      }
    } catch (e: Exception) {
      android.util.Log.w("recapd-uploader", "thumbnail best-effort failed: ${e.message}")
      null
    }
  }

  private fun videoFrameJpeg(file: File, maxPixelSize: Int, quality: Int): ByteArray? {
    val retriever = android.media.MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      val srcW = retriever
        .extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
        ?.toIntOrNull() ?: maxPixelSize
      val srcH = retriever
        .extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
        ?.toIntOrNull() ?: maxPixelSize
      val largest = maxOf(srcW, srcH, 1)
      val scale = minOf(1.0, maxPixelSize.toDouble() / largest)
      val dstW = maxOf(1, (srcW * scale).toInt())
      val dstH = maxOf(1, (srcH * scale).toInt())
      val frame = retriever.getScaledFrameAtTime(
        100_000L,
        android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
        dstW,
        dstH
      ) ?: retriever.frameAtTime ?: return null
      try {
        java.io.ByteArrayOutputStream().use { out ->
          frame.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, out)
          out.toByteArray()
        }
      } finally {
        frame.recycle()
      }
    } catch (e: Exception) {
      android.util.Log.w("recapd-uploader", "video thumbnail failed: ${e.message}")
      null
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {}
    }
  }

  private fun downsampledJpeg(file: File, maxPixelSize: Int, quality: Int): ByteArray? {
    val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    android.graphics.BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    val largest = maxOf(bounds.outWidth, bounds.outHeight)
    while (largest / sample > maxPixelSize) {
      sample *= 2
    }
    val decodeOptions = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = android.graphics.BitmapFactory.decodeFile(file.absolutePath, decodeOptions)
      ?: return null
    return try {
      java.io.ByteArrayOutputStream().use { out ->
        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, out)
        out.toByteArray()
      }
    } finally {
      bitmap.recycle()
    }
  }

  private fun stageSource(uploadId: String, assetIdentifier: String, fileUri: String, objectName: String): File {
    val cacheDir = File(applicationContext.cacheDir, "recapd-upload-stage")
    if (!cacheDir.exists()) cacheDir.mkdirs()
    val ext = objectName.substringAfterLast('.', "bin").lowercase()
    val out = File(cacheDir, "$uploadId.$ext")
    val resolver = applicationContext.contentResolver
    val stream: InputStream = when {
      assetIdentifier.startsWith("content://") -> resolver.openInputStream(Uri.parse(assetIdentifier))
        ?: throw RuntimeException("cannot open assetIdentifier $assetIdentifier")
      fileUri.startsWith("content://") -> resolver.openInputStream(Uri.parse(fileUri))
        ?: throw RuntimeException("cannot open content URI $fileUri")
      fileUri.startsWith("file://") -> File(fileUri.removePrefix("file://")).inputStream()
      fileUri.isNotEmpty() -> File(fileUri).inputStream()
      else -> throw RuntimeException("no source")
    }
    stream.use { src ->
      out.outputStream().use { dst ->
        src.copyTo(dst)
      }
    }
    return out
  }

  private fun ensureTusUpload(
    supabaseUrl: String,
    anonKey: String,
    bearerToken: String,
    bucket: String,
    objectName: String,
    contentType: String,
    totalBytes: Long,
    fingerprint: String
  ): String {
    val prefs = applicationContext.getSharedPreferences("recapd-tus", Context.MODE_PRIVATE)
    val cached = prefs.getString("tus.$fingerprint", null)
    if (cached != null) return cached

    val createUrl = "$supabaseUrl/storage/v1/upload/resumable"
    val metadata = listOf(
      "bucketName ${b64(bucket)}",
      "objectName ${b64(objectName)}",
      "contentType ${b64(contentType)}",
      "cacheControl ${b64("3600")}"
    ).joinToString(",")
    val req = Request.Builder()
      .url(createUrl)
      .post(ByteArray(0).toRequestBody(null))
      .header("Tus-Resumable", "1.0.0")
      .header("Upload-Length", totalBytes.toString())
      .header("Upload-Metadata", metadata)
      .header("Authorization", "Bearer $bearerToken")
      .header("apikey", anonKey)
      .build()
    val resp = client.newCall(req).execute()
    resp.use {
      if (resp.code != 201) throw RuntimeException("TUS create ${resp.code}")
      val loc = resp.header("Location") ?: throw RuntimeException("missing Location")
      val url = if (loc.startsWith("http")) loc else "$supabaseUrl$loc"
      prefs.edit().putString("tus.$fingerprint", url).apply()
      return url
    }
  }

  private fun fetchOffset(tusUrl: String, anonKey: String, bearerToken: String): Long {
    val req = Request.Builder()
      .url(tusUrl)
      .head()
      .header("Tus-Resumable", "1.0.0")
      .header("Authorization", "Bearer $bearerToken")
      .header("apikey", anonKey)
      .build()
    val resp = client.newCall(req).execute()
    resp.use {
      if (resp.code == 404) throw RuntimeException("tus expired (404)")
      if (!resp.isSuccessful) throw RuntimeException("HEAD ${resp.code}")
      return resp.header("Upload-Offset")?.toLongOrNull() ?: throw RuntimeException("no Upload-Offset")
    }
  }

  private fun verifyExists(
    supabaseUrl: String,
    anonKey: String,
    bearerToken: String,
    bucket: String,
    objectName: String
  ) {
    val encodedPath = objectName.split("/").joinToString("/") {
      java.net.URLEncoder.encode(it, "UTF-8").replace("+", "%20")
    }
    val url = "$supabaseUrl/storage/v1/object/info/$bucket/$encodedPath"
    var lastCode = 0
    for (attempt in 1..4) {
      val req = Request.Builder()
        .url(url)
        .get()
        .header("Authorization", "Bearer $bearerToken")
        .header("apikey", anonKey)
        .build()
      client.newCall(req).execute().use { resp ->
        if (resp.isSuccessful) return
        lastCode = resp.code
      }
      Thread.sleep(attempt * 1500L)
    }
    throw RuntimeException("verify $lastCode")
  }

  private fun b64(s: String) = android.util.Base64.encodeToString(
    s.toByteArray(Charsets.UTF_8),
    android.util.Base64.NO_WRAP
  )
}
