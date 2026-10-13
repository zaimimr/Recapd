# Web join (guests without the app)

Date: 2026-09-30
Status: Decided, building

## Goal

A guest scans the event QR (`https://recapd.app/join/CODE`) and, without installing anything, joins with a first name, uploads photos and videos, sees everyone's photos live, and downloads them later from the same link.

## Decisions (from the user)

- Scope: upload + gallery + viewer + download all. No host tools, email or notifications on web.
- Returning guests: same browser resumes; another browser joins again as a new guest.
- Participant cap: every joined participant counts (as today), enforced on the server.
- Videos allowed with the same limits as the app (free 30 s / 500 MB, Pro 5 min / 5 GB).
- Download all: phones use the Web Share API with files in batches of 20 ("Save to Photos"); desktop gets a ZIP streamed in the browser (`client-zip`).
- Architecture: grow `web/`; `/join/:code` becomes the guest app. Printed QR codes keep working.

## Decisions (made while building, user asked for no more questions)

- `web/api/join.ts` keeps server-rendered OG/Twitter tags but serves the SPA shell: it fetches the deployed `index.html` from its own origin, injects the meta tags into `<head>`, and returns it. The automatic `recapd://` redirect is removed (universal links cover app users). A small "Open in Recapd" link stays on the Welcome screen.
- The guest app is a code-split route so the marketing pages stay light.
- Browser Supabase client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as the server env), session persisted in `localStorage`.
- Join = `signInAnonymously()` → insert `users { display_name, auth_user_id }` → insert `event_participants { event_id, user_id, role: 'guest', nickname: null }`, mirroring `store/authStore.ts` and `store/eventStore.ts`. Display name 2-30 chars.
- Server-side cap: the `event_participants` guest insert policy also requires `can_join_event(event_id)`. RLS rejection (42501) shows the Full screen. The app already maps 42501 to "Event is full".
- Upload limits are read through a small security-definer RPC `get_event_upload_limits(p_event_id)` returning `{ max_file_size_bytes, max_video_duration_ms }` for participants, built on the same functions the insert policy uses.
- Upload pipeline per file: size/duration pre-check, dimensions, `captured_at` from EXIF (`exifr`) or `lastModified`, 512 px JPEG q0.6 thumbnail from canvas (videos: frame at 0.1 s; HEIC that the browser cannot decode: no thumbnail), TUS upload with `tus-js-client` to `event-photos/{eventId}/{profileId}/{Date.now()}_{rand8}.{ext}` (6 MB chunks, bearer token), thumbnail via `storage.upload` to `thumbnails/{same}_thumb.jpg`, verify object exists with the right size, then insert `media_items` with the same columns the native uploader sets. Two files at a time. No automatic retries; failed items show Retry (resumes TUS). Wake Lock while uploading, `beforeunload` warning, backgrounded items show "Paused, tap to resume".
- Gallery: same query as the app (`media_items` + uploader display name, `visibility='shared'`, not deleted), newest first, 3-column grid from signed thumbnail URLs (fallback: 720 px transformed original, HEIC without transform), realtime inserts/deletes via `postgres_changes` on `media_items:{eventId}`.
- Viewer: full screen, swipe/arrow keys, original via signed URL (1 h), video player, uploader name, Save, Delete on own items (soft delete like the app does).
- Save single item: phones `navigator.share({ files })`, desktop `<a download>`.
- UI: dark Sunset Pop tokens shared with `web/kit/theme.ts`, mobile first, English copy.

## Screens

Welcome (event title, date in host time zone, host name, guest count, name field, Join), Not found/expired, Full, Gallery (header with counts and Download all, Add photos & videos button, upload tray, grid), Viewer, Download-all sheet with batch/ZIP progress.

## Out of scope

Email/magic link identity, push, host moderation on web, creating events on web, offline queue.

## Verification

Vitest for pure logic (limits, path building, batching, metadata fallbacks). End-to-end with Playwright against a Vercel preview on a dedicated test event created for the purpose and deleted afterwards: join, upload a photo and a short video, see them in the gallery, realtime from a second context, save, download-all ZIP on desktop viewport, full-event rejection, delete own item. Then production deploy and a smoke check.
