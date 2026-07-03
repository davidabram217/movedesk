// Guards per-day crew SEGMENTS in multi-day completion: a day can have multiple move crews
// (e.g. 5 movers to load, 4 to unload, each with its own rate) and the move pay sums correctly.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};
function grab(sig){const i=src.indexOf(sig);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

// ── Run the real _cjmdReadSegments against a mock DOM ──
eval(grab('function _cjmdReadSegments(card,prefix)'));
const mockSeg=(movers,hours,rate)=>({querySelector:sel=>{
  if(sel.indexOf('day-movers')>=0)return {value:String(movers)};
  if(sel.indexOf('day-move-hours')>=0)return {value:String(hours)};
  if(sel.indexOf('day-move-rate')>=0)return {value:String(rate)};
  return null;
}});
const mockCard=segs=>({querySelectorAll:sel=>sel.indexOf('move-seg')>=0?segs:[],querySelector:()=>null});

// 1) Two crew segments read correctly (5 movers load, 4 movers unload)
{
  const out=_cjmdReadSegments(mockCard([mockSeg(5,3,375),mockSeg(4,2,300)]),'cjmd');
  check('reads 2 segments',out.length===2);
  check('segment 1 = 5 movers, 3 hrs, $375',out[0].movers===5&&out[0].hours===3&&out[0].rate===375);
  check('segment 2 = 4 movers, 2 hrs, $300',out[1].movers===4&&out[1].hours===2&&out[1].rate===300);
  const movePay=out.reduce((a,s)=>a+s.hours*s.rate,0);
  check('move pay sums both segments = 3*375 + 2*300 = 1725',movePay===1725);
}
// 2) Fallback: a card with no segment rows yields one segment from the legacy fields
{
  const legacy={querySelectorAll:()=>[],querySelector:sel=>({value:sel.indexOf('movers')>=0?'3':sel.indexOf('hours')>=0?'4':'225'})};
  const out=_cjmdReadSegments(legacy,'cjmd');
  check('fallback yields a single segment',out.length===1&&out[0].movers===3&&out[0].hours===4&&out[0].rate===225);
}
// 3) Blank values coerce to 0 (no NaN)
{
  const out=_cjmdReadSegments(mockCard([mockSeg('', '', '')]),'cjmd');
  check('blank segment coerces to zeros',out[0].movers===0&&out[0].hours===0&&out[0].rate===0);
}

// ── Structural wiring across both flows ──
check('complete builder renders the segments block',/_cjmdMoveSegsBlock\('cjmd',i,/.test(src));
check('edit builder renders the segments block',/_cjmdMoveSegsBlock\('ecjmd',i,/.test(src));
check('complete calc sums all move segments',/querySelectorAll\('\.cjmd-day-move-hours'\)/.test(src));
check('edit calc sums all move segments',/querySelectorAll\('\.ecjmd-day-move-hours'\)/.test(src));
check('both calcs compute _movePay by pairing hours*rate',/_movePay\+=\(Number\(_el\.value\)\|\|0\)\*\(Number\(_mrEls\[_k\]/.test(src));
check('complete save collects moveSegments',/const moveSegments=_cjmdReadSegments\(card,'cjmd'\)/.test(src));
check('edit save collects moveSegments',/const moveSegments=_cjmdReadSegments\(card,'ecjmd'\)/.test(src));
check('day record stores moveSegments + movePay',/moveSegments:moveSegments,movePay:_movePayTotal/.test(src));
check('edit opener round-trips moveSegments back into the builder',/type:d\.type\|\|'Moving',moveSegments:d\.moveSegments/.test(src));
check('add + remove segment fns exist (both flows)',/function cjmdAddSegment/.test(src)&&/function ecjmdAddSegment/.test(src)&&/function cjmdRemoveSegment/.test(src)&&/function ecjmdRemoveSegment/.test(src));
check('re-render (add/remove day) preserves segments in both flows',(src.match(/moveSegments:_cjmdReadSegments\(card,'(?:cjmd|ecjmd)'\)/g)||[]).length>=2);
check('the "+ crew changed during the day" control is present',/\+ crew changed during the day/.test(src));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
