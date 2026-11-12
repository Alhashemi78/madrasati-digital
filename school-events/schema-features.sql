-- FRESH PROJECTS ONLY: run AFTER schema.sql, in the same new Supabase project.
-- Replace EVERY owner@example.invalid with the verified owner email in both files.
-- This is a reproducible template, NOT a migration for the existing production tables.
begin;
create function public.school_event_is_member() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_event_access where email=lower(auth.jwt()->>'email'));
$$;
revoke all on function public.school_event_is_member() from public, anon;
grant execute on function public.school_event_is_member() to authenticated;

create function public.school_event_manage_admin(p_email text,p_name text,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if lower(auth.jwt()->>'email') is distinct from 'owner@example.invalid'
    or not public.school_event_is_admin() then
  raise exception 'إدارة الصلاحيات الإدارية مخصصة لمالك المشروع';
 end if;
 p_email=lower(btrim(p_email));
 if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_email='owner@example.invalid' then raise exception 'بريد غير صالح أو حساب المالك'; end if;
 if p_action='add' then
  if p_name is null or length(btrim(p_name)) not between 1 and 150 then raise exception 'اسم غير صالح'; end if;
  insert into public.school_event_access(email,display_name,role) values(p_email,btrim(p_name),'admin')
  on conflict(email) do update set role='admin',display_name=excluded.display_name;
 elsif p_action='remove' then
  update public.school_event_access set role='staff' where email=p_email and role='admin';
 else raise exception 'إجراء غير معتمد'; end if;
end $$;
revoke all on function public.school_event_manage_admin(text,text,text) from public, anon;
grant execute on function public.school_event_manage_admin(text,text,text) to authenticated;

create table public.school_event_documentation(
 event_id uuid primary key references public.school_events(id),
 owner_id uuid not null references auth.users(id),
 description text not null check(length(btrim(description)) between 10 and 3000),
 student_participations integer not null check(student_participations between 0 and 100000),
 approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected')),
 review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default now()
);
alter table public.school_event_documentation enable row level security;
grant select,insert,update on public.school_event_documentation to authenticated;
create policy documentation_read on public.school_event_documentation for select to authenticated using(
 public.school_event_is_member() and (approval_status='approved' or owner_id=auth.uid() or public.school_event_is_admin())
);
create policy documentation_insert on public.school_event_documentation for insert to authenticated with check(
 public.school_event_is_member() and exists(select 1 from public.school_events e
 where e.id=event_id and e.owner_id=school_event_documentation.owner_id and e.status='approved'
 and e.start_date<=(now() at time zone 'Asia/Bahrain')::date
 and (e.owner_id=auth.uid() or public.school_event_is_admin()))
 and ((approval_status='pending' and review_note='') or public.school_event_is_admin())
);
create policy documentation_update on public.school_event_documentation for update to authenticated using(
 public.school_event_is_member() and (public.school_event_is_admin() or (owner_id=auth.uid() and exists(
 select 1 from public.school_events e where e.id=event_id and e.status='approved' and e.start_date<=(now() at time zone 'Asia/Bahrain')::date)))
) with check(public.school_event_is_member() and (owner_id=auth.uid() or public.school_event_is_admin()));
create function public.validate_school_event_documentation() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.event_id is distinct from old.event_id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
   raise exception 'لا يمكن تغيير الفعالية أو صاحب التوثيق أو وقت إنشائه'; end if;
  if not public.school_event_is_admin() and (new.approval_status is distinct from old.approval_status or new.review_note is distinct from old.review_note) then
   raise exception 'مراجعة التوثيق مخصصة للإدارة'; end if;
 elsif not public.school_event_is_admin() and (new.approval_status<>'pending' or new.review_note<>'') then
  raise exception 'التوثيق الجديد من الموظف يحتاج مراجعة الإدارة';
 end if;
 return new;
end $$;
revoke all on function public.validate_school_event_documentation() from public,anon,authenticated;
create trigger documentation_validate before insert or update on public.school_event_documentation
for each row execute function public.validate_school_event_documentation();

create table public.school_event_photos(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.school_event_documentation(event_id),
 owner_id uuid not null references auth.users(id),
 storage_path text not null unique check(length(storage_path) between 1 and 500),
 cloudinary_public_id text not null check(cloudinary_public_id like 'school_events/%'),
 cloudinary_version bigint not null check(cloudinary_version>0),
 cloudinary_format text not null check(cloudinary_format in ('jpg','jpeg','png','webp')),
 created_at timestamptz not null default now()
);
alter table public.school_event_photos enable row level security;
grant select on public.school_event_photos to authenticated;
-- Only the verified Edge Function writes metadata with the service role.
grant select,insert on public.school_event_photos to service_role;
revoke insert,update,delete on public.school_event_photos from public,anon,authenticated;
create policy photos_read on public.school_event_photos for select to authenticated using(
 public.school_event_is_member() and exists(select 1 from public.school_event_documentation d where d.event_id=school_event_photos.event_id)
);
create index school_event_photos_event_date_idx on public.school_event_photos(event_id,created_at desc);

create table public.school_event_report_archive(
 id uuid primary key default gen_random_uuid(),
 report_type text not null check(report_type in ('past_week','next_week','monthly')),
 period_start date not null,
 period_end date not null check(period_end>=period_start),
 pdf_url text not null check(pdf_url ~ '^https://drive\.google\.com/file/d/[A-Za-z0-9_-]+/view(\?.*)?$'),
 created_at timestamptz not null default now(),
 unique(report_type,period_start,period_end)
);
alter table public.school_event_report_archive enable row level security;
grant select,insert,update on public.school_event_report_archive to authenticated;
create policy archive_read on public.school_event_report_archive for select to authenticated using(public.school_event_is_member());
create policy archive_insert on public.school_event_report_archive for insert to authenticated with check(public.school_event_is_admin());
create policy archive_update on public.school_event_report_archive for update to authenticated using(public.school_event_is_admin()) with check(public.school_event_is_admin());

create table public.school_event_audit(
 id bigint generated always as identity primary key,
 event_id uuid not null,
 actor_id uuid,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 occurred_at timestamptz not null default now(),
 previous_record jsonb,
 next_record jsonb
);
alter table public.school_event_audit enable row level security;
grant select on public.school_event_audit to authenticated;
revoke insert,update,delete on public.school_event_audit from public,anon,authenticated;
create policy audit_read on public.school_event_audit for select to authenticated using(public.school_event_is_admin());
create function public.record_school_event_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.school_event_audit(event_id,actor_id,operation,previous_record,next_record)
 values(coalesce(new.id,old.id),auth.uid(),TG_OP,
 case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function public.record_school_event_audit() from public,anon,authenticated;
create trigger school_events_audit after insert or update or delete on public.school_events
for each row execute function public.record_school_event_audit();
commit;
