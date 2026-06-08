/* ARIKA v420 - WFH/WFA lazy module */
(function(){
  'use strict';
  if(window.__ARIKA_WFH_MODULE_V420__) return;
  window.__ARIKA_WFH_MODULE_V420__ = true;
  var busy = false, queued = false;
  function visible(){ var v=document.getElementById('view-wfh'); return !!(v && !v.classList.contains('hidden')); }
  async function refresh(){
    if(!visible()) return;
    if(busy){ queued = true; return; }
    busy = true;
    try{
      if(typeof window.refreshWfhWfaData === 'function') await window.refreshWfhWfaData({ module:'wfh-v420' });
      else if(typeof window.renderWfhWfaDay === 'function') await window.renderWfhWfaDay({ module:'wfh-v420' });
    }catch(e){ console.warn('ARIKA WFH module:', e); }
    finally{ busy=false; if(queued){ queued=false; setTimeout(refresh, 250); } }
  }
  // Satu event delegation final agar klik tanggal tidak diproses berkali-kali oleh module ini.
  document.addEventListener('click', function(ev){
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-wfh-cal-date]');
    if(!btn) return;
    window.__ARIKA_WFH_SELECTED_DATE_LOCK__ = btn.getAttribute('data-wfh-cal-date') || '';
  }, true);
  window.arikaWfhModuleRefresh = refresh;
  window.arikaInitModule_wfh = function(){ setTimeout(refresh, 120); };
})();
