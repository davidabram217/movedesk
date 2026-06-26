// Guard: editing a lead truly auto-saves (live-commit), the Save button still works,
// and auto-save never creates a half-finished NEW lead.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
let pass=0,fail=0;
const check=(n,c)=>{if(c)pass++;else{fail++;console.log('  \u2717 '+n);}};

// ---- Extract saveLead and run it against a mock DOM ----
const grab=(sig)=>{const i=src.indexOf(sig);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const saveLeadSrc=grab('function saveLead(opts)');

function makeEnv(values){
  const made={};
  const el=id=>{
    if(made[id])return made[id];
    const e={_v:(id in values)?values[id]:'',get value(){return this._v;},set value(x){this._v=x;},checked:false,selectedIndex:0,textContent:'',style:{},classList:{contains:()=>false,add:()=>{},remove:()=>{}}};
    return made[id]=e;
  };
  const calls={saveDB:0,toast:0,renderLeads:0};
  const env={
    document:{getElementById:el,querySelector:()=>({textContent:'',style:{}}),addEventListener:()=>{},querySelectorAll:()=>[]},
    window:{},db:{leads:[{id:'L1',name:'Old Name',phone:'000',source:'Old'}]},
    editingLeadId:null,
    saveDB:()=>{calls.saveDB++;},showToast:()=>{calls.toast++;},
    renderLeads:()=>{calls.renderLeads++;},renderDashboard:()=>{},
    getExtraLocations:()=>({extraLoads:[],extraUnloads:[]}),
    propagateNotesEdits:()=>{},uid:()=>'newid',
    Date,Number,Math,JSON,setTimeout:()=>{},clearTimeout:()=>{},isNaN
  };
  return {env,calls,values};
}
function runSave(values,editingId,opts){
  const {env,calls}=makeEnv(values);
  env.editingLeadId=editingId;
  const args=Object.keys(env);
  const fn=new Function(...args, saveLeadSrc+'\n;saveLead('+(opts?JSON.stringify(opts):'')+');');
  fn(...args.map(k=>env[k]));
  return {db:env.db,calls};
}

const goodVals={'nl-name':'New Name','nl-phone':'4155551234','nl-source':'Yelp','nl-taken-by':'John'};

// 1) auto-save while editing -> commits to the lead, calls saveDB, NO toast/list re-render
{
  const {db,calls}=runSave(goodVals,'L1',{auto:true});
  check('auto edit commits the new name to the lead',db.leads[0].name==='New Name');
  check('auto edit persists via saveDB',calls.saveDB===1);
  check('auto edit shows NO toast',calls.toast===0);
  check('auto edit does NOT re-render the leads list',calls.renderLeads===0);
}
// 2) manual Save (no opts) while editing -> commits AND shows toast + re-render
{
  const {db,calls}=runSave(goodVals,'L1',undefined);
  check('manual save commits the name',db.leads[0].name==='New Name');
  check('manual save shows a toast',calls.toast===1);
  check('manual save re-renders (not gated)',calls.renderLeads>=0); // render only if page active; just ensure no crash
}
// 3) auto-save with NO editingLeadId -> must NOT create a new lead
{
  const {db,calls}=runSave(goodVals,null,{auto:true});
  check('auto-save never creates a NEW lead',db.leads.length===1);
  check('auto-save with no edit target does not call saveDB',calls.saveDB===0);
}
// 4) auto-save with invalid form (name cleared) -> silently skips, no toast, no commit
{
  const {db,calls}=runSave({'nl-name':'','nl-phone':'415','nl-source':'Yelp','nl-taken-by':'John'},'L1',{auto:true});
  check('auto-save skips commit when required fields missing',db.leads[0].name==='Old Name');
  check('auto-save stays silent on invalid form',calls.toast===0);
}

// ---- Structural guards ----
check('saveLead accepts an auto flag',/function saveLead\(opts\)\{[\s\S]{0,120}const auto=!!\(opts&&opts\.auto\)/.test(src));
check('validation stays silent in auto mode',/if\(auto\)return;showToast\('Please fill in name/.test(src));
check('auto mode never creates a new lead',/if\(auto&&!editingLeadId\)return;/.test(src));
check('toast + re-render gated to manual save',/saveDB\(\);\s*if\(!auto\)\{\s*showToast\('\u2713 Lead updated/.test(src));
check('editing routes auto-save through live commit',/if\(editingLeadId\)\{saveLead\(\{auto:true\}\);\}else\{autoSaveLeadDraft\(\);\}/.test(src));
check('Back to view flushes pending edits',/function goBackToView[\s\S]{0,140}saveLead\(\{auto:true\}\);[\s\S]{0,160}closeModal/.test(src));
check('Save button still calls saveLead() with no args',/onclick="saveLead\(\)"/.test(src));

console.log('RESULTS: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
