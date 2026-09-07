(function(){
  // Rebuilds db.aiTraining from db.completedJobs.
  // Every field a training record holds was copied from the completed job at completion time,
  // so the corpus can be reconstructed rather than re-entered. Fields that came from the
  // ORIGINAL QUOTE (quotedMin/Max, quotedHours) are recovered from the linked quote where one
  // still exists, and left null where it does not — a null is honest, a guess would poison the
  // regression this data exists to train.
  const jobs = db.completedJobs || [];
  if (!jobs.length) return 'no completed jobs to rebuild from';

  const existing = new Set((db.aiTraining || []).map(r => r.completedJobId));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const num = v => { const n = Number(v); return isFinite(n) && v !== '' && v != null ? n : null; };

  let added = 0, skipped = 0, noHours = 0;

  jobs.forEach(cj => {
    if (existing.has(cj.id)) { skipped++; return; }

    // A record with no hours teaches the model nothing and skews averages — leave it out.
    const days = Array.isArray(cj.days) ? cj.days : [];
    const mh = days.length ? days.reduce((a,d)=>a+(Number(d.moveHours)||0),0) : (num(cj.hours) || 0);
    const ph = days.length ? days.reduce((a,d)=>a+(Number(d.packHours)||0),0) : (num(cj.packHoursActual) || 0);
    if (!mh && !ph) { noHours++; return; }

    const q = (db.quotes || []).find(x => x.leadId === cj.leadId && (x.status==='accepted'||x.status==='sent')) || null;
    const d0 = q && q.days && q.days[0] ? q.days[0] : null;

    db.aiTraining.push({
      id: uid(),
      completedJobId: cj.id,
      bookedJobId: cj.bookedJobId || null,
      date: cj.date || '',
      name: cj.name || '',
      size: cj.size || '',
      sqft: num(cj.sqft),
      packing: cj.packing || '',
      moveType: cj.moveType || '',
      from: cj.from || '', fromZip: cj.fromZip || '',
      to: cj.to || '',     toZip: cj.toZip || '',
      accessLoad: cj.accessLoad || '', accessUnload: cj.accessUnload || '',
      quotedMin: q ? num(q.totalMin) : null,
      quotedMax: q ? num(q.totalMax) : null,
      quotedHoursMin: d0 ? num(d0.hrsMin) : null,
      quotedHoursMax: d0 ? num(d0.hrsMax) : null,
      quotedRate: num(cj.quotedRate) || (d0 ? num(d0.rate) : null),
      quotedCrew: d0 ? num(d0.crew) : null,
      actualHours: mh,
      moveMen: num(cj.moveMen),
      splitCrew: !!cj.splitCrew,
      moveSegments: cj.moveSegments || null,
      packHoursActual: ph || null,
      packMen: num(cj.packMen),
      feePackMaterials: num(cj.feePackMaterials),
      actualVaults: num(cj.vaults),
      actualRate: num(cj.hourlyRateCharged),
      cashRate: num(cj.cashRate),
      paidCashRate: !!cj.paidCashRate,
      actualTotal: num(cj.actualTotal),
      capDiscount: num(cj.capDiscount) || 0,
      realValue: (num(cj.capDiscount) > 0 && num(cj.actualTotal)) ? num(cj.actualTotal) : num(cj.total),
      actualLabour: num(cj.feeLabour),
      actualFuel: num(cj.feeFuel),
      actualMaterials: num(cj.feeMaterials),
      miscChargesAI: cj.miscCharges || null,
      miscChargesAITotal: num(cj.miscTotal) || 0,
      savedAt: cj.completedAt || cj.date || new Date().toISOString().split('T')[0],
      _rebuilt: true            // marks these as reconstructed, not captured at completion
    });
    added++;
  });

  saveDB();
  return 'rebuilt ' + added + ' training records  |  skipped ' + skipped +
         ' already present  |  ' + noHours + ' had no hours recorded and were left out  |  total now ' +
         (db.aiTraining || []).length;
})()
