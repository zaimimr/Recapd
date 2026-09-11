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

## Deploy on a VPS (Hetzner)

The worker is a plain container. On a box you already pay for this costs nothing extra, and it beats
a scale-to-zero host anyway: the queue lives in memory (`index.js:31`), so a machine that sleeps
loses in-flight work.

```bash
git clone <repo> && cd services/transcode-worker
cp .env.example .env          # service role key + a long random WORKER_SECRET
docker compose up -d --build
docker compose logs -f
```

`docker-compose.yml` binds to `127.0.0.1:8080` only. Nothing reaches the worker except the reverse
proxy, so the `x-worker-secret` header is not the only thing standing between the internet and your
service role key.

### TLS

Supabase `pg_net` calls the worker over HTTPS and rejects self-signed certs, so it needs a real
cert on a real subdomain. `Caddyfile.example` is a drop-in vhost; point an A record at the box,
then:

```bash
sudo cp Caddyfile.example /etc/caddy/conf.d/transcode.recapd.app.conf
sudo systemctl reload caddy
curl https://transcode.recapd.app/health     # {"ok":true,"active":0,"queued":0}
```

Traefik or nginx work the same way - proxy the subdomain to `127.0.0.1:8080`.

### Sizing

2 vCPU / 4 GB is the floor. Two reasons:

- ffmpeg is CPU-bound and `MAX_CONCURRENCY=2` runs two at once. `cpus: 1.5` in the compose file
  leaves headroom for anything else on the box; drop it if the box is dedicated.
- `processVideo` buffers the whole source into memory (`Buffer.from(await res.arrayBuffer())`) and
  then reads the finished rendition back in full before upload. Peak RAM per job is roughly source
  plus rendition, times `MAX_CONCURRENCY`. A 500 MB video with concurrency 2 will want most of
  2 GB. `mem_limit: 3g` is the guard rail; lower `MAX_CONCURRENCY` before raising it.

Scratch files go to a disk-backed named volume, not tmpfs - tmpfs is RAM and would double the
pressure above.

### Fair use

Hetzner shared-vCPU plans (CX/CPX) are not meant for sustained 100% CPU. Upload-triggered
transcodes are bursty and fine. A full backfill of an existing video library is not - run it in
small batches, or do the one-time sweep on a CCX dedicated-vCPU box and then scale back down.

### Other hosts

Any container host works, with one constraint: the worker answers `202` and transcodes *after* the
response, so hosts that throttle CPU once a request finishes (Cloud Run default, Lambda) will stall
it. Cloud Run needs CPU always-allocated and `min-instances 1`, which removes the reason to pick it.

## Wire up Supabase (one time)

The migration `20260608000001_video_transcode_pipeline.sql` adds the columns, bucket, RLS, and trigger. The trigger reads two Vault secrets - set them to your deployed worker:

```sql
select vault.create_secret('https://transcode.recapd.app/', 'transcode_worker_url');
select vault.create_secret('the-same-WORKER_SECRET', 'transcode_worker_secret');
```

(`pg_net` must be enabled - it already is for the HLS trigger.)

## Backfill existing videos

```bash
curl -X POST https://transcode.recapd.app/backfill \
  -H "x-worker-secret: $WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

Repeat until it returns `{"enqueued": 0}`.

## What the app does with the output

`useVideoPlaybackUri` prefers `rendition_path` once `video_status = 'ready'`. A faststart MP4 streams progressively (the player issues range requests), so playback starts fast and stays smooth. Until a video is `ready`, the app falls back to the existing byte-range HLS over the original, then the raw original.
