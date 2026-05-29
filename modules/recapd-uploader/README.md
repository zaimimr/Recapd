# recapd-uploader

Native background upload engine for Recapd. Modeled after the patterns used by Google Photos, iCloud Photos and Dropbox: JS owns the queue metadata + UI, native code owns the bytes.

## Why this exists

The previous JS-driven TUS uploader had the photo bytes flowing through the Hermes heap as 1-2 MB base64 chunks. While uploading 200+ items the cumulative pressure (manipulator decode + ExpoImage memory cache + base64 chunk reads + UI re-renders) walked the iOS resident memory toward the foreground jetsam ceiling (~3.5 GB on iPhone 15 Pro) and the watchdog killed the app while drawing the grid.

This module moves the data path out of JS into platform-native upload daemons:

- **iOS**: `URLSessionConfiguration.background(withIdentifier:)`. The OS-managed upload daemon owns the chunks, can resume after the app is force-quit, and uploads opportunistically when battery/network are good. Bytes are streamed from `PHAssetResourceManager.requestData(...)` directly into the URLSession without ever entering the JS heap.
- **Android**: `WorkManager` schedules `OneTimeWorkRequest` with `CONNECTED` network + exponential backoff. The Worker uses OkHttp to PATCH chunks. `MediaStore`/content URIs are streamed directly into the request body.
- **JS**: enqueues `{uploadId, assetIdentifier|fileUri, objectName, mediaType, eventId, userId, fileFingerprint}` and listens for progress / completed / failed events. JS never holds chunk bytes.

## API

```ts
import { RecapdUploader } from "recapd-uploader";

await RecapdUploader.configure({
  supabaseUrl: "...",
  anonKey: "...",
  bearerToken: "...",
  bucket: "event-photos",
});

const ids = await RecapdUploader.enqueue([
  {
    uploadId: "u_123",
    assetIdentifier: "B4F3D5E1-...", // PHAsset.localIdentifier on iOS
    fileUri: undefined,              // or a file:// URI as fallback
    objectName: "<eventId>/<userId>/<ts>_<suffix>.heic",
    contentType: "image/heic",
    mediaType: "photo",
    eventId: "...",
    userId: "...",
    fileFingerprint: "u_123",
  },
]);

RecapdUploader.addProgressListener(({ uploadId, bytesUploaded, totalBytes }) => {
  // update UI
});
RecapdUploader.addCompletedListener(({ uploadId, objectName }) => {
  // insert media_items row in JS (server-side webhook can also do this)
});
RecapdUploader.addFailedListener(({ uploadId, error }) => {
  // show retry chip
});
```

## Persistence

The queue is persisted to `applicationSupportDirectory/recapd-upload-state/queue.json` (iOS) and `filesDir/recapd-upload-state/queue.json` (Android) so that uploads survive app restarts.

The TUS upload URL is cached in `UserDefaults` (iOS) / `SharedPreferences` (Android) keyed by `fileFingerprint` so resume after relaunch picks up at the last known offset rather than re-creating the upload.

## Protocol

Speaks Supabase Storage TUS resumable upload:

- `POST /storage/v1/upload/resumable` with `Upload-Length`, `Upload-Metadata`, `Authorization` headers -> 201 + `Location`
- `HEAD <Location>` -> `Upload-Offset`
- `PATCH <Location>` with `Upload-Offset`, `Content-Type: application/offset+octet-stream`, body = chunk -> 204 + `Upload-Offset`
- `GET /storage/v1/object/info/<bucket>/<objectName>` to verify the object actually landed (mitigates Supabase silent-204 cases observed in production).

## Lifecycle (iOS)

1. JS calls `RecapdUploader.enqueue([...])`. Items are persisted, the pump scheduled.
2. The pump fills photo/video concurrency budgets, then `start(job:)`:
   - Materialize: PHAsset -> staged file in `Caches/recapd-upload-stage/` via streaming `PHAssetResourceManager.requestData`.
   - Ensure TUS upload exists.
   - Read chunk from staged file, write to temp file, `session.uploadTask(with:fromFile:)` on the background URLSession. The OS daemon executes the PATCH.
   - On 2xx, advance offset, persist state, emit progress.
3. After last chunk, verify object exists via `/storage/v1/object/info/...` GET.
4. On success: clean up staged file, drop from queue, emit `onItemCompleted`.
5. App can be force-quit at any chunk. Restart -> queue reloads -> resume from last offset using cached TUS URL.

## Lifecycle (Android)

1. JS calls `RecapdUploader.enqueue([...])`. Items are persisted, work scheduled.
2. `UploadWorker` runs:
   - Stage source via `ContentResolver.openInputStream`.
   - Ensure TUS upload exists.
   - PATCH chunks via OkHttp.
   - Verify object exists.
3. `Result.retry()` on failure -> exponential backoff up to N retries via WorkManager.

## Notes / known limitations (v0.1)

- iOS: the native URLSession background config requires file-based upload tasks; we write each chunk to a temp file before PATCHing. Temp files are deleted in `defer` blocks. There is a small disk cost (~chunk size per inflight upload).
- Android: WorkManager runs in the same app process. True out-of-process daemon parity with iOS would need a foreground Service. v0.1 keeps it simple.
- Cancellation: `cancel(uploadId)` ends inflight tasks via `URLSessionTask.cancel()` / `WorkManager.cancelUniqueWork`.
- Sentry breadcrumbs are emitted from JS based on the event stream; native errors propagate via the `error` field on `onItemFailed`.

## Migration from JS-driven TUS

Old: `lib/storage.ts uploadMedia` -> `lib/tusUpload.ts uploadMediaResumable` -> `fetch` PATCH loop.

New: `lib/storage.ts uploadMedia` -> `RecapdUploader.enqueue` -> native daemon -> `onItemCompleted` -> JS inserts `media_items` row.

The JIT materializer (`lib/uploadSource.ts`) and the JS TUS client (`lib/tusUpload.ts`) become dead code once the native path is in production.
