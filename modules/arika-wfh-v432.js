/* ARIKA v432 - WFH/WFA bridge module: tidak merender ulang paksa agar tidak flicker */
(function(){
  'use strict';
  if(window.__ARIKA_WFH_MODULE_V432__) return;
  window.__ARIKA_WFH_MODULE_V432__ = true;
  function visible(){ var v=document.getElementById('view-wfh'); return !!(v && !v.classList.contains('hidden')); }
  function refresh(){ if(visible() && typeof window.renderWfhWfaDay === 'function') return window.renderWfhWfaDay({ module:'wfh-v432', force:false }); }
  window.arikaWfhModuleRefresh = refresh;
  window.arikaInitModule_wfh = function(){ setTimeout(refresh, 180); };
})();
