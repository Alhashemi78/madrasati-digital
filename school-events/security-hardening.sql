-- Existing projects: prevents direct event deletion without changing or deleting data.
-- Run in Supabase SQL Editor as the project administrator. Safe to rerun.
begin;
revoke delete on public.school_events from public, anon, authenticated;
drop policy if exists school_events_delete on public.school_events;
-- A restrictive policy also blocks other permissive policies if DELETE is granted again.
drop policy if exists school_events_no_direct_delete on public.school_events;
create policy school_events_no_direct_delete on public.school_events
as restrictive for delete to authenticated using (false);
commit;
