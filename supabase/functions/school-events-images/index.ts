
const ORIGIN='https://alhashemi78.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const env=(key:string)=>Deno.env.get(key)||'';
const validId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
const cloud='uot1nayb',apiKey='282768485726168';
const digest=async(text:string,algo='SHA-256')=>new Uint8Array(await crypto.subtle.digest(algo,new TextEncoder().encode(text)));
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function rest(path:string,init:RequestInit={},auth?:string){
 const key=auth?env('SUPABASE_ANON_KEY'):env('SUPABASE_SERVICE_ROLE_KEY');
 const response=await fetch(env('SUPABASE_URL')+'/rest/v1/'+path,{...init,headers:{apikey:key,Authorization:auth||'Bearer '+key,'Content-Type':'application/json',...init.headers}});
 if(!response.ok)throw Error('تعذر الوصول إلى سجل الصور ('+response.status+')');
 if(response.status===204)return null;
 const body=await response.text();
 return body.trim()?JSON.parse(body):null;
}
async function cloudImage(photo:any){
 const path='v'+photo.cloudinary_version+'/'+photo.cloudinary_public_id+'.'+photo.cloudinary_format;
 const sign=await digest(photo.cloudinary_public_id+'.'+photo.cloudinary_format+env('CLOUDINARY_API_SECRET'),'SHA-1');
 const sig=btoa(String.fromCharCode(...sign)).replace(/\+/g,'-').replace(/\//g,'_').slice(0,8);
 return fetch('https://res.cloudinary.com/'+cloud+'/image/authenticated/s--'+sig+'--/'+path);
}
async function upload(file:Blob,pid:string){
 const ts=String(Math.floor(Date.now()/1000));
 const params:any={asset_folder:'الفعاليات المدرسية 2026-2027',overwrite:'false',public_id:pid,timestamp:ts,type:'authenticated'};
 const signature=hex(await digest(Object.keys(params).sort().map(k=>k+'='+params[k]).join('&')+env('CLOUDINARY_API_SECRET')));
 const form=new FormData();for(const[k,v]of Object.entries(params))form.set(k,String(v));
 form.set('api_key',apiKey);form.set('signature',signature);form.set('file',file,'photo.jpg');
 const response=await fetch('https://api.cloudinary.com/v1_1/'+cloud+'/image/upload',{method:'POST',body:form});
 let data=await response.json();
 if(!response.ok||data.existing){
  const existing=await fetch('https://api.cloudinary.com/v1_1/'+cloud+'/resources/image/authenticated/'+encodeURIComponent(pid),{headers:{Authorization:'Basic '+btoa(apiKey+':'+env('CLOUDINARY_API_SECRET'))}});
  if(!existing.ok)throw Error('Cloudinary: '+String(data.error?.message||existing.status));
  data=await existing.json();
 }
 if(data.public_id!==pid||data.type!=='authenticated'||data.resource_type!=='image')throw Error('تعذر التحقق من خصوصية الصورة.');
 const photo={cloudinary_public_id:pid,cloudinary_version:data.version,cloudinary_format:data.format};
 const check=await cloudImage(photo);
 if(!check.ok||!check.headers.get('content-type')?.startsWith('image/'))throw Error('تعذر التحقق من عرض الصورة الخاصة.');
 await check.arrayBuffer();
 return photo;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'طلب غير مدعوم'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'مصدر غير مسموح'},403);
 try{
 if(!env('CLOUDINARY_API_SECRET'))return reply({error:'مفتاح Cloudinary غير مفعّل في الخادم.'},503);

 const auth=req.headers.get('authorization')||'';
 const userResp=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:auth}});
 if(!userResp.ok)return reply({error:'سجّل الدخول أولًا'},401);
 const user=await userResp.json();
 const access=await rest('school_event_access?email=eq.'+encodeURIComponent(user.email.toLowerCase())+'&select=role',{},auth);
 if(!access.length)return reply({error:'الحساب غير مصرح له'},403);
 if(req.headers.get('content-type')?.includes('application/json')){
  const body=await req.json();if(body.action!=='read'||typeof body.storage_path!=='string'||body.storage_path.length>500)return reply({error:'طلب غير صالح'},400);
  const rows=await rest('school_event_photos?storage_path=eq.'+encodeURIComponent(body.storage_path)+'&select=cloudinary_public_id,cloudinary_version,cloudinary_format',{},auth);
  if(!rows.length||!rows[0].cloudinary_public_id)return reply({error:'الصورة غير متاحة لهذا الحساب'},404);
  const image=await cloudImage(rows[0]);if(!image.ok)throw Error('تعذر تحميل الصورة');
  return new Response(await image.arrayBuffer(),{headers:{...headers,'Content-Type':'application/octet-stream'}});
 }
 const form=await req.formData(),file=form.get('file'),eventId=String(form.get('event_id')||''),requestId=String(form.get('request_id')||'');
 if(!validId(eventId)||!validId(requestId)||!(file instanceof File)||file.type!=='image/jpeg'||!file.size||file.size>2*1024*1024)return reply({error:'صورة أو بيانات غير صالحة'},400);
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return reply({error:'صورة غير صالحة'},400);
 const events=await rest('school_events?id=eq.'+eventId+'&select=id,owner_id,status,start_date',{},auth);
 const e=events[0],today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bahrain'});
 if(!e||e.status!=='approved'||e.start_date>today||(e.owner_id!==user.id&&access[0].role!=='admin'))return reply({error:'لا تملك صلاحية إرفاق صورة لهذه الفعالية'},403);
 const docs=await rest('school_event_documentation?event_id=eq.'+eventId+'&select=event_id',{},auth);
 if(!docs.length)return reply({error:'احفظ التوثيق أولًا'},400);
 const path=eventId+'/'+user.id+'/'+requestId+'.jpg';
 const prior=await rest('school_event_photos?storage_path=eq.'+encodeURIComponent(path)+'&select=storage_path',{},auth);
 if(prior.length)return reply({storage_path:path});
 const meta=await upload(file,'school_events/'+eventId+'/'+user.id+'/'+requestId);
 // Authorization above uses the user's RLS. Only this verified server writes image metadata.
 await rest('school_event_photos',{method:'POST',body:JSON.stringify({event_id:eventId,owner_id:user.id,storage_path:path,...meta})});
 return reply({storage_path:path});
 }catch(e){return reply({error:String(e.message||'تعذر إكمال الطلب')},502);}
});