var SUPABASE_URL='https://oohqrvjhncssasjqkrzl.supabase.co';
var SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vaHFydmpobmNzc2FzanFrcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY2MzIsImV4cCI6MjA5MDM4MjYzMn0.x9N_sTjBRmSrxD-LVatV9hcpPLCuWtQh6-lIMMYfxLI';
var EJS_SERVICE='service_nakq8tb';
var EJS_NOTIFY_TEMPLATE='template_nr2plwp';
var EJS_PUBLIC_KEY='76y89yZYC-kcq82ol';

function fmtMoney(n){return'$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtDate(d){if(!d)return'--';var dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}
function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

function getPublicId(){
  var params=new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadQuote(){
  var publicId=getPublicId();
  if(!publicId){
    document.getElementById('loading').textContent='Invalid quote link. Please contact us at (415) 822-8547.';
    return;
  }
  try{
    var res=await fetch(SUPABASE_URL+'/rest/v1/quotes?select=id,data&order=created_at.desc',{
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}
    });
    if(!res.ok){
      var errText=await res.text();
      console.error('Supabase error:',res.status,errText);
      document.getElementById('loading').textContent='Unable to load quote (error '+res.status+'). Please contact us at (415) 822-8547.';
      return;
    }
    var rows=await res.json();
    console.log('Quotes loaded:',rows.length,'Looking for publicId:',publicId);
    var row=rows.find(function(r){return r.data&&r.data.publicId===publicId;});
    if(!row){
      document.getElementById('loading').textContent='Quote not found. Please contact us at (415) 822-8547.';
      return;
    }
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
    console.error('loadQuote error:',e);
    document.getElementById('loading').textContent='Error loading quote. Please contact us at (415) 822-8547.';
  }
}

function renderQuote(q){
  var isMulti=q.jobType==='multi';
  var d0=q.days&&q.days[0]||{};
  var isAccepted=q.status==='accepted';
  var html='';

  html+='<div class="quote-card">';
  html+='<div class="quote-header">';
  html+='<div class="quote-title">Move Estimate</div>';
  if(q.customerName)html+='<div class="quote-sub">Prepared for '+esc(q.customerName)+'</div>';
  html+='<div class="biz-info">CareMore Moving &amp; Storage &nbsp;&middot;&nbsp; Cal-T #0190970<br>925 Palou Ave, San Francisco, CA 94124 &nbsp;&middot;&nbsp; (415) 822-8547</div>';
  html+='</div>';

  if(q.notes){
    html+='<div class="section"><div style="font-size:14px;color:var(--text2);line-height:1.7">'+esc(q.notes)+'</div></div>';
  }

  html+='<div class="section"><div class="section-label">Move details</div>';
  if(isMulti){
    (q.days||[]).forEach(function(d,i){
      html+='<div style="margin-bottom:14px"><div style="font-weight:600;margin-bottom:6px">Day '+(i+1)+'</div><div class="grid-2">';
      if(d.date)html+='<div><div class="field-label">Date</div><div class="field-value">'+esc(fmtDate(d.date))+'</div></div>';
      if(d.arrivalStart)html+='<div><div class="field-label">Arrival</div><div class="field-value">'+esc(d.arrivalStart+(d.arrivalEnd?' - '+d.arrivalEnd:''))+'</div></div>';
      if(d.from)html+='<div><div class="field-label">Pick-up</div><div class="field-value">'+esc(d.from+(d.fromUnit?', '+d.fromUnit:''))+'</div></div>';
      if(d.to)html+='<div><div class="field-label">Drop-off</div><div class="field-value">'+esc(d.to+(d.toUnit?', '+d.toUnit:''))+'</div></div>';
      html+='</div></div>';
    });
  } else {
    html+='<div class="grid-2">';
    if(d0.date)html+='<div><div class="field-label">Move date</div><div class="field-value">'+esc(fmtDate(d0.date))+'</div></div>';
    if(d0.arrivalStart)html+='<div><div class="field-label">Arrival window</div><div class="field-value">'+esc(d0.arrivalStart+(d0.arrivalEnd?' - '+d0.arrivalEnd:''))+'</div></div>';
    var loads=d0.loads&&d0.loads.length?d0.loads:[{address:d0.from,unit:d0.fromUnit,access:d0.fromAccess}];
    loads.forEach(function(loc,i){
      if(!loc||!loc.address)return;
      html+='<div><div class="field-label">'+(i===0?'Pick-up':'Pick-up '+(i+1))+'</div><div class="field-value">'+esc(loc.address+(loc.unit?', '+loc.unit:''))+'</div>';
      if(loc.access)html+='<div style="font-size:12px;color:var(--text3)">'+esc(loc.access)+'</div>';
      html+='</div>';
    });
    var unloads=d0.unloads&&d0.unloads.length?d0.unloads:[{address:d0.to,unit:d0.toUnit,access:d0.toAccess}];
    unloads.forEach(function(loc,i){
      if(!loc||!loc.address)return;
      html+='<div><div class="field-label">'+(i===0?'Drop-off':'Drop-off '+(i+1))+'</div><div class="field-value">'+esc(loc.address+(loc.unit?', '+loc.unit:''))+'</div>';
      if(loc.access)html+='<div style="font-size:12px;color:var(--text3)">'+esc(loc.access)+'</div>';
      html+='</div>';
    });
    html+='</div>';
  }
  html+='</div>';

  html+='<div class="section"><div class="section-label">Billing</div>';
  html+='<table class="table"><thead><tr><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr></thead><tbody>';
  (q.days||[]).forEach(function(d,i){
    var label=isMulti?'Day '+(i+1)+' - '+d.crew+' Movers':d.crew+' Movers';
    var range=fmtMoney(d.hrsMin*d.rate)+' - '+fmtMoney(d.hrsMax*d.rate);
    html+='<tr><td>'+esc(label)+'</td><td>'+esc(d.hrsMin+' - '+d.hrsMax+' hrs')+'</td><td>'+fmtMoney(d.rate)+'/hr</td><td>'+esc(range)+'</td></tr>';
  });
  (q.fees||[]).filter(function(f){return f.included;}).forEach(function(f){
    var amt=f.type==='range'?fmtMoney(f.hrsMin||0)+' - '+fmtMoney(f.hrsMax||0):fmtMoney(f.amount||0);
    html+='<tr><td>'+esc(f.label||'')+'</td><td>--</td><td>--</td><td>'+esc(amt)+'</td></tr>';
  });
  html+='</tbody><tfoot><tr class="total-row"><td colspan="3">Estimated Total</td><td>'+fmtMoney(q.totalMin)+' - '+fmtMoney(q.totalMax)+'</td></tr></tfoot></table>';
  if(q.cashDiscount)html+='<div style="margin-top:10px;font-size:13px;color:var(--green)">Cash discount: '+esc(q.cashDiscount)+'</div>';
  html+='</div>';

  if(q.stipulations){
    html+='<div class="section"><div class="section-label">Terms &amp; conditions</div>';
    html+='<div style="font-size:13px;color:var(--text2);line-height:1.8;white-space:pre-wrap">'+esc(q.stipulations)+'</div>';
    html+='</div>';
  }

  if(isAccepted){
    html+='<div class="accepted-box"><div class="accepted-check">&#10003;</div>';
    html+='<div class="accepted-title">Quote accepted!</div>';
    html+='<p style="color:var(--text2);font-size:14px;margin-bottom:12px">Thank you, '+esc((q.customerName||'').split(' ')[0])+'! We have received your acceptance and we will be in touch within 2 business days to confirm what dates are available for your move.</p>';
    html+='<div style="font-size:13px;color:var(--text3)">(415) 822-8547 &nbsp;&middot;&nbsp; move@caremoremoving.com</div>';
    html+='</div>';
  } else {
    html+='<div class="accept-section">';
    html+='<div class="accept-title">Ready to move forward?</div>';
    html+='<div class="accept-sub">Click below to accept this quote. We will be in touch within 2 business days to confirm your booking. Please note: the move is not confirmed until we confirm that the date(s) are available and we send you a confirmation email.</div>';
    html+='<button class="accept-btn" id="accept-btn" onclick="acceptQuote(\''+q.id+'\',\''+q.publicId+'\')">&#10003;&nbsp; Accept Quote</button>';
    html+='</div>';
  }

  html+='<div class="contact-bar" style="margin-top:16px">Questions? Call <a href="tel:4158228547" style="color:var(--green);font-weight:500">(415) 822-8547</a> or email <a href="mailto:move@caremoremoving.com" style="color:var(--green);font-weight:500">move@caremoremoving.com</a></div>';

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
      headers:{
        'apikey':SUPABASE_KEY,
        'Authorization':'Bearer '+SUPABASE_KEY,
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body:JSON.stringify({data:updated})
    });
    try{
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload=function(){
        emailjs.init({publicKey:EJS_PUBLIC_KEY});
        var name=q.customerName||'Customer';
        var d0=q.days&&q.days[0]||{};
        var body=''+name+' has accepted their move quote.\n\n'
          +'Customer: '+name+'\n'
          +'Email: '+(q.customerEmail||'--')+'\n'
          +'Move date: '+(d0.date?fmtDate(d0.date):'--')+'\n'
          +'Quote total: '+fmtMoney(q.totalMin)+' - '+fmtMoney(q.totalMax)+'\n'
          +'Accepted: '+new Date(acceptedAt).toLocaleString()+'\n\n'
          +'Log in to MoveDesk:\nhttps://davidabram217.github.io/movedesk';
        emailjs.send(EJS_SERVICE,EJS_NOTIFY_TEMPLATE,{
          to_email:'move@caremoremoving.com',
          to_name:'CareMore Moving and Storage',
          from_name:'CareMore Moving and Storage',
          reply_to:'move@caremoremoving.com',
          subject:'Quote accepted - '+name+' ('+fmtMoney(q.totalMin)+' - '+fmtMoney(q.totalMax)+')',
          message:body,
          html_content:'<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">'+body+'</pre>'
        });
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
