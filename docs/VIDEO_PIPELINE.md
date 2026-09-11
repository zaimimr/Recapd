# Video pipeline

How video gets from a guest's phone to smooth playback in someone else's grid.

## Current state (before transcode)

1. Phone records a video, native uploader (`recapd-uploader`) TUS-uploads the original file to the `event-photos` bucket and inserts the `media_items` row.
2. A thumbnail is generated natively from the first frame (iOS `AVAssetImageGenerator`, Android `MediaMetadataRetriever`) and uploaded to the `thumbnails` bucket; `thumbnail_path` is set.
3. An `after insert` trigger calls the `process-video-hls` edge function, which reads the original MP4's moov atom and writes a byte-range segment manifest (`hls_path`). Playback streams the original file in chunks via a generated HLS `data:` manifest.

### Why playback is still laggy

`process-video-hls` does **not** re-encode. The byte-range manifest streams the **original** file: a modern phone shoots 4K / 60fps HEVC at a very high bitrate. The client downloads and decodes that full stream, so:

- High bandwidth -> slow start, stalls on weak networks.
- Heavy decode -> dropped frames on mid-range devices.
- No adaptive bitrate -> one quality for everyone.

Chunked streaming (the "play while loading" approach) is already in place; the missing half is a **lighter rendition** to stream.

## Target architecture

Add a transcode step that produces, per video:

- A **720p H.264 rendition** (capped ~2.5 Mbps) for phone playback.
- An **adaptive HLS** ladder (e.g. 1080p / 720p / 480p) so weak networks drop down instead of stalling.
- A **poster** image (replaces the best-effort native thumbnail when available).

`media_items` gains pointers to the transcoded outputs. The client prefers the rendition/HLS ladder and only falls back to the original when transcode hasn't finished.

### Schema additions (draft)

```sql
alter table public.media_items
  add column if not exists playback_hls_path text,      -- adaptive HLS master playlist
  add column if not exists rendition_path text,         -- single 720p mp4 fallback
  add column if not exists video_status text not null default 'pending'
    check (video_status in ('pending','processing','ready','failed')),
  add column if not exists video_processed_at timestamptz;
```

`hls_path` (byte-range manifest over the original) stays as the interim fallback until `video_status = 'ready'`.

### Processing flow

```
insert media_items (video)
  -> trigger -> enqueue transcode job (webhook to worker)
  -> worker: download original -> ffmpeg -> {hls ladder, 720p mp4, poster}
  -> worker: upload outputs, update media_items (playback_hls_path, rendition_path,
             thumbnail_path if missing, video_status='ready')
  -> realtime update -> client swaps to the rendition
```

Backfill = run the same worker over `where media_type='video' and video_status='pending'`.

## Backend options for the transcode worker

Supabase Edge (Deno Deploy) has **no ffmpeg**, so the worker must live elsewhere.

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **Managed (Mux / Cloudflare Stream / Cloudinary)** | Upload original, vendor returns adaptive HLS + poster + analytics | Fastest to ship, zero ops, great adaptive playback, signed playback URLs | Per-minute/storage cost, another vendor, video lives off Supabase |
| **Self-hosted ffmpeg worker (Fly.io / Cloud Run container)** | Our container, triggered by the DB webhook, writes back to Supabase storage | Full control, video stays in Supabase, cheap at low volume | We own scaling, retries, ffmpeg tuning, cold starts |

Recommendation: start **managed** to fix UX now, revisit self-hosting if cost grows. Both fit the schema above; only the worker + URL resolution differ.

## App integration (after worker exists)

- `useVideoPlaybackUri` priority: `playback_hls_path` (adaptive) -> `rendition_path` -> existing byte-range `hls_path` over original -> raw signed MP4.
- Grid/poster: prefer worker poster, fall back to native thumbnail, then lazy backfill.
- Show a subtle "optimizing…" hint on a tile while `video_status = 'processing'` (optional).

## Already shipped (phases 1-3)

- **Playback feedback** (`VideoPlayer.tsx`): real loading spinner, buffering, true play/pause, error + retry, progress bar via expo-video `statusChange`/`playingChange`/`timeUpdate`.
- **Native video thumbnails** for new uploads (iOS `AVAssetImageGenerator`, Android `MediaMetadataRetriever`).
- **Lazy thumbnail backfill** for existing videos when opened in the viewer (`backfillVideoThumbnail`).
- Removed the harmful `generate-video-thumbnails` edge function (it stamped 1x1 placeholder PNGs).
