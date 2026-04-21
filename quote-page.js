var SUPABASE_URL='https://oohqrvjhncssasjqkrzl.supabase.co';
var SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vaHFydmpobmNzc2FzanFrcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY2MzIsImV4cCI6MjA5MDM4MjYzMn0.x9N_sTjBRmSrxD-LVatV9hcpPLCuWtQh6-lIMMYfxLI';
var EJS_SERVICE='service_nakq8tb';
var EJS_NOTIFY_TEMPLATE='template_nr2plwp';
var EJS_PUBLIC_KEY='76y89yZYC-kcq82ol';

function fmtMoney(n){return'$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});}
function fmtDate(d){if(!d)return'--';var dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}
function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

function getPublicId(){
  var params=new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadQuote(){
  var publicId=getPublicId();
  if(!publicId){document.getElementById('loading').textContent='Invalid quote link. Please contact us at (415) 822-8547.';return;}
  try{
    var res=await fetch(SUPABASE_URL+'/rest/v1/quotes?select=id,data&order=created_at.desc',{
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}
    });
    if(!res.ok){document.getElementById('loading').textContent='Unable to load quote (error '+res.status+'). Please contact us at (415) 822-8547.';return;}
    var rows=await res.json();
    var row=rows.find(function(r){return r.data&&r.data.publicId===publicId;});
    if(!row){document.getElementById('loading').textContent='Quote not found. Please contact us at (415) 822-8547.';return;}
    var q=row.data;
    q.id=row.id;
    if(q.expiresAt&&new Date(q.expiresAt)<new Date()){
      document.getElementById('loading').style.display='none';
      document.getElementById('expired').style.display='block';
      return;
    }
    document.getElementById('loading').style.display='none';
    document.getElementById('quote-content').style.display='block';
    renderQuote(q);
  }catch(e){
    document.getElementById('loading').textContent='Error loading quote. Please contact us at (415) 822-8547.';
  }
}

function renderQuote(q){
  var isMulti=q.jobType==='multi';
  var days=q.days||[];
  var fees=(q.fees||[]).filter(function(f){return f.included;});
  var d0=days[0]||{};
  var isAccepted=q.status==='accepted';
  var fmt=fmtMoney;

  function renderLocs(locs,type){
    return locs.filter(function(loc){return loc&&loc.address;}).map(function(loc,i){
      return '<div style="margin-top:10px">'+
        '<div style="font-size:11px;color:#9e9b94;margin-bottom:3px">'+(i===0?(type==='load'?'Pick-up':'Drop-off'):(type==='load'?'Pick-up ':'Drop-off ')+(i+1))+'</div>'+
        '<div style="font-weight:500;font-size:14px">'+esc(loc.address+(loc.unit?', '+loc.unit:''))+'</div>'+
        (loc.floor?'<div style="font-size:12px;color:#6b6860">Floor: '+esc(loc.floor)+'</div>':'')+
        (loc.access?'<div style="font-size:12px;color:#6b6860">Access: '+esc(loc.access)+'</div>':'')+
        (loc.parking?'<div style="font-size:12px;color:#6b6860">Parking: '+esc(loc.parking)+'</div>':'')+
        '</div>';
    }).join('');
  }

  var html='<div style="font-family:\'DM Sans\',Arial,sans-serif;color:#1a1a1a;max-width:680px;margin:0 auto">';

  // Header
  html+='<div style="text-align:center;padding:32px 24px 20px;border-bottom:2px solid #e8e4dc">'+
    '<div style="font-family:Georgia,serif;font-size:28px;font-weight:600;color:#1a1a1a;letter-spacing:-0.5px">CareMore</div>'+
    '<div style="width:60px;height:2px;background:#4a9e6b;margin:8px auto 6px"></div>'+
    '<div style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:#2d5a3d">Moving &amp; Storage</div>'+
    '<div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#9e9b94;margin-top:4px">San Francisco, CA</div>'+
    '<div style="margin-top:20px;font-size:24px;font-weight:700;color:#1a1a1a">Move Estimate</div>'+
    (q.customerName?'<div style="font-size:14px;color:#6b6860;margin-top:6px">Prepared for '+esc(q.customerName)+'</div>':'')+
    '<div style="font-size:12px;color:#9e9b94;margin-top:8px;line-height:1.6">CareMore Moving &amp; Storage &nbsp;&middot;&nbsp; Cal-T #0190970<br>925 Palou Ave, San Francisco, CA 94124 &nbsp;&middot;&nbsp; (415) 822-8547</div>'+
    '</div>';

  // Notes
  if(q.notes){
    html+='<div style="padding:20px 24px;border-bottom:1px solid #e8e4dc">'+
      '<div style="font-size:14px;color:#444;line-height:1.8">'+esc(q.notes).replace(/\n/g,'<br>')+'</div>'+
      '</div>';
  }

  // Project info
  if(q.projectName||q.moveType||q.size||q.description){
    html+='<div style="padding:20px 24px;border-bottom:1px solid #e8e4dc">'+
      '<div style="font-size:10px;font-weight:600;color:#9e9b94;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">Project Information</div>'+
      '<div style="font-size:14px;line-height:2;color:#333">'+
      (q.projectName?'<div><span style="color:#9e9b94;font-size:12px">Project</span><br>'+esc(q.projectName)+'</div>':'')+
      (q.moveType?'<div style="margin-top:6px"><span style="color:#9e9b94;font-size:12px">Project Type</span><br>Local Move &middot; '+esc(q.moveType)+'</div>':'')+
      (q.size?'<div style="margin-top:6px"><span style="color:#9e9b94;font-size:12px">Project Size</span><br>'+esc(q.size)+'</div>':'')+
      (q.description?'<div style="margin-top:6px"><span style="color:#9e9b94;font-size:12px">Project Description</span><br>'+esc(q.description).replace(/\n/g,'<br>')+'</div>':'')+
      '</div></div>';
  }

  // Move details
  html+='<div style="padding:20px 24px;border-bottom:1px solid #e8e4dc">'+
    '<div style="font-size:10px;font-weight:600;color:#9e9b94;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Move Details</div>';

  if(isMulti){
    days.forEach(function(d,i){
      var loads=d.loads&&d.loads.length?d.loads:[{address:d.from||'',unit:d.fromUnit||'',floor:d.fromFloor||'',access:d.fromAccess||'',parking:d.fromParking||''}];
      var unloads=d.unloads&&d.unloads.length?d.unloads:[{address:d.to||'',unit:d.toUnit||'',floor:d.toFloor||'',access:d.toAccess||'',parking:d.toParking||''}];
      html+='<div style="margin-bottom:20px;padding-bottom:16px;'+(i<days.length-1?'border-bottom:1px dashed #e8e4dc':'')+'">'+
        '<div style="font-weight:700;font-size:15px;color:#2d5a3d;margin-bottom:10px">Day '+(i+1)+'</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
        (d.date?'<div><div style="font-size:11px;color:#9e9b94;margin-bottom:3px">Date</div><div style="font-weight:500;font-size:14px">'+esc(fmtDate(d.date))+'</div></div>':'')+
        (d.arrivalStart?'<div><div style="font-size:11px;color:#9e9b94;margin-bottom:3px">Arrival window</div><div style="font-weight:500;font-size:14px">'+esc(d.arrivalStart+(d.arrivalEnd?' \u2013 '+d.arrivalEnd:''))+'</div></div>':'')+
        '</div>'+
        renderLocs(loads,'load')+
        renderLocs(unloads,'unload')+
        '</div>';
    });
  } else {
    var loads=d0.loads&&d0.loads.length?d0.loads:[{address:d0.from||'',unit:d0.fromUnit||'',floor:d0.fromFloor||'',access:d0.fromAccess||'',parking:d0.fromParking||''}];
    var unloads=d0.unloads&&d0.unloads.length?d0.unloads:[{address:d0.to||'',unit:d0.toUnit||'',floor:d0.toFloor||'',access:d0.toAccess||'',parking:d0.toParking||''}];
    html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
      (d0.date?'<div><div style="font-size:11px;color:#9e9b94;margin-bottom:3px">Move date</div><div style="font-weight:500;font-size:14px">'+esc(fmtDate(d0.date))+'</div></div>':'')+
      (d0.arrivalStart?'<div><div style="font-size:11px;color:#9e9b94;margin-bottom:3px">Arrival window</div><div style="font-weight:500;font-size:14px">'+esc(d0.arrivalStart+(d0.arrivalEnd?' \u2013 '+d0.arrivalEnd:''))+'</div></div>':'')+
      '</div>'+
      renderLocs(loads,'load')+
      renderLocs(unloads,'unload');
  }
  html+='</div>';

  // Billing
  html+='<div style="padding:20px 24px;border-bottom:1px solid #e8e4dc">'+
    '<div style="font-size:10px;font-weight:600;color:#9e9b94;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Billing</div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:13.5px">'+
    '<thead><tr style="border-bottom:2px solid #e8e4dc">'+
    '<th style="text-align:left;padding:8px 6px;font-size:10px;color:#9e9b94;font-weight:500;text-transform:uppercase;letter-spacing:.8px">Description</th>'+
    '<th style="text-align:right;padding:8px 6px;font-size:10px;color:#9e9b94;font-weight:500;text-transform:uppercase;letter-spacing:.8px">Hours</th>'+
    '<th style="text-align:right;padding:8px 6px;font-size:10px;color:#9e9b94;font-weight:500;text-transform:uppercase;letter-spacing:.8px">Rate</th>'+
    '<th style="text-align:right;padding:8px 6px;font-size:10px;color:#9e9b94;font-weight:500;text-transform:uppercase;letter-spacing:.8px">Amount</th>'+
    '</tr></thead><tbody>';

  days.forEach(function(d,i){
    var crewDesc=d.crewLoadDiff?(d.crewLoad||d.crew)+' load / '+(d.crewUnload||d.crew)+' unload movers':d.crew+' Movers';
    var label=isMulti?'Day '+(i+1)+' \u2013 '+crewDesc:crewDesc;
    html+='<tr style="border-bottom:1px solid #f0ece4">'+
      '<td style="padding:11px 6px">'+esc(label)+'</td>'+
      '<td style="padding:11px 6px;text-align:right;color:#6b6860">'+d.hrsMin+' \u2013 '+d.hrsMax+' hrs</td>'+
      '<td style="padding:11px 6px;text-align:right;color:#6b6860">'+fmt(d.rate)+'/hr</td>'+
      '<td style="padding:11px 6px;text-align:right;font-weight:600">'+fmt(d.hrsMin*d.rate)+' \u2013 '+fmt(d.hrsMax*d.rate)+'</td>'+
      '</tr>';
    if(d.packCrew&&d.packRate){
      var pl=(isMulti?'Day '+(i+1)+' \u2013 ':'')+( d.packCrewSize||1)+' Packer'+((d.packCrewSize||1)>1?'s':'');
      html+='<tr style="border-bottom:1px solid #f0ece4">'+
        '<td style="padding:11px 6px">'+esc(pl)+'</td>'+
        '<td style="padding:11px 6px;text-align:right;color:#6b6860">'+(d.packHrsMin||'?')+' \u2013 '+(d.packHrsMax||'?')+' hrs</td>'+
        '<td style="padding:11px 6px;text-align:right;color:#6b6860">'+fmt(d.packRate)+'/hr</td>'+
        '<td style="padding:11px 6px;text-align:right;font-weight:600">'+fmt((d.packHrsMin||0)*d.packRate)+' \u2013 '+fmt((d.packHrsMax||0)*d.packRate)+'</td>'+
        '</tr>';
    }
  });

  fees.forEach(function(f){
    var amt=f.type==='range'?fmt(f.hrsMin||0)+' \u2013 '+fmt(f.hrsMax||0):fmt(f.amount||0);
    html+='<tr style="border-bottom:1px solid #f0ece4">'+
      '<td style="padding:11px 6px">'+esc(f.label||'')+'</td>'+
      '<td style="padding:11px 6px;text-align:right;color:#9e9b94">--</td>'+
      '<td style="padding:11px 6px;text-align:right;color:#9e9b94">--</td>'+
      '<td style="padding:11px 6px;text-align:right;font-weight:600">'+amt+'</td>'+
      '</tr>';
  });

  html+='</tbody><tfoot><tr style="border-top:2px solid #e8e4dc">'+
    '<td colspan="3" style="padding:14px 6px;font-weight:700;font-size:15px">Estimated Total</td>'+
    '<td style="padding:14px 6px;text-align:right;font-weight:700;font-size:16px;color:#2d5a3d">'+fmt(q.totalMin)+' \u2013 '+fmt(q.totalMax)+'</td>'+
    '</tr></tfoot></table>';

  if(q.cashDiscount){
    html+='<div style="margin-top:12px;padding:10px 14px;background:#f0faf4;border-radius:6px;font-size:13px;color:#2d5a3d"><strong>Cash discount:</strong> '+esc(q.cashDiscount)+'</div>';
  }
  html+='</div>';

  // Stipulations
  if(q.stipulations){
    html+='<div style="padding:20px 24px;border-bottom:1px solid #e8e4dc">'+
      '<div style="font-size:10px;font-weight:600;color:#9e9b94;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">Terms &amp; Conditions</div>'+
      '<div style="font-size:13px;color:#555;line-height:1.9;white-space:pre-wrap">'+esc(q.stipulations)+'</div>'+
      '</div>';
  }

  // Accept / accepted section
  if(isAccepted){
    html+='<div style="padding:24px;text-align:center;background:#f0faf4;border-radius:0 0 8px 8px">'+
      '<div style="font-size:32px;color:#2d5a3d">&#10003;</div>'+
      '<div style="font-size:18px;font-weight:700;color:#2d5a3d;margin:8px 0">Quote accepted!</div>'+
      '<p style="font-size:14px;color:#6b6860;margin-bottom:8px">Thank you, '+esc((q.customerName||'').split(' ')[0])+'! We have received your acceptance and we will be in touch within 2 business days to confirm what dates are available for your move.</p>'+
      '<div style="font-size:13px;color:#9e9b94">(415) 822-8547 &nbsp;&middot;&nbsp; move@caremoremoving.com</div>'+
      '</div>';
  } else {
    html+='<div style="padding:24px;text-align:center;background:#f9f7f4">'+
      '<div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#1a1a1a">Ready to move forward?</div>'+
      '<div style="font-size:13px;color:#6b6860;margin-bottom:18px;line-height:1.7;max-width:480px;margin-left:auto;margin-right:auto">Click below to accept this quote. We will be in touch within 2 business days to confirm your booking. Please note: the move is not confirmed until we confirm that the date(s) are available and we send you a confirmation email.</div>'+
      '<button id="accept-btn" onclick="acceptQuote(\''+q.id+'\',\''+q.publicId+'\')" style="background:#2d5a3d;color:#fff;border:none;padding:16px 48px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer">&#10003; &nbsp;Accept Quote</button>'+
      '</div>';
  }

  if(q.sentBy){
    html+='<div style="text-align:right;padding:12px 24px;font-size:12px;color:#9e9b94">Quote prepared by '+esc(q.sentBy)+'</div>';
  }

  html+='<div style="text-align:center;padding:16px 24px;font-size:12px;color:#9e9b94;border-top:1px solid #e8e4dc">Questions? Call <a href="tel:4158228547" style="color:#2d5a3d;font-weight:500">(415) 822-8547</a> or email <a href="mailto:move@caremoremoving.com" style="color:#2d5a3d;font-weight:500">move@caremoremoving.com</a></div>';
  html+='</div>';

  document.getElementById('quote-content').innerHTML=html;
  window._currentQuote=q;
}

async function acceptQuote(quoteId,publicId){
  var btn=document.getElementById('accept-btn');
  if(btn){btn.disabled=true;btn.textContent='Accepting...';}
  var q=window._currentQuote;
  var acceptedAt=new Date().toISOString();
  var updated=Object.assign({},q,{status:'accepted',acceptedAt:acceptedAt});
  try{
    await fetch(SUPABASE_URL+'/rest/v1/quotes?id=eq.'+quoteId,{
      method:'PATCH',
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({data:updated})
    });
    try{
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload=function(){
        emailjs.init({publicKey:EJS_PUBLIC_KEY});
        var name=q.customerName||'Customer';
        var d0=q.days&&q.days[0]||{};
        var body=name+' has accepted their move quote.\n\nCustomer: '+name+'\nEmail: '+(q.customerEmail||'--')+'\nMove date: '+(d0.date?fmtDate(d0.date):'--')+'\nQuote total: '+fmtMoney(q.totalMin)+' - '+fmtMoney(q.totalMax)+'\nAccepted: '+new Date(acceptedAt).toLocaleString()+'\n\nLog in to MoveDesk:\nhttps://davidabram217.github.io/movedesk';
        emailjs.send(EJS_SERVICE,EJS_NOTIFY_TEMPLATE,{to_email:'move@caremoremoving.com',to_name:'CareMore Moving and Storage',from_name:'CareMore Moving and Storage',reply_to:'move@caremoremoving.com',subject:'Quote accepted - '+name+' ('+fmtMoney(q.totalMin)+' - '+fmtMoney(q.totalMax)+')',message:body,html_content:'<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">'+body+'</pre>'});
      };
      document.head.appendChild(s);
    }catch(e){console.log('Notification failed:',e);}
    window._currentQuote=updated;
    renderQuote(updated);
  }catch(e){
    console.error('acceptQuote error:',e);
    if(btn){btn.disabled=false;btn.textContent='Accept Quote';}
    alert('Something went wrong. Please call us at (415) 822-8547.');
  }
}

loadQuote();
