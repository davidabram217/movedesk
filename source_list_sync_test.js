// Guard: the multi-day completion source dropdowns match the current full source list
const fs=require('fs');
const file=process.argv[2]||'index.html';
const script=fs.readFileSync(file,'utf8');
let pass=0,fail=0;
const check=(name,cond)=>{if(cond){pass++;}else{fail++;console.log('  \u2717 '+name);}};

function opts(id){
  const m=script.match(new RegExp('<select id="'+id+'"[^>]*>(.*?)</select>'));
  if(!m)return null;
  return (m[1].match(/<option[^>]*>([^<]*)<\/option>/g)||[])
    .map(o=>o.replace(/<[^>]*>/g,'').trim())
    .filter(t=>t&&t!=='\u2014'&&!/^select/i.test(t)); // drop placeholders
}

const canonical=opts('nl-source');
check('nl-source (canonical) found',!!canonical&&canonical.length>=18);

['cjmd-source','ecjmd-source'].forEach(id=>{
  const o=opts(id);
  check(id+' found',!!o);
  if(o&&canonical){
    check(id+' matches the full current list exactly',JSON.stringify(o)===JSON.stringify(canonical));
    check(id+' includes new entries (Realtor, Pack Attack, Unknown)',o.includes('Realtor')&&o.includes('Pack Attack')&&o.includes('Unknown'));
    check(id+' no longer lists the stale "Thumbtack"',!o.includes('Thumbtack'));
  }
});

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
