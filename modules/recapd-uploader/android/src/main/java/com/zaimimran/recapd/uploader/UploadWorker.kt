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
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

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
    val bearerToken = data.getString("bearerToken") ?: ""
    val bucket = data.getString("bucket") ?: "event-photos"
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

    return try {
      val tusUrl = ensureTusUpload(
        supabaseUrl = supabaseUrl,
        anonKey = anonKey,
        bearerToken = bearerToken,
        bucket = bucket,
        objectName = objectName,
        contentType = contentType,
        totalBytes = totalBytes,
        fingerprint = fingerprint
      )
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
          resp.use {
            if (!resp.isSuccessful) {
              throw RuntimeException("PATCH ${resp.code}")
            }
            val nextOffsetHeader = resp.header("Upload-Offset")
            val nextOffset = nextOffsetHeader?.toLongOrNull() ?: (offset + read.toLong())
            if (nextOffset <= offset) throw RuntimeException("non-advancing offset")
            offset = nextOffset
          }
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
      UploadManager.emitCompleted(uploadId, objectName)
      Result.success()
    } catch (e: Exception) {
      UploadManager.emitFailed(uploadId, e.message ?: "unknown")
      Result.retry()
    } finally {
      runCatching { if (staged.exists()) staged.delete() }
    }
  }

  private fun stageSource(uploadId: String, assetIdentifier: String, fileUri: String, objectName: String): File {
    val cacheDir = File(applicationContext.cacheDir, "recapd-upload-stage")
    if (!cacheDir.exists()) cacheDir.mkdirs()
    val ext = objectName.substringAfterLast('.', "bin").lowercase()
    val out = File(cacheDir, "$uploadId.$ext")
    val resolver = applicationContext.contentResolver
    val stream: InputStream = when {
      assetIdentifier.isNotEmpty() -> resolver.openInputStream(Uri.parse(assetIdentifier))
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
    val url = "$supabaseUrl/storage/v1/object/info/$bucket/${java.net.URLEncoder.encode(objectName, "UTF-8").replace("+", "%20")}"
    val req = Request.Builder()
      .url(url)
      .get()
      .header("Authorization", "Bearer $bearerToken")
      .header("apikey", anonKey)
      .build()
    val resp = client.newCall(req).execute()
    resp.use {
      if (!resp.isSuccessful) throw RuntimeException("verify ${resp.code}")
    }
  }

  private fun b64(s: String) = android.util.Base64.encodeToString(
    s.toByteArray(Charsets.UTF_8),
    android.util.Base64.NO_WRAP
  )
}
