/* ARIKA v420 - Admin lazy module */
(function(){
  'use strict';
  if(window.__ARIKA_ADMIN_MODULE_V420__) return;
  window.__ARIKA_ADMIN_MODULE_V420__ = true;
  function init(){
    try{ if(window.applyAdminRoleAccess) window.applyAdminRoleAccess(); }catch(e){}
    // Hindari auto-render tabel besar. Subtab admin akan render ketika diklik.
    document.body.setAttribute('data-arika-admin-module','v420');
  }
  window.arikaInitModule_admin = init;
})();
