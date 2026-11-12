'use strict';
(function(){
const $p=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const iso=d=>d.toISOString().slice(0,10);
const dateShift=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d);};
const label=s=>new Intl.DateTimeFormat('ar-BH',{timeZone:'Asia/Bahrain',year:'numeric',month:'long',day:'numeric'}).format(new Date(s+'T12:00:00Z'));
const weekStart=s=>dateShift(s,-new Date(s+'T12:00:00Z').getUTCDay());
const dateRange=r=>label(r.period_start)+' — '+label(r.period_end);
const row=r=>'<div class="archive-row periodic-archive-row"><span>'+escapeHTML(dateRange(r))+'</span><a class="periodic-pdf-link" target="_blank" rel="noopener noreferrer" href="'+escapeHTML(r.pdf_url)+'">↗ PDF</a></div>';

const driveRoot='https://drive.google.com/drive/folders/1WpViI7X9lIN_nqzmuiqDuNvNdbaSIQUn';
const academicStart='2026-08-30',academicEnd='2027-05-30';
function weekIndex(start){return Math.round((new Date(start+'T12:00:00Z')-new Date(academicStart+'T12:00:00Z'))/604800000)+1;}
function reportHTML(start,end,rows,heading){
 const approved=rows.filter(e=>e.status==='approved'),pending=rows.filter(e=>e.status==='pending');
 const m=summary(rows),byDept=Object.entries(rows.reduce((a,e)=>(a[e.department||'غير محدد']=(a[e.department||'غير محدد']||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);
 const tr=rows.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)).map((e,i)=>'<tr><td>'+(i+1)+'</td><td>'+escapeHTML(e.title)+'</td><td>'+escapeHTML(label(e.start_date))+'</td><td>'+escapeHTML(e.department||'—')+'</td><td>'+escapeHTML(e.employee||'—')+'</td><td>'+escapeHTML(e.place||'—')+'</td><td>'+escapeHTML(e.participants||0)+'</td><td>'+escapeHTML(({approved:'معتمدة',pending:'قيد المراجعة',rejected:'مرفوضة'})[e.status]||e.status)+'</td></tr>').join('');
 return '<div style="direction:rtl;font-family:Cairo,Arial,sans-serif;background:#fff;color:#173b45;padding:32px;width:1050px;box-sizing:border-box"><div style="background:#123e49;color:white;padding:28px;border-radius:14px;text-align:center"><h1 style="margin:0;font-size:30px">الفعاليات المدرسية 2026–2027م</h1><h2 style="margin:12px 0 0;font-size:23px">'+escapeHTML(heading)+'</h2><p>'+escapeHTML(label(start))+' — '+escapeHTML(label(end))+'</p></div><p style="text-align:center">مدرسة النعيم الثانوية للبنين</p><div style="display:flex;gap:12px;margin:22px 0">'+[['إجمالي الفعاليات',m.count],['المعتمدة',approved.length],['قيد المراجعة',pending.length],['الأقسام',m.departments],['المشاركات',m.participations]].map(x=>'<div style="flex:1;background:#eaf4f2;padding:16px;text-align:center;border-radius:10px"><b style="font-size:24px">'+x[1]+'</b><div>'+x[0]+'</div></div>').join('')+'</div><h2>الملخص التنفيذي</h2><p>سُجلت '+m.count+' فعالية خلال الفترة المحددة، منها '+approved.length+' معتمدة و'+pending.length+' قيد المراجعة. بلغ إجمالي المشاركات المسجلة '+m.participations+' مشاركة (قد يتكرر المشارك في أكثر من فعالية).</p><h2>توزيع الفعاليات حسب القسم</h2><p>'+escapeHTML(byDept.map(x=>x[0]+' ('+x[1]+')').join(' • ')||'لا توجد فعاليات')+'</p><h2>تفاصيل الفعاليات</h2><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>'+['#','الفعالية','التاريخ','القسم','المسؤول','المكان','المشاركات','الحالة'].map(x=>'<th style="background:#123e49;color:white;padding:9px;border:1px solid #ddd">'+x+'</th>').join('')+'</tr></thead><tbody>'+ (tr||'<tr><td colspan="8" style="padding:20px;text-align:center">لا توجد فعاليات مسجلة في هذه الفترة</td></tr>')+'</tbody></table><p style="margin-top:32px;text-align:center;border-top:1px solid #ddd;padding-top:14px">إعداد المدير المساعد: زياد الهاشمي • تقرير تجريبي مولّد من البيانات المتاحة في النظام</p></div>';
}
async function downloadPeriod(start,end,heading){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end){alert('تحقق من الفترة المحددة');return;}
 const exportRevision=revision;
 const rows=periodEvents(start,end);
 const progress=$p('exportProgress');if(progress)progress.hidden=false;
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-12000px;top:0;width:1050px;background:white;z-index:-1';host.innerHTML=reportHTML(start,end,rows,heading);document.body.appendChild(host);
 try{
  await document.fonts.ready;
  const canvas=await html2canvas(host.firstElementChild,{scale:1.5,backgroundColor:'#fff',useCORS:false});
  const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const pageW=297,pageH=210,margin=8,imgW=pageW-margin*2,printH=pageH-margin*2;
  const sliceHeight=Math.floor(canvas.width*printH/imgW);
  let page=0;
  for(let y=0;y<canvas.height;y+=sliceHeight){
   const h=Math.min(sliceHeight,canvas.height-y);
   const part=document.createElement('canvas');part.width=canvas.width;part.height=h;
   part.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
   if(page++)pdf.addPage();
   pdf.addImage(part.toDataURL('image/jpeg',0.92),'JPEG',margin,margin,imgW,h*imgW/canvas.width);
  }
  if(exportRevision!==revision)throw Error('تغيّر حساب الدخول؛ أعد إنشاء التقرير.');
  pdf.save('تقرير_'+start+'_إلى_'+end+'.pdf');
 }catch(e){alert('تعذر إنشاء PDF: '+e.message)}finally{host.remove();if(progress)progress.hidden=true;}
}
function exportButton(start,end,heading){return '<button type="button" class="btn outline periodic-generate" data-start="'+start+'" data-end="'+end+'" data-heading="'+escapeHTML(heading)+'">إنشاء PDF احترافي من البيانات</button>';}

let archive=[],revision=0;
window.addEventListener('school-events-context-reset',()=>{revision++;archive=[];display();$p('reportLinkForm').reset();$p('archiveMessage').textContent='';});
const numeric=v=>Number(v)||0;
const records=()=>Array.isArray(events)?events.filter(e=>e.status!=='rejected'):[];
function periodEvents(start,end){return records().filter(e=>e.start_date<=end&&(e.end_date||e.start_date)>=start);}
function summary(rows){const departments=new Set(rows.map(e=>e.department).filter(Boolean));return {count:rows.length,participations:rows.reduce((n,e)=>n+numeric(e.participants_count??e.participants??e.participant_count),0),departments:departments.size};}
function statsHTML(rows){const m=summary(rows);return '<div class="periodic-stats"><div><strong>'+m.count+'</strong><small>فعالية</small></div><div><strong>'+m.departments+'</strong><small>قسم</small></div></div>';}
function eventRows(rows){return rows.length?rows.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)).map(e=>'<div class="periodic-event"><span class="periodic-date">'+escapeHTML(label(e.start_date))+'</span><strong>'+escapeHTML(e.title)+'</strong><small>'+escapeHTML(e.department||'غير محدد')+'</small></div>').join(''):'<p class="muted">لا توجد فعاليات مسجلة لهذه الفترة.</p>';}
function archiveLinks(type,start){return archive.filter(r=>r.report_type===type&&r.period_start===start).map(row).join('');}
function display(){
 const now=today(),thisSunday=weekStart(now),pastStart=dateShift(thisSunday,-7),nextStart=dateShift(thisSunday,7),pastEnd=dateShift(pastStart,4),nextEnd=dateShift(nextStart,4);
 const past=periodEvents(pastStart,pastEnd),next=periodEvents(nextStart,nextEnd);
 const monthStart=now.slice(0,7)+'-01',monthEnd=dateShift(dateShift(monthStart,32).slice(0,7)+'-01',-1),current=periodEvents(monthStart,monthEnd);
 $p('periodicOverview').innerHTML='<div class="periodic-overview-item"><span>الأسبوع السابق</span><strong>'+past.length+'</strong><small>فعالية</small></div><div class="periodic-overview-item"><span>الأسبوع القادم</span><strong>'+next.length+'</strong><small>فعالية</small></div><div class="periodic-overview-item"><span>الشهر الحالي</span><strong>'+current.length+'</strong><small>فعالية</small></div>';
 $p('pastWeekReport').innerHTML='<p class="periodic-range">'+escapeHTML(label(pastStart)+' — '+label(pastEnd))+'</p>'+statsHTML(past)+eventRows(past)+exportButton(pastStart,pastEnd,'الأسبوع السابق')+archiveLinks('past_week',pastStart);
 $p('nextWeekReport').innerHTML='<p class="periodic-range">'+escapeHTML(label(nextStart)+' — '+label(nextEnd))+'</p>'+statsHTML(next)+eventRows(next)+exportButton(nextStart,nextEnd,'الأسبوع القادم')+archiveLinks('next_week',nextStart);
 const months=new Set(records().map(e=>e.start_date?.slice(0,7)).filter(Boolean));months.add(now.slice(0,7));archive.filter(r=>r.report_type==='monthly').forEach(r=>months.add(r.period_start.slice(0,7)));
 $p('monthlyReports').innerHTML=[...months].sort().reverse().slice(0,18).map(m=>{const first=m+'-01',last=dateShift(dateShift(first,32).slice(0,7)+'-01',-1),rows=periodEvents(first,last);return '<details class="periodic-month"><summary><span>'+escapeHTML(new Intl.DateTimeFormat('ar-BH',{month:'long',year:'numeric',timeZone:'Asia/Bahrain'}).format(new Date(first+'T12:00:00Z')))+'</span><span>'+rows.length+' فعالية</span></summary>'+statsHTML(rows)+eventRows(rows)+exportButton(first,last,'تقرير شهر '+m)+archive.filter(r=>r.report_type==='monthly'&&r.period_start.slice(0,7)===m).map(row).join('')+'</details>';}).join('');
 const weeks=archive.filter(r=>r.report_type!=='monthly').sort((a,b)=>b.period_start.localeCompare(a.period_start));
 $p('weeklyArchive').innerHTML=weeks.length?weeks.map(row).join(''):'<p class="muted">لا توجد تقارير PDF مؤرشفة حتى الآن.</p>';
 $p('reportLinkAdmin').hidden=!(session&&access?.role==='admin'&&!demo);
}
async function refresh(){
 const request=++revision;
 if(!session||!access||demo){archive=[];display();return;}
 const {data,error}=await db.from('school_event_report_archive').select('report_type,period_start,period_end,pdf_url').order('period_start',{ascending:false});
 if(request!==revision)return;
 if(error){$p('monthlyReports').textContent=errorText(error);return;}
 archive=data||[];display();
}
$p('periodicRefresh').onclick=refresh;
const custom=$p('customPeriodForm');
if(custom){custom.addEventListener('submit',e=>{e.preventDefault();const start=$p('customPeriodStart').value,end=$p('customPeriodEnd').value||start;downloadPeriod(start,end,start===end?'تقرير فعاليات يوم واحد':'تقرير الفعاليات للفترة المحددة');});
$p('customPeriodStart').value=today();$p('customPeriodEnd').value=today();}
$p('periodic').addEventListener('click',e=>{const b=e.target.closest('.periodic-generate');if(b)downloadPeriod(b.dataset.start,b.dataset.end,b.dataset.heading);});
document.querySelector('[data-view="periodic"]')?.addEventListener('click',refresh);
$p('reportLinkForm').addEventListener('submit',async ev=>{
 ev.preventDefault();if(access?.role!=='admin'||!session||demo)return;
 const report_type=$p('archiveType').value,period_start=$p('archiveStart').value,period_end=$p('archiveEnd').value,pdf_url=$p('archiveUrl').value.trim();
 if(period_end<period_start)return $p('archiveMessage').textContent='تاريخ النهاية قبل البداية.';
 if(!/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view(?:\?.*)?$/.test(pdf_url))return $p('archiveMessage').textContent='أدخل رابط عرض ملف PDF في Google Drive.';
 const {error}=await db.from('school_event_report_archive').upsert({report_type,period_start,period_end,pdf_url},{onConflict:'report_type,period_start,period_end'});
 if(error){$p('archiveMessage').textContent=errorText(error);return;}
 $p('archiveMessage').textContent='تم حفظ الرابط مع تاريخه.';$p('reportLinkForm').reset();await refresh();
});
})();