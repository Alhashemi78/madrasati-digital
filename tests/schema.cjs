// npm install --prefix /tmp/school-sql-tests @electric-sql/pglite
// NODE_PATH=/tmp/school-sql-tests/node_modules node tests/schema.cjs
// Uses an isolated PostgreSQL engine; never connects to Supabase.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const ids={owner:'00000000-0000-4000-8000-000000000001',staff:'00000000-0000-4000-8000-000000000002',other:'00000000-0000-4000-8000-000000000003',outsider:'00000000-0000-4000-8000-000000000004'};
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth,public to authenticated,anon,service_role;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;`);
 for(const id of Object.values(ids))await db.query('insert into auth.users values($1)',[id]);
 for(const name of ['schema.sql','schema-features.sql','photo-metadata-hardening.sql','security-hardening.sql','security-hardening.sql']){
  await db.exec(fs.readFileSync(path.join(__dirname,'../school-events',name),'utf8').replaceAll('owner@example.invalid','owner@test.school'));
 }
 console.log('PASS fresh schema and repeatable deletion migration');
 await db.exec(`insert into public.school_event_access(email,role,display_name,department) values
 ('staff@test.school','staff','معلم','العلوم'),('other@test.school','admin','إداري','الإدارة');`);
 async function user(name){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email:name+'@test.school',sub:ids[name]})]);await db.exec('set role authenticated');}
 async function denied(sql,args=[]){let failed=false;try{await db.query(sql,args)}catch(e){failed=true}assert.ok(failed,'expected permission/validation rejection: '+sql);}
 await user('staff');
 await denied("select public.school_event_manage_admin('outsider@test.school','Other','add')");
 await db.query("update public.school_event_access set role='admin' where email='staff@test.school'");
 assert.equal((await db.query("select role from public.school_event_access where email='staff@test.school'")).rows[0].role,'staff');
 const e=(await db.query(`insert into public.school_events(department,employee,title,place,slots,start_date,end_date) values
 ('العلوم','معلم','اختبار الصلاحيات','قاعة الاختبار',array['الحصة الأولى'],'2026-09-01','2026-09-01') returning id`)).rows[0].id;
 await denied('update public.school_events set status=\'approved\' where id=$1',[e]);
 await user('owner');await db.query("update public.school_events set status='approved' where id=$1",[e]);
 await denied('delete from public.school_events where id=$1',[e]);
 await user('staff');
 await db.query(`insert into public.school_event_documentation(event_id,owner_id,description,student_participations) values($1,$2,'وصف توثيق كاف للاختبار',12)`,[e,ids.staff]);
 await denied("update public.school_event_documentation set approval_status='approved' where event_id=$1",[e]);
 await user('owner');await db.query("update public.school_event_documentation set approval_status='approved',review_note='مقبول' where event_id=$1",[e]);
 await user('staff');await db.query("update public.school_event_documentation set description='تحديث وصف التوثيق مع بقاء الاعتماد' where event_id=$1",[e]);
 const d=(await db.query('select * from public.school_event_documentation where event_id=$1',[e])).rows[0];assert.equal(d.approval_status,'approved');assert.equal(d.review_note,'مقبول');
 await denied(`insert into public.school_event_photos(event_id,owner_id,storage_path,cloudinary_public_id,cloudinary_version,cloudinary_format) values($1,$2,'fake','school_events/fake',1,'jpg')`,[e,ids.staff]);
 await user('other');await denied("select public.school_event_manage_admin('outsider@test.school','Other','add')");
 await user('owner');await db.query("select public.school_event_manage_admin('outsider@test.school','Other','add')");
 await denied("select public.school_event_manage_admin('owner@test.school','','remove')");
 assert.ok((await db.query('select * from public.school_event_audit')).rows.length>=2);
 await db.exec('reset role');await db.query("delete from public.school_event_access where email='outsider@test.school'");
 await user('outsider');for(const table of ['school_events','school_event_documentation','school_event_photos','school_event_report_archive','school_event_audit'])assert.equal((await db.query('select * from public.'+table)).rows.length,0);
 console.log('PASS owner-only admin RPC, staff isolation, review protection, server-only photo writes, audit and revoked access');
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
