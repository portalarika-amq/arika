/* ARIKA v422 - API helper module with Apps Script global-const fallback */
(function(){
  'use strict';
  var API_VERSION = 'v422-api-stage3';
  function getBase(){
    try{
      if(window.API_URL) return window.API_URL;
      if(window.GAS_URL) return window.GAS_URL;
      if(window.APP_SCRIPT_URL) return window.APP_SCRIPT_URL;
      if(window.WEB_APP_URL) return window.WEB_APP_URL;
      if(window.SCRIPT_URL) return window.SCRIPT_URL;
      if(typeof SCRIPT_URL !== 'undefined' && SCRIPT_URL) return SCRIPT_URL;
    }catch(_){ }
    return '';
  }
  function withParams(url, params){
    var q = [];
    Object.keys(params||{}).forEach(function(k){
      if(params[k] !== undefined && params[k] !== null && params[k] !== '') q.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k]));
    });
    if(!q.length) return url;
    return url + (url.indexOf('?')>=0?'&':'?') + q.join('&');
  }
  async function get(params, timeoutMs){
    var base = getBase();
    if(!base) throw new Error('URL Apps Script tidak ditemukan.');
    var url = withParams(base, Object.assign({}, params||{}, { _: Date.now() }));
    var controller = new AbortController();
    var timer = setTimeout(function(){ try{ controller.abort(); }catch(_){} }, timeoutMs || 18000);
    try{
      var res = await fetch(url, { method:'GET', cache:'no-store', credentials:'omit', signal:controller.signal });
      var txt = await res.text();
      try{ return JSON.parse(txt); }catch(e){ return { success:false, result:'invalid_json', text:txt.slice(0,600), url:url }; }
    } finally { clearTimeout(timer); }
  }
  async function post(action, payload, timeoutMs){
    var base = getBase();
    if(!base) throw new Error('URL Apps Script tidak ditemukan.');
    var controller = new AbortController();
    var timer = setTimeout(function(){ try{ controller.abort(); }catch(_){} }, timeoutMs || 18000);
    try{
      var res = await fetch(base, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({ action:action, payload:payload||{} }), signal:controller.signal });
      var txt = await res.text();
      try{ return JSON.parse(txt); }catch(e){ return { success:false, result:'invalid_json', text:txt.slice(0,600) }; }
    } finally { clearTimeout(timer); }
  }
  window.ARIKA_API = Object.assign(window.ARIKA_API || {}, { version:API_VERSION, get:get, post:post, base:getBase, withParams:withParams });
  window.arikaInitModule_api = function(){ return true; };
})();
