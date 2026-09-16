function buildCustomerEmail(d){
  var firstName=(d.name||'').split(' ')[0]||'there';
  var body='Hi '+firstName+',\n\n';
  body+='Thanks for reaching out to CareMore Moving & Storage! We are excited and really appreciate the opportunity to potentially help you out with your upcoming move. We\'ll be in touch within 2 business days with a custom quote.\n\n';
  body+='Please note this is not a confirmation of your move.\n\n';
  body+='Here\'s a summary of what you submitted:\n\n';
  if(d.date)body+='Move date: '+d.date+'\n';
  if(d.size)body+='Home size: '+d.size+(d.sizeOther?' — '+d.sizeOther:'')+'\n';
  if(d.sqft)body+='Square footage: '+d.sqft+' sq ft\n';
  if(d.moveType)body+='Type of move: '+d.moveType+'\n';
  if(d.packing&&d.packing!=='No')body+='Packing needed: '+d.packing+'\n';
  // Haul-away (2026-08-19). Confirms back to the customer that we noted it, which is the point of
  // asking — it is also the line that prompts them to remember the other things they want gone.
  // Nothing prints when they answered no, so it stays out of every other confirmation.
  if(d.haulAway==='yes')body+='Haul away: Yes'+(d.haulAwayItems?' — '+d.haulAwayItems:'')+'\n';
  else if(d.haulAway==='maybe')body+='Haul away: You asked us to check with you\n';
  body+='\n📦 Moving from:\n'+fmtLoadLocations(d)+'\n';
  body+='\n🏠 Moving to:\n'+fmtUnloadLocations(d)+'\n';
  if(d.notes)body+='\nAdditional notes:\n'+d.notes+'\n';
  body+='\nIf anything looks off, or if you need to reach us sooner, just reply to this email or call us at (415) 822-8547.\n\n';
  body+='Sincerely,\nThe CareMore Team\n\n';
  body+='CareMore Moving & Storage\n';
  body+='(415) 822-8547 · move@caremoremoving.com\n';
  body+='[www.caremoremoving.com](https://www.caremoremoving.com)';
  return body;
}
