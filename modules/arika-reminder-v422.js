/* ARIKA v422 - Reminder lazy module */
(function(){
  'use strict';
  if(window.__ARIKA_REMINDER_MODULE_V422__) return;
  window.__ARIKA_REMINDER_MODULE_V422__ = true;
  function fixReminderLayer(){
    var st = document.getElementById('arika-v422-reminder-layer-fix');
    if(!st){
      st = document.createElement('style');
      st.id = 'arika-v422-reminder-layer-fix';
      st.textContent = '#reminder-center,#arika-reminder-center,.arika-reminder-panel{position:fixed!important;z-index:2147483000!important;max-height:calc(100vh - 48px)!important;overflow:auto!important}.reminder-badge,.arika-reminder-badge,.arika-reminder-count{overflow:visible!important;z-index:2147483001!important}';
      document.head.appendChild(st);
    }
  }
  function init(){ fixReminderLayer(); try{ if(window.renderReminderCenter) window.renderReminderCenter(); }catch(e){} }
  window.arikaInitModule_reminder = init;
})();
