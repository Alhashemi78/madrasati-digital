-- Deployment template: replace owner@example.invalid with the verified administrator email.
-- The active project administrator is configured privately in Supabase.
-- School events 2026-2027. Independent of late_students.
create table public.school_event_access (
  email text primary key check (email = lower(email)),
  role text not null default 'staff' check (role in ('admin','staff')),
  display_name text not null default '',
  department text not null default '',
  created_at timestamptz not null default now()
);
alter table public.school_event_access enable row level security;
grant select, insert, update, delete on public.school_event_access to authenticated;
create function public.school_event_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_event_access where email=lower(auth.jwt()->>'email') and role='admin');
$$;
revoke all on function public.school_event_is_admin() from public, anon;
grant execute on function public.school_event_is_admin() to authenticated;
create policy event_access_read on public.school_event_access for select to authenticated
using (email=lower((select auth.jwt()->>'email')) or public.school_event_is_admin());
create policy event_access_manage on public.school_event_access for all to authenticated
using (lower((select auth.jwt()->>'email'))='owner@example.invalid' or (role='staff' and public.school_event_is_admin()))
with check (lower((select auth.jwt()->>'email'))='owner@example.invalid' or (role='staff' and public.school_event_is_admin()));
insert into public.school_event_access(email,role,display_name) values ('owner@example.invalid','admin','زياد الهاشمي');

create table public.school_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 department text not null check (length(department) between 1 and 100),
 employee text not null check (length(employee) between 1 and 150),
 title text not null check (length(title) between 1 and 200),
 place text not null check (length(place) between 1 and 150),
 slots text[] not null check (cardinality(slots) between 1 and 11),
 start_date date not null,
 end_date date not null check (end_date >= start_date),
 participants integer not null default 0 check (participants >= 0),
 audience text not null default '' check (length(audience)<=200),
 notes text not null default '' check (length(notes)<=2000),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 review_note text not null default '' check (length(review_note)<=1000),
 created_at timestamptz not null default now(),
 created_at_bahrain timestamp generated always as (created_at at time zone 'Asia/Bahrain') stored,
 updated_at timestamptz not null default now()
);
alter table public.school_events enable row level security;
grant select, insert, update on public.school_events to authenticated;
revoke delete on public.school_events from public, anon, authenticated;
create policy school_events_read on public.school_events for select to authenticated using (
 exists (select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email')))
);
create policy school_events_insert on public.school_events for insert to authenticated with check (
 owner_id=(select auth.uid()) and status='pending' and review_note='' and exists (
 select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email')))
);
create policy school_events_update on public.school_events for update to authenticated using (
 exists (select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email')) and role='admin')
 or (owner_id=(select auth.uid()) and status in ('pending','rejected') and exists (
 select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email'))))
) with check (
 exists (select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email')) and role='admin')
 or (owner_id=(select auth.uid()) and status='pending' and review_note='' and exists (
 select 1 from public.school_event_access where email=lower((select auth.jwt()->>'email'))))
);
create index school_events_date_idx on public.school_events(start_date,end_date);
create index school_events_owner_idx on public.school_events(owner_id);

create function public.validate_school_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare admin_user boolean;
begin
 select exists (select 1 from public.school_event_access where email=lower(auth.jwt()->>'email') and role='admin') into admin_user;
 if TG_OP='UPDATE' then
   if new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
     raise exception 'لا يمكن تغيير صاحب السجل أو وقت إنشائه';
   end if;
   if not admin_user and (new.status is distinct from old.status or new.review_note is distinct from old.review_note)
      and not (old.owner_id=auth.uid() and old.status='rejected' and new.status='pending' and new.review_note='') then
     raise exception 'اعتماد الفعاليات مخصص للإدارة';
   end if;
 end if;
 if not (new.slots <@ array['الطابور الصباحي','الحصة الأولى','الحصة الثانية','الحصة الثالثة','الحصة الرابعة','الحصة الخامسة','الحصة السادسة','الحصة السابعة','الفسحة الأولى','الفسحة الثانية','طوال اليوم','بعد الدوام الرسمي']::text[]) then
   raise exception 'فترة غير معتمدة';
 end if;
 if cardinality(new.slots) <> (select count(distinct s) from unnest(new.slots) s) then
   raise exception 'لا يمكن تكرار الفترة';
 end if;
 if (new.slots && array['طوال اليوم','بعد الدوام الرسمي']) and cardinality(new.slots)<>1 then
   raise exception 'اختر طوال اليوم أو بعد الدوام بمفرده';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(new.place)),0));
 if new.status<>'rejected' and exists (
   select 1 from public.school_events e where e.id<>new.id and e.status<>'rejected'
   and lower(btrim(e.place))=lower(btrim(new.place))
   and e.start_date<=new.end_date and e.end_date>=new.start_date
   and (e.slots && new.slots
     or ('طوال اليوم'=any(e.slots) and not ('بعد الدوام الرسمي'=any(new.slots)))
     or ('طوال اليوم'=any(new.slots) and not ('بعد الدوام الرسمي'=any(e.slots))))
 ) then raise exception 'يوجد تعارض في المكان والتاريخ والفترة مع فعالية مسجلة'; end if;
 new.updated_at=now();
 return new;
end $$;
revoke all on function public.validate_school_event() from public, anon, authenticated;
create trigger school_events_validate before insert or update on public.school_events for each row execute function public.validate_school_event();
