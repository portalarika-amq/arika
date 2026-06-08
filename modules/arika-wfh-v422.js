/* ARIKA v422 - WFH/WFA stable monthly list module */
(function(){
  'use strict';
  if(window.__ARIKA_WFH_MODULE_V422__) return;
  window.__ARIKA_WFH_MODULE_V422__ = true;
  function visible(){ var v=document.getElementById('view-wfh'); return !!(v && !v.classList.contains('hidden')); }
  function refresh(){ if(visible() && typeof window.renderWfhWfaDay === 'function') return window.renderWfhWfaDay({ module:'wfh-v422' }); }
  window.arikaWfhModuleRefresh = refresh;
  window.arikaInitModule_wfh = function(){ setTimeout(refresh, 120); };
})();
