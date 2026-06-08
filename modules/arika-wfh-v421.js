/* ARIKA v421 - WFH/WFA stable monthly list module */
(function(){
  'use strict';
  if(window.__ARIKA_WFH_MODULE_V421__) return;
  window.__ARIKA_WFH_MODULE_V421__ = true;
  function visible(){ var v=document.getElementById('view-wfh'); return !!(v && !v.classList.contains('hidden')); }
  function refresh(){ if(visible() && typeof window.renderWfhWfaDay === 'function') return window.renderWfhWfaDay({ module:'wfh-v421' }); }
  window.arikaWfhModuleRefresh = refresh;
  window.arikaInitModule_wfh = function(){ setTimeout(refresh, 120); };
})();
