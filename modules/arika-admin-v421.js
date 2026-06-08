/* ARIKA v421 - Admin lazy module */
(function(){
  'use strict';
  if(window.__ARIKA_ADMIN_MODULE_V421__) return;
  window.__ARIKA_ADMIN_MODULE_V421__ = true;
  function init(){
    try{ if(window.applyAdminRoleAccess) window.applyAdminRoleAccess(); }catch(e){}
    // Hindari auto-render tabel besar. Subtab admin akan render ketika diklik.
    document.body.setAttribute('data-arika-admin-module','v421');
  }
  window.arikaInitModule_admin = init;
})();
