/* ARIKA v433 - Active tab render router dengan WFH non-force agar tidak flicker */
(function(){
  'use strict';
  var timers = Object.create(null);
  function safe(fn){ try{ return fn(); }catch(e){ console.warn('ARIKA v433 router:', e); } }
  function later(key, fn, delay){ clearTimeout(timers[key]); timers[key]=setTimeout(function(){ safe(fn); }, delay||80); }
  function route(){
    var view = document.querySelector('.view-section:not(.hidden)');
    return view ? String(view.id||'').replace(/^view-/,'') : '';
  }
  async function syncEndpoint(id){
    if(window.ARIKA_MODULES && window.ARIKA_MODULES.load) {
      try{ await window.ARIKA_MODULES.load('endpoints'); }catch(_){}
    }
    if(window.arikaSyncEndpointForTab) {
      try{ return await window.arikaSyncEndpointForTab(id, { source:'router-v433' }); }
      catch(e){ console.warn('ARIKA v433 endpoint ringan gagal:', id, e); }
    }
    return null;
  }
  function renderLegacy(id){
    if(id==='beranda'){
      if(window.renderRencanaBerandaOnly) window.renderRencanaBerandaOnly();
      else if(window.renderRencanaPribadi) window.renderRencanaPribadi({ berandaOnly:true, fromV422:true });
      if(window.updateHomeModernStats) window.updateHomeModernStats();
      if(window.renderPengumumanBoard) window.renderPengumumanBoard();
      if(window.renderAgendaSaya) window.renderAgendaSaya();
      if(window.renderJurnalReviewAlert && !window.isAdmin) window.renderJurnalReviewAlert();
    } else if(id==='rencana'){
      if(window.renderRencanaPribadi) window.renderRencanaPribadi({ fromV422:true });
    } else if(id==='rekap'){
      if(window.runFilter) window.runFilter({ keepPage:true, fromV422:true });
      if(window.renderVisualCalendar) window.renderVisualCalendar();
    } else if(id==='wfh'){
      if(window.ARIKA_MODULES) window.ARIKA_MODULES.load('wfh').catch(function(e){ console.warn(e); });
      if(window.renderWfhWfaDay) window.renderWfhWfaDay({ fromV432:true, force:false });
    } else if(id==='admin'){
      if(window.ARIKA_MODULES) window.ARIKA_MODULES.load('admin').catch(function(e){ console.warn(e); });
      if(window.applyAdminRoleAccess) window.applyAdminRoleAccess();
      if(window.renderAdminPengumuman) window.renderAdminPengumuman();
      if(window.renderAdminAgenda) window.renderAdminAgenda();
      // Tabel besar tetap tidak dirender otomatis. Subtab admin memanggil render sendiri.
    } else if(id==='lembur'){
      if(window.renderLemburTable) window.renderLemburTable({ fromV422:true });
    } else if(id==='dashboard-pegawai'){
      if(window.renderDashboardPegawai) window.renderDashboardPegawai({ fromV422:true });
    }
  }
  window.arikaRouteRender = function(id, meta){
    id = id || route();
    if(!id) return;
    later('route-'+id, async function(){
      if(['beranda','rencana','rekap','lembur','dashboard-pegawai','admin'].indexOf(id) >= 0) {
        await syncEndpoint(id);
      }
      renderLegacy(id);
    }, id === 'admin' ? 160 : 80);
  };
  window.arikaInitModule_router = function(){ if(window.arikaRenderActiveTabOnly) window.arikaRenderActiveTabOnly('router-init-v433'); };
})();
