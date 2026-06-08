/* =========================================================
   ARIKA v421 - Performance Stage 3 Frontend Endpoint Bridge
   Mengarahkan tab tertentu ke endpoint ringan Apps Script v37:
   - Beranda -> mode=beranda
   - Rencana Saya -> mode=rencana_user
   - Riwayat Kegiatan / Laporan Lembur / Dashboard Saya -> mode=kegiatan_user
   - Survei -> mode=survei_status
   - Dashboard/Admin lembur -> mode=admin_lembur / dashboard_light
   ========================================================= */
(function(){
  'use strict';
  if(window.__ARIKA_ENDPOINTS_V421__) return;
  window.__ARIKA_ENDPOINTS_V421__ = true;
  var VERSION = 'v421-stage3-endpoint-bridge';
  var inflight = Object.create(null);
  var cache = Object.create(null);
  var CACHE_TTL = 35 * 1000;
  function warn(){ try{ console.warn.apply(console, ['ARIKA v421 endpoints'].concat([].slice.call(arguments))); }catch(_){} }
  function info(){ try{ console.info.apply(console, ['ARIKA v421 endpoints'].concat([].slice.call(arguments))); }catch(_){} }
  function safe(fn, fallback){ try{ return fn(); }catch(e){ warn(e); return fallback; } }
  function norm(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,''); }
  function normNip(v){ return String(v||'').replace(/\D/g,''); }
  function getVal(row, names){
    if(window.getVal && typeof window.getVal === 'function') return window.getVal(row, names);
    var keys = Object.keys(row || {});
    var targets = (names || []).map(norm);
    for(var i=0;i<keys.length;i++) if(targets.indexOf(norm(keys[i]))>=0) return row[keys[i]];
    return '';
  }
  function todayKey(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function monthKey(date){
    var s = String(date || '').trim();
    if(/^\d{4}-\d{2}/.test(s)) return s.slice(0,7);
    var d = date ? new Date(date) : new Date();
    if(isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function activeMonth(){
    var ids = ['filter-month','personal-month-filter','riwayat-bulan','dashboard-month','lembur-month','wfh-month','month-filter'];
    for(var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      if(el && el.value && /^\d{4}-\d{2}/.test(el.value)) return el.value.slice(0,7);
    }
    return monthKey();
  }
  function activeDate(){
    var ids = ['wfh-date','filter-date','input-date','tanggal-kegiatan','jurnal-date'];
    for(var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      if(el && el.value && /^\d{4}-\d{2}-\d{2}/.test(el.value)) return el.value.slice(0,10);
    }
    return todayKey();
  }
  function profile(){
    var u = window.currentUser || {};
    return {
      nip: String(u.nip || u.NIP || u.ownerNip || '').trim(),
      nama: String(u.nama || u.name || u.Nama || '').trim(),
      status: String(u.status || u.statusPegawai || '').trim(),
      lab: String(u.lab || u.fungsi || u.fungsiKerja || '').trim()
    };
  }
  function samePerson(row, p){
    var rn = normNip(getVal(row, ['nip','NIP','ownerNip','owner nip','NIP Pegawai']));
    var nn = normNip(p.nip);
    if(nn && rn && nn === rn) return true;
    var rname = norm(getVal(row, ['nama','Nama','ownerName','owner name','Pelaksana','name']));
    var pname = norm(p.nama);
    return !!(pname && rname && pname === rname);
  }
  function dateOfRencana(row){ return String(getVal(row, ['tanggal','Tanggal','date','tgl']) || '').slice(0,10); }
  function dateOfJurnal(row){ return String(getVal(row, ['Tanggal','tanggal','date','tgl']) || '').slice(0,10); }
  function inMonth(date, bulan){ return String(date || '').slice(0,7) === bulan; }
  function mapJurnal(rows){
    rows = rows || [];
    if(window.mapJurnalRowsFromSheet && typeof window.mapJurnalRowsFromSheet === 'function'){
      try{ return window.mapJurnalRowsFromSheet(rows); }catch(e){ warn('mapJurnalRowsFromSheet gagal, pakai fallback.', e); }
    }
    return rows.map(function(r, idx){
      return {
        id: String(getVal(r, ['ID Jurnal','id','id_jurnal']) || 'kegiatan-v421-'+idx),
        date: dateOfJurnal(r),
        name: String(getVal(r, ['Pelaksana','Nama','nama','name']) || ''),
        nip: String(getVal(r, ['NIP','nip']) || ''),
        statusPegawai: String(getVal(r, ['Status Pegawai','statusPegawai','status pegawai','Status']) || ''),
        lab: String(getVal(r, ['Fungsi Kerja','fungsi kerja','lab','Lab']) || ''),
        cat: String(getVal(r, ['Kategori','kategori','cat']) || ''),
        desc: String(getVal(r, ['Deskripsi','deskripsi','desc','uraian']) || ''),
        status: String(getVal(r, ['Status','status']) || ''),
        isLembur: getVal(r, ['Lembur?','isLembur','lembur']) || false,
        start: String(getVal(r, ['Jam Mulai','jamMulai','start']) || ''),
        end: String(getVal(r, ['Jam Selesai','jamSelesai','end']) || ''),
        lamaLembur: String(getVal(r, ['Lama Lembur','lamaLembur','durasi']) || ''),
        suratTugas: String(getVal(r, ['No Surat Tugas','suratTugas']) || ''),
        rencanaId: String(getVal(r, ['rencanaId','rencana id','rencana_id']) || ''),
        rencanaJudul: String(getVal(r, ['rencanaJudul','rencana judul','rencana_judul']) || ''),
        raw: r
      };
    });
  }
  function mapRencana(rows){
    rows = rows || [];
    return rows.map(function(r, idx){
      var obj = {
        id: String(getVal(r, ['id','ID','id_rencana','ID Rencana']) || 'rencana-v421-'+idx),
        ownerName: String(getVal(r, ['ownerName','owner_name','nama','Nama','name','Pelaksana']) || ''),
        ownerNip: String(getVal(r, ['ownerNip','owner_nip','nip','NIP']) || ''),
        tanggal: dateOfRencana(r),
        jamReminder: String(getVal(r, ['jamReminder','jam reminder','Jam Reminder','waktuReminder','waktu','jam']) || ''),
        periode: String(getVal(r, ['periode','Periode','jenis','type']) || 'Reminder'),
        judul: String(getVal(r, ['judul','Judul','rencana','Rencana','kegiatan','Kegiatan','title']) || ''),
        catatan: String(getVal(r, ['catatan','Catatan','detail','deskripsi','note']) || ''),
        status: String(getVal(r, ['status','Status']) || 'Aktif'),
        rencanaId: String(getVal(r, ['rencanaId','rencana id','rencana_id','Rencana ID']) || ''),
        createdAt: String(getVal(r, ['createdAt','created_at','timestamp','Timestamp']) || ''),
        syncStatus: 'synced',
        raw: r
      };
      try{ if(window.normalizeRencanaItem) return window.normalizeRencanaItem(obj); }catch(e){}
      return obj;
    }).filter(function(r){ return r.judul || r.catatan; });
  }
  function replaceUserMonthJurnal(mapped, bulan, p){
    var old = Array.isArray(window.arikaData) ? window.arikaData : [];
    window.arikaData = old.filter(function(x){
      var d = String(x.date || x.Tanggal || x.tanggal || '').slice(0,7);
      var same = samePerson(x, p);
      return !(same && d === bulan);
    }).concat(mapped);
  }
  function replaceUserMonthRencana(mapped, bulan, p){
    var old = Array.isArray(window.rencanaData) ? window.rencanaData : [];
    window.rencanaData = old.filter(function(x){
      var d = String(x.tanggal || x.date || '').slice(0,7);
      var same = samePerson(x, p);
      return !(same && d === bulan);
    }).concat(mapped);
    try{ if(window.saveLocalRencana) window.saveLocalRencana(window.rencanaData); }catch(_){}
  }
  function mergeBeranda(data, p){
    window.__ARIKA_BERANDA_LIGHT__ = data;
    var today = data && data.meta && data.meta.tanggal ? data.meta.tanggal : activeDate();
    if(data && Array.isArray(data.kegiatanHariIni)){
      var mapped = mapJurnal(data.kegiatanHariIni);
      var old = Array.isArray(window.arikaData) ? window.arikaData : [];
      window.arikaData = old.filter(function(x){ return !(samePerson(x, p) && String(x.date || x.Tanggal || x.tanggal || '').slice(0,10) === today); }).concat(mapped);
    }
    if(data && Array.isArray(data.rencanaAktif)){
      var mappedR = mapRencana(data.rencanaAktif);
      var ids = Object.create(null);
      mappedR.forEach(function(r){ ids[String(r.id||r.rencanaId||'')]=true; });
      var existing = Array.isArray(window.rencanaData) ? window.rencanaData : [];
      window.rencanaData = existing.filter(function(r){ return !ids[String(r.id||r.rencanaId||'')]; }).concat(mappedR);
    }
    if(data && data.surveiStatus){ window.__ARIKA_SURVEI_STATUS__ = data.surveiStatus; }
  }
  async function apiGet(params, timeout){
    if(!window.ARIKA_API || !window.ARIKA_API.get) throw new Error('ARIKA_API belum siap.');
    var key = JSON.stringify(params || {});
    var now = Date.now();
    if(cache[key] && (now - cache[key].time) < CACHE_TTL) return cache[key].data;
    if(inflight[key]) return inflight[key];
    inflight[key] = window.ARIKA_API.get(params, timeout).then(function(data){
      cache[key] = { time: Date.now(), data: data };
      return data;
    }).finally(function(){ delete inflight[key]; });
    return inflight[key];
  }
  async function syncBeranda(opts){
    var p = profile(); if(!p.nip && !p.nama) return null;
    var data = await apiGet({ mode:'beranda', nip:p.nip, nama:p.nama, tanggal:activeDate(), maxRows:900 }, 14000);
    if(data && data.meta && data.meta.mode === 'beranda') mergeBeranda(data, p);
    return data;
  }
  async function syncRencanaUser(opts){
    var p = profile(); if(!p.nip && !p.nama) return null;
    var bulan = (opts && opts.bulan) || activeMonth();
    var data = await apiGet({ mode:'rencana_user', nip:p.nip, nama:p.nama, bulan:bulan, status:(opts&&opts.status)||'', maxRows:1800 }, 16000);
    if(data && Array.isArray(data.rencana)) replaceUserMonthRencana(mapRencana(data.rencana), bulan, p);
    window.__ARIKA_RENCANA_USER_LIGHT__ = data;
    return data;
  }
  async function syncKegiatanUser(opts){
    var p = profile(); if(!p.nip && !p.nama) return null;
    var bulan = (opts && opts.bulan) || activeMonth();
    var data = await apiGet({ mode:'kegiatan_user', nip:p.nip, nama:p.nama, bulan:bulan, maxRows:2200 }, 18000);
    if(data && (Array.isArray(data.jurnal) || Array.isArray(data.kegiatan))) replaceUserMonthJurnal(mapJurnal(data.jurnal || data.kegiatan), bulan, p);
    window.__ARIKA_KEGIATAN_USER_LIGHT__ = data;
    return data;
  }
  async function syncSurveiStatus(opts){
    var p = profile(); if(!p.nip && !p.nama) return null;
    var data = await apiGet({ mode:'survei_status', nip:p.nip, nama:p.nama, bulan:(opts&&opts.bulan)||monthKey() }, 12000);
    if(data && data.status) window.__ARIKA_SURVEI_STATUS__ = data.status;
    return data;
  }
  async function syncAdminLembur(opts){
    var bulan = (opts && opts.bulan) || activeMonth();
    var statusEl = document.getElementById('admin-lembur-status-filter') || document.getElementById('lembur-status-filter') || document.querySelector('[data-admin-lembur-status]');
    var statusPegawai = (opts && opts.statusPegawai) || (statusEl && statusEl.value) || '';
    var data = await apiGet({ mode:'admin_lembur', bulan:bulan, statusPegawai:statusPegawai, maxRows:3500 }, 20000);
    window.__ARIKA_ADMIN_LEMBUR_LIGHT__ = data;
    return data;
  }
  async function syncDashboardLight(opts){
    var data = await apiGet({ mode:'dashboard_light', bulan:(opts&&opts.bulan)||activeMonth(), maxRows:1800 }, 16000);
    window.__ARIKA_DASHBOARD_LIGHT__ = data;
    return data;
  }
  async function syncForTab(tab, opts){
    if(!window.currentUser && tab !== 'login-user' && tab !== 'login-admin') return null;
    if(tab === 'beranda') return syncBeranda(opts).then(function(d){ syncSurveiStatus({}).catch(function(){}); return d; });
    if(tab === 'rencana') return syncRencanaUser(opts);
    if(tab === 'rekap') return syncKegiatanUser(opts);
    if(tab === 'lembur') return syncKegiatanUser(opts);
    if(tab === 'dashboard-pegawai') return Promise.all([syncKegiatanUser(opts), syncRencanaUser(opts)]);
    if(tab === 'admin') return Promise.all([syncDashboardLight(opts), syncAdminLembur(opts).catch(function(e){ warn(e); })]);
    return null;
  }
  function updateSyncStatus(text, kind){
    var el = document.getElementById('sync-status');
    if(!el) return;
    el.innerText = text || '';
    if(kind === 'ok') el.className = 'text-[8px] md:text-[10px] font-bold text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer';
    if(kind === 'info') el.className = 'text-[8px] md:text-[10px] font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer';
    if(kind === 'warn') el.className = 'text-[8px] md:text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-tighter cursor-pointer';
  }
  function wrapForceSync(){
    if(window.forceSyncFromSheet && !window.forceSyncFromSheet.__arikaV421EndpointWrapped){
      var old = window.forceSyncFromSheet;
      window.forceSyncFromSheet = async function(options){
        var tab = safe(function(){ return window.ARIKA_MODULES && window.ARIKA_MODULES.activeView ? window.ARIKA_MODULES.activeView() : ''; }, '') || '';
        if(!options || !options.full){
          try{
            updateSyncStatus('Sinkron ringan...', 'info');
            await syncForTab(tab || 'beranda', options || {});
            if(window.arikaRouteRender) window.arikaRouteRender(tab || 'beranda', { source:'force-light-v421' });
            updateSyncStatus('Sinkron ringan selesai', 'ok');
            return true;
          }catch(e){ warn('Sinkron endpoint ringan gagal, fallback legacy.', e); updateSyncStatus('Fallback sinkron...', 'warn'); }
        }
        return old.apply(this, arguments);
      };
      window.forceSyncFromSheet.__arikaV421EndpointWrapped = true;
    }
  }
  function init(){
    wrapForceSync();
    setTimeout(wrapForceSync, 1200);
    info('Endpoint bridge aktif. Backend yang disarankan: Apps Script v37.');
  }
  window.ARIKA_ENDPOINTS = {
    version: VERSION,
    syncForTab: syncForTab,
    syncBeranda: syncBeranda,
    syncRencanaUser: syncRencanaUser,
    syncKegiatanUser: syncKegiatanUser,
    syncSurveiStatus: syncSurveiStatus,
    syncAdminLembur: syncAdminLembur,
    syncDashboardLight: syncDashboardLight,
    clearCache: function(){ cache = Object.create(null); },
    info: function(){ return { version:VERSION, cacheKeys:Object.keys(cache), inflight:Object.keys(inflight), lastBeranda:window.__ARIKA_BERANDA_LIGHT__, lastKegiatan:window.__ARIKA_KEGIATAN_USER_LIGHT__, lastRencana:window.__ARIKA_RENCANA_USER_LIGHT__, lastAdminLembur:window.__ARIKA_ADMIN_LEMBUR_LIGHT__, lastDashboard:window.__ARIKA_DASHBOARD_LIGHT__ }; }
  };
  window.arikaSyncEndpointForTab = syncForTab;
  window.arikaEndpointInfo = function(){ var x = window.ARIKA_ENDPOINTS.info(); console.log(x); return x; };
  window.arikaInitModule_endpoints = init;
})();
