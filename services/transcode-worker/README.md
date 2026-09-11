# Recapd transcode worker

Self-hosted ffmpeg service. Supabase calls it when a video is uploaded; it produces a light **720p H.264 faststart MP4** (and a poster if one is missing), uploads them back into Supabase storage, and flips `media_items.video_status` to `ready`. No third-party video vendor, no per-minute fees - just the box it runs on. Video stays in your Supabase.

See `../../docs/VIDEO_PIPELINE.md` for the full architecture.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/` | Transcode one video. Body `{ id, storage_path, event_id }`. Called by the DB trigger. |
| POST | `/backfill` | Enqueue up to `{ limit }` videos still `pending`. Run once to backfill old videos. |
| GET | `/health` | Liveness + queue depth. |

All POSTs require header `x-worker-secret` matching `WORKER_SECRET`.

## Run locally

```bash
cp .env.example .env   # fill in the service role key + a random WORKER_SECRET
npm install
npm start
```

ffmpeg must be on PATH (the Docker image installs it).

## Deploy (any container host: Fly.io, Cloud Run, Railway, a VPS)

```bash
docker build -t recapd-transcode-worker .
docker run -p 8080:8080 --env-file .env recapd-transcode-worker
```

Fly.io example:

```bash
fly launch --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WORKER_SECRET=...
fly deploy
```

Pick a machine with at least 1 vCPU / 1 GB RAM. ffmpeg is CPU-bound; scale vCPUs or `MAX_CONCURRENCY` for throughput.

## Wire up Supabase (one time)

The migration `20260608000001_video_transcode_pipeline.sql` adds the columns, bucket, RLS, and trigger. The trigger reads two Vault secrets - set them to your deployed worker:

```sql
select vault.create_secret('https://your-worker-host/', 'transcode_worker_url');
select vault.create_secret('the-same-WORKER_SECRET', 'transcode_worker_secret');
```

(`pg_net` must be enabled - it already is for the HLS trigger.)

## Backfill existing videos

```bash
curl -X POST https://your-worker-host/backfill \
  -H "x-worker-secret: $WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

Repeat until it returns `{"enqueued": 0}`.

## What the app does with the output

`useVideoPlaybackUri` prefers `rendition_path` once `video_status = 'ready'`. A faststart MP4 streams progressively (the player issues range requests), so playback starts fast and stays smooth. Until a video is `ready`, the app falls back to the existing byte-range HLS over the original, then the raw original.
