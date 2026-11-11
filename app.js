/* Quiz Bank app: library of quiz banks, each with quizzes, mocks, flashcards and pronunciation. */
(function(){
"use strict";
const app=document.getElementById("app");
const LETTERS=["A","B","C","D","E","F"];
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
function hash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(36)}

/* ---------- storage for imported banks (IndexedDB, with a localStorage fallback) ---------- */
const DBN="quizbank",STORE="banks";
function idb(){return new Promise((res,rej)=>{if(!("indexedDB" in window)){rej(new Error("no idb"));return}
  const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbAll(){try{const db=await idb();return await new Promise((res,rej)=>{const t=db.transaction(STORE,"readonly").objectStore(STORE).getAll();t.onsuccess=()=>res(t.result||[]);t.onerror=()=>rej(t.error)})}catch(e){return lsGet("qb-banks-fallback",[])}}
async function idbPut(b){try{const db=await idb();await new Promise((res,rej)=>{const t=db.transaction(STORE,"readwrite");t.objectStore(STORE).put(b);t.oncomplete=res;t.onerror=()=>rej(t.error)})}catch(e){const l=lsGet("qb-banks-fallback",[]).filter(x=>x.id!==b.id);l.push(b);if(!lsSet("qb-banks-fallback",l))throw new Error("This device has run out of storage for banks.")}}
async function idbDel(id){try{const db=await idb();await new Promise((res,rej)=>{const t=db.transaction(STORE,"readwrite");t.objectStore(STORE).delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}catch(e){lsSet("qb-banks-fallback",lsGet("qb-banks-fallback",[]).filter(x=>x.id!==id))}}
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}

/* ---------- bank validation ---------- */
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"bank"}
function normaliseBank(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("The file isn't a quiz bank (it should be a JSON object with a title and questions).");
  if(typeof raw.title!=="string"||!raw.title.trim())throw new Error("The bank needs a \"title\".");
  if(!Array.isArray(raw.questions)||!raw.questions.length)throw new Error("The bank needs a \"questions\" list with at least one question.");
  const b=Object.assign({},raw);
  b.id=typeof raw.id==="string"&&raw.id.trim()?slug(raw.id):slug(raw.title);
  const problems=[];const qs=[];const ids=new Set();
  raw.questions.forEach((q,n)=>{
    const where=`Question ${n+1}`;
    if(!q||typeof q.q!=="string"||!q.q.trim()){problems.push(`${where} has no question text ("q").`);return}
    if(!Array.isArray(q.o)||q.o.length<2||q.o.length>6||q.o.some(x=>typeof x!=="string"||!x.trim())){problems.push(`${where} needs 2 to 6 answer options ("o").`);return}
    let o=q.o.slice();
    if(q.a!=null){const a=+q.a;if(!(a>=0&&a<o.length)){problems.push(`${where} has an answer index ("a") that doesn't match its options.`);return}o=[o[a]].concat(o.filter((_,i)=>i!==a))}
    const ob=typeof q.ob==="string"&&q.ob.trim()?q.ob.trim():"General";
    let id=typeof q.id==="string"||typeof q.id==="number"?String(q.id):hash(ob+"|"+q.q);
    while(ids.has(id))id+="x";ids.add(id);
    qs.push({id,q:q.q,o,e:typeof q.e==="string"?q.e:"",ob,m:q.m==null?null:String(q.m),l:typeof q.l==="string"?q.l:"",s:q.s?1:0,g:q.g?1:0});
  });
  if(!qs.length)throw new Error("None of the questions could be read. "+problems.slice(0,3).join(" "));
  b.questions=qs;
  b.objectives=b.objectives&&typeof b.objectives==="object"?b.objectives:{};
  for(const q of qs)if(!(q.ob in b.objectives))b.objectives[q.ob]=q.ob;
  b.domains=b.domains&&typeof b.domains==="object"?b.domains:null;
  b.modules=b.modules&&typeof b.modules==="object"&&Object.keys(b.modules).length?b.modules:null;
  b.exams=Array.isArray(b.exams)?b.exams.filter(x=>x&&x.id!=null&&x.name):[];
  b.glossary=Array.isArray(b.glossary)?b.glossary:[];
  b.labels=Object.assign({gap:"Extra",noModule:"Other questions",noModuleSub:"not linked to a module",module:"Module"},b.labels||{});
  b._problems=problems;
  return b;
}

/* ---------- library ---------- */
let LIB=[];               // [{bank, builtin}]
let installEvt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;if(!B)library()});
async function loadLibrary(){
  const out=[];
  try{
    const idx=await (await fetch("banks/index.json",{cache:"no-cache"})).json();
    for(const f of idx.banks||[]){try{const raw=await (await fetch("banks/"+f,{cache:"no-cache"})).json();out.push({bank:normaliseBank(raw),builtin:true})}catch(e){console.warn("Built-in bank failed",f,e)}}
  }catch(e){console.warn("No built-in bank list",e)}
  for(const raw of await idbAll()){try{const b=normaliseBank(raw);const i=out.findIndex(x=>x.bank.id===b.id);if(i>=0)out[i]={bank:b,builtin:false,replaces:true};else out.push({bank:b,builtin:false})}catch(e){}}
  LIB=out;
}
function progressFor(id){const s=lsGet("qb-progress:"+id,null);if(!s||!s.stats)return null;let c=0,n=0;for(const k in s.stats){c+=s.stats[k].c;n+=s.stats[k].n}return{c,n,missed:(s.missed||[]).length}}
function library(msg){
  B=null;stopTimer();R=null;F=null;
  document.title="Quiz Bank";
  setBar("Quiz Bank",`${LIB.length} bank${LIB.length===1?"":"s"}`,prevBank?"Back":null);
  document.getElementById("bankfoot").hidden=true;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;
  const standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
  app.innerHTML=`
  <section class="hero">
    <span class="eyebrow">Your library</span>
    <h1>Pick a quiz bank</h1>
    ${prevBank?`<div class="line" style="margin-top:4px"><button class="btn main" id="backbank">Back to ${esc(prevBank.title)}</button></div>`:""}
    <p>Each bank keeps its own scores, missed questions and flashcard progress on this device. Add a new bank whenever you start a new course.</p>
  </section>
  ${msg?`<div class="notice ${msg.bad?"bad":""}" role="status">${msg.html}</div>`:""}
  <div class="rows">${LIB.map((x,i)=>{const b=x.bank,p=progressFor(b.id);const pc=p&&p.n?Math.round(100*p.c/p.n):null;
    return `<div class="row bankrow"><div class="t"><b>${esc(b.title)}</b><span class="sub">${b.questions.length} questions${b.glossary.length?` · ${b.glossary.length} key terms`:""}${b.subtitle?` · ${esc(b.subtitle)}`:""}</span>
      <span class="sub">${x.builtin?"Built in":"Imported"}${b.version?` · version ${esc(b.version)}`:""}${p&&p.n?` · ${p.n} answered`:""}</span></div>
      <div class="acts">${pctChip(pc)}${x.builtin?"":`<button class="go ghost" data-del="${i}" aria-label="Remove ${esc(b.title)}">Remove</button>`}<button class="go" data-open="${i}">Open</button></div></div>`}).join("")||'<p class="empty">No banks yet. Import one below.</p>'}</div>
  <h3 style="margin-top:28px">Add a bank</h3>
  <div class="fsetup" style="margin-top:10px">
    <p>Choose a quiz bank file (<span class="mono">.json</span>) saved on this device. If a bank with the same ID is already here, the new file replaces it and your progress is kept.</p>
    <div class="line"><label class="btn main" for="imp" tabindex="0">Import bank file</label><input type="file" id="imp" accept=".json,application/json" multiple hidden></div>
  </div>
  <h3 style="margin-top:28px">Backup</h3>
  <div class="fsetup" style="margin-top:10px">
    <p>Save your progress for every bank as a file, so you can move it to a new phone or browser.</p>
    <div class="line"><button class="btn" id="bk">Save progress backup</button><label class="btn" for="rs" tabindex="0">Restore from backup</label><input type="file" id="rs" accept=".json,application/json" hidden></div>
  </div>
  ${standalone?"":`<h3 style="margin-top:28px">Install</h3><div class="fsetup" style="margin-top:10px">${installEvt?`<p>Add Quiz Bank to your home screen so it opens like an app and works offline.</p><div class="line"><button class="btn main" id="inst">Install app</button></div>`:ios?`<p>On iPhone or iPad: tap the Share button in Safari, then <b>Add to Home Screen</b>.</p>`:`<p>On Android: open the Chrome menu (three dots) and tap <b>Add to Home screen</b> or <b>Install app</b>.</p>`}</div>`}`;
  app.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>{prevBank=null;popSub();openBank(LIB[+b.dataset.open].bank)}));
  const bb=document.getElementById("backbank");bb&&bb.addEventListener("click",backToBank);
  app.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",async()=>{
    const x=LIB[+b.dataset.del];
    if(b.dataset.sure!=="1"){b.dataset.sure="1";b.textContent="Tap again to remove";setTimeout(()=>{if(b.isConnected){b.dataset.sure="";b.textContent="Remove"}},4000);return}
    await idbDel(x.bank.id);if(prevBank&&prevBank.id===x.bank.id){prevBank=null;popSub()}await loadLibrary();library({html:`Removed <b>${esc(x.bank.title)}</b>. Its progress is still saved, so importing it again picks up where you left off.`});
  }));
  const kb=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.target.click()}};
  app.querySelectorAll("label.btn").forEach(l=>l.addEventListener("keydown",kb));
  document.getElementById("imp").addEventListener("change",async e=>{
    const files=[...e.target.files];const done=[],bad=[];
    for(const f of files){try{const raw=JSON.parse(await f.text());const b=normaliseBank(raw);const keep=Object.assign({},raw,{id:b.id});await idbPut(keep);done.push(b)}catch(err){bad.push(`${esc(f.name)}: ${esc(err.message||"couldn't read this file")}`)}}
    await loadLibrary();
    let html="";
    if(done.length)html+=`Added ${done.map(b=>`<b>${esc(b.title)}</b> (${b.questions.length} questions${b._problems.length?`, ${b._problems.length} skipped`:""})`).join(", ")}.`;
    if(bad.length)html+=`${html?"<br>":""}Couldn't import: ${bad.join("<br>")}`;
    const skipped=done.flatMap(b=>b._problems.slice(0,5));
    if(skipped.length)html+=`<br><span class="muted">Skipped: ${skipped.map(esc).join(" ")}</span>`;
    library({html,bad:!done.length});
  });
  document.getElementById("bk").addEventListener("click",()=>{
    const data={app:"quizbank",saved:new Date().toISOString(),progress:{}};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith("qb-progress:"))data.progress[k.slice(12)]=lsGet(k,null)}
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"}));a.download=`quizbank-progress-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  });
  document.getElementById("rs").addEventListener("change",async e=>{
    try{const d=JSON.parse(await e.target.files[0].text());if(d.app!=="quizbank"||!d.progress)throw new Error();let n=0;for(const id in d.progress){if(d.progress[id]&&d.progress[id].stats){lsSet("qb-progress:"+id,d.progress[id]);n++}}library({html:`Restored progress for ${n} bank${n===1?"":"s"}.`})}
    catch(err){library({html:"That file isn't a Quiz Bank progress backup.",bad:true})}
  });
  const inst=document.getElementById("inst");inst&&inst.addEventListener("click",async()=>{try{installEvt.prompt();await installEvt.userChoice}catch(e){}installEvt=null;library()});
}
function setBar(title,meta,btn){
  document.getElementById("brand").textContent=title;
  document.getElementById("barmeta").textContent=meta;
  const lb=document.getElementById("libbtn");lb.hidden=!btn;if(btn)lb.textContent=btn;
}
let prevBank=null;
function toLibrary(){if(B){prevBank=B;pushSub()}lsSet("qb-last",null);library()}
function backToBank(){const b=prevBank;if(!b)return;prevBank=null;popSub();openBank(b)}
document.getElementById("libbtn").addEventListener("click",()=>{if(B)toLibrary();else backToBank()});

/* ---------- phone back button / gesture ---------- */
let ignorePop=false;
try{history.replaceState({v:"root"},"")}catch(e){}
function pushSub(){try{if(!history.state||history.state.v!=="sub")history.pushState({v:"sub"},"")}catch(e){}}
function popSub(){if(ignorePop)return;try{if(history.state&&history.state.v==="sub"){ignorePop=true;history.back()}}catch(e){}}
window.addEventListener("popstate",()=>{
  if(ignorePop){ignorePop=false;return}
  if(R&&!R.done&&R.mode==="exam"&&R.items.some(x=>x.pick!==null)){
    if(!confirm("Leave this quiz? It won't be marked.")){pushSub();return}
  }
  if(R||F){if(B)home();return}
  if(!B&&prevBank){const b=prevBank;prevBank=null;openBank(b)}
});

/* ---------- per-bank state ---------- */
let B=null,Q=[],OBJ={},DOM=null,MODS=null,G=[],byOb={},objKeys=[],S=null,KEY="",settings={},fset={};
const objTitle=ob=>{const v=OBJ[ob];return v&&typeof v==="object"?v.title:v||ob};
const domKey=ob=>{const v=OBJ[ob];if(v&&typeof v==="object"&&v.domain)return v.domain;const m=/^(\S+) (\d+)\./.exec(ob);return m?m[1]+"-"+m[2]:"_"};
const obLabel=ob=>(B.codePrefix||"")+ob;
const domTitle=k=>{const d=DOM&&DOM[k];return d?`${d.code?d.code+" ":""}${d.name}`:k};
function load(){const s=lsGet(KEY,null);if(s&&s.stats)return Object.assign({missed:[],best:{},settings:{},known:[]},s);return{stats:{},missed:[],best:{},settings:{},known:[]}}
function save(){lsSet(KEY,S)}
function saveSettings(){S.settings=settings;save()}
function pctClass(p){return p==null?"":p>=80?"good":p>=60?"mid":"low"}
function accFor(filter){let c=0,n=0;for(const ob in S.stats){if(filter(ob)){c+=S.stats[ob].c;n+=S.stats[ob].n}}return n?Math.round(100*c/n):null}
function pctChip(p){return p==null?'<span class="pct">not tried</span>':`<span class="pct ${pctClass(p)}" title="Your accuracy across all attempts">${p}%</span>`}
function poolFilter(list){return settings.scenario?list.filter(q=>q.s):list}
const modKeys=()=>MODS?Object.keys(MODS).sort((a,b)=>(+a-+b)||a.localeCompare(b)):[];
const modName=m=>m==null||m==="0"||!MODS||!(m in MODS)?B.labels.noModule:`${B.labels.module} ${m}: ${MODS[m]}`;
function natCmp(a,b){const pa=a.split(/[ .\-]/),pb=b.split(/[ .\-]/);for(let i=0;i<Math.max(pa.length,pb.length);i++){const x=pa[i]||"",y=pb[i]||"";const nx=+x,ny=+y;if(!isNaN(nx)&&!isNaN(ny)&&x!==""&&y!==""){if(nx!==ny)return nx-ny}else if(x!==y)return x.localeCompare(y)}return 0}

function openBank(bank){
  B=bank;Q=B.questions;OBJ=B.objectives;DOM=B.domains;MODS=B.modules;
  KEY="qb-progress:"+B.id;S=load();
  settings=Object.assign({mode:"study",count:20,scenario:false},S.settings||{});
  fset=Object.assign({deck:"all",front:"term",learning:false},S.fset||{});
  byOb={};for(const q of Q)(byOb[q.ob]=byOb[q.ob]||[]).push(q);
  objKeys=Object.keys(OBJ).filter(o=>byOb[o]||!B.domains||true).sort(natCmp);
  G=B.glossary.map((r,i)=>Array.isArray(r)?{i,t:r[0],x:r[1]||"",p:r[2]||"",s:r[3]||"",d:r[4]||"",m:r[5]==null?null:String(r[5]),ob:r[6]||""}:{i,t:r.term,x:r.stands||"",p:r.sayAs||"",s:r.speak||"",d:r.meaning||"",m:r.module==null?null:String(r.module),ob:r.objective||""}).filter(g=>g.t);
  homeTab=lsGet("qb-tab:"+B.id,"")||(DOM?"domain":MODS?"module":"objective");
  lsSet("qb-last",B.id);
  document.title=B.title;
  home();
}

/* ---------- bank home ---------- */
let homeTab="domain";
function tabs(){const t=[];if(DOM)t.push(["domain","Exam domains"]);if(MODS)t.push(["module","Course modules"]);t.push(["objective","Objectives"]);if(G.length){t.push(["flash","Flashcards"]);t.push(["say","Pronunciation"])}if(B.coverage)t.push(["coverage","Coverage check"]);return t}
function examsWithDomains(){return B.exams.filter(ex=>DOM&&Object.values(DOM).some(d=>String(d.exam)===String(ex.id)))}
function home(){
  stopTimer();R=null;F=null;
  setBar(B.title,`${Q.length} questions`,"All banks");
  popSub();
  const bf=document.getElementById("bankfoot");bf.textContent=B.footer||"";bf.hidden=!B.footer;
  const missed=S.missed.filter(id=>Q.some(q=>q.id===id)).length;
  const scen=Q.filter(q=>q.s).length;
  const tl=tabs();if(!tl.some(t=>t[0]===homeTab))homeTab=tl[0][0];
  const mocks=examsWithDomains();
  app.innerHTML=`
  <section class="hero">
    ${B.subtitle?`<span class="eyebrow">${esc(B.subtitle)}</span>`:""}
    <h1>${esc(B.title)}</h1>
    <p>${Q.length} questions${scen?`, ${scen} of them scenario questions`:""}. ${B.description?esc(B.description)+" ":""}Every answer comes with an explanation${G.length?`, and there are flashcards and a pronunciation guide for ${G.length} key terms`:""}.</p>
  </section>
  <div class="quick">
    ${mocks.map(ex=>`<button class="qbtn primary" data-act="mock" data-exam="${esc(ex.id)}"><strong>Mock exam ${esc(ex.name)}</strong><span>${+ex.questions||90} questions weighted like the real exam${ex.minutes?`, ${+ex.minutes} minutes`:""}</span></button>`).join("")}
    <button class="qbtn" data-act="random"><strong>Quick ${settings.count==="all"?"mixed":settings.count}</strong><span>Random mix from everything</span></button>
    <button class="qbtn" data-act="missed" ${missed?"":"disabled"}><strong>Retry missed${missed?` (${missed})`:""}</strong><span>${missed?"Questions you've got wrong and not yet put right":"Wrong answers will collect here"}</span></button>
  </div>
  <div class="settings" role="group" aria-label="Quiz settings">
    <span class="lbl">Feedback</span>
    <span class="seg" id="seg-mode"><button data-mode="study" aria-pressed="${settings.mode==="study"}">After each question</button><button data-mode="exam" aria-pressed="${settings.mode==="exam"}">At the end</button></span>
    <span class="lbl">Length</span>
    <span class="seg" id="seg-count">${[10,20,40,"all"].map(n=>`<button data-count="${n}" aria-pressed="${settings.count==n}">${n==="all"?"All":n}</button>`).join("")}</span>
    ${scen?`<label><input type="checkbox" id="scen" ${settings.scenario?"checked":""}> Scenario questions only</label>`:""}
  </div>
  <div class="tabs" role="tablist">${tl.map(([k,t])=>`<button role="tab" data-tab="${k}" aria-selected="${homeTab===k}">${t}</button>`).join("")}</div>
  <section id="tabbody"></section>`;
  renderTab();
  app.querySelectorAll("[data-act]").forEach(b=>b.addEventListener("click",()=>{
    const a=b.dataset.act;
    if(a==="mock")startMock(b.dataset.exam);
    if(a==="random")start(Q,"Random mix");
    if(a==="missed")start(Q.filter(q=>S.missed.includes(q.id)),"Retry missed",{all:true});
  }));
  app.querySelectorAll("#seg-mode button").forEach(b=>b.addEventListener("click",()=>{settings.mode=b.dataset.mode;saveSettings();home()}));
  app.querySelectorAll("#seg-count button").forEach(b=>b.addEventListener("click",()=>{settings.count=b.dataset.count==="all"?"all":+b.dataset.count;saveSettings();home()}));
  const sc=document.getElementById("scen");sc&&sc.addEventListener("change",e=>{settings.scenario=e.target.checked;saveSettings();renderTab()});
  app.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{homeTab=b.dataset.tab;lsSet("qb-tab:"+B.id,homeTab);app.querySelectorAll("[data-tab]").forEach(x=>x.setAttribute("aria-selected",x===b));renderTab()}));
}
function renderTab(){
  const el=document.getElementById("tabbody");
  if(homeTab==="domain")el.innerHTML=domainTab();
  if(homeTab==="module")el.innerHTML=moduleTab();
  if(homeTab==="objective")el.innerHTML=objectiveTab();
  if(homeTab==="coverage")el.innerHTML=coverageTab();
  if(homeTab==="flash"){el.innerHTML=flashTab();wireFlashTab(el)}
  if(homeTab==="say"){el.innerHTML=sayTab();wireSayTab(el)}
  el.querySelectorAll("[data-start]").forEach(b=>b.addEventListener("click",()=>{
    const i=b.dataset.start.indexOf("|"),kind=b.dataset.start.slice(0,i),val=b.dataset.start.slice(i+1);let list,name;
    if(kind==="dom"){list=Q.filter(q=>domKey(q.ob)===val);name=domTitle(val)}
    if(kind==="mod"){list=Q.filter(q=>val==="_none"?!(MODS&&q.m in MODS):q.m===val);name=val==="_none"?B.labels.noModule:modName(val)}
    if(kind==="ob"){list=byOb[val]||[];name=`${obLabel(val)} ${objTitle(val)}`}
    start(list,name);
  }));
}
function countLabel(list){const n=poolFilter(list).length;return `${n} question${n===1?"":"s"}${settings.scenario?" (scenario)":""}`}
function domainRows(keys){return keys.map(k=>{const d=DOM[k];const list=Q.filter(q=>domKey(q.ob)===k);
  return `<div class="row"><div class="t"><b>${esc(domTitle(k))}</b><span class="sub">${countLabel(list)}${d.weight?` · <span class="weight">${+d.weight}% of the exam</span>`:""}</span></div><div class="acts">${pctChip(accFor(ob=>domKey(ob)===k))}<button class="go" data-start="dom|${esc(k)}" ${poolFilter(list).length?"":"disabled"}>Start</button></div></div>`}).join("")}
function domainTab(){
  const keys=Object.keys(DOM).sort(natCmp);let h="";const used=new Set();
  for(const ex of B.exams){const ks=keys.filter(k=>String(DOM[k].exam)===String(ex.id));if(!ks.length)continue;ks.forEach(k=>used.add(k));
    h+=`<div class="examhead"><h2>${esc(ex.name)}</h2>${ks.some(k=>DOM[k].weight)?'<span class="weight">weighting on the real exam</span>':""}</div><div class="rows">${domainRows(ks)}</div>`}
  const rest=keys.filter(k=>!used.has(k));
  if(rest.length)h+=`${h?'<div class="examhead"><h2>Other</h2></div>':""}<div class="rows">${domainRows(rest)}</div>`;
  return h;
}
function moduleTab(){
  let h=`<div class="rows">`;
  for(const m of modKeys()){const list=Q.filter(q=>q.m===m);if(!list.length)continue;const lessons=[...new Set(list.map(q=>q.l).filter(Boolean))];
    h+=`<div class="row"><div class="t"><b>${esc(modName(m))}</b><span class="sub">${lessons.length?`${lessons.length} lessons · `:""}${countLabel(list)}</span></div><div class="acts"><button class="go" data-start="mod|${esc(m)}" ${poolFilter(list).length?"":"disabled"}>Start</button></div></div>`}
  const other=Q.filter(q=>!(q.m in MODS));
  if(other.length)h+=`<div class="row"><div class="t"><b>${esc(B.labels.noModule)}</b><span class="sub">${countLabel(other)} ${esc(B.labels.noModuleSub)}</span></div><div class="acts"><span class="tag gap">${esc(B.labels.gap)}</span><button class="go" data-start="mod|_none" ${poolFilter(other).length?"":"disabled"}>Start</button></div></div>`;
  return h+`</div>`;
}
function objRows(obs){return obs.map(o=>{const list=byOb[o]||[];const n=poolFilter(list).length;const st=S.stats[o];const p=st&&st.n?Math.round(100*st.c/st.n):null;const v=OBJ[o];const code=v&&typeof v==="object"&&v.code?v.code:o.split(" ").slice(-1)[0];
  return `<div class="orow"><span class="code">${esc(code)}</span><span class="ot">${esc(objTitle(o))}</span><span class="acts">${pctChip(p)}<button class="go ghost" data-start="ob|${esc(o)}" ${n?"":"disabled"}>${n} Q</button></span></div>`}).join("")}
function objectiveTab(){
  let h=`<p class="muted" style="margin-bottom:14px">Drill one objective at a time. Percentages show your accuracy so far.</p><div class="rows">`;
  if(DOM){const keys=Object.keys(DOM).sort(natCmp);
    for(const k of keys){const obs=objKeys.filter(o=>domKey(o)===k);if(!obs.length)continue;const d=DOM[k];const ex=B.exams.find(e=>String(e.id)===String(d.exam));
      h+=`<details class="obj"><summary><span>${ex?esc(ex.name)+" · ":""}${esc(domTitle(k))}</span></summary><div class="inner">${objRows(obs)}</div></details>`}
    const loose=objKeys.filter(o=>!DOM[domKey(o)]);if(loose.length)h+=`<details class="obj"><summary><span>Other</span></summary><div class="inner">${objRows(loose)}</div></details>`;
  }else h+=`<div class="obj" style="padding:4px 0">${objRows(objKeys)}</div>`;
  return h+`</div>`;
}
function coverageTab(){
  const c=B.coverage;let h=`<div class="note">${c.title?`<h3>${esc(c.title)}</h3>`:""}${c.intro?`<p>${esc(c.intro)}</p>`:""}`;
  if(c.table&&Array.isArray(c.table.rows))h+=`<div class="tablewrap"><table><thead><tr>${(c.table.head||[]).map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${c.table.rows.map(r=>`<tr>${r.map((x,i)=>`<td class="${i?"mono":""}">${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if(Array.isArray(c.watch)&&c.watch.length)h+=`${c.watchTitle?`<p>${esc(c.watchTitle)}</p>`:""}<ul>${c.watch.map(w=>`<li><b>${esc(w[0])}</b> ${esc(w[1])}</li>`).join("")}</ul>`;
  h+=`</div><div class="tablewrap"><table><thead><tr><th>Objective</th><th>Title</th><th>Your notes</th><th>Qs</th></tr></thead><tbody>`;
  const ST=c.status||{};
  for(const o of objKeys){const list=byOb[o]||[];const s=ST[o];let status,detail;
    if(s&&s[0]==="none"){status='<span class="status none">Not covered</span>';detail=s[1]}
    else if(s&&s[0]==="thin"){status='<span class="status thin">Thin</span>';detail=s[1]}
    else{status='<span class="status ok">Covered</span>';detail=s?s[1]:[...new Set(list.filter(q=>!q.g).map(q=>q.l).filter(Boolean))].join(", ")}
    h+=`<tr><td class="mono">${esc(obLabel(o))}</td><td>${esc(objTitle(o))}</td><td>${status}<div class="muted" style="font-size:.84rem;margin-top:3px">${esc(detail)}</div></td><td class="n">${list.length}</td></tr>`}
  return h+`</tbody></table></div>`;
}

/* ---------- glossary: flashcards + pronunciation ---------- */
const baseTerm=t=>t.replace(/\s*\(.*\)\s*/,"");
function sayText(g){return g.s||baseTerm(g.t).replace(/[^A-Za-z0-9]/g,"").split("").join(" ")}
function howHtml(g){return g.p?`<span class="kind word">Say it as</span> <span class="resp">${esc(g.p)}</span>`:`<span class="kind letters">Say the letters</span> <span class="resp">${esc(baseTerm(g.t).replace(/[^A-Za-z0-9]/g,"").split("").join("-"))}</span>`}
const canSpeak=(()=>{try{return "speechSynthesis" in window&&typeof SpeechSynthesisUtterance!=="undefined"}catch(e){return false}})();
let gbVoice=null;
function pickVoice(){try{const v=speechSynthesis.getVoices();gbVoice=v.find(x=>/en-GB/i.test(x.lang))||v.find(x=>/^en/i.test(x.lang))||null}catch(e){}}
if(canSpeak){pickVoice();try{speechSynthesis.onvoiceschanged=pickVoice}catch(e){}}
function speak(text){if(!canSpeak)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);if(gbVoice)u.voice=gbVoice;u.lang=gbVoice?gbVoice.lang:"en-GB";u.rate=.9;speechSynthesis.speak(u)}catch(e){}}
const SPK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
function spkBtn(g){return canSpeak?`<button class="speak" data-speak="${g.i}" aria-label="Hear ${esc(baseTerm(g.t))}" title="Hear it">${SPK}</button>`:""}
function wireSpeak(root){root.querySelectorAll("[data-speak]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();const g=G.find(x=>x.i===+b.dataset.speak);g&&speak(sayText(g))}))}
function deckList(){let l=G;if(fset.deck!=="all")l=l.filter(g=>fset.deck==="_none"?!(MODS&&g.m in MODS):g.m===fset.deck);if(fset.learning)l=l.filter(g=>!S.known.includes(g.t));return l}
function deckOptions(sel){
  let h=`<option value="all" ${sel==="all"?"selected":""}>All terms (${G.length})</option>`;
  if(MODS){for(const m of modKeys()){const n=G.filter(g=>g.m===m).length;if(n)h+=`<option value="${esc(m)}" ${sel===m?"selected":""}>${esc(modName(m))} (${n})</option>`}
    const o=G.filter(g=>!(g.m in MODS)).length;if(o)h+=`<option value="_none" ${sel==="_none"?"selected":""}>${esc(B.labels.noModule)} (${o})</option>`}
  return h}
function flashTab(){
  const known=S.known.filter(t=>G.some(g=>g.t===t)).length;
  return `<div class="fsetup">
    <p>${G.length} key terms and acronyms. Flip each card, then mark it <b>Got it</b> or <b>Still learning</b>. You know ${known} of ${G.length} so far.</p>
    ${MODS?`<div class="line"><label for="fdeck" class="lbl">Deck</label><select id="fdeck">${deckOptions(fset.deck)}</select></div>`:""}
    <div class="line"><span class="lbl">Front of card</span><span class="seg" id="ffront"><button data-front="term" aria-pressed="${fset.front==="term"}">Acronym or term</button><button data-front="def" aria-pressed="${fset.front==="def"}">Meaning</button></span>
      <label><input type="checkbox" id="flearn" ${fset.learning?"checked":""}> Only cards I'm still learning</label></div>
    <div class="line"><button class="btn main" id="fstart">Start flashcards</button><span class="muted" id="fcount"></span>${known?'<button class="btn" id="freset">Reset progress</button>':""}</div>
  </div>`;
}
function wireFlashTab(el){
  const upd=()=>{const n=deckList().length;el.querySelector("#fcount").textContent=`${n} card${n===1?"":"s"} in this deck`;el.querySelector("#fstart").disabled=!n};
  const sv=()=>{S.fset=fset;save();upd()};
  const fd=el.querySelector("#fdeck");fd&&fd.addEventListener("change",e=>{fset.deck=e.target.value;sv()});
  el.querySelectorAll("#ffront button").forEach(b=>b.addEventListener("click",()=>{fset.front=b.dataset.front;el.querySelectorAll("#ffront button").forEach(x=>x.setAttribute("aria-pressed",x===b));sv()}));
  el.querySelector("#flearn").addEventListener("change",e=>{fset.learning=e.target.checked;sv()});
  el.querySelector("#fstart").addEventListener("click",()=>startFlash(deckList()));
  const r=el.querySelector("#freset");r&&r.addEventListener("click",()=>{S.known=[];save();renderTab()});
  upd();
}
let F=null;
function startFlash(list){pushSub();stopTimer();R=null;F={cards:shuffle(list),i:0,back:false,got:0,learn:[]};renderFlash()}
function renderFlash(){
  if(F.i>=F.cards.length){flashDone();return}
  const g=F.cards[F.i],n=F.cards.length,termFront=fset.front==="term";
  const showTerm=termFront!==F.back;
  const front=showTerm
    ?`<div class="face"><div class="term">${esc(baseTerm(g.t))}</div>${F.back?"":'<p class="muted">What does it stand for, and what is it?</p>'}</div>`
    :`<div class="face"><p class="def">${esc(g.d)}</p><p class="muted">Which term is this?</p></div>`;
  const back=`<div class="face">
      <div class="term" style="font-size:1.6rem">${esc(baseTerm(g.t))}</div>
      ${g.x?`<div class="exp">${esc(g.x)}</div>`:""}
      <div class="say">${howHtml(g)} ${spkBtn(g)}</div>
      <p class="def">${esc(g.d)}</p>
      <div class="chips" style="justify-content:center">${g.ob?`<span class="tag">${esc(obLabel(g.ob))}</span>`:""}${MODS?(g.m in MODS?`<span class="tag">${esc(B.labels.module)} ${esc(g.m)}</span>`:`<span class="tag gap">${esc(B.labels.gap)}</span>`):""}</div>
    </div>`;
  app.innerHTML=`
  <div class="qtop"><h2>Flashcards</h2><span class="count">Card ${F.i+1} of ${n} · ${F.got} got it</span></div>
  <div class="progress" aria-hidden="true"><i style="width:${100*F.i/n}%"></i></div>
  <div class="flip ${F.back?"back":""}" id="card" role="button" tabindex="0" aria-label="${F.back?"Card answer":"Card question. Press to flip"}">
    <span class="side">${F.back?"Answer":"Tap or press Space to flip"}</span>
    ${F.back?back:front}
  </div>
  <div class="fnav">${F.back?`<button class="btn learn" id="flearnbtn">Still learning</button><button class="btn good" id="fgot">Got it</button>`:`<button class="btn main" id="fflip">Show answer</button>`}</div>
  <div class="fnav"><button class="btn" id="fquit">End session</button></div>
  <p class="hint" style="text-align:center;margin-top:10px">Keys: Space to flip, 1 for still learning, 2 for got it${canSpeak?", S to hear it":""}.</p>`;
  const c=document.getElementById("card");
  c.addEventListener("click",flip);
  c.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();flip()}});
  wireSpeak(app);
  const g2=id=>document.getElementById(id);
  g2("fflip")&&g2("fflip").addEventListener("click",flip);
  g2("fgot")&&g2("fgot").addEventListener("click",()=>mark(true));
  g2("flearnbtn")&&g2("flearnbtn").addEventListener("click",()=>mark(false));
  g2("fquit").addEventListener("click",flashDone);
}
function flip(){F.back=!F.back;renderFlash()}
function mark(ok){
  const g=F.cards[F.i],k=S.known.indexOf(g.t);
  if(ok){F.got++;if(k<0)S.known.push(g.t)}else{F.learn.push(g);if(k>=0)S.known.splice(k,1)}
  save();F.i++;F.back=false;renderFlash();
}
function flashDone(){
  const seen=F.got+F.learn.length;
  if(!seen){F=null;homeTab="flash";home();return}
  app.innerHTML=`
  <div class="qtop"><h2>Flashcards: session done</h2></div>
  <section class="score"><div class="big">${F.got}<small>/${seen}</small></div><div class="t"><b>${F.got} got it · ${F.learn.length} still learning</b><p class="muted">${F.learn.length?"Go round again with the ones you're still learning until the pile is empty.":"Every card in this session marked as known."}</p></div></section>
  <div class="actions">${F.learn.length?`<button class="btn main" id="fagain">Go again with ${F.learn.length} still learning</button>`:""}<button class="btn" id="fmenu">Back to flashcards</button></div>
  ${F.learn.length?`<h3>Still learning</h3><div class="plist" style="margin-top:10px">${F.learn.map(g=>`<div class="prow"><span class="pt">${esc(baseTerm(g.t))}</span><span class="pm"><span class="x">${esc(g.x)}</span><span class="muted" style="font-size:.88rem">${esc(g.d)}</span></span>${spkBtn(g)}</div>`).join("")}</div>`:""}`;
  wireSpeak(app);
  const again=document.getElementById("fagain"),learn=F.learn.slice();
  again&&again.addEventListener("click",()=>startFlash(learn));
  document.getElementById("fmenu").addEventListener("click",()=>{F=null;homeTab="flash";home()});
  window.scrollTo({top:0});
}
let sayQ="",sayDeck="all";
function sayTab(){
  return `<div class="fsetup">
    <p>How people say each acronym out loud. Some are said as a word, others letter by letter. ${canSpeak?"Press the speaker to hear it in your device's voice.":"Your browser doesn't offer speech here, so use the written guide."}</p>
    <div class="line"><input type="search" id="sq" placeholder="Search terms" value="${esc(sayQ)}" aria-label="Search terms">${MODS?`<select id="sdeck" aria-label="Module">${deckOptions(sayDeck)}</select>`:""}</div>
    <div class="line"><span class="kind word">Say it as</span><span class="muted" style="font-size:.88rem">said as a word</span><span class="kind letters">Say the letters</span><span class="muted" style="font-size:.88rem">spelled out letter by letter</span></div>
  </div><div id="slist"></div>`;
}
function wireSayTab(el){
  const draw=()=>{
    const q=sayQ.trim().toLowerCase();
    let l=G.filter(g=>(sayDeck==="all"||(sayDeck==="_none"?!(MODS&&g.m in MODS):g.m===sayDeck))&&(!q||g.t.toLowerCase().includes(q)||g.x.toLowerCase().includes(q)));
    l=l.slice().sort((a,b)=>{const w=x=>x.p?0:1;return w(a)-w(b)||baseTerm(a.t).replace(/^\./,"").localeCompare(baseTerm(b.t).replace(/^\./,""),"en",{sensitivity:"base"})});
    const box=el.querySelector("#slist");
    box.innerHTML=l.length?`<p class="muted" style="margin:0 0 8px;font-size:.88rem">${l.length} term${l.length===1?"":"s"}, words first, then letters</p><div class="plist">${l.map(g=>`<div class="prow"><span class="pt">${esc(baseTerm(g.t))}</span><span class="pm"><span class="x">${esc(g.x)}</span><span class="how">${howHtml(g)}</span></span>${spkBtn(g)}</div>`).join("")}</div>`:'<p class="empty">No terms match that search.</p>';
    wireSpeak(box);
  };
  el.querySelector("#sq").addEventListener("input",e=>{sayQ=e.target.value;draw()});
  const sd=el.querySelector("#sdeck");sd&&sd.addEventListener("change",e=>{sayDeck=e.target.value;draw()});
  draw();
}

/* ---------- quiz engine ---------- */
let R=null,timerId=null;
function stopTimer(){if(timerId){clearInterval(timerId);timerId=null}}
function makeItems(list){return list.map(q=>({q,order:shuffle(q.o.map((_,i)=>i)),pick:null,checked:false,flag:false}))}
function start(list,name,opt){
  opt=opt||{};F=null;
  let pool=poolFilter(list);if(!pool.length)pool=list;
  if(!pool.length)return;
  pool=shuffle(pool);
  if(!opt.all&&settings.count!=="all")pool=pool.slice(0,settings.count);
  pushSub();
  R={name,mode:opt.mode||settings.mode,items:makeItems(pool),i:0,mock:null,deadline:null};
  render();
}
function startMock(exId){
  const ex=B.exams.find(e=>String(e.id)===String(exId));if(!ex)return;
  const total=+ex.questions||90,ex2=new Set(ex.exclude||[]);
  const ks=Object.keys(DOM).filter(k=>String(DOM[k].exam)===String(ex.id)).sort(natCmp);
  const wsum=ks.reduce((a,k)=>a+(+DOM[k].weight||0),0)||ks.length;
  const raw=ks.map(k=>total*((+DOM[k].weight||(wsum===ks.length?1:0))/wsum)),cnt=raw.map(Math.floor);
  let rem=total-cnt.reduce((a,b)=>a+b,0);
  raw.map((v,i)=>[v-Math.floor(v),i]).sort((a,b)=>b[0]-a[0]).forEach(([,i])=>{if(rem>0){cnt[i]++;rem--}});
  let pool=[];ks.forEach((k,i)=>{pool=pool.concat(shuffle(Q.filter(q=>domKey(q.ob)===k&&!ex2.has(q.ob))).slice(0,cnt[i]))});
  if(pool.length<total){const have=new Set(pool.map(q=>q.id));pool=pool.concat(shuffle(Q.filter(q=>ks.includes(domKey(q.ob))&&!ex2.has(q.ob)&&!have.has(q.id))).slice(0,total-pool.length))}
  if(!pool.length)return;
  pushSub();
  R={name:`Mock exam ${ex.name}`,mode:"exam",items:makeItems(shuffle(pool)),i:0,mock:ex,deadline:ex.minutes?Date.now()+(+ex.minutes)*60000:null};
  if(R.deadline)timerId=setInterval(tick,1000);
  render();
}
function tick(){
  const el=document.getElementById("timer");if(!R||!R.deadline){stopTimer();return}
  const left=Math.max(0,R.deadline-Date.now());
  if(el){const m=Math.floor(left/60000),s=Math.floor(left%60000/1000);el.textContent=`${m}:${String(s).padStart(2,"0")} left`;el.classList.toggle("low",left<5*60000)}
  if(left<=0){stopTimer();finish(true)}
}
function render(){
  const it=R.items[R.i],q=it.q,n=R.items.length,study=R.mode==="study";
  const answered=R.items.filter(x=>x.pick!==null).length;
  const chips=[`<span class="tag">${esc(obLabel(q.ob))}</span>`];
  if(q.l)chips.push(`<span class="tag">${esc(q.l)}</span>`);
  if(q.s)chips.push('<span class="tag sc">Scenario</span>');
  if(q.g)chips.push(`<span class="tag gap">${esc(B.labels.gap)}</span>`);
  let fb="";
  if(study&&it.checked){const ok=it.pick===0;fb=`<div class="feedback ${ok?"ok":"bad"}"><b>${ok?"Correct":"Not quite"}</b><p>${ok?"":`The answer is <strong>${esc(q.o[0])}</strong>. `}${esc(q.e)}</p></div>`}
  const opts=it.order.map((oi,pos)=>{
    let cls="",pressed=it.pick===oi;
    if(study&&it.checked){if(oi===0)cls="right";else if(pressed)cls="wrong"}
    return `<button class="opt ${cls}" data-oi="${oi}" aria-pressed="${pressed&&!(study&&it.checked)}" ${study&&it.checked?"disabled":""}><span class="k">${LETTERS[pos]}</span><span>${esc(q.o[oi])}</span></button>`}).join("");
  const last=R.i===n-1;
  const nav=study
    ?`<div class="qnav"><button class="btn" id="quit">End quiz</button><div class="r">${it.checked?`<button class="btn main" id="next">${last?"See results":"Next question"}</button>`:`<button class="btn main" id="check" ${it.pick===null?"disabled":""}>Check answer</button>`}</div></div>`
    :`<div class="qnav"><button class="btn" id="quit">End and mark</button><button class="btn flag" id="flag" aria-pressed="${it.flag}">${it.flag?"Flagged":"Flag for review"}</button><div class="r"><button class="btn" id="prev" ${R.i===0?"disabled":""}>Back</button><button class="btn main" id="next">${last?"Finish":"Next"}</button></div></div>`;
  app.innerHTML=`
  <div class="qtop"><h2>${esc(R.name)}</h2><span class="count">${R.deadline?`<span class="timer" id="timer"></span> `:""}Question ${R.i+1} of ${n}</span></div>
  <div class="progress" aria-hidden="true"><i style="width:${100*(study?R.items.filter(x=>x.checked).length:answered)/n}%"></i></div>
  <article class="card">
    <div class="chips">${chips.join("")}</div>
    <p class="qtext">${esc(q.q)}</p>
    <div class="opts" role="group" aria-label="Answers">${opts}</div>
    ${fb}
    ${nav}
    <p class="hint">Keys: 1 to ${q.o.length} or A to ${LETTERS[q.o.length-1]} to choose, Enter to ${study?"check and continue":"go to the next question"}.</p>
  </article>
  ${study?"":`<div class="dots" aria-label="Jump to question">${R.items.map((x,j)=>`<button data-j="${j}" class="${x.pick!==null?"done":""} ${x.flag?"flagged":""} ${j===R.i?"cur":""}" aria-label="Question ${j+1}${x.flag?", flagged":""}">${j+1}</button>`).join("")}</div>`}`;
  if(R.deadline)tick();
  app.querySelectorAll(".opt").forEach(b=>b.addEventListener("click",()=>choose(+b.dataset.oi)));
  const g=id=>document.getElementById(id);
  g("quit")&&g("quit").addEventListener("click",()=>finish(false));
  g("check")&&g("check").addEventListener("click",check);
  g("next")&&g("next").addEventListener("click",next);
  g("prev")&&g("prev").addEventListener("click",()=>{R.i--;render()});
  g("flag")&&g("flag").addEventListener("click",()=>{it.flag=!it.flag;render()});
  app.querySelectorAll(".dots button").forEach(b=>b.addEventListener("click",()=>{R.i=+b.dataset.j;render()}));
}
function choose(oi){const it=R.items[R.i];if(R.mode==="study"&&it.checked)return;it.pick=oi;render()}
function check(){const it=R.items[R.i];if(it.pick===null)return;it.checked=true;record(it);render();const f=app.querySelector(".feedback");f&&f.scrollIntoView({block:"nearest",behavior:"smooth"})}
function next(){
  const it=R.items[R.i];
  if(R.mode==="study"&&!it.checked){check();return}
  if(R.i<R.items.length-1){R.i++;render();window.scrollTo({top:0})}else finish(false);
}
function record(it){
  const ob=it.q.ob,ok=it.pick===0;
  const st=S.stats[ob]||(S.stats[ob]={c:0,n:0});st.n++;if(ok)st.c++;
  const idx=S.missed.indexOf(it.q.id);
  if(!ok&&idx<0)S.missed.push(it.q.id);
  if(ok&&idx>=0)S.missed.splice(idx,1);
  save();
}
function finish(timeUp){
  stopTimer();
  if(R.mode==="exam")R.items.forEach(it=>{if(!it.checked){it.checked=true;if(it.pick!==null)record(it)}});
  const done=R.items.filter(it=>R.mode==="study"?it.checked:true);
  if(!done.length){home();return}
  results(done,timeUp);
}

/* ---------- results ---------- */
function barRows(groups){
  return groups.map(g=>{const p=Math.round(100*g.c/g.n);const col=p>=80?"var(--ok)":p>=60?"var(--warn)":"var(--bad)";
    return `<div class="brow"><div class="nm">${g.label}</div><div class="track"><i style="width:${Math.max(p,2)}%;background:${col}"></i></div><div class="v">${g.c}/${g.n} · ${p}%</div></div>`}).join("");
}
function results(done,timeUp){
  R.done=true;
  const right=done.filter(it=>it.pick===0).length,total=done.length,pct=Math.round(100*right/total);
  const unanswered=done.filter(it=>it.pick===null).length;
  const keyName=R.mock?`mock${R.mock.id}`:R.name;
  const prevBest=S.best[keyName];S.best[keyName]=Math.max(prevBest||0,pct);save();
  const dg={},og={};
  for(const it of done){const ok=it.pick===0?1:0;
    if(DOM){const dk=domKey(it.q.ob);(dg[dk]=dg[dk]||{k:dk,c:0,n:0,label:esc(domTitle(dk))});dg[dk].c+=ok;dg[dk].n++}
    (og[it.q.ob]=og[it.q.ob]||{c:0,n:0,label:`<span class="mono">${esc(it.q.ob)}</span> ${esc(objTitle(it.q.ob))}`});og[it.q.ob].c+=ok;og[it.q.ob].n++}
  const dlist=Object.values(dg).sort((a,b)=>natCmp(a.k,b.k));
  const olist=Object.values(og).sort((a,b)=>a.c/a.n-b.c/b.n||b.n-a.n);
  const weakest=olist.filter(o=>o.c<o.n).slice(0,8);
  const wrong=done.filter(it=>it.pick!==0);
  const verdict=R.mock&&R.mock.note?esc(R.mock.note):pct>=80?"Strong. Move on to another area or try a mock exam.":pct>=60?"Getting there. Review the explanations below and retry the ones you missed.":"This area needs more work. Re-read your notes for the weakest objectives below, then retry.";
  app.innerHTML=`
  <div class="qtop"><h2>${esc(R.name)}: results</h2>${timeUp?'<span class="tag gap">Time ran out</span>':""}</div>
  <section class="score">
    <div class="big">${pct}<small>%</small></div>
    <div class="t"><b>${right} of ${total} correct${unanswered?` · ${unanswered} unanswered`:""}${prevBest!=null&&pct>prevBest?" · new best":""}</b><p class="muted">${verdict}</p></div>
  </section>
  <div class="actions">
    ${wrong.length?`<button class="btn main" id="retry">Retry the ${wrong.length} you missed</button>`:""}
    <button class="btn" id="again">Same topic, new questions</button>
    <button class="btn" id="menu">Back to menu</button>
  </div>
  ${dlist.length?`<h3>By exam domain</h3><div class="bars">${barRows(dlist)}</div>`:""}
  ${weakest.length?`<h3>Weakest objectives this round</h3><div class="bars">${barRows(weakest)}</div>`:""}
  <div class="examhead"><h3>Review</h3><span class="seg" id="rf"><button data-f="wrong" aria-pressed="true">Wrong only</button><button data-f="all" aria-pressed="false">All</button></span></div>
  <div class="review" id="review"></div>`;
  const rv=document.getElementById("review");
  function drawReview(f){
    const items=f==="all"?done:wrong;
    rv.innerHTML=items.length?items.map(it=>{const q=it.q,ok=it.pick===0;
      return `<div class="ritem ${ok?"ok":"bad"}"><div class="chips"><span class="tag">${esc(obLabel(q.ob))}</span>${q.g?`<span class="tag gap">${esc(B.labels.gap)}</span>`:""}</div><b>${esc(q.q)}</b>
      <div class="ans">${ok?`<span class="c">${esc(q.o[0])}</span>`:`${it.pick===null?'<span class="y">Not answered</span>':`Your answer: <span class="y">${esc(q.o[it.pick])}</span>`}<br>Correct: <span class="c">${esc(q.o[0])}</span>`}</div>
      ${q.e?`<p class="exp">${esc(q.e)}</p>`:""}</div>`}).join(""):'<p class="empty">Nothing wrong this round. Nice work.</p>';
  }
  drawReview("wrong");
  app.querySelectorAll("#rf button").forEach(b=>b.addEventListener("click",()=>{app.querySelectorAll("#rf button").forEach(x=>x.setAttribute("aria-pressed",x===b));drawReview(b.dataset.f)}));
  const name=R.name,mock=R.mock,base=done.map(it=>it.q);
  document.getElementById("menu").addEventListener("click",home);
  document.getElementById("again").addEventListener("click",()=>{
    if(mock){startMock(mock.id);return}
    if(name==="Random mix"||name==="Retry missed"){start(Q,"Random mix");return}
    const obs=new Set(base.map(q=>q.ob)),mods=new Set(base.map(q=>q.m));
    start(Q.filter(q=>obs.has(q.ob)&&(mods.size>1||mods.has(q.m))),name)});
  const rb=document.getElementById("retry");
  rb&&rb.addEventListener("click",()=>start(wrong.map(it=>it.q),"Retry: "+name.replace(/^Retry: /,""),{all:true,mode:"study"}));
  window.scrollTo({top:0});
}

/* ---------- keyboard ---------- */
document.addEventListener("keydown",e=>{
  if(F&&document.getElementById("card")){
    if(e.target&&(e.target.tagName==="INPUT"||e.target.tagName==="SELECT"))return;
    if(e.key===" "){e.preventDefault();flip();return}
    if(F.back&&e.key==="1"){mark(false);return}
    if(F.back&&e.key==="2"){mark(true);return}
    if(e.key.toLowerCase()==="s"&&canSpeak){speak(sayText(F.cards[F.i]));return}
    return;
  }
  if(!R||!document.querySelector(".opt"))return;
  if(e.target&&(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"))return;
  const k=e.key.toUpperCase();let pos=-1;
  if(/^[1-6]$/.test(k))pos=+k-1;
  if(LETTERS.includes(k))pos=LETTERS.indexOf(k);
  if(pos>=0){const b=document.querySelectorAll(".opt")[pos];if(b&&!b.disabled){e.preventDefault();choose(+b.dataset.oi)}}
  if(e.key==="Enter"&&!(e.target&&(e.target.tagName==="BUTTON"||e.target.tagName==="LABEL"))){e.preventDefault();next()}
});

/* ---------- offline + updates ---------- */
if("serviceWorker" in navigator&&location.protocol!=="file:"){
  navigator.serviceWorker.register("sw.js").then(reg=>{
    reg.addEventListener("updatefound",()=>{const w=reg.installing;w&&w.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller)showUpdate()})});
  }).catch(()=>{});
}
function showUpdate(){const t=document.getElementById("toast");t.hidden=false;t.innerHTML=`An update is ready. <button class="btn main" id="reload">Reload</button>`;document.getElementById("reload").addEventListener("click",()=>location.reload())}

/* ---------- start ---------- */
(async()=>{
  app.innerHTML='<p class="empty">Loading your banks…</p>';
  await loadLibrary();
  const last=lsGet("qb-last",null);const hit=LIB.find(x=>x.bank.id===last);
  if(hit)openBank(hit.bank);else if(LIB.length===1)openBank(LIB[0].bank);else library();
})();
})();
