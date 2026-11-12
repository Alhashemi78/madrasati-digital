// Run with Playwright available: node tests/documentation.cjs
// Uses the real form and documentation script; all database/Edge Function calls are local test doubles.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 const failures=[];
 async function scenario(name, run) {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   const html=fs.readFileSync(path.join(root,'school-events/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
   await page.route('http://127.0.0.1/**',route=>route.fulfill({contentType:'text/html',body:html}));
   await page.goto('http://127.0.0.1/documentation-test');
   await page.evaluate(()=>{
    window.session={user:{id:'owner'}};window.access={role:'staff'};window.demo=false;
    window.events=[{id:'event1',owner_id:'owner',title:'فعالية اختبار',start_date:'2026-09-01',status:'approved'}];
    window.today=()=> '2026-10-12';window.dateLabel=x=>x;window.errorText=e=>e.message||String(e);
    window.state={docs:[],photos:[],uploads:0,writes:0,removed:0,requestIds:[],lostReply:false,failUpload:false,throwUpload:false,failLink:false,zeroUpdate:false};
    window.db={from(table){let action='read',payload,filter;const q={select(){return q},order(){return q},eq(k,v){filter=v;return q},maybeSingle(){return q.then(r=>({...r,data:r.data?.[0]||null}))},insert(v){action='insert';payload=v;return q},update(v){action='update';payload=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{
     const rows=table==='school_event_documentation'?state.docs:state.photos;
     if(action==='read')return {data:rows.filter(r=>!filter||r.event_id===filter).map(r=>({...r})),error:null};
     state.writes++;
     if(table==='school_event_documentation'&&access.role!=='admin'&&((action==='insert'&&payload.approval_status!=='pending')||(action==='update'&&('approval_status' in payload||'review_note' in payload))))return {data:null,error:{message:'Review is admin-only'}};
     if(table==='school_event_photos'&&state.failLink)return {data:null,error:{message:'photo policy denied'}};
     if(action==='insert'){
      if(table==='school_event_documentation'&&rows.some(r=>r.event_id===payload.event_id))return {data:null,error:{message:'duplicate key'}};
      rows.push({...payload});return {data:[{...payload}],error:null};
     }
     const found=state.zeroUpdate?[]:rows.filter(r=>r.event_id===filter);found.forEach(r=>Object.assign(r,payload));return {data:found,error:null};
    }).then(resolve,reject)}};return q},functions:{async invoke(name,{body}){
     if(body instanceof FormData){
      state.uploads++;const requestId=body.get('request_id');state.requestIds.push(requestId);
      const file=body.get('file');if(!(file instanceof Blob)||file.type!=='image/jpeg'||file.size>2*1024*1024)throw Error('invalid prepared upload');
      if(state.throwUpload)throw Error('network disconnected');
      const fail=message=>({data:null,error:{context:{json:async()=>({error:message})}}});
      if(state.failUpload)return fail('upload denied');if(state.failLink)return fail('photo policy denied');
      const storage_path=body.get('event_id')+'/owner/'+requestId+'.jpg';
      if(!state.photos.some(p=>p.storage_path===storage_path))state.photos.push({event_id:body.get('event_id'),storage_path});
      if(state.lostReply){state.lostReply=false;return fail('network reply lost');}
      return {data:{storage_path},error:null};
     }
     return {data:new Blob([new Uint8Array([255,216,255,0])],{type:'application/octet-stream'}),error:null};
    }}};

   });
   await page.addScriptTag({content:fs.readFileSync(process.env.DOCUMENTATION_SCRIPT || path.join(root,'school-events/documentation.js'),'utf8')});
   await page.click('[data-view="documentation"]');
   await page.waitForFunction(()=>document.querySelectorAll('#docEvent option').length===2);
   await page.selectOption('#docEvent','event1');
   await page.fill('#docDescription','وصف تنفيذ فعالية الاختبار والنتائج');await page.fill('#docCount','12');
   await run(page);
   assert.deepEqual(errors,[],'no uncaught browser exceptions');console.log('PASS',name);
  }catch(e){failures.push(name+': '+e.message);console.error('FAIL',name,e.message)}finally{await page.close()}
 }
 const attach=p=>p.setInputFiles('#docPhoto',{name:'photo.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(root,'icons/icon-192.png'))});
 const save=p=>p.click('#docForm button[type="submit"]');
 const waitText=(p,text)=>p.waitForFunction(text=>document.getElementById('docFeedback').textContent.includes(text),text,{timeout:2500});
 await scenario('staff saves new documentation and photo as pending',async p=>{await attach(p);await save(p);await waitText(p,'تم حفظ');assert.equal(await p.evaluate(()=>state.photos.length),1);assert.equal(await p.evaluate(()=>state.docs[0].approval_status),'pending');assert.match(await p.locator('#docList').textContent(),/قيد المراجعة/)});
 await scenario('failed upload can retry without duplicate documentation',async p=>{
  await attach(p);await p.evaluate(()=>state.failUpload=true);await save(p);await waitText(p,'رفع الصورة');
  await p.evaluate(()=>state.failUpload=false);await save(p);await waitText(p,'تم حفظ');assert.equal(await p.evaluate(()=>state.docs.length),1);assert.equal(await p.evaluate(()=>state.photos.length),1);
 });
 await scenario('oversized image is rejected before any data writes',async p=>{
  await p.setInputFiles('#docPhoto',{name:'big.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(26*1024*1024)});await save(p);await waitText(p,'25 ميغابايت');assert.equal(await p.evaluate(()=>state.writes),0);
 });
 await scenario('network exception is shown and save button recovers',async p=>{
  await attach(p);await p.evaluate(()=>state.throwUpload=true);await save(p);await waitText(p,'network disconnected');assert.equal(await p.locator('#docForm button[type="submit"]').isEnabled(),true);
 });
 await scenario('details-only save resets photo field consistently',async p=>{
  await p.selectOption('#docEditMode','details');await save(p);await waitText(p,'تم حفظ');assert.equal(await p.locator('#docPhoto').isEnabled(),true);assert.equal(await p.locator('#docEditMode').inputValue(),'details_photo');
 });
 await scenario('empty update must not claim success or upload',async p=>{
  await p.evaluate(()=>{state.docs=[{event_id:'event1',owner_id:'owner',description:'توثيق موجود للاختبار',student_participations:8,approval_status:'approved'}];state.zeroUpdate=true});
  await p.click('#docRefresh');await p.selectOption('#docEvent','event1');await p.selectOption('#docEditMode','details_photo');await attach(p);await save(p);await waitText(p,'لم يتم حفظ');assert.equal(await p.evaluate(()=>state.uploads),0);
 });
 await scenario('server photo registration failure preserves details and can retry',async p=>{
  await attach(p);await p.evaluate(()=>state.failLink=true);await save(p);await waitText(p,'photo policy denied');assert.equal(await p.evaluate(()=>state.photos.length),0);assert.equal(await p.evaluate(()=>state.docs.length),1);
  await p.evaluate(()=>state.failLink=false);await save(p);await waitText(p,'تم حفظ');assert.equal(await p.evaluate(()=>state.photos.length),1);
 });
 await scenario('staff edits approved content without changing review decision',async p=>{
  await p.evaluate(()=>state.docs=[{event_id:'event1',owner_id:'owner',description:'توثيق موجود للاختبار',student_participations:8,approval_status:'approved',review_note:'مقبول'}]);
  await p.click('#docRefresh');await p.selectOption('#docEvent','event1');await attach(p);await save(p);await waitText(p,'تم حفظ');
  assert.equal(await p.evaluate(()=>state.docs[0].approval_status),'approved');assert.equal(await p.evaluate(()=>state.docs[0].review_note),'مقبول');assert.equal(await p.evaluate(()=>state.photos.length),1);
 });
 await scenario('photo-only does not overwrite documentation fields',async p=>{
  await p.evaluate(()=>state.docs=[{event_id:'event1',owner_id:'owner',description:'توثيق موجود للاختبار',student_participations:8,approval_status:'approved',review_note:'مقبول'}]);
  await p.click('#docRefresh');await p.selectOption('#docEvent','event1');await p.selectOption('#docEditMode','photo');await attach(p);await save(p);await waitText(p,'تم تحديث صورة');
  assert.equal(await p.evaluate(()=>state.docs[0].student_participations),8);assert.equal(await p.evaluate(()=>state.writes),0);assert.equal(await p.evaluate(()=>state.uploads),1);
 });
 await scenario('admin sees pending documentation and approves explicitly',async p=>{
  await p.evaluate(()=>{access.role='admin';state.docs=[{event_id:'event1',owner_id:'owner',description:'توثيق ينتظر المراجعة',student_participations:8,approval_status:'pending'}]});
  await p.click('#docRefresh');await p.click('[data-doc-review="approved"]');await p.getByRole('button',{name:'تأكيد القرار'}).click();
  await p.waitForFunction(()=>state.docs[0].approval_status==='approved');
 });
 await scenario('admin can create approved documentation with photo',async p=>{
  await p.evaluate(()=>access.role='admin');await attach(p);await save(p);await waitText(p,'تم حفظ');assert.equal(await p.evaluate(()=>state.docs[0].approval_status),'approved');
 });
 await scenario('retry after lost response reuses the upload request and avoids duplicate photos',async p=>{
  await attach(p);await p.evaluate(()=>state.lostReply=true);await save(p);await waitText(p,'network reply lost');
  await save(p);await waitText(p,'تم حفظ');
  assert.equal(await p.evaluate(()=>state.photos.length),1);assert.equal(await p.evaluate(()=>new Set(state.requestIds).size),1);
 });
 await scenario('context reset clears documentation, form and image gallery',async p=>{
  await p.evaluate(()=>{document.getElementById('achievementGallery').textContent='private photo';session=null;access=null;window.dispatchEvent(new Event('school-events-context-reset'));});
  assert.equal(await p.locator('#achievementGallery').textContent(),'');assert.equal(await p.locator('#docDescription').inputValue(),'');assert.equal(await p.locator('#docCount').inputValue(),'');
 });
 await scenario('late documentation response cannot repopulate a signed-out screen',async p=>{
  await p.evaluate(()=>{const original=db.from;db.from=function(table){const q=original(table);if(table==='school_event_documentation'){const then=q.then;q.then=(resolve,reject)=>new Promise(r=>window.releaseDocs=r).then(()=>then(resolve,reject));}return q;};});
  await p.click('#docRefresh');await p.waitForFunction(()=>typeof releaseDocs==='function');
  await p.evaluate(()=>{session=null;access=null;window.dispatchEvent(new Event('school-events-context-reset'));releaseDocs();});
  await p.waitForTimeout(50);assert.equal(await p.locator('#docList').textContent(),'');assert.equal(await p.locator('#docEvent option').count(),0);
 });
 await browser.close();if(failures.length){console.error(failures.join('\n'));process.exitCode=1}
})();
