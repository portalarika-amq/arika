/* ARIKA v423 - WFH/WFA legacy daily monitoring module */
(function(){
  'use strict';
  if(window.__ARIKA_WFH_MODULE_V423__) return;
  window.__ARIKA_WFH_MODULE_V423__ = true;
  function visible(){ var v=document.getElementById('view-wfh'); return !!(v && !v.classList.contains('hidden')); }
  function refresh(){ if(visible() && typeof window.renderWfhWfaDay === 'function') return window.renderWfhWfaDay({ module:'wfh-v423' }); }
  window.arikaWfhModuleRefresh = refresh;
  window.arikaInitModule_wfh = function(){ setTimeout(refresh, 150); };
})();
