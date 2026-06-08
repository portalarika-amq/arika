/* =========================================================
   ARIKA v421 - Performance Stage 1 in Module
   Tujuan:
   1) cache versioning agar cache lama tidak dipakai lagi,
   2) render hanya tab aktif setelah sinkron data,
   3) batasi render berat dan event berulang,
   4) kurangi data awal dari Apps Script.
   ========================================================= */
(function(){
  'use strict';
  var PERF_VERSION = 'v421-stage3-endpoint-front';
  function safe(fn){ try { return fn(); } catch(e) { console.warn('ARIKA v421:', e); } }
  function byId(id){ return document.getElementById(id); }
  function activeViewId(){
    var views = document.querySelectorAll('.view-section');
    for(var i=0;i<views.length;i++){
      var v = views[i];
      if(v && !v.classList.contains('hidden')) return String(v.id||'').replace(/^view-/, '');
    }
    return '';
  }
  window.arikaGetActiveViewId = activeViewId;

  // Cache version guard: bersihkan cache lama cukup sekali per versi.
  safe(function(){
    var k='arika_cache_version_active';
    var prev = localStorage.getItem(k) || '';
    if(prev !== PERF_VERSION){
      var keep = {};
      ['arika_reminder_sound_enabled','arika_reminder_center_read_v1'].forEach(function(x){ try{ keep[x]=localStorage.getItem(x); }catch(_){} });
      for(var i=localStorage.length-1;i>=0;i--){
        var key = localStorage.key(i) || '';
        if(/^arika_.*cache/i.test(key) || /^arika_core_cache/i.test(key) || /^arika_data_cache/i.test(key) || key.indexOf('arika_rencana_pribadi')>=0){
          try{ localStorage.removeItem(key); }catch(_){}
        }
      }
      Object.keys(keep).forEach(function(x){ if(keep[x] != null) try{ localStorage.setItem(x, keep[x]); }catch(_){} });
      localStorage.setItem(k, PERF_VERSION);
    }
  });

  // Debounce umum untuk mencegah render bertumpuk dari beberapa patch lama.
  window.arikaDebounce = window.arikaDebounce || function(fn, delay){
    var t; return function(){ var args=arguments, ctx=this; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, delay||180); };
  };

  var renderTokens = Object.create(null);
  function scheduleOnce(name, fn, delay){
    clearTimeout(renderTokens[name]);
    renderTokens[name] = setTimeout(function(){ safe(fn); }, delay || 90);
  }

  // Render ringan hanya untuk tab aktif. Ini menimpa render massal lama yang memanggil semua tab setelah fetch.
  window.arikaRenderActiveTabOnly = function(reason){
    var id = activeViewId();
    if(!id) return;
    safe(function(){ if(window.populateLoginDropdown && (!window.currentUser || id.indexOf('login')>=0)) window.populateLoginDropdown(); });
    if(id === 'beranda'){
      scheduleOnce('beranda', function(){
        if(window.renderPengumumanBoard) window.renderPengumumanBoard();
        if(window.renderAgendaSaya) window.renderAgendaSaya();
        if(window.renderRencanaBerandaOnly) window.renderRencanaBerandaOnly();
        else if(window.renderRencanaPribadi) window.renderRencanaPribadi({ berandaOnly:true });
        if(window.renderJurnalReviewAlert && !window.isAdmin) window.renderJurnalReviewAlert();
        if(window.updateHomeModernStats) window.updateHomeModernStats();
      }, 80);
    } else if(id === 'rencana'){
      scheduleOnce('rencana', function(){ if(window.renderRencanaPribadi) window.renderRencanaPribadi({ fromV417:true }); }, 80);
    } else if(id === 'rekap'){
      scheduleOnce('rekap', function(){ if(window.runFilter) window.runFilter({ keepPage:true, fromV417:true }); if(window.renderVisualCalendar) window.renderVisualCalendar(); }, 90);
    } else if(id === 'lembur'){
      scheduleOnce('lembur', function(){ if(window.renderLemburTable) window.renderLemburTable({ fromV417:true }); }, 100);
    } else if(id === 'dashboard-pegawai'){
      scheduleOnce('dashboard-pegawai', function(){ if(window.renderDashboardPegawai) window.renderDashboardPegawai({ fromV417:true }); }, 120);
    } else if(id === 'wfh'){
      scheduleOnce('wfh', function(){ if(window.renderWfhTab) window.renderWfhTab({ fromV417:true }); else if(window.renderWfhWfaDay) window.renderWfhWfaDay({ fromV417:true }); }, 120);
    } else if(id === 'admin'){
      scheduleOnce('admin-light', function(){
        if(window.applyAdminRoleAccess) window.applyAdminRoleAccess();
        if(window.renderAdminPengumuman) window.renderAdminPengumuman();
        if(window.renderAdminAgenda) window.renderAdminAgenda();
        // Jangan render tabel/analitik besar otomatis. Admin memilih subtab terlebih dahulu.
      }, 160);
    }
  };

  // Bungkus nav agar render berat hanya terjadi ketika tabnya memang dibuka.
  if(window.nav && !window.nav.__arikaV417Wrapped){
    var oldNav = window.nav;
    window.nav = function(id){
      var out = oldNav.apply(this, arguments);
      scheduleOnce('nav-active-render', function(){ window.arikaRenderActiveTabOnly('nav:'+id); }, 120);
      return out;
    };
    window.nav.__arikaV417Wrapped = true;
  }

  // Tombol refresh/sinkron default dibuat ringan. Sinkron penuh tetap bisa lewat fungsi eksplisit ini.
  window.arikaForceFullSyncForExport = function(){
    if(typeof window.fetchCloudData === 'function') return window.fetchCloudData({ force:true, full:true });
  };

  // Batasi render otomatis saat window focus; cukup render tab aktif saja, bukan semua dashboard.
  if(!window.__ARIKA_V417_FOCUS_BOUND__){
    window.__ARIKA_V417_FOCUS_BOUND__ = true;
    window.addEventListener('focus', window.arikaDebounce(function(){
      if(window.currentUser) window.arikaRenderActiveTabOnly('focus');
    }, 450), { passive:true });
  }

  // Info debug sederhana.
  window.arikaPerformanceInfo = function(){
    var info = {
      version: PERF_VERSION,
      activeView: activeViewId(),
      pegawai: (window.masterPegawai||[]).length,
      kegiatan: (window.arikaData||[]).length,
      rencana: (window.rencanaData||[]).length,
      survei: (window.surveiData||[]).length,
      agenda: (window.agendaData||[]).length,
      heapMB: performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize/1024/1024) : null
    };
    console.table(info);
    return info;
  };

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){ safe(function(){ window.arikaRenderActiveTabOnly('dom-ready'); }); }, 600);
  });
})();
