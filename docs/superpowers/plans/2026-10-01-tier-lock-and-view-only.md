# Tier lock + view-only full events

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** (1) Only the server can set `users.subscription_tier`, driven by RevenueCat webhooks. (2) Visitors who hit a full event can view its photos read-only, without taking a guest slot and without saving, downloading or uploading.

**Spec:** this document (user decisions 2026-10-01: "yes please" to the tier fix; view-only on full events "but they are not allowed to download or upload").

## Global Constraints

- No code comments. No em dash character. No attribution lines in commits. Hobby project: commit to `main`; push and deploys are approved at the end of each task after verification.
- Supabase project `zfrpwfuihfpoqyexbwng` (production, real users). DB changes: read live definitions first, test inside `begin; ... rollback;`, then `apply_migration`, and commit the migration file with the exact SQL.
- RevenueCat project `projc314bd23`, entitlement "Recapd Pro" (`entlb18ce2653a`). App user id passed to `Purchases.logIn` / `configure` comes from `lib/billing/revenuecatProvider.ts` (verify whether it is `users.id` or the auth uid).
- Old app versions in the wild still call `syncSubscriptionToDatabase` (`lib/subscription.ts:159-198`); they must not start throwing user-visible errors.
- Web: `web/` ESM on Vercel Node builder, `.js` suffixes in `web/api` and `web/kit`; `vercel --prod` from the repo root.

---

### Task A: Server-owned subscription tier

- [ ] Inspect live: `users` policies, column grants, triggers; how `subscription_tier` is read by `get_event_participant_limit`, `media_size_limit_bytes`, `media_duration_limit_ms`, `get_event_preview` (`host_is_pro`); how the per-event consumable `recapd_event_pro` is represented (search `store/eventStore.ts`, migrations, live schema). The fix must not break per-event Pro.
- [ ] Migration: `BEFORE INSERT OR UPDATE` trigger on `public.users` that, unless the current role is `service_role` or `postgres` (use `current_setting('request.jwt.claims', true)` role / `current_user`), forces `NEW.subscription_tier := OLD.subscription_tier` on update and `'free'` on insert. Silent (no exception) so old apps keep working. Test rolled back: authenticated user update to 'pro' leaves 'free'; service role update to 'pro' works; other column updates (display_name) still work.
- [ ] Edge function `supabase/functions/revenuecat-webhook/index.ts` (Deno, `--no-verify-jwt`): require header `Authorization: Bearer ${REVENUECAT_WEBHOOK_SECRET}` (constant-time compare) else 401. Parse `event`; resolve the user from `app_user_id` and, for TRANSFER, `transferred_from`/`transferred_to`; ignore anonymous RC ids (`$RCAnonymousID:`). Pro is active when the event's `entitlement_ids` includes the Pro entitlement identifier and `expiration_at_ms` is null or in the future, for event types INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, PRODUCT_CHANGE, SUBSCRIPTION_EXTENDED, NON_RENEWING_PURCHASE (only if it grants the entitlement), TEMPORARY_ENTITLEMENT_GRANT; CANCELLATION keeps pro until expiration (no change); EXPIRATION and BILLING_ISSUE-after-grace and REFUND/REVERSAL → free. Update `users.subscription_tier` and `user_private_data` (`subscription_expires_at`, `subscription_platform` from `store`) with the service role. Idempotent; always 200 for well-formed but irrelevant events. Unit-test the pure mapping in Deno or as a plain TS module with Vitest-compatible tests (place pure logic in a separate file).
- [ ] Deploy the function, set `REVENUECAT_WEBHOOK_SECRET` (generate a strong random value; never print it in reports), register the webhook with RevenueCat MCP `create-webhook-integration` (URL `https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/revenuecat-webhook`, authorization header set, all event types, production + sandbox). Send a test event if the API allows, else curl the function with a synthetic payload and the secret.
- [ ] Backfill: for the users currently `pro` and any RevenueCat customers with an active Pro entitlement, reconcile the DB tier to RevenueCat's truth (RC MCP `get-customer` / `list-subscriptions`). Report changes by user id only, no names.
- [ ] App: `syncSubscriptionToDatabase` stops writing `subscription_tier` (keep the `user_private_data` upsert). Update affected tests. `npx jest` green, `npx tsc --noEmit` no new errors.
- [ ] Apply migration only after the webhook is live and backfill done (order: function + webhook, backfill, then trigger), so paying users never drop to free.
- [ ] Commit(s), push.

### Task B: View-only gallery for full events

- [ ] Edge function `supabase/functions/guest-view/index.ts` (no JWT): input `{ code }`; normalize like `normalizeCode`; look up the event (service role), reject if missing or `expires_at < now()` (404). Return event basics plus media list (`id, media_type, width, height, duration_milliseconds, captured_at, uploader display_name`) for `visibility='shared'` items, with signed URLs (1 h): `thumb` (thumbnails bucket, or transformed 400 px if no thumbnail and not HEIC) and, for photos, `display` = transformed 1600 px longest side quality 80 from `event-photos` (HEIC: fall back to thumb). Never return original URLs or storage paths. Videos: poster only. Cap at 2000 items. CORS for `https://recapd.app` and Vercel preview origins.
- [ ] Web: Full screen gets a "View photos" button → read-only gallery view reusing grid/viewer components with upload tray, Save, Download all and Delete hidden, and a banner "This event is full. You can look, but only guests can add or save photos." Viewer shows `display` images; videos show the poster with "Videos play for guests in the app". Refresh button re-fetches (no realtime). Disable right-click/long-press save affordances where cheap (`draggable=false`, `-webkit-touch-callout: none`) without pretending it is DRM.
- [ ] Vitest for the view-model mapping and hidden actions. Live check on a throwaway event filled to the cap: the 13th visitor sees Full → View photos → grid and viewer work, no save/download/upload controls, network tab contains no original URLs; clean up.
- [ ] Deploy function + web (`vercel --prod`), smoke-check `/join/W6DD5K` Welcome, push.
