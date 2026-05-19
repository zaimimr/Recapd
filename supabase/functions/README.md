# Edge functions: notifications

## nudge-broadcast

Host-triggered. Pushes a reminder to event guests who haven't uploaded in the last 4 hours. Enforces a 6h cooldown per event via `nudge_log`.

Deploy:

```
supabase functions deploy nudge-broadcast --no-verify-jwt=false
```

Environment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## daily-reminder

Cron-triggered. Scans events whose `end_time` was 18-24h ago and pushes the day-after auto-reminder once per event.

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

## TODO

- SMS fallback for guests without push tokens (Twilio or similar). Currently no-op.
