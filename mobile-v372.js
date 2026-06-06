(function(){
'use strict';
const SCRIPT_URL='https://script.google.com/macros/s/AKfycbzsIiJU-C0cwKya-7H3hk0uAqBmWaV7xHc7WanWDszOSwag89mAjTOlSFmPPhjSjbS_/exec';
const $=id=>document.getElementById(id); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const S={pegawai:[],jurnal:[],rencana:[],pengumuman:[],agenda:[],user:null,linked:null,edit:null,loaded:false};
const LS='arika_mobile_lite_v329_session'; const CACHE='arika_mobile_lite_v329_cache'; const PENDING_R='arika_mobile_pending_rencana_v337';
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function norm(v){return String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function today(){const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateKey(v){if(!v)return''; if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0'); let s=String(v).trim(); let m=s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/); if(m)return `${m[1]}-${m[2]}-${m[3]}`; m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; return s.slice(0,10);}
function fmt(d){const m=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']; const x=new Date(dateKey(d)); return isNaN(x)?(d||'-'):`${String(x.getDate()).padStart(2,'0')} ${m[x.getMonth()]} ${x.getFullYear()}`;}
function getVal(o,keys){if(!o)return''; for(const k of keys){if(Object.prototype.hasOwnProperty.call(o,k)&&o[k]!=null&&String(o[k]).trim()!=='')return o[k];} const lower={}; Object.keys(o).forEach(k=>lower[norm(k)]=o[k]); for(const k of keys){const v=lower[norm(k)]; if(v!=null&&String(v).trim()!=='')return v;} return '';}
function toast(msg){const t=$('toast'); if(!t)return; t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.add('hidden'),2600);} 
function loading(on,msg='Memuat...'){const l=$('loader'); if($('loaderText'))$('loaderText').textContent=msg; if(l)l.classList.toggle('show',!!on);} 
function apiUrl(q){return SCRIPT_URL+(SCRIPT_URL.includes('?')?'&':'?')+q;}
async function fetchJson(q,ms=14000){const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); try{const r=await fetch(apiUrl(q),{cache:'no-store',signal:c.signal}); if(!r.ok)throw new Error('HTTP '+r.status); return await r.json();} finally{clearTimeout(t);} }
async function post(action,payload,opt={}){const body=JSON.stringify({action,payload}); const isJurnal=/jurnal/i.test(action); const ms=opt.ms||12000; const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); try{if(isJurnal){await fetch(SCRIPT_URL,{method:'POST',mode:'no-cors',cache:'no-store',body,signal:c.signal}); return {success:true,opaque:true};} const r=await fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},cache:'no-store',body,signal:c.signal}); const ct=r.headers.get('content-type')||''; if(ct.includes('json'))return await r.json(); return {success:r.ok};}catch(e){ if(e.name==='AbortError')return {success:true,timeoutAssumed:true}; try{await fetch(SCRIPT_URL,{method:'POST',mode:'no-cors',cache:'no-store',body}); return {success:true,opaque:true};}catch(_){throw e;} } finally{clearTimeout(t);} }
function mapPegawai(a){return (a||[]).map(p=>({nama:String(getVal(p,['nama','Nama','name','pelaksana'])||''),nip:String(getVal(p,['nip','NIP','nip pegawai','nip_pegawai'])||''),status:String(getVal(p,['status','Status','status pegawai'])||'PNS'),lab:String(getVal(p,['lab','fungsi','Fungsi Kerja','fungsi kerja'])||''),peran:String(getVal(p,['peran','role','hak akses','akses'])||'Pegawai')})).filter(p=>p.nama);}
function truthyLembur(v){const t=String(v??'').trim().toLowerCase(); return v===true||t==='true'||t==='ya'||t==='y'||t==='1'||t==='lembur'||t==='iya'||t==='yes';}
function explicitFalseLembur(v){const t=String(v??'').trim().toLowerCase(); return t==='false'||t==='tidak'||t==='no'||t==='n'||t==='0'||t==='bukan lembur'||t==='non lembur'||t==='non-lembur';}
function validTimeLembur(v){return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v||'').trim());}
function meaningfulLemburDuration(v){const t=String(v??'').trim().toLowerCase(); if(!t)return false; if(/^0+(\.0+)?$/.test(t))return false; if(/^(0\s*jam|0\s*menit|00:00|0:00|-)$/i.test(t))return false; const nums=t.match(/\d+/g); if(nums&&nums.some(n=>Number(n)>0))return true; return /jam|menit/.test(t)&&!/0/.test(t);}
function strictIsLembur(explicit,start,end,surat,lama){if(truthyLembur(explicit))return true; if(explicitFalseLembur(explicit))return false; const hasValidTimes=validTimeLembur(start)&&validTimeLembur(end); if(hasValidTimes)return true; if(hasValidTimes&&meaningfulLemburDuration(lama))return true; return false;}
function normalizeMobileLemburFlag(j){const isL=strictIsLembur(j&&j.isLembur,j&&j.start,j&&j.end,j&&j.suratTugas,j&&(j.lamaLembur||j.waktuLembur)); if(!isL){if(j){j.isLembur=false; j.start=''; j.end=''; j.suratTugas=''; j.lamaLembur=''; j.waktuLembur='';}} else if(j){j.isLembur=true;} return j;}
function mapJurnal(a){return (a||[]).map((d,i)=>{
  const start=String(getVal(d,['Jam Mulai','jam mulai','start','jamMulai','Jam Mulai Lembur'])||'');
  const end=String(getVal(d,['Jam Selesai','jam selesai','end','jamSelesai','Jam Selesai Lembur'])||'');
  const surat=String(getVal(d,['No Surat Tugas','suratTugas','surat tugas','no surat tugas','ST'])||'');
  const lama=String(getVal(d,['Lama Lembur','lamaLembur','lama lembur','waktuLembur','durasi'])||'');
  const isL=strictIsLembur(getVal(d,['Lembur?','lembur','isLembur','is lembur']),start,end,surat,lama);
  return {
    id:String(getVal(d,['ID Jurnal','id','id_jurnal','id jurnal'])||`j-${i}-${Date.now()}`),
    date:dateKey(getVal(d,['date','tanggal','Tanggal','tgl'])),
    name:String(getVal(d,['name','nama','pelaksana','pegawai','Nama'])||''),
    nip:String(getVal(d,['nip','NIP','nip pegawai'])||''),
    cat:String(getVal(d,['cat','kategori','Kategori','category'])||'Lainnya'),
    desc:String(getVal(d,['desc','deskripsi','Deskripsi','uraian','pekerjaan'])||''),
    status:String(getVal(d,['status','Status','status akhir','status_pekerjaan'])||'Selesai'),
    linkDataDukung:String(getVal(d,['linkDataDukung','Link Data Dukung','link data dukung','data dukung'])||''),
    rencanaId:String(getVal(d,['rencanaId','rencana id','rencana_id','Rencana ID'])||''),
    rencanaJudul:String(getVal(d,['rencanaJudul','rencana judul','rencana_judul','Judul Rencana'])||''),
    isLembur:isL,start,end,suratTugas:surat,lamaLembur:lama,waktuLembur:lama,
    createdAt:String(getVal(d,['createdAt','timestamp','Timestamp'])||'')
  };
}).filter(x=>x.date&&x.name).map(normalizeMobileLemburFlag);}
function mapRencana(a){return (a||[]).map((r,i)=>({id:String(getVal(r,['id','ID','id_rencana','timestamp'])||`r-${i}`),rencanaId:String(getVal(r,['rencanaId','rencana id','rencana_id','Rencana ID'])||getVal(r,['id','ID'])||`r-${i}`),ownerName:String(getVal(r,['ownerName','nama','Nama','pegawai','pelaksana'])||''),ownerNip:String(getVal(r,['ownerNip','nip','NIP','nip pegawai'])||''),tanggal:dateKey(getVal(r,['tanggal','Tanggal','date','tgl'])),jamReminder:String(getVal(r,['jamReminder','jam reminder','Jam Reminder','jam','waktu'])||''),periode:String(getVal(r,['periode','jenis','type'])||'Reminder'),judul:String(getVal(r,['judul','Judul','rencana','kegiatan','title'])||''),catatan:String(getVal(r,['catatan','Catatan','detail','deskripsi','note'])||''),status:String(getVal(r,['status','Status'])||'Aktif'),createdAt:String(getVal(r,['createdAt','timestamp','Timestamp'])||'')})).filter(r=>r.judul||r.catatan);}

function mapPengumuman(a){return (a||[]).map((x,i)=>({
  id:String(getVal(x,['id','ID','id_pengumuman','ID Pengumuman'])||('p-'+i)),
  judul:String(getVal(x,['judul','Judul','title','nama pengumuman','Nama Pengumuman'])||''),
  jenis:String(getVal(x,['jenis','Jenis','kategori','Kategori','type'])||'Informasi'),
  mulai:dateKey(getVal(x,['mulai','Mulai','tanggal mulai','Tanggal Mulai','startDate','start'])),
  selesai:dateKey(getVal(x,['selesai','Selesai','tanggal selesai','Tanggal Selesai','endDate','end'])),
  isi:String(getVal(x,['isi','Isi','isi pengumuman','Isi Pengumuman','pesan','Pesan','message','deskripsi','Deskripsi'])||''),
  aktif:String(getVal(x,['aktif','Aktif','isActive','status','Status'])||'true').toLowerCase()!=='false'
})).filter(x=>x.judul||x.isi);}
function mapAgenda(a){return (a||[]).map((x,i)=>({
  id:String(getVal(x,['id','ID','id_agenda','ID Agenda'])||('a-'+i)),
  judul:String(getVal(x,['judul','Judul','title','Nama Agenda'])||''),
  jenis:String(getVal(x,['jenis','Jenis','kategori','Kategori'])||'Agenda'),
  tanggal:dateKey(getVal(x,['tanggal','Tanggal','date','tgl'])),
  waktuMulai:String(getVal(x,['Waktu Mulai','waktuMulai','waktu_mulai','Jam Mulai','jamMulai'])||''),
  lokasi:String(getVal(x,['lokasi','Lokasi','tempat','Tempat','media','Media'])||''),
  keterangan:String(getVal(x,['keterangan','Keterangan','catatan','Catatan','deskripsi','Deskripsi'])||''),
  aktif:String(getVal(x,['aktif','Aktif','status','Status'])||'true').toLowerCase()!=='false'
})).filter(x=>x.judul||x.keterangan);}
function activePengumuman(){const now=today(); return (S.pengumuman||[]).filter(x=>x.aktif!==false).filter(x=>(!x.mulai||x.mulai<=now)&&(!x.selesai||x.selesai>=now)).sort((a,b)=>String(b.mulai||'').localeCompare(String(a.mulai||''))).slice(0,3);}
function agendaTerdekat(){const now=today(); return (S.agenda||[]).filter(x=>x.aktif!==false).filter(x=>!x.tanggal||x.tanggal>=now).sort((a,b)=>(a.tanggal+a.waktuMulai).localeCompare(b.tanggal+b.waktuMulai)).slice(0,3);}

function saveCache(){try{localStorage.setItem(CACHE,JSON.stringify({pegawai:S.pegawai,jurnal:S.jurnal,rencana:S.rencana,pengumuman:S.pengumuman,agenda:S.agenda,ts:Date.now()}));}catch(_){}}
function loadCache(){try{const c=JSON.parse(localStorage.getItem(CACHE)||'{}'); if(c.pegawai)S.pegawai=c.pegawai; if(c.jurnal)S.jurnal=(c.jurnal||[]).map(normalizeMobileLemburFlag); if(c.rencana)S.rencana=c.rencana; if(c.pengumuman)S.pengumuman=c.pengumuman; if(c.agenda)S.agenda=c.agenda;}catch(_){}}
function getPendingRencana(){try{const now=Date.now(); const rows=JSON.parse(localStorage.getItem(PENDING_R)||'[]'); const fresh=(Array.isArray(rows)?rows:[]).filter(r=>r&&r.__pendingAt&&(now-r.__pendingAt)<86400000); if(fresh.length!==rows.length)localStorage.setItem(PENDING_R,JSON.stringify(fresh)); return fresh;}catch(_){return[];}}
function savePendingRencana(rows){try{localStorage.setItem(PENDING_R,JSON.stringify((rows||[]).slice(0,80)));}catch(_){}}
function addPendingRencana(p){const id=String(p.rencanaId||p.id||''); const rows=getPendingRencana().filter(r=>String(r.rencanaId||r.id||'')!==id); rows.unshift(Object.assign({},p,{__pendingRencana:true,__pendingAt:p.__pendingAt||Date.now()})); savePendingRencana(rows);}
function removePendingRencana(id){id=String(id||''); if(!id)return; savePendingRencana(getPendingRencana().filter(r=>String(r.rencanaId||r.id||'')!==id));}
function mergeServerRencana(rows){const incoming=mapRencana(rows||[]); const pending=getPendingRencana(); S.rencana=dedupeRencana([...pending,...incoming]); saveCache(); return S.rencana;}
function currentJurnal(){if(!S.user)return[]; const n=norm(S.user.nama), nip=norm(S.user.nip); return S.jurnal.filter(j=>norm(j.nip)===nip||norm(j.name)===n).sort((a,b)=>(b.date||'').localeCompare(a.date||''));}
function currentPlans(){if(!S.user)return[]; const n=norm(S.user.nama), nip=norm(S.user.nip); return S.rencana.filter(r=>(norm(r.ownerNip)===nip||norm(r.ownerName)===n)&&!/^selesai$/i.test(r.status)).sort((a,b)=>(a.tanggal+a.jamReminder).localeCompare(b.tanggal+b.jamReminder));}
function planReal(plan){const rid=String(plan.rencanaId||plan.id); const pt=norm(plan.judul); return currentJurnal().filter(j=>(rid&&j.rencanaId&&String(j.rencanaId)===rid)||(pt&&norm(j.rencanaJudul)===pt)||(pt&&norm(j.desc).includes(pt)&&/REALISASI\s+RENCANA/i.test(j.desc)));}
function rid(){return 'RNC-'+today().replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,10).toUpperCase();}
function jid(){return 'jurnal-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);}
function setDefaults(){['planDate','jDate'].forEach(id=>{if($(id)&&!$(id).value)$(id).value=today();});}
async function loadPegawai(){loadCache(); renderLoginHints(); try{const d=await fetchJson('mode=login&maxRows=0&mobile=1&_='+Date.now(),10000); if(d&&d.pegawai){S.pegawai=mapPegawai(d.pegawai); saveCache(); renderLoginHints('Daftar pegawai siap.');}}catch(e){renderLoginHints(S.pegawai.length?'Mode offline cache.':'Gagal memuat pegawai. Coba refresh.');}}
async function loadRencanaLengkapMobile(){
  if(!S.user) return;
  try{
    // Sinkron tambahan khusus Rencana: mengambil seluruh rencana dari database agar rencana lama/di luar 600 baris tidak hilang di mobile.
    // Jika backend belum punya mode rencana khusus, full=true tetap membuat data rencana lengkap terbaca.
    const d=await fetchJson('mode=core&full=true&maxRows=1&mobile=1&rencanaOnly=1&_='+Date.now(),22000);
    if(d&&Array.isArray(d.rencana)&&d.rencana.length){
      S.rencana=dedupeRencana([...(S.rencana||[]), ...getPendingRencana(), ...mapRencana(d.rencana)]);
      saveCache();
      renderAll();
      if($('syncText')) $('syncText').textContent='Database sinkron';
    }
  }catch(e){
    // Jangan ganggu mobile jika koneksi lambat; cache/core awal tetap dipakai.
    console.warn('Rencana lengkap mobile belum bisa dimuat:', e);
  }
}
async function loadCore(silent=false){if(!S.user)return; if(!silent) $('syncText').textContent='Sinkron...'; try{const d=await fetchJson('mode=core&maxRows=800&days=90&mobile=1&_='+Date.now(),16000); if(d.pegawai)S.pegawai=mapPegawai(d.pegawai); if(d.jurnal)S.jurnal=dedupeJurnal(mapJurnal(d.jurnal)); if(d.rencana)mergeServerRencana(d.rencana); if(d.pengumuman)S.pengumuman=mapPengumuman(d.pengumuman); if(d.agenda)S.agenda=mapAgenda(d.agenda); saveCache(); S.loaded=true; $('syncText').textContent='Database sinkron'; renderAll(); setTimeout(()=>loadRencanaLengkapMobile(),500);}catch(e){$('syncText').textContent='Cache lokal'; if(!silent)toast('Database belum merespons. Menampilkan cache.'); renderAll(); setTimeout(()=>loadRencanaLengkapMobile(),900);}}
function dedupeJurnal(list){const m=new Map(); [...list].forEach(j=>{const k=j.id||[j.date,norm(j.name),norm(j.desc),j.rencanaId].join('|'); m.set(k,j);}); return Array.from(m.values());}
function dedupeRencana(list){const m=new Map(); [...list].forEach(r=>{const k=r.rencanaId||r.id||[r.tanggal,norm(r.ownerName),norm(r.judul)].join('|'); m.set(k,r);}); return Array.from(m.values());}
function renderLoginHints(msg){if($('loginMsg'))$('loginMsg').textContent=msg||'Ketik username untuk mencari pegawai.';}
function doLogin(e){e.preventDefault(); const name=($('loginHidden').value||$('loginName').value||'').trim(); const pass=$('loginPass').value.trim(); const p=S.pegawai.find(x=>norm(x.nama)===norm(name)); if(!p||norm(p.nip)!==norm(pass)){toast('Username atau kata sandi belum sesuai.'); return;} S.user=p; localStorage.setItem(LS,JSON.stringify(p)); $('loginView').classList.add('hidden'); $('appShell').classList.remove('hidden'); setDefaults(); renderAll(); loadCore(true);}
function logout(){localStorage.removeItem(LS); S.user=null; S.linked=null; S.edit=null; $('appShell').classList.add('hidden'); $('loginView').classList.remove('hidden');}
function go(view){$$('.view').forEach(v=>v.classList.toggle('active',v.id===view)); $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.go===view)); if(view==='journal') renderLinked(); if(view==='history') renderHistory(); if(view==='plans') renderPlans(); if(view==='wfh') renderWfh(); scrollTo(0,0);}
function renderHomeInfo(){
  const box=$('homeInfo'); if(!box)return;
  const p=activePengumuman(); const a=agendaTerdekat();
  const peng=p.length?p.map(x=>`<button class="mobile-info-item" type="button" onclick="ARIKA.viewPengumuman('${esc(x.id)}')"><b>${esc(x.judul||x.jenis)}</b><span>${esc(x.jenis)}${x.mulai?' • '+fmt(x.mulai):''}</span>${x.isi?`<p>${esc(x.isi)}</p>`:''}</button>`).join(''):'<div class="mobile-info-empty">Tidak ada pengumuman aktif.</div>';
  const ag=a.length?a.map(x=>`<button class="mobile-info-item" type="button" onclick="ARIKA.viewAgenda('${esc(x.id)}')"><b>${esc(x.judul||x.jenis)}</b><span>${esc(fmt(x.tanggal||today()))}${x.waktuMulai?' • '+esc(x.waktuMulai):''}</span>${x.lokasi?`<p>${esc(x.lokasi)}</p>`:(x.keterangan?`<p>${esc(x.keterangan)}</p>`:'')}</button>`).join(''):'<div class="mobile-info-empty">Tidak ada agenda terdekat.</div>';
  box.innerHTML=`<div class="mobile-info-grid"><div class="mobile-info-card"><div class="mobile-info-head"><div><h2>📢 Pengumuman</h2><p>Maksimal 3 info aktif.</p></div></div>${peng}</div><div class="mobile-info-card"><div class="mobile-info-head"><div><h2>📅 Agenda</h2><p>Agenda hari ini/terdekat.</p></div></div>${ag}</div></div>`;
}
function viewPengumuman(id){const x=(S.pengumuman||[]).find(r=>String(r.id)===String(id)); if(!x)return; openModal(`<h2 class="title">${esc(x.judul||'Pengumuman')}</h2><p class="sub">${esc(x.jenis||'Informasi')}${x.mulai?' • '+fmt(x.mulai):''}${x.selesai?' s.d. '+fmt(x.selesai):''}</p><div class="divider"></div><div class="journal-desc">${esc(x.isi||'-')}</div>`);}
function viewAgenda(id){const x=(S.agenda||[]).find(r=>String(r.id)===String(id)); if(!x)return; openModal(`<h2 class="title">${esc(x.judul||'Agenda')}</h2><p class="sub">${esc(fmt(x.tanggal||today()))}${x.waktuMulai?' • '+esc(x.waktuMulai):''}</p><div class="divider"></div>${x.lokasi?`<p class="sub"><b>Lokasi:</b> ${esc(x.lokasi)}</p>`:''}<div class="journal-desc" style="margin-top:8px">${esc(x.keterangan||'-')}</div>`);}
function renderAll(){if(!S.user)return; $('helloText').textContent='Halo, '+(S.user.nama||'Pegawai').split(' ')[0]; renderHomeInfo(); renderStats(); renderHomePlans(); renderPlans(); renderHistory(); renderWfh(); renderLinked();}
function renderStats(){const j=currentJurnal(), p=currentPlans(); const done=p.filter(x=>planReal(x).length).length; $('homeStats').innerHTML=`<div class="card"><div class="row-between"><div><div class="meta">Jurnal Saya</div><div class="title">${j.length}</div></div><span class="pill pill-ok">${done} rencana terealisasi</span></div></div><div class="card"><div class="row-between"><div><div class="meta">Rencana Aktif</div><div class="title">${p.length}</div></div><span class="pill pill-blue">Mobile Lite</span></div></div>`;}
function planCard(p,compact=false){const real=planReal(p); const isWfh=isWfhText(p.judul+' '+p.catatan); return `<div class="card"><div class="row-between"><div><p class="plan-title">${esc(p.judul)}</p><div class="meta">${fmt(p.tanggal)} • ${esc(p.jamReminder||'-')}</div></div><span class="pill ${real.length?'pill-ok':'pill-warn'}">${real.length?'Sudah Realisasi':'Belum Realisasi'}</span></div>${p.catatan?`<div class="plan-note" style="margin-top:8px">${esc(p.catatan)}</div>`:''}<div class="row" style="margin-top:12px">${isWfh?'<span class="pill pill-blue">WFH/WFA</span>':''}${real.length?`<button class="btn btn-soft" onclick="ARIKA.viewReal('${esc(p.rencanaId||p.id)}')">Lihat Realisasi</button>`:`<button class="btn btn-primary" onclick="ARIKA.startReal('${esc(p.rencanaId||p.id)}')">Isi Realisasi</button>`}${!compact?`<button class="btn btn-light" onclick="ARIKA.markDone('${esc(p.rencanaId||p.id)}')">Tandai Selesai</button>`:''}</div></div>`;}
function renderHomePlans(){const list=currentPlans().slice(0,3); $('homePlans').innerHTML=list.length?list.map(p=>planCard(p,true)).join(''):'<div class="list-empty">Belum ada rencana aktif.</div>';}
function renderPlans(){if(!$('planList'))return; const list=currentPlans(); $('planList').innerHTML=list.length?list.map(p=>planCard(p)).join(''):'<div class="card list-empty">Belum ada rencana.</div>';}
function currentMonthKey(){return today().slice(0,7);}
function currentMonthName(){const m=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']; const d=new Date(today()); return m[d.getMonth()]+' '+d.getFullYear();}
function monthStart(){return currentMonthKey()+'-01';}
function monthEnd(){const now=new Date(today()); return new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);}
function setDefaultHistoryDates(){if($('histFrom')&&!$('histFrom').value)$('histFrom').value=monthStart(); if($('histTo')&&!$('histTo').value)$('histTo').value=monthEnd();}
function setHistoryRange(type){const t=today(); const d=new Date(t); if(type==='today'){if($('histFrom'))$('histFrom').value=t; if($('histTo'))$('histTo').value=t;} else if(type==='7'){const a=new Date(d); a.setDate(a.getDate()-6); if($('histFrom'))$('histFrom').value=a.toISOString().slice(0,10); if($('histTo'))$('histTo').value=t;} else {if($('histFrom'))$('histFrom').value=monthStart(); if($('histTo'))$('histTo').value=monthEnd();} S.historyPage=1; renderHistory();}
function setHistoryPage(n){S.historyPage=Math.max(1,Number(n)||1); renderHistory();}
function historyInRange(j){setDefaultHistoryDates(); const d=dateKey(j.date); const from=$('histFrom')?.value||monthStart(); const to=$('histTo')?.value||monthEnd(); return (!from||d>=from)&&(!to||d<=to);}

function parseDurationMinutesMobile(v){
  const s=String(v??'').toLowerCase().replace(',', '.').trim();
  if(!s||s==='-'||s==='0')return 0;
  let h=0,m=0;
  const mh=s.match(/(\d+(?:\.\d+)?)\s*jam/); if(mh)h=parseFloat(mh[1])||0;
  const mm=s.match(/(\d+)\s*menit/); if(mm)m=parseInt(mm[1],10)||0;
  if(mh||mm)return Math.round(h*60+m);
  const hm=s.match(/^(\d{1,2}):(\d{2})$/); if(hm)return (parseInt(hm[1],10)||0)*60+(parseInt(hm[2],10)||0);
  if(/^\d+(?:\.\d+)?$/.test(s))return Math.round(parseFloat(s)*60);
  return 0;
}
function diffMinutesMobile(start,end){
  if(!validTimeLembur(start)||!validTimeLembur(end))return 0;
  const a=String(start).split(':').map(Number), b=String(end).split(':').map(Number);
  let m1=a[0]*60+a[1], m2=b[0]*60+b[1];
  if(m2<m1)m2+=1440;
  return Math.max(0,m2-m1);
}
function klaimLemburMinutesMobile(start,end,raw){
  // Aturan tampilan klaim mobile: dibulatkan ke bawah per jam penuh dan maksimal 2 jam.
  // Contoh 2 jam 35 menit absensi => Durasi Klaim 2 jam.
  const fromTime=diffMinutesMobile(start,end);
  const base=fromTime || parseDurationMinutesMobile(raw);
  const hours=Math.min(2, Math.floor(base/60));
  return Math.max(0,hours*60);
}
function formatKlaimLemburMobile(minutes){
  const h=Math.floor((Number(minutes)||0)/60);
  if(h<=0)return '';
  return h+' jam';
}
function renderMobileLemburInfo(j){
  const jam=`${esc(j.start||'-')} - ${esc(j.end||'-')}`;
  const claim=formatKlaimLemburMobile(klaimLemburMinutesMobile(j.start,j.end,j.lamaLembur||j.waktuLembur||''));
  const st=j.suratTugas?`<p class="small"><b>ST:</b> ${esc(j.suratTugas)}</p>`:'';
  return `<div class="mobile-lembur-lines"><p class="small"><b>Lembur:</b> ${jam}</p>${claim?`<p class="small mobile-lembur-claim"><b>Durasi Klaim:</b> ${esc(claim)}</p>`:''}${st}</div>`;
}

function renderHistory(){
  setDefaultHistoryDates();
  const per=10;
  const q=norm($('histSearch')?.value||'');
  let list=currentJurnal().filter(historyInRange);
  if(q)list=list.filter(j=>norm(j.desc+' '+j.cat+' '+j.status+' '+j.rencanaJudul+' '+j.linkDataDukung).includes(q));
  const total=list.length;
  const pages=Math.max(1,Math.ceil(total/per));
  S.historyPage=Math.min(Math.max(1,S.historyPage||1),pages);
  const start=(S.historyPage-1)*per;
  const rows=list.slice(start,start+per);
  const info=$('historyMonthInfo');
  const from=$('histFrom')?.value||monthStart(); const to=$('histTo')?.value||monthEnd();
  if(info)info.textContent=`Menampilkan ${total} jurnal (${fmt(from)} s.d. ${fmt(to)}) • 10 jurnal per halaman.`;
  const listEl=$('historyList');
  if(listEl){listEl.innerHTML=rows.length?rows.map(j=>`<div class="card"><div class="row-between"><div><div class="meta">${fmt(j.date)} • ${esc(j.cat)}</div><p class="plan-title">${esc(j.status)}</p></div><div class="row">${j.rencanaId||j.rencanaJudul?'<span class="pill pill-ok">Terkait Rencana</span>':''}${j.isLembur?'<span class="pill pill-lembur">Lembur</span>':''}</div></div><div class="journal-desc">${esc(j.desc)}</div>${j.isLembur?renderMobileLemburInfo(j):''}${j.linkDataDukung?`<p class="small"><b>Data dukung:</b><span class="mobile-link-text">${esc(j.linkDataDukung)}</span></p>`:''}<div class="row" style="margin-top:12px"><button class="btn btn-soft" onclick="ARIKA.editJournal('${esc(j.id)}')">Edit</button></div></div>`).join(''):`<div class="card list-empty">Belum ada jurnal pada rentang tanggal ini.</div>`;}
  const pager=$('historyPager');
  if(pager){
    pager.classList.toggle('hidden', total<=per);
    pager.innerHTML= total>per ? `<div class="row-between"><button class="btn btn-light" type="button" data-hpage="${S.historyPage-1}" ${S.historyPage<=1?'disabled':''}>Sebelumnya</button><span class="pill pill-gray">Hal ${S.historyPage} / ${pages}</span><button class="btn btn-soft" type="button" data-hpage="${S.historyPage+1}" ${S.historyPage>=pages?'disabled':''}>Berikutnya</button></div><p class="sub small" style="margin-top:10px;text-align:center">Menampilkan 10 jurnal per halaman.</p>` : '';
  }
}
function isWfhText(s){return /\bWFH\b|\bWFA\b|work\s*from\s*home|work\s*from\s*anywhere/i.test(String(s||''));}
function renderWfh(){const plans=currentPlans().filter(p=>isWfhText(p.judul+' '+p.catatan)); const journals=currentJurnal().filter(j=>isWfhText(j.desc+' '+j.rencanaJudul)); $('wfhList').innerHTML=`<div class="card"><div class="row-between"><div><div class="meta">Rencana WFH/WFA</div><div class="title">${plans.length}</div></div><span class="pill pill-blue">Realisasi ${journals.length}</span></div></div>`+(plans.length?plans.map(p=>planCard(p)).join(''):'<div class="card list-empty">Belum ada rencana WFH/WFA.</div>');}
function renderLinked(){const box=$('linkedPlanBox'); if(!box)return; if(!S.linked){box.classList.add('hidden'); box.innerHTML=''; $('journalSub').textContent=S.edit?'Mode edit jurnal.':'Catatan kegiatan harian.'; return;} box.classList.remove('hidden'); box.innerHTML=`<div class="card" style="margin:0;background:#ecfdf5"><div class="meta">Realisasi untuk rencana</div><p class="plan-title">${esc(S.linked.rencanaJudul)}</p><p class="sub">${fmt(S.linked.tanggal)} • ID: ${esc(S.linked.rencanaId)}</p><button type="button" class="btn btn-danger" onclick="ARIKA.cancelLink()">Batal Kaitkan</button></div>`; $('journalSub').textContent='Form ini akan tersimpan sebagai realisasi rencana terpilih.';}
function startReal(id){const p=currentPlans().find(x=>String(x.rencanaId||x.id)===String(id)); if(!p)return toast('Rencana tidak ditemukan.'); if(planReal(p).length)return viewReal(id); S.linked={rencanaId:p.rencanaId||p.id,rencanaJudul:p.judul,tanggal:p.tanggal}; S.edit=null; fillJournal({date:p.tanggal,cat:'Administrasi',status:'Selesai',desc:`[REALISASI RENCANA: ${p.judul}]\n`,linkDataDukung:''}); go('journal');}
function hitungDurasiLembur(start,end){const mins=klaimLemburMinutesMobile(start,end,''); return formatKlaimLemburMobile(mins);}
function toggleLemburFields(){const on=!!$('jLembur')?.checked; const box=$('jLemburFields'); if(box)box.classList.toggle('hidden',!on); if(!on){if($('jStart'))$('jStart').value=''; if($('jEnd'))$('jEnd').value=''; if($('jSurat'))$('jSurat').value=''; if($('jLama'))$('jLama').value='';} else updateLamaLembur();}
function updateLamaLembur(){if($('jLama'))$('jLama').value=hitungDurasiLembur($('jStart')?.value||'', $('jEnd')?.value||'');}
function fillJournal(j){$('jDate').value=j.date||today(); const _cat=j.cat||'Administrasi'; if($('jCat')){ $('jCat').value=_cat; if($('jCat').value!==_cat) $('jCat').value='Lainnya'; } $('jStatus').value=j.status||'Selesai'; $('jDesc').value=j.desc||''; $('jLink').value=j.linkDataDukung||''; const isLembur=strictIsLembur(j.isLembur,j.start,j.end,j.suratTugas,j.lamaLembur||j.waktuLembur); if($('jLembur'))$('jLembur').checked=isLembur; if($('jStart'))$('jStart').value=j.start||''; if($('jEnd'))$('jEnd').value=j.end||''; if($('jSurat'))$('jSurat').value=j.suratTugas||''; if($('jLama'))$('jLama').value=j.lamaLembur||j.waktuLembur||hitungDurasiLembur(j.start||'',j.end||''); toggleLemburFields(); $('journalSubmit').textContent=S.edit?'Simpan Perubahan':'Simpan Jurnal'; $('cancelEdit').classList.toggle('hidden',!S.edit); renderLinked();}
async function submitPlan(e){e.preventDefault(); const p={id:'rencana-'+Date.now(),rencanaId:rid(),ownerName:S.user.nama,ownerNip:S.user.nip,tanggal:$('planDate').value||today(),jamReminder:$('planTime').value,periode:'Reminder',judul:$('planTitle').value.trim(),catatan:$('planNote').value.trim(),status:'Aktif',createdAt:new Date().toISOString(),__pendingRencana:true,__pendingAt:Date.now()}; if(!p.judul||!p.jamReminder)return toast('Rencana dan jam wajib diisi.'); S.rencana=dedupeRencana([p,...(S.rencana||[])]); addPendingRencana(p); saveCache(); renderAll(); $('planForm').reset(); setDefaults(); toast('Rencana langsung ditampilkan. Sinkron berjalan.'); post('save_rencana',p).then(()=>{if($('syncText'))$('syncText').textContent='Rencana tersimpan ke database'; setTimeout(()=>loadRencanaLengkapMobile(),5000);}).catch(()=>toast('Rencana tersimpan lokal, sinkron menyusul.'));}
async function submitJournal(e){e.preventDefault(); const desc=$('jDesc').value.trim(); if(!desc)return toast('Uraian wajib diisi.'); const lembur=!!$('jLembur')?.checked; const start=lembur?($('jStart')?.value||''):''; const end=lembur?($('jEnd')?.value||''):''; const lama=lembur?(hitungDurasiLembur(start,end)||$('jLama')?.value||''):''; if(lembur&&(!start||!end))return toast('Jam mulai dan selesai lembur wajib diisi.'); const payload={id:S.edit?.id||jid(),date:$('jDate').value||today(),name:S.user.nama,nip:S.user.nip,statusPegawai:S.user.status||'',lab:S.user.lab||'',cat:$('jCat').value,desc,status:$('jStatus').value,isLembur:lembur,suratTugas:lembur?($('jSurat')?.value.trim()||''):'',linkDataDukung:$('jLink').value.trim(),start,end,lamaLembur:lama,waktuLembur:lama,rencanaId:(S.linked&&S.linked.rencanaId)||S.edit?.rencanaId||'',rencanaJudul:(S.linked&&S.linked.rencanaJudul)||S.edit?.rencanaJudul||'',createdAt:new Date().toISOString(),originalDate:S.edit?.date||($('jDate').value||today()),originalName:S.edit?.name||S.user.nama,originalDesc:S.edit?.desc||desc}; const editing=!!S.edit; if(editing)S.jurnal=S.jurnal.map(j=>j.id===payload.id?payload:j); else S.jurnal.unshift(payload); S.jurnal=dedupeJurnal(S.jurnal); saveCache(); S.edit=null; S.linked=null; fillJournal({date:today(),cat:'Administrasi',status:'Selesai',desc:'',linkDataDukung:'',isLembur:false}); renderAll(); go('history'); toast(editing?'Jurnal diperbarui.':'Jurnal tersimpan.'); post(editing?'update_jurnal':'add_jurnal',payload).then(()=>setTimeout(()=>loadCore(true),900)).catch(()=>toast('Jurnal tersimpan lokal, sinkron menyusul.'));}
function editJournal(id){const j=currentJurnal().find(x=>x.id===id); if(!j)return; S.edit=j; S.linked=null; fillJournal(j); go('journal');}
function cancelEdit(){S.edit=null; S.linked=null; fillJournal({date:today(),cat:'Administrasi',status:'Selesai',desc:'',linkDataDukung:''});}
function viewReal(id){const p=currentPlans().find(x=>String(x.rencanaId||x.id)===String(id)); const rows=p?planReal(p):[]; openModal(`<h2 class="title">Realisasi</h2>${rows.length?rows.map(j=>`<div class="card"><div class="meta">${fmt(j.date)} • ${esc(j.cat)}</div><div class="journal-desc">${esc(j.desc)}</div><button class="btn btn-soft" onclick="ARIKA.closeModal();ARIKA.editJournal('${esc(j.id)}')">Edit Realisasi</button></div>`).join(''):'<p class="sub">Belum ada realisasi.</p>'}`);}
function openModal(html){$('modalContent').innerHTML=html; $('modal').classList.remove('hidden');} function closeModal(){$('modal').classList.add('hidden');}
function markDone(id){const p=S.rencana.find(x=>String(x.rencanaId||x.id)===String(id)); if(!p)return; p.status='Selesai'; removePendingRencana(p.rencanaId||p.id); saveCache(); renderAll(); post('update_rencana_status',{id:p.id,status:'Selesai'}).catch(()=>null); toast('Rencana ditandai selesai.');}
function newWfhPlan(){go('plans'); $('planDate').value=today(); $('planTitle').value='[WFH/WFA] '; setTimeout(()=>$('planTitle').focus(),80);} 
function loginSuggest(){const q=norm($('loginName').value); const box=$('loginSuggest'); $('loginHidden').value=''; if(q.length<2){box.classList.add('hidden'); return;} const rows=S.pegawai.filter(p=>norm(p.nama).includes(q)).slice(0,8); box.innerHTML=rows.map(p=>`<button type="button" data-name="${esc(p.nama)}"><b>${esc(p.nama)}</b><span>${esc(p.lab||p.status||'Pegawai')}</span></button>`).join(''); box.classList.toggle('hidden',!rows.length);}
function openDesktop(){try{localStorage.setItem('arika_force_desktop_once','1')}catch(_){} location.href='index.html?desktop=1';}
function bind(){document.addEventListener('click',e=>{const hp=e.target.closest('[data-hpage]'); if(hp){e.preventDefault(); setHistoryPage(hp.dataset.hpage); return;} const g=e.target.closest('[data-go]'); if(g)go(g.dataset.go); const s=e.target.closest('#loginSuggest button'); if(s){$('loginName').value=s.dataset.name; $('loginHidden').value=s.dataset.name; $('loginSuggest').classList.add('hidden'); $('loginPass').focus();}}); $('loginName').addEventListener('input',loginSuggest); $('loginPass').addEventListener('focus',()=>$('loginSuggest').classList.add('hidden')); $('loginForm').addEventListener('submit',doLogin); $('planForm').addEventListener('submit',submitPlan); $('journalForm').addEventListener('submit',submitJournal); if($('jLembur'))$('jLembur').addEventListener('change',toggleLemburFields); if($('jStart'))$('jStart').addEventListener('input',updateLamaLembur); if($('jEnd'))$('jEnd').addEventListener('input',updateLamaLembur); $('histSearch').addEventListener('input',()=>{S.historyPage=1; renderHistory();}); if($('histFrom'))$('histFrom').addEventListener('change',()=>{S.historyPage=1; renderHistory();}); if($('histTo'))$('histTo').addEventListener('change',()=>{S.historyPage=1; renderHistory();}); if($('histThisMonth'))$('histThisMonth').onclick=()=>setHistoryRange('month'); if($('histToday'))$('histToday').onclick=()=>setHistoryRange('today'); if($('hist7Days'))$('hist7Days').onclick=()=>setHistoryRange('7'); $('refreshBtn').onclick=()=>loadCore(false); $('syncBtn').onclick=()=>loadCore(false); $('logoutBtn').onclick=logout; $('desktopBtn').onclick=openDesktop; $('openDesktop').onclick=openDesktop; $('cancelEdit').onclick=cancelEdit; $('newWfhPlan').onclick=newWfhPlan;}
function init(){bind(); setDefaults(); loadCache(); try{S.user=JSON.parse(localStorage.getItem(LS)||'null');}catch(_){} if(S.user){$('loginView').classList.add('hidden'); $('appShell').classList.remove('hidden'); renderAll(); loadCore(true);} loadPegawai();}
window.ARIKA={startReal,viewReal,editJournal,closeModal,viewPengumuman,viewAgenda,cancelLink(){S.linked=null;renderLinked();},markDone,setHistoryPage,setHistoryRange,toggleLemburFields};
document.addEventListener('DOMContentLoaded',init);
})();

/* v331 - mobile konsisten dengan status riwayat/database */
(function(){
  try { localStorage.removeItem('arika_v322_local_realized_plans'); } catch(_) {}
  // Mobile sudah menghitung realisasi dari daftar jurnal yang tampil. Patch ini hanya memastikan cache lama PC tidak memengaruhi status mobile.
})();


/* v332 - Riwayat mobile bulan berjalan + pagination 10 jurnal per halaman */


/* v333 - Tambahan Panduan Mobile Singkat; tidak mengubah sistem data. */

/* v337: Mobile rencana langsung muncul dan tidak hilang saat sinkron database lambat. */

/* v344 - Mobile kategori sesuai PC, link tidak keluar kotak, filter tanggal riwayat, pagination stabil. */


/* v369: tombol mata pada password login mobile */
(function(){
  function setupMobilePasswordEye(){
    try{
      var pass=document.getElementById('loginPass');
      var btn=document.getElementById('toggleLoginPass');
      if(!pass || !btn || btn.__arikaEyeReady) return;
      btn.__arikaEyeReady=true;
      btn.addEventListener('click', function(){
        var show = pass.type === 'password';
        pass.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
        btn.textContent = show ? '🙈' : '👁';
        setTimeout(function(){ try{ pass.focus(); }catch(_){} }, 20);
      });
    }catch(_){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', setupMobilePasswordEye);
  else setupMobilePasswordEye();
  window.addEventListener('load', setupMobilePasswordEye);
})();
