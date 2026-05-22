-- Drop orphaned subscription functions never called from app, edge functions, or policies
-- (capabilities are resolved client-side in types/subscription.ts).
drop function if exists public.can_upload_video(uuid, integer);
drop function if exists public.resolve_event_subscription_policy(text, text);
drop function if exists public.get_subscription_plan_capabilities(text);

-- unlock_scope supported the removed per-event unlock model; only free(none)/pro(both) were ever used.
alter table public.subscription_plans drop column if exists unlock_scope;
drop type if exists public.subscription_unlock_scope;
