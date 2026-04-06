var SUPABASE_URL='https://oohqrvjhncssasjqkrzl.supabase.co';
var SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vaHFydmpobmNzc2FzanFrcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY2MzIsImV4cCI6MjA5MDM4MjYzMn0.x9N_sTjBRmSrxD-LVatV9hcpPLCuWtQh6-lIMMYfxLI';
var GMAIL_CLIENT_ID='1056257621603-7sq4nk45fivr1sh1lk0ci0435qcm47vv.apps.googleusercontent.com';
var GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.send';
var extraLoadCount=0;
var extraUnloadCount=0;
var _gmailToken=null;

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function v(id){var el=document.getElementById(id);return el?el.value.trim():'';}

// Load Google Identity Services
function loadGoogleAuth(){
  return new Promise(function(resolve){
    if(window.google&&window.google.accounts){resolve();return;}
    var s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client';
    s.onload=resolve;
    document.head.appendChild(s);
  });
}

function getGmailToken(){
  return new Promise(function(resolve,reject){
    loadGoogleAuth().then(function(){
      var client=window.google.accounts.oauth2.initTokenClient({
        client_id:GMAIL_CLIENT_ID,
        scope:GMAIL_SCOPE,
        callback:function(resp){
          if(resp.error){reject(resp.error);return;}
          _gmailToken=resp.access_token;
          resolve(resp.access_token);
        }
      });
      client.requestAccessToken({prompt:_gmailToken?'':'consent'});
    });
  });
}

function buildEmailBody(d){
  var firstName=d.name.split(' ')[0];
  var pickups=[];
  pickups.push(d.from+(d.fromZip?' '+d.fromZip:'')+(d.accessLoad?'\nAccess: '+d.accessLoad:'')+(d.parkingLoad?'\nParking: '+d.parkingLoad:''));
  (d.extraLoads||[]).forEach(function(ex,i){
    if(ex.address)pickups.push('Pick-up '+(i+2)+': '+ex.address+(ex.zip?' '+ex.zip:'')+(ex.access?'\nAccess: '+ex.access:'')+(ex.parking?'\nParking: '+ex.parking:''));
  });
  var dropoffs=[];
  dropoffs.push(d.to+(d.toZip?' '+d.toZip:'')+(d.accessUnload?'\nAccess: '+d.accessUnload:'')+(d.parkingUnload?'\nParking: '+d.parkingUnload:''));
  (d.extraUnloads||[]).forEach(function(ex,i){
    if(ex.address)dropoffs.push('Drop-off '+(i+2)+': '+ex.address+(ex.zip?' '+ex.zip:'')+(ex.access?'\nAccess: '+ex.access:'')+(ex.parking?'\nParking: '+ex.parking:''));
  });

  var body='Hi '+firstName+',\n\n';
  body+='Thank you for reaching out to CareMore Moving & Storage! We\'ve received your move request and will be in touch shortly to go over the details and provide you with a quote.\n\n';
  body+='Please note this is not a confirmation — your move is not booked until you receive a signed confirmation from us.\n\n';
  body+='Here\'s a summary of what you submitted:\n';
  body+='─────────────────────────────────\n';
  if(d.date)body+='Move date: '+d.date+'\n';
  if(d.size)body+='Home size: '+d.size+'\n';
  if(d.moveType)body+='Type: '+d.moveType+'\n';
  if(d.packing&&d.packing!=='No')body+='Packing: '+d.packing+'\n';
  body+='\nPick-up:\n'+pickups.join('\n\n')+'\n';
  body+='\nDrop-off:\n'+dropoffs.join('\n\n')+'\n';
  if(d.notes)body+='\nAdditional notes:\n'+d.notes+'\n';
  body+='─────────────────────────────────\n\n';
  body+='We\'ll review your request and call or email you within 2 business days to confirm availability, go over rates and provide you with a quote.\n\n';
  body+='If anything looks incorrect or you need to reach us sooner, please don\'t hesitate to get in touch:\n\n';
  body+='📞 (415) 822-8547\n';
  body+='✉ move@caremoremoving.com\n';
  body+='🌐 www.caremoremoving.com\n\n';
  body+='We look forward to helping with your move!\n\n';
  body+='Sincerely,\nThe CareMore Team';
  return body;
}

function sendGmailConfirmation(d){
  return getGmailToken().then(function(token){
    var to=d.email;
    var subject='Thank you for your move request — CareMore Moving & Storage';
    var body=buildEmailBody(d);
    // Build RFC 2822 email
    var email=[
      'From: CareMore Moving & Storage <move@caremoremoving.com>',
      'To: '+to,
      'Subject: '+subject,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');
    // Base64 URL encode
    var encoded=btoa(unescape(encodeURIComponent(email))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({raw:encoded})
    });
  });
}

function toggleStorage(){
  var val=document.getElementById('q-storage').value;
  var toField=document.getElementById('q-to');
  if(val==='yes'){
    toField.value='925 Palou Ave, San Francisco, CA 94124';
    document.getElementById('q-to-zip').value='94124';
    toField.disabled=true;
  } else {
    if(toField.value==='925 Palou Ave, San Francisco, CA 94124'){
      toField.value='';
      document.getElementById('q-to-zip').value='';
    }
    toField.disabled=false;
  }
}

function toggleSourceOther(){
  var val=document.getElementById('q-source').value;
  var grp=document.getElementById('q-source-other-group');
  var lbl=document.getElementById('q-source-other-label');
  var show=val==='Other'||val==='Referral'||val==='Google'||val==='ChatGPT';
  grp.style.display=show?'flex':'none';
  if(val==='Referral')lbl.textContent='Who referred you?';
  else if(val==='Google'||val==='ChatGPT')lbl.textContent='What did you search for?';
  else lbl.textContent='Please specify';
}

function makeLocBlock(id,badgeClass,badgeText){
  var div=document.createElement('div');
  div.className='loc-block';
  div.id=id;
  div.innerHTML='<div class="loc-block-header">'
    +'<span class="loc-badge '+badgeClass+'">'+badgeText+'</span>'
    +'<button type="button" class="remove-loc-btn" onclick="removeLoc(\''+id+'\')">x</button>'
    +'</div>'
    +'<div class="grid-2">'
    +'<div class="field full"><label>Address</label><input type="text" id="'+id+'-addr" placeholder="Start typing address..."></div>'
    +'<div class="field"><label>Zip Code</label><input type="text" id="'+id+'-zip" placeholder="e.g. 94103" maxlength="5"></div>'
    +'<div class="field"><label>Unit / Suite #</label><input type="text" id="'+id+'-unit" placeholder="e.g. Apt 4B"></div>'
    +'<div class="field"><label>Location Type</label><select id="'+id+'-type"><option value="">Select...</option><option>House</option><option>Apartment</option><option>Condo</option><option>Office</option><option>Storage unit</option><option>Other</option></select></div>'
    +'<div class="field"><label>Floor #</label><input type="text" id="'+id+'-floor" placeholder="e.g. 2"></div>'
    +'<div class="field"><label>Access</label><select id="'+id+'-access"><option value="">Select...</option><option>Flat</option><option>Flat with long walk</option><option>A few steps</option><option>1 flight</option><option>2 flights</option><option>3 flights</option><option>4 flights</option><option>Elevator</option><option>Elevator with long walk</option></select></div>'
    +'<div class="field"><label>Parking</label><select id="'+id+'-parking"><option value="">Select...</option><option>Loading dock</option><option>Double parking</option><option>Save spots</option><option>Permits</option><option>Open parking</option></select></div>'
    +'<div class="field full"><label>Notes</label><input type="text" id="'+id+'-notes" placeholder="Parking details, gate codes, access info..."></div>'
    +'</div>';
  return div;
}

function addExtraLoad(){
  extraLoadCount++;
  document.getElementById('q-extra-loads').appendChild(makeLocBlock('q-extra-load-'+extraLoadCount,'pickup','Pick-up '+(extraLoadCount+1)));
}

function addExtraUnload(){
  extraUnloadCount++;
  document.getElementById('q-extra-unloads').appendChild(makeLocBlock('q-extra-unload-'+extraUnloadCount,'dropoff','Drop-off '+(extraUnloadCount+1)));
}

function removeLoc(id){
  var el=document.getElementById(id);
  if(el)el.parentNode.removeChild(el);
}

function getLocData(containerId){
  var results=[];
  var container=document.getElementById(containerId);
  if(!container)return results;
  var blocks=container.children;
  for(var i=0;i<blocks.length;i++){
    var id=blocks[i].id;
    var addrEl=document.getElementById(id+'-addr');
    if(addrEl&&addrEl.value.trim()){
      results.push({
        address:addrEl.value.trim(),
        zip:(document.getElementById(id+'-zip')||{value:''}).value.trim(),
        unit:(document.getElementById(id+'-unit')||{value:''}).value.trim(),
        locationType:(document.getElementById(id+'-type')||{value:''}).value,
        floor:(document.getElementById(id+'-floor')||{value:''}).value.trim(),
        access:(document.getElementById(id+'-access')||{value:''}).value,
        parking:(document.getElementById(id+'-parking')||{value:''}).value,
        notes:(document.getElementById(id+'-notes')||{value:''}).value.trim()
      });
    }
  }
  return results;
}

function getExtraLoads(){return getLocData('q-extra-loads');}
function getExtraUnloads(){return getLocData('q-extra-unloads');}

function validate(){
  var ok=true;
  function req(fid,iid){
    var f=document.getElementById(fid);
    var el=document.getElementById(iid);
    if(!el||!el.value.trim()){if(f)f.classList.add('has-error');ok=false;}
    else{if(f)f.classList.remove('has-error');}
  }
  req('f-name','q-name');
  req('f-phone','q-phone');
  req('f-email','q-email');
  req('f-date','q-date');
  req('f-from','q-from');
  req('f-to','q-to');
  req('f-source','q-source');
  var email=v('q-email');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    var f=document.getElementById('f-email');
    if(f)f.classList.add('has-error');
    ok=false;
  }
  return ok;
}

function collectData(){
  return {
    name:v('q-name'),
    phone:v('q-phone'),
    email:v('q-email'),
    date:v('q-date'),
    size:v('q-size'),
    sqft:v('q-sqft'),
    moveType:v('q-movetype'),
    packing:v('q-packing'),
    storage:document.getElementById('q-storage').value==='yes',
    from:v('q-from'),
    fromZip:v('q-from-zip'),
    fromUnit:v('q-from-unit'),
    fromType:v('q-from-type'),
    fromFloor:v('q-from-floor'),
    accessLoad:v('q-access-load'),
    parkingLoad:v('q-parking-load'),
    fromNotes:v('q-from-notes'),
    extraLoads:getExtraLoads(),
    to:v('q-to'),
    toZip:v('q-to-zip'),
    toUnit:v('q-to-unit'),
    toType:v('q-to-type'),
    toFloor:v('q-to-floor'),
    accessUnload:v('q-access-unload'),
    parkingUnload:v('q-parking-unload'),
    toNotes:v('q-to-notes'),
    extraUnloads:getExtraUnloads(),
    source:v('q-source'),
    sourceDetail:v('q-source-other'),
    notes:v('q-notes'),
    submittedAt:new Date().toISOString()
  };
}

function submitForm(){
  if(!validate()){
    var err=document.querySelector('.has-error');
    if(err)err.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  var btn=document.getElementById('submit-btn');
  btn.disabled=true;
  btn.textContent='Submitting...';
  var data=collectData();

  // Save to Supabase
  fetch(SUPABASE_URL+'/rest/v1/pending_leads',{
    method:'POST',
    headers:{
      'apikey':SUPABASE_KEY,
      'Authorization':'Bearer '+SUPABASE_KEY,
      'Content-Type':'application/json',
      'Prefer':'resolution=merge-duplicates'
    },
    body:JSON.stringify([{id:uid(),data:data}])
  }).then(function(){
    // Send confirmation email via Gmail
    if(data.email){
      sendGmailConfirmation(data).then(function(){
        showSuccess(data);
      }).catch(function(){
        // Email failed but form still submitted — show success anyway
        showSuccess(data);
      });
    } else {
      showSuccess(data);
    }
  }).catch(function(){
    // Supabase failed — use localStorage fallback
    try{
      var p=JSON.parse(localStorage.getItem('caremore-pending-leads')||'[]');
      p.push(data);
      localStorage.setItem('caremore-pending-leads',JSON.stringify(p));
    }catch(e){}
    showSuccess(data);
  });
}

function showSuccess(d){
  document.getElementById('form-page').style.display='none';
  document.getElementById('success-page').style.display='block';
  document.getElementById('success-name').textContent=d.name.split(' ')[0];
  var rows=[['Name',d.name],['Phone',d.phone],['Email',d.email]];
  if(d.date)rows.push(['Move date',d.date]);
  if(d.size)rows.push(['Home size',d.size]);
  if(d.from)rows.push(['Pick-up',d.from+(d.fromZip?' '+d.fromZip:'')]);
  (d.extraLoads||[]).forEach(function(ex,i){if(ex.address)rows.push(['Pick-up '+(i+2),ex.address+(ex.zip?' '+ex.zip:'')]);});
  if(d.to)rows.push(['Drop-off',d.to+(d.toZip?' '+d.toZip:'')]);
  (d.extraUnloads||[]).forEach(function(ex,i){if(ex.address)rows.push(['Drop-off '+(i+2),ex.address+(ex.zip?' '+ex.zip:'')]);});
  if(d.packing&&d.packing!=='No')rows.push(['Packing',d.packing]);
  if(d.source)rows.push(['How you heard',d.source+(d.sourceDetail?' - '+d.sourceDetail:'')]);
  if(d.notes)rows.push(['Notes',d.notes]);
  document.getElementById('success-summary').innerHTML=rows.map(function(r){
    return '<div style="display:flex;justify-content:space-between;gap:16px;padding:5px 0;border-bottom:1px solid #f0ede6">'
      +'<span style="color:#9e9b94;flex-shrink:0">'+r[0]+'</span>'
      +'<span style="text-align:right">'+r[1]+'</span></div>';
  }).join('');
  window.scrollTo(0,0);
}
