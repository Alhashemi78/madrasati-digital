'use strict';
(function(){
const area=document.getElementById('auditList'),button=document.getElementById('auditRefresh');
if(!area||!button)return;
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let revision=0;
window.addEventListener('school-events-context-reset',()=>{revision++;area.replaceChildren();});
async function refresh(){
 const request=++revision;
 if(!session||access?.role!=='admin'||demo){area.textContent='سجل العمليات متاح للإدارة بعد تسجيل الدخول.';return;}
 area.textContent='جارٍ تحميل سجل العمليات…';
 const {data,error}=await db.from('school_event_audit').select('event_id,actor_id,operation,occurred_at,previous_record,next_record').order('occurred_at',{ascending:false}).limit(50);
 if(request!==revision)return;
 if(error){area.textContent=errorText(error);return;}
 if(!data?.length){area.textContent='لا توجد عمليات مسجلة بعد تفعيل السجل.';return;}
 area.innerHTML=data.map(r=>{
  const e=r.next_record||r.previous_record||{};
  const name=({INSERT:'إضافة',UPDATE:'تعديل',DELETE:'حذف'})[r.operation]||r.operation;
  const changed=r.operation==='UPDATE'?Object.keys(r.next_record||{}).filter(k=>!['updated_at','created_at_bahrain'].includes(k)&&JSON.stringify(r.previous_record?.[k])!==JSON.stringify(r.next_record?.[k])):[];
  const when=new Intl.DateTimeFormat('ar-BH',{timeZone:'Asia/Bahrain',dateStyle:'medium',timeStyle:'short'}).format(new Date(r.occurred_at));
  return '<article class="event-card"><div><strong>'+escapeText(name)+' — '+escapeText(e.title||r.event_id)+'</strong><p>'+escapeText(when)+'</p>'+(changed.length?'<small>الحقول المتغيرة: '+escapeText(changed.join('، '))+'</small>':'')+'</div></article>';
 }).join('');
}
button.addEventListener('click',refresh);
document.querySelector('[data-view="admin"]')?.addEventListener('click',refresh);
})();