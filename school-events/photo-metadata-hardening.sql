-- EXISTING PROJECT: deploy the updated school-events-images Edge Function FIRST.
-- The function validates the user/event with RLS, then writes metadata as service_role.
-- No photo records or original files are changed or deleted by this migration.
begin;
grant select,insert on public.school_event_photos to service_role;
revoke insert,update,delete on public.school_event_photos from public,anon,authenticated;
commit;
