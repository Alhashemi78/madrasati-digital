'use strict';
const CONFIG={url:'https://chkczeusxnifayswhvqo.supabase.co',key:'sb_publishable_ylT-mRYXiTu-KHp-aD8J9w_EVv9Xz6p',year:'2026-2027م',title:'الفعاليات المدرسية العام الدراسي \u200e2026-2027\u200eم',credit:'إعداد المدير المساعد:زياد الهاشمي'};
const DEPARTMENTS=['الإدارة','الاجتماعيات','التربية الرياضية','العلوم','اللغة الإنجليزية','اللغة العربية','المواد الاثرائية','المواد التجارية','التربية الاسلامية','حاسوب','رياضيات','المجلس الطلابي','الكشافة'];
const SLOTS=['الطابور الصباحي','الحصة الأولى','الحصة الثانية','الحصة الثالثة','الحصة الرابعة','الحصة الخامسة','الحصة السادسة','الحصة السابعة','الفسحة الأولى','الفسحة الثانية','طوال اليوم','بعد الدوام الرسمي'];
const STATUS={pending:'قيد المراجعة',approved:'معتمدة',rejected:'مرفوضة'};
const PALETTE=['#168475','#d9b46a','#588ca8','#a781a3','#d08064','#123e49','#6ba489','#9ea9c9','#bc9c53','#6a949e','#c783a2','#87a555','#6688b3'];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const db=window.supabase?.createClient(CONFIG.url,CONFIG.key,{auth:{storageKey:'school-events-auth',detectSessionInUrl:true}});
let events=[],session=null,access=null,demo=false,currentView='dashboard',charts={},review=null,loading=false,contextRevision=0;
const isOwner=()=>access?.role==='admin'&&session?.user?.email?.toLowerCase()==='zead07@hotmail.com';
function clearPrivateViews(){
 contextRevision++; loading=false; review=null; pendingRoster=null;
 window.dispatchEvent(new Event('school-events-context-reset'));
 for(const id of ['membersList','auditList','rosterPreview','pdfWorkspace','lastUpdate','toast'])$(id)?.replaceChildren();
 for(const id of ['memberForm','reviewForm','authForm'])$(id)?.reset();
 $('rosterFile').value='';$('rosterApply').hidden=true;$('confirmLink').value='';$('authMessage').textContent='';
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 clearTimeout(toast.timer);$('toast').style.display='none';
 resetEventForm();
}
function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bahrain',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=k=>p.find(x=>x.type===k).value;return `${v('year')}-${v('month')}-${v('day')}`;}
function dateLabel(d){return d?new Intl.DateTimeFormat('ar-BH',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Bahrain'}).format(new Date(d+'T12:00:00+03:00')):'—';}
function shiftDate(d,n){const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
function weekRange(d){const day=new Date(d+'T12:00:00Z').getUTCDay();const start=shiftDate(d,-day);return {start,end:shiftDate(start,4)};}
function days(e){return Math.round((new Date(e.end_date+'T12:00:00Z')-new Date(e.start_date+'T12:00:00Z'))/86400000)+1;}
function groupBy(rows,key){return rows.reduce((o,r)=>{const k=r[key]||'غير محدد';o[k]=(o[k]||0)+1;return o;},{});}
function metrics(rows){return {total:rows.length,approved:rows.filter(e=>e.status==='approved').length,pending:rows.filter(e=>e.status==='pending').length,participants:rows.filter(e=>e.status!=='rejected').reduce((s,e)=>s+Number(e.participants||0),0),depts:new Set(rows.filter(e=>e.status!=='rejected').map(e=>e.department)).size};}
function canEdit(e){return demo||access?.role==='admin'||(e.owner_id===session?.user.id&&['pending','rejected'].includes(e.status));}
function canDelete(e){return false;} // لا حذف مباشر؛ يتطلب طلبًا واعتمادًا وسجلًا محفوظًا.
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5000);}
function showView(v){if(v==='admin'&&(!session||access?.role!=='admin'))return;currentView=v;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===v));document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===v));if(v==='calendar')renderWeek();if(v==='reports')renderInsights();window.scrollTo({top:0,behavior:'smooth'});}
function badge(e){return `<span class="badge ${esc(e.status)}">${STATUS[e.status]}</span>`;}
function errorText(err){const t=err?.message||String(err);if(t.includes('Invalid login'))return 'البريد أو كلمة المرور غير صحيحين.';if(t.includes('Email not confirmed'))return 'أكد بريدك الإلكتروني من رسالة التأكيد أولًا.';if(t.includes('rate limit'))return 'تم تجاوز عدد رسائل البريد المسموح. انتظر قليلًا ثم حاول مجددًا.';return t;}
function employeeOptions(){const dep=$('department').value==='أخرى'?$('otherDepartment').value.trim():$('department').value;$('employeeList').innerHTML=[...new Set(events.filter(e=>e.department===dep).map(e=>e.employee))].map(s=>`<option value="${esc(s)}">`).join('');}
function applyTeacherIdentity(){if(!access||demo)return;if(access.role==='admin'){$('department').disabled=false;if(!$('department').value&&!$('eventId').value)$('department').value='الإدارة';$('otherDeptWrap').hidden=$('department').value!=='أخرى';$('otherDepartment').required=!$('otherDeptWrap').hidden;return;}const name=String(access.display_name||'').trim(),dept=String(access.department||'').trim();if(name){$('employee').value=name;$('employee').readOnly=true;}if(dept){if(DEPARTMENTS.includes(dept)){$('department').value=dept;$('otherDeptWrap').hidden=true;$('otherDepartment').required=false;}else{$('department').value='أخرى';$('otherDeptWrap').hidden=false;$('otherDepartment').required=true;$('otherDepartment').value=dept;$('otherDepartment').readOnly=true;}$('department').disabled=true;}}
function resetEventForm(){$('department').disabled=false;$('employee').readOnly=false;$('otherDepartment').readOnly=false;$('eventForm').reset();$('eventId').value='';$('start_date').value=today();$('formHeading').textContent='تسجيل فعالية مدرسية';$('saveEvent').textContent='إرسال للمراجعة';$('formMessage').textContent='';$('otherDeptWrap').hidden=true;$('otherDepartment').required=false;applyTeacherIdentity();}
function chosenSlots(){return [...document.querySelectorAll('#slotChoices input:checked')].map(el=>el.value);}
function conflicting(r){return events.find(e=>e.id!==r.id&&e.status!=='rejected'&&e.place.trim().toLowerCase()===r.place.trim().toLowerCase()&&e.start_date<=r.end_date&&e.end_date>=r.start_date&&(e.slots.some(s=>r.slots.includes(s))||(e.slots.includes('طوال اليوم')&&!r.slots.includes('بعد الدوام الرسمي'))||(r.slots.includes('طوال اليوم')&&!e.slots.includes('بعد الدوام الرسمي'))));}
async function saveEvent(ev){ev.preventDefault();$('formMessage').textContent='';if(demo){toast('المعاينة لا تحفظ بيانات. سجّل الدخول لإضافة فعالية حقيقية.');return;}if(!session||!access){$('authDialog').showModal();return;}const id=$('eventId').value;const editing=id.length>0;const original=editing?events.find(e=>e.id===id):null;if(editing&&(!original||!canEdit(original))){$('formMessage').textContent='تعذر تحديد الفعالية الأصلية للتعديل. حدّث السجل وحاول مجددًا.';return;}
 const r={department:$('department').value==='أخرى'?$('otherDepartment').value.trim():$('department').value,employee:$('employee').value.trim(),title:$('title').value.trim(),place:$('place').value.trim(),start_date:$('start_date').value,end_date:$('end_date').value||$('start_date').value,slots:chosenSlots(),participants:Number($('participants').value),audience:$('audience').value.trim(),notes:$('notes').value.trim()};
 if(access?.role!=='admin'&&!demo){r.department=(access.department||'').trim();r.employee=(access.display_name||'').trim();}if(!r.department||!r.employee||!r.title||!r.place||!r.slots.length){$('formMessage').textContent='أكمل الحقول المطلوبة واختر فترة واحدة على الأقل.';return;}if(r.end_date<r.start_date){$('formMessage').textContent='تاريخ النهاية يجب أن يساوي تاريخ البداية أو يأتي بعده.';return;}if(r.start_date<'2026-08-01'||r.end_date>'2027-07-31'){$('formMessage').textContent='حدد تاريخًا ضمن العام الدراسي 2026-2027 (أغسطس 2026 إلى يوليو 2027).';return;}const c=conflicting({...r,id});if(c){$('formMessage').textContent=`يوجد تعارض مع «${c.title}» في المكان والفترة. غيّر المكان أو الوقت أو التاريخ.`;return;}
 if(!editing){const duplicate=events.find(e=>e.owner_id===session.user.id&&e.title.trim().toLowerCase()===r.title.toLowerCase()&&e.start_date===r.start_date&&e.end_date===r.end_date&&e.place.trim().toLowerCase()===r.place.toLowerCase()&&e.status!=='rejected');if(duplicate){$('formMessage').textContent='هذه الفعالية مسجلة مسبقًا.';return;}}
 const resubmitting=id&&events.find(e=>e.id===id)?.status==='rejected';if(resubmitting){r.status='pending';r.review_note='';}
 $('saveEvent').disabled=true;try{const query=editing?db.from('school_events').update(r).eq('id',id).eq('updated_at',original.updated_at):db.from('school_events').insert(r);const {data,error}=await query.select('id');if(error)throw error;if(!data?.length)throw Error(editing?'لم يُحفظ التعديل؛ ربما غُيّرت الفعالية من جهاز آخر. حدّث السجل وحاول مجددًا.':'لم يتم حفظ السجل. تحقق من صلاحيات حسابك.');toast(resubmitting?'تم تعديل الفعالية وإعادة إرسالها للمراجعة.':id?'تم تعديل الفعالية.':'تم إرسال الفعالية للمراجعة.');resetEventForm();await loadEvents();showView('register');}catch(err){$('formMessage').textContent=errorText(err);}finally{$('saveEvent').disabled=false;}}
function editEvent(id){const e=events.find(x=>x.id===id);if(!e||!canEdit(e))return;resetEventForm();$('eventId').value=id;if(DEPARTMENTS.includes(e.department))$('department').value=e.department;else{$('department').value='أخرى';$('otherDeptWrap').hidden=false;$('otherDepartment').value=e.department;$('otherDepartment').required=true;}for(const k of ['employee','title','place','start_date','end_date','participants','audience','notes'])$(k).value=e[k]??'';document.querySelectorAll('#slotChoices input').forEach(el=>el.checked=e.slots.includes(el.value));$('formHeading').textContent='تعديل الفعالية';$('saveEvent').textContent=e.status==='rejected'?'حفظ وإعادة إرسال للمراجعة':'حفظ التعديل';applyTeacherIdentity();showView('register');}
function deleteEvent(){toast('الحذف النهائي غير مسموح. يلزم مسار طلب حذف واعتماد إداري مع حفظ السجل.');}
function openReview(id,status){if(demo)return toast('المعاينة لا تغيّر بيانات.');review={id,status};$('reviewHeading').textContent=status==='approved'?'اعتماد الفعالية':'رفض الفعالية';$('reviewTitle').textContent=events.find(e=>e.id===id)?.title||'';$('reviewNote').value='';$('reviewDialog').showModal();}
async function submitReview(ev){ev.preventDefault();if(!review)return;const button=ev.submitter;button.disabled=true;try{const {data,error}=await db.from('school_events').update({status:review.status,review_note:$('reviewNote').value.trim()}).eq('id',review.id).select('id');if(error)throw error;if(!data.length)throw Error('لم يتم اعتماد القرار. تحقق من صلاحياتك.');$('reviewDialog').close();toast('تم حفظ قرار المراجعة.');await loadEvents();}catch(err){toast(errorText(err));}finally{button.disabled=false;}}
function actionButtons(e){return `${canEdit(e)?`<button class="btn outline" data-action="edit" data-id="${e.id}">تعديل</button>`:''}${canDelete(e)?`<button class="btn outline" data-action="delete" data-id="${e.id}">حذف</button>`:''}${(demo||access?.role==='admin')&&e.status==='pending'?`<button class="btn primary" data-action="approve" data-id="${e.id}">اعتماد</button><button class="btn pdf" data-action="reject" data-id="${e.id}">رفض</button>`:''}`;}
function drawChart(id,type,labels,values){if(!window.Chart)return;charts[id]?.destroy();charts[id]=new Chart($(id),{type,data:{labels,datasets:[{data:values,backgroundColor:type==="bar"?PALETTE:["#d9b46a","#168475","#d08064"],borderWidth:0,borderRadius:type==='bar'?5:0}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:type==='bar'?'y':'x',animation:false,plugins:{legend:{display:type!=='bar',position:'bottom',labels:{font:{family:'Cairo',size:12},padding:15}}},scales:type==='bar'?{x:{beginAtZero:true,ticks:{precision:0,font:{family:'Cairo'}},grid:{color:'#eef3f1'}},y:{grid:{display:false},ticks:{font:{family:'Cairo',size:11}}}}:{}}});}
function renderDashboard(){const m=metrics(events);$('stats').innerHTML=[['إجمالي الفعاليات',m.total],['الفعاليات المعتمدة',m.approved],['قيد المراجعة',m.pending],['المشاركات المسجلة',m.participants],['الأقسام المشاركة',m.depts]].map(([k,v])=>`<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');const deps=Object.entries(groupBy(events.filter(e=>e.status!=='rejected'),'department')).sort((a,b)=>b[1]-a[1]);drawChart('deptChart','bar',deps.map(x=>x[0]),deps.map(x=>x[1]));drawChart('statusChart','doughnut',Object.values(STATUS),Object.keys(STATUS).map(s=>events.filter(e=>e.status===s).length));const next=events.filter(e=>e.status==='approved'&&e.end_date>=today()).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,5);$('upcoming').innerHTML=next.length?next.map(e=>`<div class="event-card"><div class="date-badge">${dateLabel(e.start_date)}</div><div><h3>${esc(e.title)}</h3><p>${esc(e.department)} · ${esc(e.place)} · ${e.slots.map(esc).join('، ')}</p></div>${badge(e)}</div>`).join(''):'<div class="empty">لا توجد فعاليات قادمة معتمدة.</div>';}
function renderReportsKpis(){const root=$('reportsKpiStats'),bars=$('reportsKpiDepartments');if(!root||!bars)return;const rows=events,m=metrics(rows),active=rows.filter(e=>e.status!=='rejected'),departments=Object.entries(groupBy(active,'department')).sort((a,b)=>b[1]-a[1]);const cards=[['▦','إجمالي الفعاليات',m.total],['✓','الفعاليات المعتمدة',m.approved],['♧','إجمالي المشاركات',m.participants],['▤','الأقسام المشاركة',m.depts]];root.innerHTML=cards.map(([icon,label,value])=>'<div class="reports-kpi-card"><span class="reports-kpi-icon" aria-hidden="true">'+icon+'</span><strong>'+value.toLocaleString('ar-BH')+'</strong><span>'+label+'</span></div>').join('');const max=Math.max(1,...departments.map(x=>x[1]));bars.innerHTML=departments.length?departments.map(([name,n])=>'<div class="reports-kpi-dept"><div><span>'+esc(name)+'</span><b>'+n.toLocaleString('ar-BH')+'</b></div><div class="reports-kpi-track"><div class="reports-kpi-fill" style="width:'+Math.round(n/max*100)+'%"></div></div></div>').join(''):'<p class="muted">لا توجد فعاليات لعرض توزيع الأقسام.</p>';}
function renderInsights(){renderReportsKpis();const list=events,m=metrics(list),top=Object.entries(groupBy(list.filter(e=>e.status!=='rejected'),'department')).sort((a,b)=>b[1]-a[1])[0];$('insights').innerHTML=`<div class="card"><span class="eyebrow dark">المشاركة</span><h2>الأقسام والمشاركات</h2><div class="insight-number">${m.depts} أقسام</div><p class="muted">القسم الأكثر نشاطًا: ${top?`${esc(top[0])} (${top[1]} فعاليات)`:'لا توجد بيانات'}.</p><p class="muted">المشاركات المسجلة: ${m.participants}. العدد مجموع المشاركات وقد يشمل الشخص نفسه في أكثر من فعالية.</p></div><div class="card"><span class="eyebrow dark">المتابعة</span><h2>الاعتماد والتنفيذ</h2><div class="insight-number">${m.total?Math.round(m.approved/m.total*100):0}%</div><p class="muted">نسبة الفعاليات المعتمدة من إجمالي النتائج.</p><p class="muted">${m.pending} طلبات تحتاج إلى مراجعة. المرفوضة محفوظة للرجوع إليها ولا تحجز المكان.</p></div>`;}
function weeklyEvents(){const w=weekRange($('weekDate').value||today());return events.filter(e=>e.status==='approved'&&e.start_date<=w.end&&e.end_date>=w.start);}
function renderWeek(){const w=weekRange($('weekDate').value||today());$('weekLabel').textContent=`الأسبوع من ${dateLabel(w.start)} إلى ${dateLabel(w.end)}`;const list=weeklyEvents();$('weekGrid').innerHTML=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'].map((name,i)=>{const d=shiftDate(w.start,i),arr=list.filter(e=>e.start_date<=d&&e.end_date>=d);return `<div class="week-day"><h3>${name}<small style="display:block">${dateLabel(d)}</small></h3>${arr.length?arr.map(e=>`<div class="week-item"><b>${esc(e.title)}</b><small>${esc(e.place)}</small><small>${e.slots.map(esc).join('، ')}</small></div>`).join(''):'<div class="empty">لا توجد فعاليات</div>'}</div>`;}).join('');}
function renderPending(){const p=events.filter(e=>e.status==='pending');$('pendingList').innerHTML=p.length?p.map(e=>`<div class="event-card"><div><h3>${esc(e.title)}</h3><p>${esc(e.department)} · ${esc(e.employee)} · ${dateLabel(e.start_date)}</p></div><div class="actions">${actionButtons(e)}</div></div>`).join(''):'<div class="empty">جميع الطلبات تمت مراجعتها.</div>';}
async function loadMembers(){
 const revision=contextRevision;
 if(demo){$('membersList').textContent='تُعرض الصلاحيات الفعلية بعد تسجيل الدخول.';return;}
 if(!session||access?.role!=='admin'){$('membersList').replaceChildren();return;}
 const {data,error}=await db.from('school_event_access').select('*').order('created_at');
 if(revision!==contextRevision)return;
 if(error)return toast(errorText(error));
 $('membersList').innerHTML=(data||[]).map(m=>`<div class="member-row"><b>${esc(m.display_name)}</b><small dir="ltr">${esc(m.email)}</small><span class="badge approved">${m.role==='admin'?'إدارة':'موظف'}</span>${m.role==='admin'&&m.email!=='zead07@hotmail.com'&&isOwner()?`<button type="button" class="btn outline" data-remove-admin="${esc(m.email)}">إلغاء الصلاحية الإدارية</button>`:''}</div>`).join('');
}
async function loadEvents(){
 if(demo){renderAll();return;}
 if(!session||!access||loading)return;
 const revision=contextRevision;loading=true;$('connection').textContent='جاري تحديث البيانات…';
 try{
  const all=[];
  for(let offset=0;;offset+=500){
   const {data,error}=await db.from('school_events').select('*').order('start_date',{ascending:false}).order('id').range(offset,offset+499);
   if(revision!==contextRevision)return;
   if(error)throw error;all.push(...data);if(data.length<500)break;
  }
  events=all;renderAll();$('connection').textContent='● متصل بقاعدة البيانات';
  $('lastUpdate').textContent='آخر تحديث '+new Date().toLocaleString('ar-BH',{timeZone:'Asia/Bahrain',dateStyle:'short',timeStyle:'short'});
  await loadMembers();
 }catch(err){if(revision===contextRevision){$('connection').textContent='تعذر تحديث البيانات';toast(errorText(err));}}
 finally{if(revision===contextRevision)loading=false;}
}
function renderAll(){$('placeList').innerHTML=[...new Set(['قاعة الأنشطة','المكتبة','المسرح','الملعب','مختبر العلوم','مختبر الحاسوب','الساحة',...events.map(e=>e.place)])].map(p=>`<option value="${esc(p)}">`).join('');employeeOptions();renderDashboard();renderInsights();renderWeek();renderPending();}
async function syncAuth(s){
 session=s;demo=false;access=null;events=[];clearPrivateViews();
 const revision=contextRevision;
 $('authBtn').textContent=s?'تسجيل الخروج':'تسجيل الدخول';
 $('adminNav').hidden=$('memberForm').hidden=$('rosterImport').hidden=true;
 $('rosterImport').style.display='none';$('welcomeBanner').hidden=false;$('demoBanner').hidden=true;
 $('connection').textContent=s?'جارٍ التحقق من صلاحيات الحساب…':'جاهز للبدء';
 if(currentView==='admin')showView('dashboard');renderAll();
 if(!s)return;
 const {data,error}=await db.from('school_event_access').select('*').eq('email',s.user.email.toLowerCase()).maybeSingle();
 if(revision!==contextRevision)return;
 if(error)toast(errorText(error));access=data;
 $('adminNav').hidden=!(data?.role==='admin');$('memberForm').hidden=!isOwner();
 $('rosterImport').hidden=!(data?.role==='admin');$('rosterImport').style.display=data?.role==='admin'?'':'none';
 $('welcomeBanner').hidden=!!access;$('connection').textContent=access?'● متصل بقاعدة البيانات':'الحساب ينتظر صلاحية الإدارة';
 resetEventForm();
 if(!data)toast('حسابك مسجل، لكن الإدارة لم تمنح هذا البريد صلاحية الوصول بعد.');
 else await loadEvents();
}
function enableDemo(){demo=true;events=[];clearPrivateViews();const titles=['أسبوع القراءة والإبداع','يوم العلوم والتجارب','البطولة الرياضية المدرسية','ورشة الأمن الرقمي','ملتقى ريادة الأعمال','مبادرة القيم الوطنية','برنامج مهارات اللغة الإنجليزية','معرض المشاريع الطلابية'];events=Array.from({length:20},(_,i)=>{const date=shiftDate('2026-10-04',i);return {id:'demo-'+i,owner_id:'demo',department:DEPARTMENTS[i%DEPARTMENTS.length],employee:'مسؤول الفعالية '+(i+1),title:titles[i%titles.length],place:['المكتبة','مختبر العلوم','الملعب','المسرح'][i%4],slots:[SLOTS[i%10]],start_date:date,end_date:shiftDate(date,i%5===0?1:0),participants:25+i*7,audience:'طلبة المرحلة الثانوية',notes:'بيانات توضيحية لتجربة الواجهة والتقارير. تعزيز مشاركة الطلبة وتنمية مهاراتهم من خلال أنشطة منظمة.',status:i%6===0?'rejected':i%4===0?'pending':'approved',review_note:'',created_at:'2026-10-03T06:00:00Z',created_at_bahrain:'2026-10-03T09:00:00'};});$('welcomeBanner').hidden=true;$('demoBanner').hidden=false;$('adminNav').hidden=!(session&&access?.role==='admin');$('connection').textContent='معاينة تجريبية';$('weekDate').value='2026-10-04';renderAll();loadMembers();}
async function authAction(kind){if(!db)return toast('تعذر تحميل خدمة الدخول. حدّث الصفحة.');const email=$('email').value.trim().toLowerCase(),password=$('password').value;if(!$('email').checkValidity()||password.length<8){$('authMessage').textContent='أدخل بريدًا صحيحًا وكلمة مرور من 8 أحرف على الأقل.';return;}const buttons=$('authForm').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const redirect=location.origin+location.pathname;const {data,error}=kind==='signup'?await db.auth.signUp({email,password,options:{emailRedirectTo:redirect}}):await db.auth.signInWithPassword({email,password});if(error)throw error;if(kind==='signup'&&!data.session)$('authMessage').textContent='تم طلب إنشاء الحساب. افتح رسالة تأكيد البريد ثم سجّل الدخول. إذا كنت مسجلًا مسبقًا، استخدم زر الدخول.';else{$('authDialog').close();await syncAuth(data.session);}}catch(err){$('authMessage').textContent=errorText(err);}finally{buttons.forEach(b=>b.disabled=false);}}
async function verifyLink(){try{const url=new URL($('confirmLink').value);if(url.origin!==CONFIG.url)throw Error('ألصق رابط التأكيد الصادر من Supabase الخاص بهذا النظام.');const token_hash=url.searchParams.get('token')||url.searchParams.get('token_hash'),type=url.searchParams.get('type');if(!token_hash||!['signup','recovery','email'].includes(type))throw Error('رابط التأكيد غير صالح.');const {data,error}=await db.auth.verifyOtp({token_hash,type});if(error)throw error;await syncAuth(data.session);if(type==='recovery')$('authDialog').showModal();$('authMessage').textContent=type==='recovery'?'اكتب كلمة المرور الجديدة ثم اضغط حفظ كلمة المرور الجديدة.':'تم تأكيد الحساب. يمكنك إغلاق هذه النافذة.';}catch(err){$('authMessage').textContent=errorText(err);}}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));$('department').innerHTML='<option value="">اختر القسم</option>'+[...DEPARTMENTS,'أخرى'].map(d=>`<option>${d}</option>`).join('');$('slotChoices').innerHTML=SLOTS.map((s,i)=>`<label class="slot"><input type="checkbox" value="${s}" id="slot${i}">${s}</label>`).join('');$('slotChoices').onchange=ev=>{if(!ev.target.checked)return;const single=['طوال اليوم','بعد الدوام الرسمي'].includes(ev.target.value);document.querySelectorAll('#slotChoices input').forEach(el=>{if(el!==ev.target&&(single||['طوال اليوم','بعد الدوام الرسمي'].includes(el.value)))el.checked=false;});};$('department').onchange=()=>{$('otherDeptWrap').hidden=$('department').value!=='أخرى';$('otherDepartment').required=!$('otherDeptWrap').hidden;employeeOptions();};$('otherDepartment').oninput=employeeOptions;$('eventForm').onsubmit=saveEvent;$('resetForm').onclick=resetEventForm;$('weekDate').value=today();$('weekDate').onchange=renderWeek;
document.body.addEventListener('click',ev=>{const b=ev.target.closest('[data-action]');if(b){const {action,id}=b.dataset;if(action==='edit')editEvent(id);if(action==='delete')deleteEvent(id);if(action==='approve')openReview(id,'approved');if(action==='reject')openReview(id,'rejected');}});$('reviewForm').onsubmit=submitReview;$('cancelReview').onclick=()=>$('reviewDialog').close();$('demoBtn').onclick=enableDemo;$('endDemo').onclick=()=>syncAuth(session);
$('authBtn').onclick=async()=>{if(session){const {error}=await db.auth.signOut();if(error)return toast(errorText(error));await syncAuth(null);}else $('authDialog').showModal();};$('closeAuth').onclick=()=>$('authDialog').close();$('authForm').onsubmit=e=>{e.preventDefault();authAction('login');};$('signup').onclick=()=>authAction('signup');$('verifyLink').onclick=verifyLink;$('forgotPassword').onclick=async()=>{const email=$('email').value.trim();if(!$('email').checkValidity())return;$('authMessage').textContent='جاري إرسال رابط الاستعادة…';const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});$('authMessage').textContent=error?errorText(error):'تم طلب رابط الاستعادة. افتحه في البريد أو ألصقه في حقل رابط التأكيد أعلاه.';};$('changePassword').onclick=async()=>{if(!session)return $('authMessage').textContent='افتح رابط الاستعادة أولًا.';const password=$('password').value;if(password.length<8)return $('authMessage').textContent='كلمة المرور من 8 أحرف على الأقل.';const {error}=await db.auth.updateUser({password});$('authMessage').textContent=error?errorText(error):'تم حفظ كلمة المرور الجديدة.';};
$('memberForm').onsubmit=async e=>{e.preventDefault();if(!session||access?.role!=='admin'||!isOwner())return;const email=$('memberEmail').value.trim().toLowerCase(),name=$('memberName').value.trim();if(!email||!name)return; if(!confirm('منح صلاحيات الإدارة والقبول والرفض والتعديل لهذا البريد؟'))return;const {error}=await db.rpc('school_event_manage_admin',{p_email:email,p_name:name,p_action:'add'});if(error)return toast(errorText(error));$('memberForm').reset();toast('تم منح الصلاحية الإدارية');await loadMembers();};$('membersList').onclick=async e=>{const button=e.target.closest('[data-remove-admin]');if(!button||!session||access?.role!=='admin'||!isOwner())return;const email=button.dataset.removeAdmin;if(!confirm('إلغاء صلاحية الإدارة عن '+email+'؟ سيبقى حسابه موظفًا دون قبول أو رفض.'))return;button.disabled=true;const {error}=await db.rpc('school_event_manage_admin',{p_email:email,p_name:'',p_action:'remove'});if(error)toast(errorText(error));else{toast('أُلغيت الصلاحية الإدارية');await loadMembers();}button.disabled=false;};

let pendingRoster=null;
$('rosterFile').onchange=async ev=>{
 const revision=contextRevision;
 pendingRoster=null;$('rosterApply').hidden=true;$('rosterPreview').textContent='';
 if(!session||access?.role!=='admin')return toast('هذه العملية مخصصة للإدارة فقط.');
 const file=ev.target.files?.[0];if(!file)return;
 if(!/\.xlsx$/i.test(file.name)||file.size>2*1024*1024)return toast('اختر ملف XLSX لا يتجاوز 2 ميغابايت.');
 try{
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
  if(revision!==contextRevision)return;
  const ws=wb.worksheets[0];if(!ws)throw Error('ملف Excel لا يحتوي على ورقة بيانات.');
  const value=c=>{const v=c?.value;return String(typeof v==='object'?(v?.text||v?.result||''):v??'').trim();};
  const header=[1,2,3].map(i=>value(ws.getRow(1).getCell(i)));
  if(header[0]!=='اسم المعلم'||header[1]!=='البريد الإلكتروني'||header[2]!=='القسم')throw Error('ترتيب الأعمدة المطلوب: اسم المعلم، البريد الإلكتروني، القسم.');
  const rows=[],seen=new Set();
  ws.eachRow((row,i)=>{if(i===1)return;const name=value(row.getCell(1)),email=value(row.getCell(2)).toLowerCase(),dept=value(row.getCell(3));
   if(!name&&!email&&!dept)return;
   if(!name||!dept||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.endsWith('.invalid'))throw Error('بيانات غير مكتملة أو بريد تجريبي في الصف '+i);
   if(seen.has(email))throw Error('بريد مكرر في الصف '+i);
   seen.add(email);rows.push({email,display_name:name,department:dept});
  });
  if(!rows.length)throw Error('الملف فارغ. لن يتم إيقاف حسابات بسبب ملف فارغ.');
  const {data:existing,error}=await db.from('school_event_access').select('email,role,display_name');
  if(revision!==contextRevision)return;
  if(error)throw error;
  const adminEmails=new Set(existing.filter(x=>x.role==='admin').map(x=>x.email));
  if(rows.some(x=>adminEmails.has(x.email)))throw Error('تحتوي القائمة على حساب إداري. لا يمكن تغيير صلاحيات الإدارة من ملف المعلمين.');
  const previous=existing.filter(x=>x.role==='staff');
  const added=rows.filter(x=>!previous.some(p=>p.email===x.email));
  const removed=previous.filter(x=>!seen.has(x.email));
  pendingRoster={rows,added,removed};
  $('rosterPreview').textContent='معاينة: '+rows.length+' معلمًا | إضافة '+added.length+' | إيقاف وصول '+removed.length+'. الأقسام موجودة في Excel؛ يجب التحقق من ربطها بالخادم قبل الاعتماد النهائي.';
  $('rosterApply').hidden=false;
 }catch(err){if(revision===contextRevision)$('rosterPreview').textContent='تعذر قراءة القائمة: '+errorText(err);}
};
$('rosterApply').onclick=async()=>{
 if(!pendingRoster||access?.role!=='admin'||!session)return;
 const {rows,added,removed}=pendingRoster;
 const revision=contextRevision;
 const checkContext=()=>{if(revision!==contextRevision)throw Error('تغيّر حساب الدخول؛ أعد استيراد القائمة.');};
 if(!confirm('اعتماد قائمة Excel؟ سيُضاف '+added.length+' موظفًا ويُلغى وصول '+removed.length+' موظفًا غير موجودين بالقائمة. لا يمكن اعتبار هذا إبطالًا فوريًا لكل جلسات Supabase.'))return;
 $('rosterApply').disabled=true;
 try{
  const {error}=await db.from('school_event_access').upsert(rows.map(x=>({email:x.email,display_name:x.display_name,department:x.department,role:'staff'})),{onConflict:'email'});
  checkContext();if(error)throw error;
  for(const member of removed){checkContext();const res=await db.from('school_event_access').delete().eq('email',member.email).eq('role','staff');if(res.error)throw res.error;}
  checkContext();pendingRoster=null;$('rosterApply').hidden=true;$('rosterFile').value='';
  $('rosterPreview').textContent='تم تحديث قائمة السماح. يتطلب إبطال الجلسات القائمة إجراءً منفصلًا على الخادم.';
  await loadMembers();
 }catch(err){if(revision===contextRevision)toast('لم يكتمل التحديث؛ راجع القائمة قبل المحاولة: '+errorText(err));}
 finally{$('rosterApply').disabled=false;}
};

if(window.Chart)Chart.defaults.font.family='Cairo';resetEventForm();renderAll();if(db){db.auth.getSession().then(({data,error})=>{if(error)toast(errorText(error));syncAuth(data.session);});db.auth.onAuthStateChange((event,s)=>{if(event==='PASSWORD_RECOVERY'){setTimeout(async()=>{await syncAuth(s);$('authDialog').showModal();$('authMessage').textContent='اكتب كلمة المرور الجديدة واضغط حفظ كلمة المرور الجديدة.';},0);}else if(event==='SIGNED_OUT')setTimeout(()=>syncAuth(null),0);else if(['SIGNED_IN','USER_UPDATED'].includes(event)&&s?.user?.id!==session?.user?.id)setTimeout(()=>syncAuth(s),0);});}else toast('تعذر تحميل مكتبة Supabase. تحقق من الاتصال ثم حدّث الصفحة.');
