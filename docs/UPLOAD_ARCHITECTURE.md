# Recapd upload architecture (v2)

## Why this changed

The v1 (JS-driven TUS) pipeline had photo / video bytes flowing through the Hermes heap as base64 chunks. When a user opened the event grid mid-upload, three forces stacked on top of each other:

1. JS-side TUS chunk reads (2 MB base64 -> ~5 MB transient JS memory per chunk)
2. ExpoImage decoding remote thumbnails as the user scrolled (~2 MB decoded bitmap per 720 px tile, `memory-disk` cache holding them)
3. UI re-render storm because `pendingUploads` mutated on every chunk PATCH

The cumulative resident memory walked up to the foreground jetsam ceiling on iPhone 15 Pro (~3.5 GB), iOS killed the app, Sentry tagged it as the `vImage` + `img_interpolate_read` watchdog hang.

Big providers (Google Photos, iCloud, Dropbox) avoid this entire failure class by keeping the bytes out of the app process. We adopt the same model.

## High-level shape

```
            JS                                          Native
+------------------------+                +----------------------------+
| eventStore             |                | RecapdUploaderModule (Swift / Kotlin)
|  pendingUploads (UI)   | -- enqueue --> | UploadManager queue + persistence
|  failedUploadsKey      | <-- events --- | URLSession.background (iOS)
|  UploadProgressBar     |                | WorkManager + OkHttp (Android)
+------------------------+                +----------------------------+
        |                                            |
        | media_items row insert on success          | streams PHAsset / MediaStore
        v                                            v
   Supabase Postgres                            Supabase TUS endpoint
```

JS owns metadata + UI state. Native owns bytes + protocol + retries + persistence.

## Native module: `recapd-uploader`

Located at `modules/recapd-uploader`. An Expo Module exposing a Swift/Kotlin native uploader with a TS bridge in `src/index.ts`.

### Surface

```ts
RecapdUploader.configure({ supabaseUrl, anonKey, bearerToken, bucket?, maxConcurrentPhotos?, maxConcurrentVideos?, chunkBytes? });
RecapdUploader.enqueue(items: UploadItemInput[]);
RecapdUploader.cancel(uploadId);
RecapdUploader.retry(uploadId);
RecapdUploader.clearFailed();
RecapdUploader.getQueueState(): Promise<QueueSnapshot>;
RecapdUploader.kick();

RecapdUploader.addProgressListener(cb);
RecapdUploader.addCompletedListener(cb);
RecapdUploader.addFailedListener(cb);
RecapdUploader.addDrainedListener(cb);
```

### iOS implementation

- `URLSessionConfiguration.background(withIdentifier: "com.zaimimran.recapd.upload.background")` so uploads continue when the app is backgrounded; with `sessionSendsLaunchEvents = true` iOS may even relaunch the app silently to handle completion (handed off via the `AppDelegate handleEventsForBackgroundURLSession:`).
- Source materialization streams via `PHAssetResourceManager.requestData(...)` directly into a writable file handle in `Caches/recapd-upload-stage/`. The full HEIC bitmap is never decoded; bytes flow through `Data` chunks without the JS heap involved.
- Each TUS PATCH is performed via `session.uploadTask(with: request, fromFile: tmpChunkURL)` so the daemon handles the transfer; the temp chunk file is removed in the same iteration.
- TUS URL is cached in `UserDefaults` keyed by `fileFingerprint`, so on app relaunch the offset HEAD picks up from the last good byte rather than re-creating the upload.
- Queue is persisted as JSON to `applicationSupportDirectory/recapd-upload-state/queue.json`. On `OnCreate` the queue is reloaded so in-flight uploads can be inspected via `getQueueState()`.

### Android implementation

- `WorkManager` schedules each upload as a `OneTimeWorkRequest` with `NetworkType.CONNECTED` + `BackoffPolicy.EXPONENTIAL` so retries are managed by the OS rather than the app.
- `UploadWorker` is a `CoroutineWorker` that uses OkHttp to run the TUS protocol. The source `ContentResolver.openInputStream` returns a stream that's chunked into the request body without a full read into memory.
- TUS URL cached in `SharedPreferences` keyed by `fileFingerprint`.
- Queue persisted to `filesDir/recapd-upload-state/queue.json`.

### Protocol

Speaks the Supabase Storage TUS resumable upload protocol exactly as the previous JS implementation did:

| Method | Path | Headers | Body |
|---|---|---|---|
| POST | `/storage/v1/upload/resumable` | `Tus-Resumable: 1.0.0`, `Upload-Length`, `Upload-Metadata` (base64 bucketName/objectName/contentType), `Authorization`, `apikey` | empty |
| HEAD | `<Location>` | `Tus-Resumable: 1.0.0`, `Authorization`, `apikey` | empty, returns `Upload-Offset` |
| PATCH | `<Location>` | `Tus-Resumable: 1.0.0`, `Content-Type: application/offset+octet-stream`, `Upload-Offset`, `Authorization`, `apikey` | chunk bytes |
| GET | `/storage/v1/object/info/<bucket>/<encoded objectName>` | `Authorization`, `apikey` | verification probe |

The trailing GET is the same "silent 204" guard we shipped in v1.8.2. Supabase TUS occasionally PATCHes 204 without persisting; if the object isn't visible at the info endpoint we fail the upload loudly rather than insert a phantom DB row.

## JS integration

| File | Role |
|---|---|
| `lib/recapdUploaderBridge.ts` | JS-side bridge. Holds per-upload metadata (eventId, userId, captured_at, thumbnail path) so the `onItemCompleted` event can build the `media_items` row + insert it. Owns global listeners. |
| `lib/uploadQueue.ts` | Thin shim. `processUploadQueue` now translates pending uploads into `RecapdUploaderItemArgs` and calls `enqueueRecapdUploads`. There is no JS-side concurrency pool any more. |
| `lib/storage.ts` | Helpers (`getContentType`, `getPathExtension`) are exported and used by `uploadQueue` to derive object names. `uploadMedia` is still exported as a one-shot fallback but not called from the queue. |
| `lib/uploadId.ts` | Pure `generateUploadId` factored out so tests that need it don't drag in AsyncStorage. |
| `app/_layout.tsx` | On user login, fetches Supabase session bearer token and calls `configureRecapdUploader`. Re-configures when the token changes. |

## Lifecycle

### Enqueue

1. User picks photos / videos in `contribute/[eventId]`.
2. `eventStore.addPendingUploads(...)` inserts items into `pendingUploads`, schedules `processPendingUploads`.
3. `processUploadQueue` translates them to native inputs (deriving `objectName = <eventId>/<userId>/<ts>_<suffix>.<ext>`) and calls `RecapdUploader.enqueue([...])`.
4. JS marks each as `syncing`. UI updates: bottom progress toast + grid filters as before.

### Upload (per item)

1. Native pump checks photo / video concurrency budgets and starts an item.
2. Materialize source bytes into a staged file (out of JS heap).
3. Ensure TUS upload exists (cached or POST-created).
4. Read offset (HEAD), then PATCH chunks until `offset == totalBytes`.
5. Verify object exists at `/storage/v1/object/info/...`.
6. Emit `onItemCompleted({ uploadId, objectName })`.

### Completion (in JS)

1. `recapdUploaderBridge` looks up the upload metadata it stashed at enqueue time.
2. Inserts the `media_items` row with that metadata.
3. Removes the item from `pendingUploads`, persists.
4. Existing realtime channel surfaces the row to other guests.

### Failure

1. Native pumps `Result.retry()` (Android) or marks status `failed` (iOS, since the v1.8.2 mandate is no auto-retry per `feedback_no_auto_retry`).
2. Emits `onItemFailed({ uploadId, error })`.
3. JS marks the upload `failed`. The grid shows a Failed tile + Retry button. `RecapdUploader.retry(uploadId)` re-queues it.

### App death / relaunch

iOS:
1. Background URLSession persists its in-flight transfer to disk. The OS resumes on relaunch via the session delegate callbacks (we plan to wire `AppDelegate.handleEventsForBackgroundURLSession` in a follow-up; v0.1 relies on TUS resume rather than session restoration).
2. On `RecapdUploaderModule.OnCreate`, the queue JSON is reloaded.
3. The next `kick()` re-fires the pump; items resume from the cached TUS offset.

Android:
1. WorkManager persists work requests across process restarts.
2. On boot the Worker resumes from the cached TUS offset.

## Memory budget after v2

The grid + scroll path is the same as v1.8.x but the upload pipeline no longer contributes to the JS heap. On the same iPhone 15 Pro test that previously walked to 3.4 GB:

- Decoded ExpoImage tiles: bounded by `cachePolicy: "disk"` + memory warning -> `Image.clearMemoryCache()` (v1 mitigation kept).
- Manipulator thumbnails for failed-upload tiles: bounded by 2-concurrent semaphore (v1 mitigation kept).
- Upload pipeline JS memory: ~0. JS only holds metadata + listener closures.
- Native upload buffers: ~chunk size per inflight (1 MB photo, 1 MB video; bounded by `maxConcurrentPhotos + maxConcurrentVideos`).

## Known v0.1 limitations

| | Status | Plan |
|---|---|---|
| Per-tile upload progress UI | Single aggregate via existing UploadProgressBar | Next iteration |
| Video thumbnail generation | Server-side (Supabase Edge Function / DB trigger expected to fill in) | Next iteration |
| iOS app-relaunch on background completion | Not wired to AppDelegate yet; we rely on TUS resume on next launch | Follow-up |
| Android foreground notification | Not yet surfaced; WorkManager runs without a visible notification | Follow-up |

## Migration

Old: `lib/storage.ts uploadMedia` -> `lib/tusUpload.ts` -> JS PATCH loop -> DB insert.

New: `processUploadQueue` -> `RecapdUploader.enqueue` -> native upload daemon -> `onItemCompleted` event -> JS DB insert.

`lib/tusUpload.ts` + `lib/uploadSource.ts` remain in the tree for the moment (the JS-side TUS helpers are still exercised by tests + the one-shot `uploadMedia` fallback) but become dead code once we delete the fallback path.
