/* =========================================================
   ARIKA v421 - Performance Stage 4 DOM Load Reduction
   Tujuan: mengurangi beban DOM/browser dengan progressive DOM,
   bukan merender/menahan ratusan card/baris sekaligus.
   ========================================================= */
(function(){
  'use strict';
  if(window.__ARIKA_DOM_V421__) return;
  window.__ARIKA_DOM_V421__ = true;

  var VERSION = 'v421-stage4-dom-reduction';
  var DEFAULT_STEP = 20;
  var pending = false;
  var observer = null;
  var applying = false;
  var wrapped = Object.create(null);

  function log(){ try{ console.info.apply(console, ['ARIKA v421 DOM'].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console, ['ARIKA v421 DOM'].concat([].slice.call(arguments))); }catch(_){} }
  function idle(fn){
    if(window.requestIdleCallback) return window.requestIdleCallback(fn, { timeout: 900 });
    return setTimeout(fn, 80);
  }
  function nextFrame(fn){
    if(window.requestAnimationFrame) return window.requestAnimationFrame(function(){ idle(fn); });
    return idle(fn);
  }
  function getLimit(container){
    var id = container && container.id || '';
    var map = {
      'tbl-body': 12,
      'admin-history-body': 12,
      'admin-all-body': 12,
      'lembur-body': 12,
      'pegawai-lembur-saya-body': 10,
      'pegawai-catatan-body': 10,
      'admin-pegawai-body': 30,
      'admin-ot-detail-body': 16,
      'admin-ot-person-body': 12,
      'admin-monev-body': 16,
      'survey-action-body': 14,
      'survey-feedback-body': 14,
      'rencana-pribadi-list': 12,
      'admin-pengumuman-list': 12,
      'admin-agenda-list': 12,
      'agenda-personil-list': 30,
      'wfh-list': 12,
      'arika-reminder-center-list': 12,
      'focus-hari-list': 8,
      'rencana-beranda-list': 3
    };
    var explicit = Number(container && container.getAttribute && container.getAttribute('data-arika-dom-limit'));
    return explicit > 0 ? explicit : (map[id] || 0);
  }
  function isTablePart(el){
    return el && /^(TBODY|THEAD|TFOOT)$/i.test(el.tagName || '');
  }
  function directItems(container){
    if(!container) return [];
    return Array.prototype.filter.call(container.children || [], function(child){
      return child.nodeType === 1 &&
        !child.classList.contains('arika-dom-more-row') &&
        !child.classList.contains('arika-dom-more-wrap') &&
        !child.hasAttribute('data-arika-dom-control');
    });
  }
  function colspanFor(container){
    var first = directItems(container)[0];
    if(!first) return 1;
    var cells = first.querySelectorAll(':scope > td, :scope > th');
    return Math.max(1, cells.length || 1);
  }
  function makeControl(container, count, step){
    var table = isTablePart(container);
    var control = document.createElement(table ? 'tr' : 'div');
    control.setAttribute('data-arika-dom-control', 'true');
    control.className = table ? 'arika-dom-more-row' : 'arika-dom-more-wrap';
    var html = '<div class="arika-dom-more-box">' +
      '<span>Menampilkan data bertahap agar halaman tetap ringan. Tersisa <b>'+count+'</b> item.</span>' +
      '<button type="button" class="arika-dom-more-btn">Muat lagi</button>' +
      '<button type="button" class="arika-dom-all-btn">Tampilkan semua</button>' +
      '</div>';
    if(table){
      var td = document.createElement('td');
      td.colSpan = colspanFor(container);
      td.innerHTML = html;
      control.appendChild(td);
    } else {
      control.innerHTML = html;
    }
    control.querySelector('.arika-dom-more-btn').addEventListener('click', function(ev){
      ev.preventDefault(); ev.stopPropagation();
      revealMore(container, step || DEFAULT_STEP);
    });
    control.querySelector('.arika-dom-all-btn').addEventListener('click', function(ev){
      ev.preventDefault(); ev.stopPropagation();
      revealMore(container, 99999);
    });
    return control;
  }
  function removeControls(container){
    Array.prototype.forEach.call(container.querySelectorAll(':scope > [data-arika-dom-control="true"]'), function(n){ n.remove(); });
  }
  function ensureStore(container){
    if(!container.__arikaDomStore) container.__arikaDomStore = [];
    return container.__arikaDomStore;
  }
  function clearStore(container){
    container.__arikaDomStore = [];
    container.removeAttribute('data-arika-dom-managed');
  }
  function revealMore(container, amount){
    if(!container || !container.__arikaDomStore || !container.__arikaDomStore.length) return;
    applying = true;
    try{
      removeControls(container);
      var store = container.__arikaDomStore;
      var nodes = store.splice(0, Math.max(1, amount || DEFAULT_STEP));
      var frag = document.createDocumentFragment();
      nodes.forEach(function(n){ frag.appendChild(n); });
      container.appendChild(frag);
      if(store.length){
        container.appendChild(makeControl(container, store.length, amount || DEFAULT_STEP));
      } else {
        clearStore(container);
      }
    } finally {
      applying = false;
    }
  }
  function applyLimit(container, limit){
    if(!container || !limit || limit < 1) return;
    if(container.__arikaDomApplying) return;
    container.__arikaDomApplying = true;
    applying = true;
    try{
      removeControls(container);
      clearStore(container);
      var items = directItems(container);
      if(items.length <= limit) return;
      var keep = items.slice(0, limit);
      var extra = items.slice(limit);
      var store = ensureStore(container);
      extra.forEach(function(node){
        store.push(node);
        try{ node.remove(); }catch(_){ if(node.parentNode) node.parentNode.removeChild(node); }
      });
      container.setAttribute('data-arika-dom-managed', 'true');
      container.appendChild(makeControl(container, store.length, Math.max(DEFAULT_STEP, Math.ceil(limit/2))));
    } catch(e){ warn('Gagal membatasi DOM:', container && container.id, e); }
    finally {
      applying = false;
      container.__arikaDomApplying = false;
    }
  }
  function targetContainers(){
    var ids = [
      'tbl-body','admin-history-body','admin-all-body','lembur-body','pegawai-lembur-saya-body','pegawai-catatan-body',
      'admin-pegawai-body','admin-ot-detail-body','admin-ot-person-body','admin-monev-body','survey-action-body','survey-feedback-body',
      'rencana-pribadi-list','admin-pengumuman-list','admin-agenda-list','agenda-personil-list','wfh-list','arika-reminder-center-list',
      'focus-hari-list','rencana-beranda-list'
    ];
    return ids.map(function(id){ return document.getElementById(id); }).filter(Boolean);
  }
  function compactAll(reason){
    nextFrame(function(){
      targetContainers().forEach(function(el){ applyLimit(el, getLimit(el)); });
      document.documentElement.setAttribute('data-arika-dom-stage', 'v421');
    });
  }
  function schedule(reason){
    if(applying || pending) return;
    pending = true;
    nextFrame(function(){ pending = false; compactAll(reason || 'scheduled'); });
  }
  function wrapRender(name){
    if(wrapped[name] || typeof window[name] !== 'function') return false;
    var old = window[name];
    window[name] = function(){
      var out = old.apply(this, arguments);
      schedule('after:' + name);
      return out;
    };
    window[name].__arikaV421DomWrapped = true;
    wrapped[name] = true;
    return true;
  }
  function wrapKnownRenders(){
    [
      'runFilter','renderLemburTable','renderRencanaPribadi','renderRencanaBerandaOnly','renderAdminAllTable',
      'renderAdminAnalytics','renderAdminOvertimeDashboard','renderAdminSurvei','renderAdminPengumuman','renderAdminAgenda',
      'renderAgendaPegawaiOptions','renderAgendaSaya','renderPengumumanBoard','renderWfhWfaCalendarAuthority','renderWfhWfaDay',
      'renderWfhCalendar','renderReminderCenter','startArikaReminderCenter'
    ].forEach(wrapRender);
  }
  function injectCss(){
    if(document.getElementById('arika-dom-v421-style')) return;
    var style = document.createElement('style');
    style.id = 'arika-dom-v421-style';
    style.textContent = [
      '.arika-dom-more-wrap{padding:.75rem 0;text-align:center}',
      '.arika-dom-more-row td{padding:.75rem!important;background:#f8fafc!important}',
      '.arika-dom-more-box{display:flex;align-items:center;justify-content:center;gap:.55rem;flex-wrap:wrap;border:1px dashed #cbd5e1;background:#f8fafc;border-radius:1rem;padding:.65rem .8rem;color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
      '.arika-dom-more-btn,.arika-dom-all-btn{border:0;border-radius:.75rem;padding:.45rem .7rem;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}',
      '.arika-dom-more-btn{background:#0f766e;color:white}',
      '.arika-dom-all-btn{background:white;color:#334155;border:1px solid #e2e8f0}',
      '[data-arika-dom-managed="true"]{contain:layout style paint}',
      '@media (max-width:640px){.arika-dom-more-box{font-size:9px}.arika-dom-more-btn,.arika-dom-all-btn{width:100%}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function installObserver(){
    if(observer || !document.body) return;
    observer = new MutationObserver(function(muts){
      if(applying) return;
      for(var i=0;i<muts.length;i++){
        var t = muts[i].target;
        if(t && t.nodeType === 1){
          var limit = getLimit(t);
          if(limit || (t.closest && targetContainers().indexOf(t.closest('[id]')) >= 0)) { schedule('mutation'); break; }
        }
      }
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }
  function boot(){
    injectCss();
    wrapKnownRenders();
    compactAll('boot');
    installObserver();
    setTimeout(wrapKnownRenders, 1000);
    setTimeout(function(){ schedule('late-boot'); }, 1500);
  }
  window.arikaCompactDomNow = function(){ compactAll('manual'); return window.arikaDomInfo(); };
  window.arikaDomInfo = function(){
    var rows = targetContainers().map(function(el){
      return { id: el.id, visible: directItems(el).length, hidden: (el.__arikaDomStore || []).length, limit: getLimit(el) };
    });
    return { version: VERSION, pending: pending, wrapped: Object.keys(wrapped), containers: rows };
  };
  window.arikaInitModule_dom = boot;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  log('aktif. DOM besar akan dibatasi bertahap. Gunakan arikaDomInfo() untuk diagnosa.');
})();
