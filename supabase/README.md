# Supabase

Database, storage policies, and TypeScript types for Recapd.

## Layout

- `schema.sql` - canonical declarative schema (tables, RLS, functions, triggers, seed data)
- `storage.sql` - `media-originals` and `media-thumbs` buckets and their object policies
- `migrations/` - timestamped, replay-ready migrations (Supabase CLI consumes these)
- `../types/database.ts` - hand-written `Database` type matching `schema.sql`

The migration file is the inlined concatenation of `schema.sql` and `storage.sql`. If you edit either source file, regenerate the migration:

```bash
cat supabase/schema.sql supabase/storage.sql > supabase/migrations/$(date -u +%Y%m%d%H%M%S)_<slug>.sql
```

Keep the existing init migration in place for fresh setups, and add a new timestamped file for each delta.

## Local development

Prereq: `supabase` CLI installed (`brew install supabase/tap/supabase`) and Docker running.

```bash
supabase init
supabase start
supabase db reset
```

`supabase db reset` drops the local DB and replays everything in `supabase/migrations/` in timestamp order.

## Pushing to a remote project

```bash
supabase link --project-ref <ref>
supabase db push
```

## Regenerating types

Hand-written types in `types/database.ts` are the source of truth for application code. To compare against generated types from a live database:

```bash
supabase gen types typescript --project-id <ref> --schema public > /tmp/generated.ts
diff /tmp/generated.ts types/database.ts
```

Update `types/database.ts` to match whenever the schema changes.

## Buckets

- `media-originals` (private) - full-resolution originals. Read via signed URLs only.
- `media-thumbs` (private) - compressed thumbnails. Read via signed URLs, but cache headers allow CDN reuse.

Object key layout: `<event_id>/<owner_id>/<media_id>.<ext>`. Storage policies parse the first folder as event id and the second as owner id, gated by `is_event_member` and `is_event_host`.

## Entitlements

Plan limits live in `subscription_limits` keyed by `subscription_entitlement` (`free` | `pro`). `current_entitlement(user_id)` resolves a user's current tier, honoring `subscriptions.expires_at`. Server-side triggers enforce:

- guest cap (free: 20, pro: unlimited)
- event window (free: 48h, pro: 720h / 30 days)
- video duration (free: 30s, pro: 240s / 4 min)
- active event cap (free: 1, pro: unlimited)
- media TTL on `events.media_expires_at` (free: 60 days after `ends_at`, pro: never)

`can_download_full_resolution(event_id)` gates the signed URL request path for Pro-only originals.
