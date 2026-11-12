// node tests/images-function.cjs (Node 24+). No network or real credentials.
const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
(async()=>{
 let handler;
 const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',requestId='00000000-0000-4000-8000-000000000003';
 const state={};const reset=()=>Object.assign(state,{signedIn:true,allowed:true,role:'staff',eventOwner:owner,status:'approved',start:'2026-01-01',doc:true,prior:false,writes:0,cloudUploads:0,writeAuth:null});reset();
 const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-server',CLOUDINARY_API_SECRET:'test-secret'};
 const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 const fetch=async(url,init={})=>{
  const u=new URL(url);
  if(u.pathname==='/auth/v1/user')return state.signedIn?json({id:owner,email:'staff@test.school'}):new Response('',{status:401});
  if(u.pathname.startsWith('/rest/v1/')){
   const table=u.pathname.split('/').pop();
   if(init.method==='POST'){
    assert.equal(table,'school_event_photos');state.writes++;state.writeAuth=init.headers.Authorization;
    assert.equal(init.headers.Authorization,'Bearer test-server');
    const row=JSON.parse(init.body);assert.equal(row.event_id,id);assert.equal(row.owner_id,owner);
    return new Response(null,{status:201});
   }
   assert.equal(init.headers.Authorization,'Bearer test-user');
   if(table==='school_event_access')return json(state.allowed?[{role:state.role}]:[]);
   if(table==='school_events')return json([{id,owner_id:state.eventOwner,status:state.status,start_date:state.start}]);
   if(table==='school_event_documentation')return json(state.doc?[{event_id:id}]:[]);
   if(table==='school_event_photos')return json(state.prior?[{storage_path:'existing'}]:[]);
  }
  if(u.hostname==='api.cloudinary.com'){
   state.cloudUploads++;const form=init.body;
   return json({public_id:form.get('public_id'),type:'authenticated',resource_type:'image',version:1,format:'jpg'});
  }
  if(u.hostname==='res.cloudinary.com')return new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});
  throw Error('Unexpected request '+url);
 };
 const code=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/school-events-images/index.ts'),'utf8'));
 vm.runInNewContext(code,{Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},Response,Request,File,Blob,FormData,Uint8Array,TextEncoder,URL,crypto:webcrypto,btoa,fetch,console});
 function upload(eventId=id){const body=new FormData();body.set('event_id',eventId);body.set('request_id',requestId);body.set('file',new File([new Uint8Array([255,216,255,1])],'photo.jpg',{type:'image/jpeg'}));return new Request('https://function.test',{method:'POST',headers:{Authorization:'Bearer test-user'},body});}
 state.signedIn=false;assert.equal((await handler(upload())).status,401);assert.equal(state.writes,0);
 reset();state.allowed=false;assert.equal((await handler(upload())).status,403);
 reset();state.eventOwner=requestId;assert.equal((await handler(upload())).status,403);
 reset();state.start='2999-01-01';assert.equal((await handler(upload())).status,403);
 reset();state.doc=false;assert.equal((await handler(upload())).status,400);
 reset();assert.equal((await handler(upload('-'.repeat(36)))).status,400);
 reset();const response=await handler(upload());assert.equal(response.status,200);assert.ok((await response.json()).storage_path);assert.equal(state.writes,1);assert.equal(state.cloudUploads,1);
 reset();state.prior=true;assert.equal((await handler(upload())).status,200);assert.equal(state.writes,0);assert.equal(state.cloudUploads,0);
 console.log('PASS image endpoint rejects unauthorized/future/invalid uploads, uses server-only writes, accepts empty 201 and handles completed retries');
})().catch(e=>{console.error(e);process.exitCode=1});
