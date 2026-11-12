// node tests/session.cjs — real browser scripts, fake backend, no remote writes.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('dialog',d=>d.accept());
  const html=fs.readFileSync(path.join(root,'school-events/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
  await p.route('http://127.0.0.1/**',r=>r.fulfill({contentType:'text/html',body:html}));await p.goto('http://127.0.0.1/session-test');
  await p.evaluate(()=>{
   window.testState={rpcCalls:0,holdEvents:false,holdAccess:false};
   window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:cb=>{window.authChanged=cb}},
    rpc:async()=>{testState.rpcCalls++;return {data:null,error:null}},
    from(table){let email;const q={select(){return q},eq(k,v){if(k==='email')email=v;return q},order(){return q},range(){return q},limit(){return q},maybeSingle(){return q},then(resolve,reject){return Promise.resolve().then(async()=>{
     if(table==='school_event_access'){
      if(testState.holdAccess)await new Promise(r=>testState.releaseAccess=r);
      return {data:email?{email,role:'admin',display_name:'إدارة',department:'الإدارة'}:[],error:null};
     }
     if(table==='school_events'&&testState.holdEvents){await new Promise(r=>testState.releaseEvents=r);return {data:[{id:'private',title:'PRIVATE EVENT',department:'الإدارة',employee:'PRIVATE STAFF',place:'قاعة',slots:['الحصة الأولى'],start_date:'2026-10-01',end_date:'2026-10-01',status:'approved',participants:1,notes:''}],error:null};}
     return {data:[],error:null};
    }).then(resolve,reject)}};return q;}
   })};
  });
  for(const f of ['app.js','documentation.js','audit.js','photo-export.js','periodic-reports.js'])await p.addScriptTag({content:fs.readFileSync(path.join(root,'school-events',f),'utf8')});
  await p.evaluate(async()=>{await syncAuth({user:{id:'other',email:'other@example.com'}});});
  await p.evaluate(async()=>{document.getElementById('memberEmail').value='new@example.com';document.getElementById('memberName').value='اسم';await document.getElementById('memberForm').onsubmit({preventDefault(){}});});
  assert.equal(await p.evaluate(()=>testState.rpcCalls),0);console.log('PASS non-owner admin cannot invoke admin-management handler');
  await p.evaluate(async()=>{await syncAuth({user:{id:'owner',email:'zead07@hotmail.com'}});document.getElementById('memberEmail').value='new@example.com';document.getElementById('memberName').value='اسم';await document.getElementById('memberForm').onsubmit({preventDefault(){}});});
  assert.equal(await p.evaluate(()=>testState.rpcCalls),1);console.log('PASS owner can invoke admin-management handler');
  await p.evaluate(async()=>{document.getElementById('achievementGallery').textContent='PRIVATE PHOTO';document.getElementById('docDescription').value='PRIVATE DESCRIPTION';document.getElementById('membersList').textContent='PRIVATE EMAIL';document.getElementById('auditList').textContent='PRIVATE AUDIT';document.getElementById('weeklyArchive').textContent='PRIVATE REPORT';showView('documentation');await syncAuth(null);});
  for(const id of ['achievementGallery','docDescription','membersList','auditList','weeklyArchive'])assert.ok(!(await p.locator('#'+id).evaluate(el=>'value' in el?el.value:el.textContent)).includes('PRIVATE'));
  console.log('PASS logout clears photos, forms, members, audit and archive');
  await p.evaluate(()=>{testState.holdAccess=true;window.loginWork=syncAuth({user:{id:'owner',email:'zead07@hotmail.com'}});});
  await p.waitForFunction(()=>typeof testState.releaseAccess==='function');
  await p.evaluate(async()=>{await syncAuth(null);testState.releaseAccess();await loginWork;});
  assert.equal(await p.evaluate(()=>access),null);assert.equal(await p.locator('#adminNav').isHidden(),true);console.log('PASS late access lookup cannot restore an old account');
  await p.evaluate(async()=>{testState.holdAccess=false;await syncAuth({user:{id:'owner',email:'zead07@hotmail.com'}});testState.holdEvents=true;window.eventWork=loadEvents();});
  await p.waitForFunction(()=>typeof testState.releaseEvents==='function');
  await p.evaluate(async()=>{await syncAuth(null);testState.releaseEvents();await eventWork;});
  assert.equal(await p.evaluate(()=>events.length),0);assert.ok(!(await p.locator('body').textContent()).includes('PRIVATE EVENT'));console.log('PASS late event request cannot restore data after logout');
  assert.deepEqual(errors,[]);console.log('PASS no uncaught browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
