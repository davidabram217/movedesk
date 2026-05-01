// CareMore quote-form.js — stub. Form logic is now inline in quote.html.
// This file exists only to prevent 404s if any cached HTML still references it,
// and to ensure that even cached HTML cannot trigger any sign-in popup.
(function(){
  function noop(){}
  if(typeof window.submitForm!=='function')window.submitForm=noop;
  if(typeof window.toggleStorage!=='function')window.toggleStorage=noop;
  if(typeof window.toggleSourceOther!=='function')window.toggleSourceOther=noop;
  if(typeof window.toggleSizeOther!=='function')window.toggleSizeOther=noop;
  if(typeof window.addExtraLoad!=='function')window.addExtraLoad=noop;
  if(typeof window.addExtraUnload!=='function')window.addExtraUnload=noop;
  if(typeof window.removeLoc!=='function')window.removeLoc=noop;
  // Override any old Gmail OAuth functions to no-ops (defensive)
  window.getGmailToken=function(){return Promise.reject('disabled');};
  window.sendGmailConfirmation=noop;
  window.loadGoogleAuth=function(){return Promise.resolve();};
})();
