# Edge functions: notifications

## nudge-broadcast

Host-triggered. Pushes a reminder to event guests who haven't uploaded in the last 4 hours, are opted in, and have a `push_token` on `event_members`. Enforces a 6h cooldown per event via `nudges`. Logs delivery to `reminders_log` with `kind='host_nudge'`.

Deploy:

```
supabase functions deploy nudge-broadcast --no-verify-jwt=false
```

Environment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## daily-reminder

Cron-triggered. Scans events whose `ends_at` was 18-24h ago and pushes the day-after auto-reminder. Idempotent per (event, user) via `reminders_log` row with `kind='day_after_auto'`. Only targets guests with `notifications_opt_in=true`, `no_photos_to_upload=false`, no `last_uploaded_at`, and a `push_token`.

Deploy:

```
supabase functions deploy daily-reminder --no-verify-jwt=true
```

Environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (optional, validates the `x-cron-secret` header)

Schedule via Supabase Cron (`pg_cron`) hourly:

```sql
select cron.schedule(
	'daily-reminder-hourly',
	'0 * * * *',
	$$
	select net.http_post(
		url := 'https://<project-ref>.functions.supabase.co/daily-reminder',
		headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
		body := '{}'::jsonb
	);
	$$
);
```

## Schema dependencies

Owned by the db slice (`feat/db`):

- `events(id, host_id, title, ends_at, archived_at)`
- `event_members(event_id, user_id, role, push_token, notifications_opt_in, last_uploaded_at, no_photos_to_upload)`
- `nudges(event_id, sent_by, sent_at, message, recipient_count)` for cooldown
- `reminders_log(event_id, user_id, kind, channel, delivered, error, payload)` for audit + idempotency

## TODO

- SMS fallback for guests without `push_token` (Twilio or similar). Currently the response surfaces `without_push_token` so the host UI can show a fallback hint.
