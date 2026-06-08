/* =========================================================
   ARIKA v420 - Modular Frontend Loader
   Tahap 4: mengurangi beban DOM dengan progressive rendering/pagination ringan.
   Core legacy tetap dipertahankan untuk kompatibilitas, sedangkan
   render/performa/fitur berat dipanggil bertahap sesuai tab aktif.
   ========================================================= */
(function(){
  'use strict';
  var VERSION = 'v420-stage4-dom-reduction';
  var BASE = './modules/';
  var loaded = Object.create(null);
  var loading = Object.create(null);
  var manifest = {
    performance: { file: 'arika-performance-v420.js', eager: true },
    api:         { file: 'arika-api-v420.js', eager: true },
    endpoints:   { file: 'arika-endpoints-v420.js', eager: true },
    router:      { file: 'arika-render-router-v420.js', eager: true },
    dom:         { file: 'arika-dom-v420.js', eager: true },
    wfh:         { file: 'arika-wfh-v420.js', route: 'wfh' },
    admin:       { file: 'arika-admin-v420.js', route: 'admin' },
    rencana:     { file: 'arika-rencana-v420.js', route: 'rencana' },
    reminder:    { file: 'arika-reminder-v420.js' }
  };
  function log(){ try{ console.info.apply(console, ['ARIKA v420'].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console, ['ARIKA v420'].concat([].slice.call(arguments))); }catch(_){} }
  function load(name){
    if(!manifest[name]) return Promise.reject(new Error('Modul tidak dikenal: '+name));
    if(loaded[name]) return Promise.resolve(true);
    if(loading[name]) return loading[name];
    loading[name] = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = BASE + manifest[name].file + '?v=420';
      s.defer = true;
      s.onload = function(){
        loaded[name] = true;
        try{
          var init = window['arikaInitModule_' + name];
          if(typeof init === 'function') init();
        }catch(e){ warn('Init modul gagal:', name, e); }
        resolve(true);
      };
      s.onerror = function(){ reject(new Error('Gagal memuat modul '+name+' ('+manifest[name].file+')')); };
      document.head.appendChild(s);
    });
    return loading[name];
  }
  function activeView(){
    var view = document.querySelector('.view-section:not(.hidden)');
    if(!view) return '';
    return String(view.id || '').replace(/^view-/, '');
  }
  function loadForRoute(route){
    var tasks = [];
    Object.keys(manifest).forEach(function(name){
      if(manifest[name].route === route) tasks.push(load(name));
    });
    return Promise.all(tasks).catch(function(e){ warn(e); });
  }
  function routeAfterNav(id){
    var route = id || activeView();
    loadForRoute(route).then(function(){
      try{
        if(window.arikaRouteRender) window.arikaRouteRender(route, { source:'module-loader', version:VERSION });
        else if(window.arikaRenderActiveTabOnly) window.arikaRenderActiveTabOnly('module-loader:'+route);
      }catch(e){ warn('Render route gagal:', route, e); }
    });
  }
  window.ARIKA_MODULES = {
    version: VERSION,
    manifest: manifest,
    loaded: loaded,
    load: load,
    loadForRoute: loadForRoute,
    activeView: activeView,
    renderActive: routeAfterNav
  };
  // Bungkus nav setelah app legacy siap.
  function wrapNav(){
    if(typeof window.nav !== 'function' || window.nav.__arikaV420ModuleWrapped) return;
    var old = window.nav;
    window.nav = function(id){
      var out = old.apply(this, arguments);
      setTimeout(function(){ routeAfterNav(id); }, 50);
      return out;
    };
    window.nav.__arikaV420ModuleWrapped = true;
  }
  // Load modul eager tanpa menunggu tab.
  function boot(){
    wrapNav();
    Object.keys(manifest).forEach(function(name){ if(manifest[name].eager) load(name).catch(warn); });
    setTimeout(function(){ routeAfterNav(activeView()); }, 650);
  }
  // Reminder perlu bisa dimuat ketika tombol dibuka.
  document.addEventListener('click', function(ev){
    var t = ev.target && ev.target.closest && ev.target.closest('#reminder-open-btn,#open-reminder-btn,#btn-open-reminder,[data-open-reminder],[data-action="open-reminder"],.open-reminder,.js-open-reminder');
    if(t) load('reminder').catch(warn);
  }, true);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(wrapNav, 1000);
  log('loader aktif. Struktur modular + endpoint ringan tahap 3 siap.');
})();
