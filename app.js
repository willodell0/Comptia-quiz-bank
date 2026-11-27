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
  const lt=b.labTips&&typeof b.labTips==="object"?b.labTips:null;
  b.labTips=lt?{title:typeof lt.title==="string"?lt.title:"Tips",intro:typeof lt.intro==="string"?lt.intro:"",tips:(Array.isArray(lt.tips)?lt.tips:[]).filter(t=>Array.isArray(t)&&typeof t[0]==="string").map(t=>[t[0],typeof t[1]==="string"?t[1]:""])}:null;
  b.labs=(Array.isArray(b.labs)?b.labs:[]).filter(x=>x&&typeof x.title==="string"&&x.title.trim()).map((x,i)=>({code:String(x.code||i+1),title:x.title,ob:typeof x.ob==="string"?x.ob:"",summary:typeof x.summary==="string"?x.summary:"",
    steps:Array.isArray(x.steps)?x.steps.filter(y=>typeof y==="string"):[],commands:Array.isArray(x.commands)?x.commands.filter(y=>typeof y==="string"):[],
    needs:Array.isArray(x.needs)?x.needs.filter(y=>typeof y==="string"):[],files:Array.isArray(x.files)?x.files.filter(y=>typeof y==="string"):[],
    shots:Array.isArray(x.shots)?x.shots.filter(y=>typeof y==="string"):[],tier:["top","good","skip"].includes(x.tier)?x.tier:"",
    link:typeof x.link==="string"&&/^https:\/\//i.test(x.link)?x.link:"",group:typeof x.group==="string"?x.group:""}));
  const str=v=>typeof v==="string"?v:"";const pids=new Set();
  b.practice=(Array.isArray(raw.practice)?raw.practice:[]).filter(d=>d&&typeof d.title==="string"&&d.title.trim()&&["subnet","match","exhibit","order"].includes(d.type)).map((d,i)=>{
    let id=slug(d.id||d.title);while(pids.has(id))id+="x";pids.add(id);
    const o={id,type:d.type,title:d.title,intro:str(d.intro),ob:str(d.ob)};
    if(d.type==="match"){o.cols=Array.isArray(d.cols)&&d.cols.length===2?d.cols.map(String):["Item","Answer"];o.both=!!d.both;o.round=Math.max(3,Math.min(10,+d.round||6));
      o.pairs=(Array.isArray(d.pairs)?d.pairs:[]).filter(x=>Array.isArray(x)&&typeof x[0]==="string"&&typeof x[1]==="string"&&x[0].trim()&&x[1].trim()).map(x=>[x[0],x[1]]);if(o.pairs.length<3)return null}
    if(d.type==="exhibit"){o.items=(Array.isArray(d.items)?d.items:[]).filter(x=>x&&typeof x.q==="string"&&Array.isArray(x.o)&&x.o.length>=2&&x.o.length<=6&&x.o.every(y=>typeof y==="string"&&y.trim())).map(x=>({x:str(x.x),q:x.q,o:x.o.slice(),e:str(x.e)}));if(!o.items.length)return null}
    if(d.type==="order"){o.sets=(Array.isArray(d.sets)?d.sets:[]).filter(x=>x&&Array.isArray(x.items)&&x.items.length>=3&&x.items.length<=12&&x.items.every(y=>typeof y==="string"&&y.trim())&&new Set(x.items).size===x.items.length).map(x=>({title:str(x.title)||o.title,intro:str(x.intro),items:x.items.slice(),e:str(x.e)}));if(!o.sets.length)return null}
    return o}).filter(Boolean);
  b.labsIntro=typeof raw.labsIntro==="string"?raw.labsIntro:"";
  const rg=raw.guide;b.guide=rg&&typeof rg.md==="string"&&rg.md.trim()?{title:typeof rg.title==="string"?rg.title:"Study guide",md:rg.md.slice(0,600000),
    keywords:(Array.isArray(rg.keywords)?rg.keywords:[]).filter(k=>k&&typeof k.term==="string"&&k.term.trim()&&typeof k.meaning==="string").map(k=>({term:k.term,stands:typeof k.stands==="string"?k.stands:"",meaning:k.meaning,ob:typeof k.ob==="string"?k.ob:""}))}:null;
  b.labels=Object.assign({gap:"Extra",noModule:"Other questions",noModuleSub:"not linked to a module",module:"Module"},b.labels||{});
  b._problems=problems;
  return b;
}

/* saving a file: hosted on Claude it goes through Claude's download prompt, otherwise a normal download */
let claudeDownloads=null;
try{if(window.claude&&typeof window.claude.use==="function")window.claude.use("downloads").then(d=>{claudeDownloads=d}).catch(()=>{})}catch(e){}
function saveFile(name,text){
  if(claudeDownloads){claudeDownloads.save({filename:name,data:text}).catch(err=>{if(err&&err.code!=="declined")library({html:"The backup couldn't be saved here. Try again in a moment.",bad:true})});return}
  if(window.QB_EMBEDDED&&window.claude){library({html:"Saving files isn't available in this view. Open the page in the Claude app or website and try again.",bad:true});return}
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
/* ---------- library ---------- */
let LIB=[];               // [{bank, builtin}]
let installEvt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;if(!B)library()});
async function loadLibrary(){
  const out=[];
  if(Array.isArray(window.QB_EMBEDDED)){for(const raw of window.QB_EMBEDDED){try{out.push({bank:normaliseBank(raw),builtin:true})}catch(e){}}}
  else try{
    const idx=await (await fetch("banks/index.json",{cache:"no-cache"})).json();
    for(const f of idx.banks||[]){try{const raw=await (await fetch("banks/"+f,{cache:"no-cache"})).json();out.push({bank:normaliseBank(raw),builtin:true})}catch(e){console.warn("Built-in bank failed",f,e)}}
  }catch(e){console.warn("No built-in bank list",e)}
  for(const raw of await idbAll()){try{const b=normaliseBank(raw);const i=out.findIndex(x=>x.bank.id===b.id);if(i>=0)out[i]={bank:b,builtin:false,replaces:true};else out.push({bank:b,builtin:false})}catch(e){}}
  LIB=out;
}
function progressFor(id){const s=lsGet("qb-progress:"+id,null);if(!s||!s.stats)return null;let c=0,n=0;for(const k in s.stats){c+=s.stats[k].c;n+=s.stats[k].n}return{c,n,missed:(s.missed||[]).length}}
function library(msg){
  ttsStop();B=null;stopTimer();R=null;F=null;
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
  ${standalone||window.QB_EMBEDDED?"":`<h3 style="margin-top:28px">Install</h3><div class="fsetup" style="margin-top:10px">${installEvt?`<p>Add Quiz Bank to your home screen so it opens like an app and works offline.</p><div class="line"><button class="btn main" id="inst">Install app</button></div>`:ios?`<p>On iPhone or iPad: tap the Share button in Safari, then <b>Add to Home Screen</b>.</p>`:`<p>On Android: open the Chrome menu (three dots) and tap <b>Add to Home screen</b> or <b>Install app</b>.</p>`}</div>`}`;
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
    saveFile(`quizbank-progress-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data));
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
  if(R&&!R.done&&R.mode==="exam"&&!window.QB_EMBEDDED&&R.items.some(x=>x.pick!==null)){
    if(!confirm("Leave this quiz? It won't be marked.")){pushSub();return}
  }
  if(R||F||P){if(B)home();return}
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
function tabs(){const t=[];if(DOM)t.push(["domain","Exam domains"]);if(MODS)t.push(["module","Course modules"]);t.push(["objective","Objectives"]);if(B.guide)t.push(["guide","Study guide"]);if(B.practice.length)t.push(["practice","Practice"]);t.push(["progress","Progress"]);if(G.length){t.push(["flash","Flashcards"]);t.push(["say","Pronunciation"])}if(B.labs.length)t.push(["labs","Labs"]);if(B.coverage)t.push(["coverage","Coverage check"]);return t}
function examsWithDomains(){return B.exams.filter(ex=>DOM&&Object.values(DOM).some(d=>String(d.exam)===String(ex.id)))}
function home(){
  stopTimer();R=null;F=null;logDrill();P=null;ttsStop();
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
  <label class="tabsel"><span class="lbl">Show</span><select id="tabsel" aria-label="Choose a section">${tl.map(([k,t])=>`<option value="${k}" ${homeTab===k?"selected":""}>${t}</option>`).join("")}</select></label>
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
  const setTab=k=>{homeTab=k;lsSet("qb-tab:"+B.id,homeTab);app.querySelectorAll("[data-tab]").forEach(x=>x.setAttribute("aria-selected",x.dataset.tab===k));const ts=document.getElementById("tabsel");if(ts)ts.value=k;renderTab()};
  app.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
  document.getElementById("tabsel").addEventListener("change",e=>setTab(e.target.value));
}
function renderTab(){
  ttsStop();
  const el=document.getElementById("tabbody");
  if(homeTab==="domain")el.innerHTML=domainTab();
  if(homeTab==="module")el.innerHTML=moduleTab();
  if(homeTab==="objective")el.innerHTML=objectiveTab();
  if(homeTab==="coverage")el.innerHTML=coverageTab();
  if(homeTab==="progress"){el.innerHTML=progressTab();wireProgress(el)}
  if(homeTab==="labs"){el.innerHTML=labsTab();wireLabs(el)}
  if(homeTab==="practice"){el.innerHTML=practiceTab();wirePractice(el)}
  if(homeTab==="guide"){el.innerHTML=guideTab();wireGuide(el)}
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
/* ---------- progress tracking ---------- */
const dayKey=(d)=>{d=d||new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const fmtDay=k=>{const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("en-GB",{day:"numeric",month:"short"})};
function today(){S.days=S.days||{};const k=dayKey();return S.days[k]||(S.days[k]={c:0,n:0,f:0,ob:{}})}
function logAnswer(ob,ok){const t=today();t.n++;if(ok)t.c++;const o=t.ob[ob]||(t.ob[ob]=[0,0]);if(ok)o[0]++;o[1]++}
function logSession(x){S.sessions=S.sessions||[];S.sessions.push(Object.assign({t:Date.now()},x));if(S.sessions.length>500)S.sessions=S.sessions.slice(-500);save()}
function lastDays(n){const out=[];const d=new Date();d.setHours(12,0,0,0);for(let i=n-1;i>=0;i--){const x=new Date(d);x.setDate(d.getDate()-i);out.push(dayKey(x))}return out}
function streak(){const days=S.days||{};const act=k=>days[k]&&(days[k].n||days[k].f);let d=new Date();d.setHours(12);if(!act(dayKey(d)))d.setDate(d.getDate()-1);let s=0;while(act(dayKey(d))){s++;d.setDate(d.getDate()-1)}return s}
function groupOf(ob){return DOM?domKey(ob):ob}
function groupName(g){return DOM?domTitle(g):`${obLabel(g)} ${objTitle(g)}`}
function groupSeries(g){ // daily accuracy for one group, on days it was practised
  const days=Object.keys(S.days||{}).sort();const pts=[];
  for(const k of days){let c=0,n=0;for(const ob in S.days[k].ob){if(groupOf(ob)===g){c+=S.days[k].ob[ob][0];n+=S.days[k].ob[ob][1]}}if(n)pts.push({k,c,n,p:Math.round(100*c/n)})}
  return pts}
function spark(pts,label,empty){
  if(!pts.length)return `<span class="muted spk-empty">${esc(empty||"No daily data yet")}</span>`;
  const w=120,h=34,pad=5,n=pts.length;
  const x=i=>n===1?w/2:pad+i*(w-2*pad)/(n-1),y=p=>h-pad-(p/100)*(h-2*pad);
  const line=pts.map((p,i)=>`${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(" ");
  const last=pts[n-1];
  return `<svg class="spk" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}: daily accuracy ${pts.map(p=>p.p+"%").join(", ")}">
    <line x1="${pad}" x2="${w-pad}" y1="${y(80).toFixed(1)}" y2="${y(80).toFixed(1)}" class="ref"/>
    ${n>1?`<polyline points="${line}" class="ln"/>`:""}
    ${pts.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.p).toFixed(1)}" r="${i===n-1?4:2.5}" class="${i===n-1?"dot last":"dot"}" data-tip="${esc(fmtDay(p.k))}: ${p.c} of ${p.n} correct (${p.p}%)"/>`).join("")}
  </svg>`}
function trendText(pts){
  if(pts.length<2)return "";
  const cut=dayKey(new Date(Date.now()-6*864e5));
  const rec=pts.filter(p=>p.k>=cut),old=pts.filter(p=>p.k<cut);
  const acc=a=>{const c=a.reduce((s,p)=>s+p.c,0),n=a.reduce((s,p)=>s+p.n,0);return n?100*c/n:null};
  let a=acc(rec),b=acc(old);
  if(a==null||b==null){a=pts[pts.length-1].p;b=pts[pts.length-2].p}
  const d=Math.round(a-b);
  if(Math.abs(d)<3)return '<span class="trend flat">steady</span>';
  return d>0?`<span class="trend up">up ${d} points</span>`:`<span class="trend down">down ${-d} points</span>`}
function progressTab(){
  let N=0,C=0;for(const ob in S.stats){N+=S.stats[ob].n;C+=S.stats[ob].c}
  const days=S.days||{};const active=Object.keys(days).filter(k=>days[k].n||days[k].f);
  const sess=S.sessions||[];const mocks=sess.filter(s=>s.mock!=null);
  const cards=Object.values(days).reduce((a,d)=>a+(d.f||0),0);
  const tdy=days[dayKey()]||{n:0,c:0,f:0};
  const tiles=[
    ["Questions answered",N.toLocaleString("en-GB"),tdy.n?`${tdy.n} today`:"none yet today"],
    ["Overall accuracy",N?Math.round(100*C/N)+"%":"–",N?`${C.toLocaleString("en-GB")} correct`:"answer some questions"],
    ["Study streak",`${streak()} day${streak()===1?"":"s"}`,`${active.length} day${active.length===1?"":"s"} studied in total`],
    ["Mock exams",String(mocks.length),cards?`${cards} flashcards reviewed`:"timed, weighted like the real exam"]];
  if(B.labs.length){const done=B.labs.filter(l=>(S.labsDone||[]).includes(l.code)).length;tiles.push(["Labs done",`${done} of ${B.labs.length}`,done===B.labs.length?"all labs ticked off":"tick labs off in the Labs tab"])}
  if(B.practice.length){let pc=0,pn=0,pr=0;for(const k in (S.practice||{})){if(k==="_set")continue;pc+=S.practice[k].c;pn+=S.practice[k].n;pr+=S.practice[k].runs||0}tiles.push(["Practice drills",pn?Math.round(100*pc/pn)+"%":"–",pn?`${pn} answered in ${pr} session${pr===1?"":"s"}`:"try the Practice tab"])}
  let h=`<div class="tiles">${tiles.map(t=>`<div class="tile"><span class="tl">${t[0]}</span><span class="tv">${esc(t[1])}</span><span class="ts">${esc(t[2])}</span></div>`).join("")}</div>`;
  if(N&&!active.length)h+=`<p class="notice">Your earlier answers are counted in the totals. Daily charts start from today, as the app didn't record dates before this update.</p>`;
  // daily activity
  const span=lastDays(30);const max=Math.max(1,...span.map(k=>(days[k]&&days[k].n)||0));
  const nice=max<=10?10:max<=20?20:max<=50?50:Math.ceil(max/50)*50;
  h+=`<div class="pcard"><div class="phead"><h3>Questions per day</h3><span class="muted">last 30 days</span></div>
    <div class="dchart" role="img" aria-label="Questions answered per day over the last 30 days. ${span.filter(k=>days[k]&&days[k].n).map(k=>`${fmtDay(k)}: ${days[k].n}`).join(", ")||"No questions yet"}">
      <span class="ymax">${nice}</span>
      <div class="cols">${span.map(k=>{const d=days[k];const n=d?d.n:0;const p=n?Math.round(100*d.c/n):null;
        return `<div class="col" data-tip="${esc(fmtDay(k))}: ${n} question${n===1?"":"s"}${p!=null?`, ${p}% correct`:""}${d&&d.f?`, ${d.f} flashcards`:""}">${n?`<i style="height:${Math.max(3,100*n/nice)}%"></i>`:""}</div>`}).join("")}</div>
      <div class="xax"><span>${esc(fmtDay(span[0]))}</span><span>${esc(fmtDay(span[15]))}</span><span>Today</span></div>
    </div>
    <details class="tview"><summary>Show as a table</summary><div class="tablewrap"><table><thead><tr><th>Day</th><th>Questions</th><th>Correct</th><th>Flashcards</th></tr></thead><tbody>${active.slice().sort().reverse().map(k=>`<tr><td>${esc(fmtDay(k))}</td><td class="n">${days[k].n}</td><td class="n">${days[k].n?Math.round(100*days[k].c/days[k].n)+"%":"–"}</td><td class="n">${days[k].f||0}</td></tr>`).join("")||'<tr><td colspan="4">Nothing recorded yet.</td></tr>'}</tbody></table></div></details></div>`;
  // by domain / objective
  const groups=DOM?Object.keys(DOM).sort(natCmp):objKeys.filter(o=>byOb[o]);
  const rows=groups.map(g=>{let c=0,n=0;for(const ob in S.stats)if(groupOf(ob)===g){c+=S.stats[ob].c;n+=S.stats[ob].n}
    const total=DOM?Q.filter(q=>domKey(q.ob)===g).length:(byOb[g]||[]).length;return{g,c,n,p:n?Math.round(100*c/n):null,total,pts:groupSeries(g)}}).filter(r=>r.total);
  const sortBy=lsGet("qb-psort:"+B.id,"weak");
  const sorted=sortBy==="weak"?rows.slice().sort((a,b)=>(a.p==null)-(b.p==null)||(a.p-b.p)||natCmp(a.g,b.g)):rows;
  h+=`<div class="pcard"><div class="phead"><h3>${DOM?"By exam domain":"By objective"}</h3><span class="seg" id="psort"><button data-s="weak" aria-pressed="${sortBy==="weak"}">Weakest first</button><button data-s="order" aria-pressed="${sortBy!=="weak"}">Exam order</button></span></div>
    <p class="muted small">The line shows your accuracy on each day you practised that area. The faint line marks 80%.</p>
    <div class="prows">${sorted.map(r=>`<div class="prow2"><div class="pt2"><b>${esc(groupName(r.g))}</b><span class="sub">${DOM&&DOM[r.g]&&B.exams.find(e=>String(e.id)===String(DOM[r.g].exam))?esc(B.exams.find(e=>String(e.id)===String(DOM[r.g].exam)).name)+" · ":""}${r.n?`${r.n} answered`:"not tried yet"} · ${r.total} in the bank ${trendText(r.pts)}</span></div>
      <div class="pviz">${spark(r.pts,groupName(r.g))}</div><div class="acts">${pctChip(r.p)}<button class="go" data-start="${DOM?"dom":"ob"}|${esc(r.g)}">Practise</button></div></div>`).join("")}</div></div>`;
  // focus next
  const weak=Object.keys(S.stats).filter(ob=>byOb[ob]&&S.stats[ob].n>=3).map(ob=>({ob,p:Math.round(100*S.stats[ob].c/S.stats[ob].n),n:S.stats[ob].n})).filter(x=>x.p<80).sort((a,b)=>a.p-b.p||b.n-a.n).slice(0,6);
  h+=`<div class="pcard"><div class="phead"><h3>Focus next</h3><span class="muted">objectives under 80%, tried 3+ times</span></div>
    ${weak.length?`<div class="prows">${weak.map(x=>`<div class="orow"><span class="code">${esc(obLabel(x.ob))}</span><span class="ot">${esc(objTitle(x.ob))}<span class="sub"> · ${x.n} answered</span></span><span class="acts">${pctChip(x.p)}<button class="go ghost" data-start="ob|${esc(x.ob)}">Practise</button></span></div>`).join("")}</div>`:`<p class="empty">${N?"Nothing under 80% with enough attempts yet. Keep going.":"Answer a few questions and your weakest objectives will show up here."}</p>`}</div>`;
  // mocks
  if(examsWithDomains().length){
    h+=`<div class="pcard"><div class="phead"><h3>Mock exam scores</h3><span class="muted">faint line marks 80%</span></div>`;
    for(const ex of examsWithDomains()){const m=mocks.filter(s=>String(s.mock)===String(ex.id));
      const pts=m.slice(-12).map(s=>({k:dayKey(new Date(s.t)),c:s.c,n:s.n,p:Math.round(100*s.c/s.n)}));
      h+=`<div class="prow2"><div class="pt2"><b>${esc(ex.name)}</b><span class="sub">${m.length?`${m.length} taken · best ${Math.max(...m.map(s=>Math.round(100*s.c/s.n)))}% · last ${pts[pts.length-1].p}%`:"not taken yet"}</span></div><div class="pviz">${spark(pts,ex.name+" mock scores","No mocks taken yet")}</div><div class="acts"><button class="go" data-act2="mock" data-exam="${esc(ex.id)}">Take mock</button></div></div>`}
    h+=`</div>`}
  // recent sessions
  const recent=sess.slice(-8).reverse();
  if(recent.length)h+=`<div class="pcard"><div class="phead"><h3>Recent sessions</h3></div><div class="tablewrap"><table><thead><tr><th>When</th><th>Session</th><th>Score</th></tr></thead><tbody>${recent.map(s=>`<tr><td>${esc(new Date(s.t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))}</td><td>${esc(s.name)}</td><td class="n">${s.kind==="flash"?`${s.c}/${s.n} known`:`${s.c}/${s.n} · ${Math.round(100*s.c/s.n)}%`}</td></tr>`).join("")}</tbody></table></div></div>`;
  return h;
}
function wireProgress(el){
  el.querySelectorAll("#psort button").forEach(b=>b.addEventListener("click",()=>{lsSet("qb-psort:"+B.id,b.dataset.s);renderTab()}));
  el.querySelectorAll("[data-act2=mock]").forEach(b=>b.addEventListener("click",()=>startMock(b.dataset.exam)));
}
/* tooltip for charts: hover on desktop, tap on phones */
const tip=document.createElement("div");tip.id="tip";tip.hidden=true;document.body.appendChild(tip);
function showTip(t,e){tip.textContent=t.dataset.tip;tip.hidden=false;const r=t.getBoundingClientRect();const tw=tip.offsetWidth;let x=r.left+r.width/2-tw/2;x=Math.max(8,Math.min(x,innerWidth-tw-8));tip.style.left=x+"px";tip.style.top=(r.top+scrollY-tip.offsetHeight-8)+"px"}
document.addEventListener("pointerover",e=>{const t=e.target.closest&&e.target.closest("[data-tip]");if(t&&e.pointerType==="mouse")showTip(t,e)});
document.addEventListener("pointerout",e=>{if(e.pointerType==="mouse"&&e.target.closest&&e.target.closest("[data-tip]"))tip.hidden=true});
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-tip]");if(t)showTip(t,e);else tip.hidden=true});
addEventListener("scroll",()=>{tip.hidden=true},{passive:true});


/* ---------- labs ---------- */
function labsTab(){
  const done=new Set(S.labsDone||[]);const n=B.labs.filter(l=>done.has(l.code)).length;
  const groups={};for(const l of B.labs){const m=l.code.split(".")[0];const k=l.group?"g:"+l.group:MODS&&m in MODS?"m:"+m:(l.ob&&DOM?domKey(l.ob):"_");(groups[k]=groups[k]||[]).push(l)}
  let h=`<div class="fsetup"><p>${B.labsIntro?esc(B.labsIntro):`${B.labs.length} hands-on labs from your course. Each card says what the lab practises and the key steps and commands to remember.`} Tick a lab off when you've done it. You've done <b>${n} of ${B.labs.length}</b>.</p>
    <div class="progress" aria-hidden="true"><i style="width:${100*n/B.labs.length}%"></i></div></div>
  ${B.labTips?`<details class="obj tips" data-tips="1"${lsGet("qb-tipsopen:"+B.id,true)?" open":""}><summary><span>${esc(B.labTips.title)}</span></summary><div class="inner">${B.labTips.intro?`<p>${esc(B.labTips.intro)}</p>`:""}<ul>${B.labTips.tips.map(t=>`<li><b>${esc(t[0])}</b> ${esc(t[1])}</li>`).join("")}</ul></div></details>`:""}
  <div class="rows">`;
  let opened=false;
  const gk=Object.keys(groups);for(const k of (gk.every(x=>x.startsWith("g:"))?gk:gk.sort(natCmp))){const ls=groups[k];const dn=ls.filter(l=>done.has(l.code)).length;
    const op=(lsGet("qb-labopen:"+B.id,null)===k)||(!opened&&lsGet("qb-labopen:"+B.id,null)==null&&dn<ls.length);if(op)opened=true;
    h+=`<details class="obj" data-grp="${esc(k)}"${op?" open":""}><summary><span>${esc(k==="_"?"Labs":k.startsWith("g:")?k.slice(2):k.startsWith("m:")?modName(k.slice(2)):domTitle(k))} <span class="muted">· ${dn} of ${ls.length} done</span></span></summary><div class="inner">`;
    for(const l of ls){const d=done.has(l.code);
      h+=`<div class="lab ${d?"done":""}"><div class="labhead"><label class="labtick"><input type="checkbox" data-lab="${esc(l.code)}" ${d?"checked":""}> <span class="code">${esc(l.code)}</span> <b>${esc(l.title)}</b></label><span class="chips">${l.tier==="top"?'<span class="tag pick">Portfolio pick</span>':""}${l.ob?`<span class="tag">${esc(obLabel(l.ob))}</span>`:""}</span></div>
        ${l.summary?`<p class="labsum">${esc(l.summary)}</p>`:""}
        ${l.needs.length?`<div class="labcol"><span class="lbl">You'll need</span><div class="chips">${l.needs.map(x=>`<span class="tag">${esc(x)}</span>`).join("")}</div></div>`:""}
        ${l.files.length?`<div class="labcol"><span class="lbl">Files from your lab folder</span><ul class="files">${l.files.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}
        ${l.steps.length?`<div class="labcol"><span class="lbl">Steps</span><ol>${l.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>`:""}
        ${l.shots.length?`<div class="labcol shots"><span class="lbl">Portfolio shots</span>${l.shots.map((x,j)=>{const key=l.code+"#"+j;const got=(S.shotsDone||[]).includes(key);return `<label class="shot"><input type="checkbox" data-shot="${esc(key)}" ${got?"checked":""}> <span>${esc(x)}</span></label>`}).join("")}</div>`:(l.tier==="skip"?'<p class="muted small">Not needed for your portfolio.</p>':"")}
        ${l.commands.length?`<div class="labcol"><span class="lbl">Key commands and points</span><ul class="cmds">${l.commands.map(x=>`<li><code>${esc(x)}</code></li>`).join("")}</ul></div>`:""}
        <div class="acts">${l.link?`<a class="go ghost" href="${esc(l.link)}" target="_blank" rel="noopener noreferrer">Open lab</a>`:""}${l.ob&&byOb[l.ob]?`<button class="go ghost" data-start="ob|${esc(l.ob)}">Practise ${esc(obLabel(l.ob))}</button>`:""}</div></div>`}
    h+=`</div></details>`}
  return h+`</div>`;
}
function wireLabs(el){
  const td=el.querySelector("details[data-tips]");td&&td.addEventListener("toggle",()=>lsSet("qb-tipsopen:"+B.id,td.open));
  el.querySelectorAll("[data-shot]").forEach(c=>c.addEventListener("change",()=>{S.shotsDone=(S.shotsDone||[]).filter(x=>x!==c.dataset.shot);if(c.checked)S.shotsDone.push(c.dataset.shot);save()}));
  el.querySelectorAll("details[data-grp]").forEach(d=>d.addEventListener("toggle",()=>{if(d.open)lsSet("qb-labopen:"+B.id,d.dataset.grp)}));
  el.querySelectorAll("[data-lab]").forEach(c=>c.addEventListener("change",()=>{
    S.labsDone=(S.labsDone||[]).filter(x=>x!==c.dataset.lab);if(c.checked){S.labsDone.push(c.dataset.lab);today().l=(today().l||0)+1}save();
    const y=scrollY;renderTab();scrollTo(0,y)}));
}
/* ---------- study guide ---------- */
let GP=null,GQ="",GV=null;
function parseGuide(md){
  const lines=String(md).replace(/\r/g,"").split("\n"),groups=[];let g=null,sub=null,para=[],i=0;
  const target=()=>sub?sub.blocks:g.blocks;
  const flush=()=>{if(para.length&&g){target().push({t:"p",s:para.join(" ")})}para=[]};
  g={title:"",blocks:[],subs:[]};groups.push(g);
  while(i<lines.length){const L=lines[i];
    if(/^#\s/.test(L)){flush();i++;continue}
    if(/^##\s/.test(L)){flush();g={title:L.replace(/^##\s+/,""),blocks:[],subs:[]};groups.push(g);sub=null;i++;continue}
    if(/^###\s/.test(L)){flush();sub={title:L.replace(/^###\s+/,""),blocks:[]};g.subs.push(sub);i++;continue}
    if(/^\s*\|/.test(L)){flush();const rows=[];while(i<lines.length&&/^\s*\|/.test(lines[i])){rows.push(lines[i].trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim()));i++}
      const sep=rows.length>1&&rows[1].every(c=>/^:?-{2,}:?$/.test(c));target().push({t:"table",head:sep?rows[0]:null,rows:sep?rows.slice(2):rows});continue}
    if(/^\s*-\s/.test(L)){flush();const items=[];while(i<lines.length&&/^\s*-\s/.test(lines[i])){const m=/^\s*-\s+(\[( |x|X)\]\s+)?(.*)$/.exec(lines[i]);items.push({s:m[3],chk:m[1]?true:false});i++}target().push({t:"ul",items});continue}
    if(/^\s*\d+\.\s/.test(L)){flush();const items=[];while(i<lines.length&&/^\s*\d+\.\s/.test(lines[i])){items.push(lines[i].replace(/^\s*\d+\.\s+/,""));i++}target().push({t:"ol",items});continue}
    if(!L.trim()){flush();i++;continue}
    para.push(L.trim());i++}
  flush();
  const plain=s=>s.replace(/\*\*|`/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1");
  const btext=bs=>bs.map(b=>b.t==="p"?b.s:b.t==="table"?[b.head||[]].concat(b.rows).map(r=>r.join(" ")).join(" "):b.items.map(x=>x.s||x).join(" ")).join(" ");
  for(const gr of groups){gr.text=plain(gr.title+" "+btext(gr.blocks)).toLowerCase();for(const s of gr.subs)s.text=plain(s.title+" "+btext(s.blocks)).toLowerCase();
    const m=/\b(?:220-)?(1201|1202)\b/.exec(gr.title);gr.prefix=m?m[1]+" ":""}
  return groups.filter(gr=>gr.title||gr.blocks.length);
}
function kwBase(){const g=B.guide;if(g&&g.keywords.length)return g.keywords;return (B.glossary||[]).map(x=>({term:x.term,stands:x.stands||"",meaning:x.meaning||"",ob:x.objective?String(x.objective):""}))}
function myKw(){if(!Array.isArray(S.myKw))S.myKw=[];return S.myKw}
function kwList(){return kwBase().concat(myKw().map(k=>Object.assign({mine:true},k))).sort((a,b)=>a.term.replace(/^\./,"").localeCompare(b.term.replace(/^\./,""),"en",{numeric:true,sensitivity:"base"}))}
function kwMap(){if(GP&&GP.kwm)return GP.kwm;const m=new Map();for(const k of kwBase())m.set(k.term.toLowerCase(),k);for(const k of myKw())if(!m.has(k.term.toLowerCase()))m.set(k.term.toLowerCase(),Object.assign({mine:true},k));GP.kwm=m;return m}
let GF=null;
function kwForm(){const f=GF,obs=Object.keys(OBJ||{}).sort(natCmp);
  return `<div class="kwform" role="group" aria-label="${f.id?"Edit keyword":"Add a keyword"}"><b class="kft">${f.id?"Edit your keyword":"Add a keyword"}</b>
  <label>Term<input id="kf-term" maxlength="80" value="${esc(f.term)}" autocomplete="off" placeholder="For example: OSPF"></label>
  <label>Stands for <span class="muted">(optional)</span><input id="kf-stands" maxlength="120" value="${esc(f.stands)}" autocomplete="off" placeholder="For example: Open Shortest Path First"></label>
  <label>What it means<textarea id="kf-meaning" maxlength="600" rows="3" placeholder="One or two sentences in your own words">${esc(f.meaning)}</textarea></label>
  <label>Objective <span class="muted">(optional)</span><select id="kf-ob"><option value="">None</option>${obs.map(o=>`<option value="${esc(o)}" ${f.ob===o?"selected":""}>${esc(obLabel(o))} ${esc((objTitle(o)||"").slice(0,60))}</option>`).join("")}</select></label>
  <label>Where you checked it <span class="muted">(optional, such as a web link or your notes)</span><input id="kf-src" maxlength="300" value="${esc(f.src)}" autocomplete="off" placeholder="https://..."></label>
  <p class="muted small">Check new terms against the official CompTIA objectives or a trusted source before you add them, so you don't learn something wrong.</p>
  ${f.err?`<p class="kferr" role="alert">${esc(f.err)}</p>`:""}
  <div class="kfacts"><a class="btn" id="kf-search" href="${esc(kwSearchUrl(f.term))}" target="_blank" rel="noopener noreferrer">Look it up</a><span class="r"><button class="btn" id="kf-cancel">Cancel</button><button class="btn main" id="kf-save">${f.id?"Save changes":"Add keyword"}</button></span></div></div>`}
function kwSearchUrl(t){return "https://duckduckgo.com/?q="+encodeURIComponent(((B.title||"")+" "+(t||"")).trim()+" meaning")}
function kwCard(k,q){const src=k.src||"";const link=/^https:\/\//i.test(src);
  return `<div class="kwe${k.mine?" mine":""}"><div class="kh"><b>${hl(k.term,q)}</b><span class="tags">${k.mine?`<span class="tag pick">Yours</span>`:""}${k.ob?`<span class="tag">${esc(k.ob)}</span>`:""}</span></div>${k.stands?`<div class="ks">${hl(k.stands,q)}</div>`:""}<div class="km">${hl(k.meaning,q)}</div>
  ${k.mine?`${src?`<div class="ksrc">Source: ${link?`<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(src.replace(/^https:\/\/(www\.)?/i,"").slice(0,60))}</a>`:esc(src)}</div>`:""}<div class="kacts"><button class="lnk" data-kedit="${esc(k.id)}">Edit</button><button class="lnk" data-kdel="${esc(k.id)}">${GF&&GF.del===k.id?"Tap again to delete":"Delete"}</button></div>`:""}</div>`}
function kwFind(t){const m=kwMap(),k=t.replace(/\*/g,"").toLowerCase();const hit=m.get(k)||(k.endsWith("s")&&m.get(k.slice(0,-1)))||(k.endsWith("es")&&m.get(k.slice(0,-2)));if(hit)return hit;if(k.length<3)return null;const p=k+" ";for(const [t,v] of m)if(t.startsWith(p))return v;return null}
function hl(t,q){const s=esc(t);if(!q)return s;const re=new RegExp("("+q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+")","gi");return s.replace(re,"<mark>$1</mark>")}
function gInline(s,q){
  let out="",re=/\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,last=0,m;
  while((m=re.exec(s))){out+=hl(s.slice(last,m.index),q);
    if(m[1]!=null){const k=kwFind(m[1]);out+=k?`<b class="kwl" role="button" tabindex="0" data-kw="${esc(k.term)}">${hl(m[1],q)}</b>`:`<b>${hl(m[1],q)}</b>`}
    else if(m[2]!=null)out+=`<code>${hl(m[2],q)}</code>`;
    else out+=`<a href="${esc(m[4])}" target="_blank" rel="noopener noreferrer">${hl(m[3],q)}</a>`;
    last=re.lastIndex}
  return out+hl(s.slice(last),q)}
function gBlocks(bs,q){const chk=gChecks();return bs.map(b=>{
  if(b.t==="p")return `<p>${gInline(b.s,q)}</p>`;
  if(b.t==="ol")return `<ol>${b.items.map(x=>`<li>${gInline(x,q)}</li>`).join("")}</ol>`;
  if(b.t==="ul")return `<ul class="${b.items.some(x=>x.chk)?"gchk":""}">${b.items.map(x=>x.chk?`<li><label><input type="checkbox" data-gchk="${esc(x.s)}" ${chk[x.s]?"checked":""}><span>${gInline(x.s,q)}</span></label></li>`:`<li>${gInline(x.s,q)}</li>`).join("")}</ul>`;
  return `<div class="gtable"><table>${b.head?`<thead><tr>${b.head.map(c=>`<th>${gInline(c,q)}</th>`).join("")}</tr></thead>`:""}<tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${gInline(c,q)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}).join("")}
function gChecks(){const o=lsGet("qb-guidechk:"+B.id,{});return o&&typeof o==="object"?o:{}}
function gOpen(){const a=lsGet("qb-guideopen:"+B.id,[]);return new Set(Array.isArray(a)?a:[])}
function guideTab(){
  if(!GP||GP.id!==B.id){GP={id:B.id,groups:parseGuide(B.guide.md)};GQ="";GF=null;GV=lsGet("qb-guideview:"+B.id,"guide")}
  const kw=kwList().length;
  return `<div class="gtools"><input id="gq" type="search" placeholder="${GV==="kw"?"Search keywords":"Search the guide"}" value="${esc(GQ)}" autocomplete="off" aria-label="Search">
  ${kw?`<span class="seg" id="gview"><button data-v="guide" aria-pressed="${GV!=="kw"}">Guide</button><button data-v="kw" aria-pressed="${GV==="kw"}">Keywords (${kw})</button></span>`:""}</div>
  <div id="gbody"></div><div id="kwpop" class="kwpop" hidden></div>`}
function renderGuideBody(){
  const el=document.getElementById("gbody");if(!el)return;const q=GQ.trim().toLowerCase();
  if(GV==="kw"){const list=kwList().filter(k=>!q||(k.term+" "+k.stands+" "+k.meaning).toLowerCase().includes(q)),mine=myKw().length;
    el.innerHTML=`${GF&&GF.open?kwForm():`<div class="kwtop"><button class="btn main" id="kw-add">+ Add keyword</button><span class="muted small">${q?`${list.length} matching`:`${list.length} terms, A to Z${mine?`, ${mine} added by you`:""}`}. Tap a bold word in the guide to see its entry.</span></div>`}
    <div class="kwl-list">${list.map(k=>kwCard(k,q)).join("")||`<p class="empty">No keywords match.${q?` <button class="lnk" id="kw-addq">Add "${esc(GQ.trim())}" as a keyword</button>`:""}</p>`}</div>`;
    const kb=document.querySelector('#gview [data-v="kw"]');if(kb)kb.textContent=`Keywords (${kwList().length})`;
    const t=document.getElementById("kf-term");if(t){t.addEventListener("input",()=>{const a=document.getElementById("kf-search");if(a)a.href=kwSearchUrl(t.value)});if(!GF.focused){GF.focused=1;t.focus()}}
    return}
  const open=gOpen();let h="",hits=0;
  GP.groups.forEach((g,gi)=>{
    if(!g.title){if(!q)h+=`<div class="gintro">${gBlocks(g.blocks,"")}</div>`;return}
    const subs=g.subs.filter(s=>!q||s.text.includes(q));
    if(q&&!subs.length&&!(g.blocks.length&&gBlocks(g.blocks,"").replace(/<[^>]+>/g,"").toLowerCase().includes(q)))return;
    hits+=q?subs.length||1:0;
    const intro=g.blocks.length&&(!q||gBlocks(g.blocks,"").replace(/<[^>]+>/g,"").toLowerCase().includes(q));
    h+=`<details class="gsec" data-g="${gi}" ${q||open.has(String(gi))?"open":""}><summary>${hl(g.title,q)}${g.subs.length?`<span class="muted small"> · ${q?`${subs.length} of `:""}${g.subs.length} section${g.subs.length===1?"":"s"}</span>`:""}</summary><div class="gbody">
      ${TTS&&!q?`<div class="gsay-all"><button class="lnk gsay" data-say="${gi}:-1">${TTI.spk}<span>Listen to this whole domain</span></button></div>`:""}
      ${intro?gBlocks(g.blocks,q):""}
      ${subs.map(s=>{const m=/^(\d+\.\d+)\s/.exec(s.title),ob=m?g.prefix+m[1]:"",si=g.subs.indexOf(s);return `<section class="gsub" data-sec="${gi}:${si}"><div class="ghead"><h3>${gInline(s.title,q)}</h3>${TTS?`<button class="lnk gsay" data-say="${gi}:${si}" aria-label="Listen to ${esc(sayPlain(s.title))}">${TTI.spk}<span>Listen</span></button>`:""}</div>${gBlocks(s.blocks,q)}${ob&&byOb[ob]&&byOb[ob].length?`<div class="acts"><button class="go ghost" data-gob="${esc(ob)}">Practise ${esc(obLabel(ob))} (${byOb[ob].length})</button></div>`:""}</section>`}).join("")}
    </div></details>`});
  if(TT)setTimeout(()=>ttsMark(),0);
  el.innerHTML=(q?`<p class="muted small">${hits?`${hits} section${hits===1?"":"s"} mention "${esc(GQ.trim())}"`:`Nothing in the guide mentions "${esc(GQ.trim())}".`}</p>`:"")+h;
}
function wireGuide(root){
  const inp=document.getElementById("gq");
  inp.addEventListener("input",()=>{GQ=inp.value;renderGuideBody()});
  root.querySelectorAll("#gview button").forEach(b=>b.addEventListener("click",()=>{GV=b.dataset.v;GF=null;lsSet("qb-guideview:"+B.id,GV);root.querySelectorAll("#gview button").forEach(x=>x.setAttribute("aria-pressed",x===b));inp.placeholder=GV==="kw"?"Search keywords":"Search the guide";renderGuideBody()}));
  const body=document.getElementById("gbody"),pop=document.getElementById("kwpop");
  body.addEventListener("toggle",e=>{const d=e.target;if(!d.matches||!d.matches("details.gsec")||GQ.trim())return;const s=gOpen();d.open?s.add(d.dataset.g):s.delete(d.dataset.g);lsSet("qb-guideopen:"+B.id,[...s])},true);
  body.addEventListener("change",e=>{const c=e.target.closest("[data-gchk]");if(!c)return;const o=gChecks();if(c.checked)o[c.dataset.gchk]=1;else delete o[c.dataset.gchk];lsSet("qb-guidechk:"+B.id,o)});
  const showKw=t=>{const k=kwFind(t);if(!k)return;pop.innerHTML=`<div class="kh"><b>${esc(k.term)}</b>${k.ob?`<span class="tag">${esc(k.ob)}</span>`:""}${TTS?`<button class="lnk gsay ksay" aria-label="Listen">${TTI.spk}</button>`:""}<button class="x" aria-label="Close">&times;</button></div>${k.stands?`<div class="ks">${esc(k.stands)}</div>`:""}<div class="km">${esc(k.meaning)}</div>`;pop.hidden=false;pop.querySelector(".x").addEventListener("click",()=>{pop.hidden=true});const ks=pop.querySelector(".ksay");if(ks)ks.addEventListener("click",()=>ttsSayOnce(`${k.term}. ${k.stands?k.stands+". ":""}${k.meaning}`))};
  const readForm=()=>{for(const [k,id] of [["term","kf-term"],["stands","kf-stands"],["meaning","kf-meaning"],["ob","kf-ob"],["src","kf-src"]]){const x=document.getElementById(id);if(x)GF[k]=x.value}};
  body.addEventListener("click",e=>{
    const t=e.target;if(GF&&GF.del&&!t.closest("[data-kdel]")){GF=null;renderGuideBody()}
    if(t.closest("#kw-add")||t.closest("#kw-addq")){GF={open:1,id:null,term:t.closest("#kw-addq")?GQ.trim():"",stands:"",meaning:"",ob:"",src:""};renderGuideBody();body.scrollIntoView({block:"start",behavior:"smooth"});return}
    if(t.closest("#kf-cancel")){GF=null;renderGuideBody();return}
    if(t.closest("#kf-save")){readForm();const term=GF.term.trim(),meaning=GF.meaning.trim();
      if(!term||!meaning){GF.err="Add the term and what it means.";renderGuideBody();return}
      const lc=term.toLowerCase();
      if(kwBase().some(k=>k.term.toLowerCase()===lc)){GF.err=`"${term}" is already in the keywords. Search for it to see the entry.`;renderGuideBody();return}
      if(myKw().some(k=>k.term.toLowerCase()===lc&&k.id!==GF.id)){GF.err=`You've already added "${term}".`;renderGuideBody();return}
      const src=GF.src.trim();if(src&&/^[a-z]+:/i.test(src)&&!/^https:\/\//i.test(src)){GF.err="Links need to start with https://";renderGuideBody();return}
      const rec={id:GF.id||("k"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),term:term.slice(0,80),stands:GF.stands.trim().slice(0,120),meaning:meaning.slice(0,600),ob:GF.ob&&OBJ&&OBJ[GF.ob]?GF.ob:"",src:src.slice(0,300),added:GF.added||new Date().toISOString().slice(0,10)};
      const L=myKw(),i=L.findIndex(k=>k.id===rec.id);if(i>=0)L[i]=rec;else L.push(rec);
      save();GP.kwm=null;GF=null;renderGuideBody();return}
    const ed=t.closest("[data-kedit]");if(ed){const k=myKw().find(x=>x.id===ed.dataset.kedit);if(k){GF=Object.assign({open:1},k);renderGuideBody();body.scrollIntoView({block:"start",behavior:"smooth"})}return}
    const dl=t.closest("[data-kdel]");if(dl){const id=dl.dataset.kdel;if(GF&&GF.del===id){S.myKw=myKw().filter(x=>x.id!==id);save();GP.kwm=null;GF=null}else GF={del:id};renderGuideBody();return}
    const sy=t.closest("[data-say]");if(sy){const [a,c]=sy.dataset.say.split(":").map(Number);ttsStart(a,c);return}
    const k=t.closest("[data-kw]");if(k){showKw(k.dataset.kw);return}const b=e.target.closest("[data-gob]");if(b){const ob=b.dataset.gob;start(byOb[ob]||[],`${obLabel(ob)} ${objTitle(ob)}`)}});
  body.addEventListener("keydown",e=>{const k=e.target.closest("[data-kw]");if(k&&(e.key==="Enter"||e.key===" ")){e.preventDefault();showKw(k.dataset.kw)}});
  renderGuideBody();
}
/* ---------- read aloud ---------- */
const TTS=typeof window!=="undefined"&&"speechSynthesis" in window&&typeof SpeechSynthesisUtterance!=="undefined";
let TT=null;
const TTI={prev:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',next:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',play:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',pause:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',stop:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>',spk:'<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>'};
function ttsPrefs(){const p=lsGet("qb-tts",{})||{};return{rate:+p.rate||1,voice:p.voice||"",cont:!!p.cont}}
function ttsVoices(){if(!TTS)return[];try{const en=speechSynthesis.getVoices().filter(v=>/^en([-_]|$)/i.test(v.lang)),gb=en.filter(v=>/^en[-_]GB/i.test(v.lang));return gb.length?gb:en}catch(e){return[]}}
function ttsVoice(){const vs=ttsVoices(),p=ttsPrefs();return vs.find(v=>v.name===p.voice)||vs.find(v=>/en[-_]GB/i.test(v.lang))||vs[0]||null}
function sayPlain(s){return String(s).replace(/\*\*|`/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/\s+/g," ").trim()}
function sayFix(s){return s.replace(/(\d)-(\d)/g,"$1 $2").replace(/\be\.g\./gi,"for example").replace(/\bi\.e\./gi,"that is").replace(/ · /g,", ")}
function blocksSay(bs){const out=[];for(const b of bs){
  if(b.t==="p")out.push(sayPlain(b.s));
  else if(b.t==="ul"||b.t==="ol")b.items.forEach((x,i)=>{const t=sayPlain(x.s!=null?x.s:x);out.push(b.t==="ol"?`${i+1}. ${t}`:t)});
  else if(b.t==="table")for(const r of b.rows)out.push(r.map((c,i)=>{const h=b.head&&b.head[i]?sayPlain(b.head[i]):"",v=sayPlain(c);return !v?"":h&&i>0?`${h}: ${v}`:v}).filter(Boolean).join(". "))}
  return out.filter(Boolean).map(t=>/[.!?:]$/.test(t)?t:t+".")}
function ttsChunks(parts){const out=[];for(const p of parts){let cur="";for(const s of sayFix(p).replace(/([.!?])\s+/g,"$1\u0001").split("\u0001")){if(cur&&(cur+" "+s).length>220){out.push(cur);cur=s}else cur=cur?cur+" "+s:s}if(cur)out.push(cur)}return out}
function ttsItems(gi,si){const g=GP&&GP.groups[gi],items=[];if(!g)return items;
  if(si<0&&g.blocks.length)items.push({gi,si:-1,title:g.title,parts:[sayPlain(g.title)+"."].concat(blocksSay(g.blocks))});
  const from=si<0?0:si;g.subs.slice(from).forEach((s,k)=>items.push({gi,si:from+k,title:s.title,parts:[sayPlain(s.title)+"."].concat(blocksSay(s.blocks))}));
  return items}
function ttsMore(T){if(!ttsPrefs().cont||!GP)return false;let gi=T.items[T.items.length-1].gi+1;
  while(gi<GP.groups.length){const g=GP.groups[gi];if(g.title){const add=ttsItems(gi,-1);if(add.length){T.items=T.items.concat(add);return true}}gi++}return false}
function ttsStart(gi,si){
  if(!TTS||!GP)return;ttsStop();const items=ttsItems(gi,si);
  if(!items.length)return;TT={items,i:0,c:0,chunks:null,paused:false,gen:0};ttsBar();ttsPlay(true)}
function ttsPlay(scroll){const T=TT;if(!T)return;const it=T.items[T.i];if(!it){ttsStop();return}
  if(!T.chunks)T.chunks=ttsChunks(it.parts);
  if(T.c>=T.chunks.length){if(T.i+1>=T.items.length&&!ttsMore(T)){ttsStop();return}T.i++;T.c=0;T.chunks=null;ttsBar();ttsPlay(true);return}
  const u=new SpeechSynthesisUtterance(T.chunks[T.c]),v=ttsVoice();u.lang=v?v.lang:"en-GB";if(v)try{u.voice=v}catch(e){}u.rate=ttsPrefs().rate;
  const gen=T.gen;u.onend=()=>{if(TT!==T||T.gen!==gen||T.paused)return;T.c++;ttsPlay()};
  u.onerror=e=>{if(TT!==T||T.gen!==gen||T.paused)return;if(e&&(e.error==="interrupted"||e.error==="canceled"))return;T.c++;ttsPlay()};
  try{speechSynthesis.speak(u)}catch(e){ttsStop();return}ttsMark(scroll)}
function ttsHalt(){if(TT)TT.gen++;try{speechSynthesis.cancel()}catch(e){}}
function ttsStop(){if(!TTS)return;const had=!!TT;ttsHalt();TT=null;ttsBar();if(had)ttsMark()}
function ttsGo(d){const T=TT;if(!T)return;ttsHalt();T.paused=false;
  if(d<0&&T.c>1)T.c=0;else{if(d>0&&T.i+1>=T.items.length)ttsMore(T);const n=T.i+d;if(n<0||n>=T.items.length){if(n<0)T.c=0;else{ttsStop();return}}else{T.i=n;T.c=0;T.chunks=null}}
  ttsBar();ttsPlay(true)}
function ttsMark(scroll){document.querySelectorAll(".gsub.reading").forEach(x=>x.classList.remove("reading"));if(!TT)return;const it=TT.items[TT.i];if(!it||it.si<0)return;
  const el=document.querySelector(`[data-sec="${it.gi}:${it.si}"]`);if(!el)return;el.classList.add("reading");
  if(scroll){const d=el.closest("details");if(d&&!d.open)d.open=true;el.scrollIntoView({block:"start",behavior:"smooth"})}}
function ttsBar(){let b=document.getElementById("ttsbar");
  if(!TT){if(b)b.remove();document.body.classList.remove("tts-on");return}
  if(!b){b=document.createElement("div");b.id="ttsbar";b.className="ttsbar";b.setAttribute("role","region");b.setAttribute("aria-label","Read aloud");document.body.appendChild(b);
    b.addEventListener("click",e=>{const x=e.target.closest("[data-tt]");if(!x||!TT)return;const a=x.dataset.tt;
      if(a==="play"){if(TT.paused){TT.paused=false;ttsBar();ttsPlay()}else{TT.paused=true;ttsHalt();ttsBar()}}
      else if(a==="cont"){const p=ttsPrefs();p.cont=!p.cont;lsSet("qb-tts",p);ttsBar()}
      else if(a==="prev")ttsGo(-1);else if(a==="next")ttsGo(1);else if(a==="stop")ttsStop()});
    b.addEventListener("change",e=>{const x=e.target.closest("select[data-tt]");if(!x)return;const p=ttsPrefs();if(x.dataset.tt==="rate")p.rate=+x.value;else p.voice=x.value;lsSet("qb-tts",p);
      if(TT&&!TT.paused){ttsHalt();ttsPlay()}})}
  document.body.classList.add("tts-on");const T=TT,it=T.items[T.i]||{},p=ttsPrefs(),vs=ttsVoices(),cv=ttsVoice();
  b.innerHTML=`<div class="tt-now"><span class="muted small">${T.paused?"Paused":"Reading"} · ${T.i+1} of ${T.items.length}${p.cont?", then on to the next domain":""}</span><b>${esc(sayPlain(it.title||""))}</b></div>
  <div class="tt-ctl"><button data-tt="prev" aria-label="Previous section">${TTI.prev}</button><button data-tt="play" class="main" aria-label="${T.paused?"Play":"Pause"}">${T.paused?TTI.play:TTI.pause}</button><button data-tt="next" aria-label="Next section">${TTI.next}</button><button data-tt="stop" aria-label="Stop reading">${TTI.stop}</button>
  <button data-tt="cont" class="tt-cont" aria-pressed="${p.cont}" title="Keep reading into the next domain">Continuous</button>
  <select data-tt="rate" aria-label="Reading speed">${[0.8,1,1.2,1.4,1.6].map(r=>`<option value="${r}" ${r===p.rate?"selected":""}>${r}x</option>`).join("")}</select>
  ${vs.length>1?`<select data-tt="voice" aria-label="Voice">${vs.map(v=>`<option value="${esc(v.name)}" ${cv&&v.name===cv.name?"selected":""}>${esc(v.name.replace(/^(Microsoft|Google)\s+/,"").replace(/\s+Online.*$/,"").slice(0,28))}</option>`).join("")}</select>`:""}</div>`}
function ttsSayOnce(text){if(!TTS)return;ttsStop();const u=new SpeechSynthesisUtterance(sayFix(text)),v=ttsVoice();u.lang=v?v.lang:"en-GB";if(v)try{u.voice=v}catch(e){}u.rate=ttsPrefs().rate;try{speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
if(TTS)try{speechSynthesis.addEventListener("voiceschanged",()=>{if(TT)ttsBar()})}catch(e){}
/* ---------- practice drills ---------- */
let P=null;
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const n2ip=n=>[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
const ip2n=s=>{const p=String(s).trim().split(".");if(p.length!==4)return null;let n=0;for(const x of p){if(!/^\d{1,3}$/.test(x)||+x>255)return null;n=n*256+(+x)}return n};
const maskN=p=>p<=0?0:(0xFFFFFFFF<<(32-p))>>>0;
const ORD=["first","second","third","fourth"];
function pset(){S.practice=S.practice||{};return S.practice._set||(S.practice._set={kind:"mix",level:"easy"})}
function dstat(id){S.practice=S.practice||{};return S.practice[id]||(S.practice[id]={c:0,n:0,runs:0,best:null})}
function subnetWhy(ip,pre){
  const m=maskN(pre),net=(ip&m)>>>0,bc=(net|(~m>>>0))>>>0,idx=Math.min(3,Math.floor(pre/8)),mo=(m>>>(24-8*idx))&255,blk=256-mo;
  const ov=(ip>>>(24-8*idx))&255,st=Math.floor(ov/blk)*blk,hosts=Math.pow(2,32-pre)-2;
  return `/${pre} is ${n2ip(m)}. The interesting octet is the ${ORD[idx]}, where the block size is 256 - ${mo} = ${blk}. ${ov} falls in the block ${st} to ${st+blk-1}, so the network ID is ${n2ip(net)} and the broadcast is ${n2ip(bc)}. Usable hosts: 2^${32-pre} - 2 = ${hosts.toLocaleString("en-GB")}.`}
function randIp(hard){const t=rnd(0,2);const a=t===0?[192,168]:t===1?[10,rnd(0,255)]:[172,rnd(16,31)];return ((a[0]*16777216)+(a[1]*65536)+(rnd(0,255)*256)+rnd(0,255))>>>0}
function subnetCard(){
  const st=pset(),hard=st.level==="hard",lo=hard?16:24;
  const kinds=["break","break","hosts","same","mask"];const kind=st.kind==="mix"?kinds[rnd(0,kinds.length-1)]:st.kind;
  if(kind==="break"){
    const pre=rnd(lo,30),m=maskN(pre);let ip,net,bc;
    do{ip=randIp(hard);net=(ip&m)>>>0;bc=(net|(~m>>>0))>>>0}while(ip===net||ip===bc);
    return{t:"fields",prompt:`Break down <b class="mono">${n2ip(ip)}/${pre}</b>`,fields:[
      {k:"net",label:"Network ID",type:"ip",ans:n2ip(net)},{k:"first",label:"First usable host",type:"ip",ans:n2ip(net+1)},
      {k:"last",label:"Last usable host",type:"ip",ans:n2ip(bc-1)},{k:"bc",label:"Broadcast",type:"ip",ans:n2ip(bc)},
      {k:"hosts",label:"Usable hosts",type:"int",ans:String(Math.pow(2,32-pre)-2)}],why:subnetWhy(ip,pre)}}
  if(kind==="hosts"){
    const pre=rnd(lo,30),cap=Math.pow(2,32-pre)-2,low=Math.max(2,Math.pow(2,31-pre)-1),need=rnd(low,cap);
    return{t:"fields",prompt:`A subnet needs <b>${need.toLocaleString("en-GB")}</b> usable host addresses. What is the smallest subnet that fits?`,fields:[
      {k:"pre",label:"Prefix (for example /26)",type:"prefix",ans:String(pre)},{k:"mask",label:"Subnet mask",type:"ip",ans:n2ip(maskN(pre))}],
      why:`/${pre} gives 2^${32-pre} - 2 = ${cap.toLocaleString("en-GB")} usable hosts.${pre<30?` One size smaller, /${pre+1}, gives only ${(Math.pow(2,31-pre)-2).toLocaleString("en-GB")}, which isn't enough.`:""} The mask for /${pre} is ${n2ip(maskN(pre))}.`}}
  if(kind==="same"){
    const pre=rnd(lo,29),m=maskN(pre),size=Math.pow(2,32-pre);let a,net;
    do{a=randIp(hard);net=(a&m)>>>0}while(a===net||a===net+size-1);
    const same=Math.random()<.5,bnet=same?net:(Math.random()<.5&&net>=size?net-size:net+size)>>>0;let b;
    do{b=(bnet+rnd(1,size-2))>>>0}while(b===a);
    const yes=((b&m)>>>0)===net;
    return{t:"choice",prompt:`Are <b class="mono">${n2ip(a)}/${pre}</b> and <b class="mono">${n2ip(b)}/${pre}</b> on the same subnet?`,opts:["Yes, same subnet","No, different subnets"],ans:yes?0:1,
      why:`${n2ip(a)} is in ${n2ip(net)}/${pre} and ${n2ip(b)} is in ${n2ip((b&m)>>>0)}/${pre}. ${subnetWhy(a,pre).split(". ").slice(0,2).join(". ")}.`}}
  const pre=rnd(hard?8:24,30);
  if(Math.random()<.5)return{t:"fields",prompt:`Write <b class="mono">/${pre}</b> as a dotted decimal subnet mask.`,fields:[{k:"mask",label:"Subnet mask",type:"ip",ans:n2ip(maskN(pre))}],
    why:`/${pre} means ${pre} ones followed by ${32-pre} zeros, which is ${n2ip(maskN(pre))}.`};
  return{t:"fields",prompt:`Write <b class="mono">${n2ip(maskN(pre))}</b> as a CIDR prefix.`,fields:[{k:"pre",label:"Prefix (for example /26)",type:"prefix",ans:String(pre)}],
    why:`${n2ip(maskN(pre))} has ${pre} bits set to 1, so it's /${pre}.`};
}
function drillCards(d){
  if(d.type==="subnet"){const c=[];for(let i=0;i<10;i++)c.push(subnetCard());return c}
  if(d.type==="exhibit")return shuffle(d.items).slice(0,10).map(x=>{const ord=shuffle(x.o.map((_,i)=>i));return{t:"choice",x:x.x,prompt:esc(x.q),opts:ord.map(i=>x.o[i]),ans:ord.indexOf(0),why:x.e}});
  if(d.type==="order")return shuffle(d.sets).map(s=>{let cur;do{cur=shuffle(s.items.map((_,i)=>i))}while(cur.every((v,i)=>v===i));return{t:"order",prompt:esc(s.title),intro:s.intro,items:s.items,cur,why:s.e}});
  const pairs=shuffle(d.pairs),out=[];
  for(let i=0;i<pairs.length;i+=d.round){let grp=pairs.slice(i,i+d.round);if(grp.length<3&&out.length){out[out.length-1].grp=out[out.length-1].grp.concat(grp);continue}out.push({grp})}
  return out.map(o=>{const rev=d.both&&Math.random()<.5,A=rev?1:0,Bk=rev?0:1;
    const rows=o.grp.map(p=>({p:p[A],ok:d.pairs.filter(x=>x[A]===p[A]).map(x=>x[Bk])}));
    const opts=new Set(o.grp.map(p=>p[Bk]));for(const x of shuffle(d.pairs)){if(opts.size>=o.grp.length+2)break;opts.add(x[Bk])}
    return{t:"match",cols:rev?[d.cols[1],d.cols[0]]:d.cols,rows,opts:[...opts].sort((a,b)=>a.localeCompare(b,"en",{numeric:true}))}})}
function drillSize(d){
  if(d.type==="subnet")return "10 fresh questions each time";
  if(d.type==="match")return `${d.pairs.length} to match`;
  if(d.type==="exhibit")return `${d.items.length} exhibits${d.items.length>10?", 10 at a time":""}`;
  return `${d.sets.length} to put in order`}
const DINTRO={subnet:"Work out network IDs, broadcasts, host ranges and masks. A new set of numbers every time.",match:"Match each item to the right answer, like the drag-and-drop questions in the exam.",exhibit:"Read the output and work out what it's telling you.",order:"Put the steps in the right order."};
function practiceTab(){
  const st=pset();
  let h=`<div class="fsetup"><p>Drills in the style of the hands-on questions at the start of the real exam.${B.practice.some(d=>d.type==="subnet")?" Subnetting questions are made up fresh each time, so you can't learn the answers off by heart.":""} Drills count towards your daily activity on the Progress tab.</p></div><div class="drills">`;
  for(const d of B.practice){const s=(S.practice||{})[d.id];const p=s&&s.n?Math.round(100*s.c/s.n):null;
    h+=`<div class="drill"><div class="dh"><b>${esc(d.title)}</b>${pctChip(p)}</div><p class="muted small">${esc(d.intro||DINTRO[d.type])}</p>
    ${d.type==="subnet"?`<div class="line"><span class="lbl">Type</span><span class="seg" id="skind">${[["mix","Mixed"],["break","Break down"],["hosts","Hosts"],["same","Same subnet?"],["mask","Masks"]].map(([k,t])=>`<button data-k="${k}" aria-pressed="${st.kind===k}">${t}</button>`).join("")}</span></div>
      <div class="line"><span class="lbl">Level</span><span class="seg" id="slevel"><button data-l="easy" aria-pressed="${st.level!=="hard"}">Last octet (/24 to /30)</button><button data-l="hard" aria-pressed="${st.level==="hard"}">Any octet (/16 to /30)</button></span></div>`:""}
    <div class="acts"><span class="muted small">${drillSize(d)}${s&&s.runs?` · ${s.runs} session${s.runs===1?"":"s"}${s.best!=null?`, best ${s.best}%`:""}`:""}</span><button class="go" data-drill="${esc(d.id)}">Start</button></div></div>`}
  return h+`</div>`;
}
function wirePractice(el){
  el.querySelectorAll("#skind button").forEach(b=>b.addEventListener("click",()=>{pset().kind=b.dataset.k;save();el.querySelectorAll("#skind button").forEach(x=>x.setAttribute("aria-pressed",x===b))}));
  el.querySelectorAll("#slevel button").forEach(b=>b.addEventListener("click",()=>{pset().level=b.dataset.l;save();el.querySelectorAll("#slevel button").forEach(x=>x.setAttribute("aria-pressed",x===b))}));
  el.querySelectorAll("[data-drill]").forEach(b=>b.addEventListener("click",()=>{const d=B.practice.find(x=>x.id===b.dataset.drill);d&&startDrill(d)}));
}
function startDrill(d){pushSub();stopTimer();R=null;F=null;P={d,cards:drillCards(d),i:0,c:0,n:0,miss:[],done:false};newCard();renderDrill()}
function newCard(){const k=P.cards[P.i];P.checked=false;P.val={};P.sel=k.t==="match"?k.rows.map(()=>""):null;P.pick=null;P.res=null}
function normAns(type,v){v=String(v||"").trim();if(type==="int")return v.replace(/[,\s]/g,"");if(type==="prefix"){const m=/^\/?\s*(\d{1,2})$/.exec(v);if(m)return String(+m[1]);const n=ip2n(v);if(n!=null){const b=n.toString(2).padStart(32,"0");if(/^1*0*$/.test(b))return String(b.indexOf("0")<0?32:b.indexOf("0"))}return v}
  if(type==="ip"){const n=ip2n(v);return n==null?v:n2ip(n)}return v.toLowerCase()}
function renderDrill(){
  const d=P.d,k=P.cards[P.i],n=P.cards.length;
  let body="";
  if(k.t==="fields")body=`<p class="qtext">${k.prompt}</p><div class="dfields">${k.fields.map((f,i)=>{const r=P.res&&P.res[i];return `<label class="dfield ${r==null?"":r?"right":"wrong"}"><span>${esc(f.label)}</span><input data-f="${i}" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(P.val[i]||"")}" ${P.checked?"disabled":""}>${r===false?`<em>Answer: ${esc(f.type==="prefix"?"/"+f.ans:f.ans)}</em>`:""}</label>`}).join("")}</div>`;
  if(k.t==="choice")body=`${k.x?`<pre class="exhibit" tabindex="0" aria-label="Exhibit">${esc(k.x)}</pre><p class="muted small swipe">Swipe the output sideways to see all of it.</p>`:""}<p class="qtext">${k.prompt}</p><div class="opts">${k.opts.map((o,i)=>{let c="";if(P.checked){if(i===k.ans)c="right";else if(i===P.pick)c="wrong"}return `<button class="opt ${c}" data-pick="${i}" aria-pressed="${P.pick===i}" ${P.checked?"disabled":""}><span class="k">${LETTERS[i]}</span><span>${esc(o)}</span></button>`}).join("")}</div>`;
  if(k.t==="match")body=`<p class="qtext">Match each ${esc(k.cols[0].toLowerCase())} to its ${esc(k.cols[1].toLowerCase())}.</p><div class="mrows">${k.rows.map((r,i)=>{const res=P.res&&P.res[i];return `<div class="mrow ${res==null?"":res?"right":"wrong"}"><span class="mp">${esc(r.p)}</span><select data-m="${i}" aria-label="${esc(k.cols[1])} for ${esc(r.p)}" ${P.checked?"disabled":""}><option value="">Choose</option>${k.opts.map(o=>`<option ${P.sel[i]===o?"selected":""}>${esc(o)}</option>`).join("")}</select>${res===false?`<em>Answer: ${esc(r.ok.join(" or "))}</em>`:""}</div>`}).join("")}</div>`;
  if(k.t==="order")body=`<p class="qtext">${k.prompt}</p>${k.intro?`<p class="muted small">${esc(k.intro)}</p>`:""}<ol class="olist">${k.cur.map((ix,pos)=>{const res=P.res&&P.res[pos];return `<li class="${res==null?"":res?"right":"wrong"}"><span class="ot">${esc(k.items[ix])}${res===false?`<em>Should be step ${ix+1}</em>`:""}</span>${P.checked?"":`<span class="mv"><button data-up="${pos}" aria-label="Move up" ${pos===0?"disabled":""}>&#9650;</button><button data-down="${pos}" aria-label="Move down" ${pos===k.cur.length-1?"disabled":""}>&#9660;</button></span>`}</li>`}).join("")}</ol>`;
  let fb="";
  if(P.checked){const ok=P.res.every(Boolean);const part=k.t==="match"?`${P.res.filter(Boolean).length} of ${P.res.length} right. `:"";
    fb=`<div class="feedback ${ok?"ok":"bad"}"><b>${ok?"Correct":"Not quite"}</b><p>${part}${k.t==="order"&&!ok?"The right order is: "+k.items.map((x,i)=>`${i+1}. ${esc(x)}`).join(" "):""}${k.why?(k.t==="order"&&!ok?" ":"")+esc(k.why):""}</p></div>`}
  app.innerHTML=`
  <div class="qtop"><h2>${esc(d.title)}</h2><span class="count">${P.i+1} of ${n} · ${P.c} of ${P.n} right</span></div>
  <div class="progress" aria-hidden="true"><i style="width:${100*P.i/n}%"></i></div>
  <article class="card drillcard">${body}${fb}
  <div class="qnav"><button class="btn" id="dquit">End session</button><div class="r">${P.checked?`<button class="btn main" id="dnext">${P.i+1<n?"Next":"See results"}</button>`:`<button class="btn main" id="dcheck">Check</button>`}</div></div></article>`;
  const g=id=>document.getElementById(id);
  app.querySelectorAll("[data-f]").forEach(x=>{x.addEventListener("input",()=>{P.val[+x.dataset.f]=x.value});x.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const nx=app.querySelector(`[data-f="${+x.dataset.f+1}"]`);if(nx)nx.focus();else checkDrill()}})});
  app.querySelectorAll("[data-pick]").forEach(b=>b.addEventListener("click",()=>{P.pick=+b.dataset.pick;renderDrill()}));
  app.querySelectorAll("[data-m]").forEach(x=>x.addEventListener("change",()=>{P.sel[+x.dataset.m]=x.value}));
  const mv=(a,b)=>{const c=k.cur;[c[a],c[b]]=[c[b],c[a]];renderDrill();const f=app.querySelector(`[data-${b<a?"up":"down"}="${b}"]`)||app.querySelector(`[data-up="${b}"],[data-down="${b}"]`);f&&f.focus()};
  app.querySelectorAll("[data-up]").forEach(b=>b.addEventListener("click",()=>{const i=+b.dataset.up;if(i>0)mv(i,i-1)}));
  app.querySelectorAll("[data-down]").forEach(b=>b.addEventListener("click",()=>{const i=+b.dataset.down;if(i<k.cur.length-1)mv(i,i+1)}));
  g("dcheck")&&g("dcheck").addEventListener("click",checkDrill);
  g("dnext")&&g("dnext").addEventListener("click",()=>{P.i++;if(P.i>=n){drillDone();return}newCard();renderDrill();window.scrollTo({top:0})});
  g("dquit").addEventListener("click",drillDone);
  if(k.t==="fields"&&!P.checked){const f=app.querySelector("[data-f]");f&&f.focus({preventScroll:true})}
}
function checkDrill(){
  const k=P.cards[P.i];
  if(k.t==="fields"){if(!k.fields.some((f,i)=>String(P.val[i]||"").trim()))return;P.res=k.fields.map((f,i)=>normAns(f.type,P.val[i])===normAns(f.type,f.ans))}
  if(k.t==="choice"){if(P.pick==null)return;P.res=[P.pick===k.ans]}
  if(k.t==="match"){if(!P.sel.some(Boolean))return;P.res=k.rows.map((r,i)=>r.ok.includes(P.sel[i]))}
  if(k.t==="order")P.res=k.cur.map((ix,pos)=>ix===pos);
  const units=k.t==="match"?P.res:[P.res.every(Boolean)];
  for(const ok of units){P.n++;if(ok)P.c++;logAnswer(P.d.ob||"Practice",ok)}
  if(!units.every(Boolean))P.miss.push(missText(k));
  P.checked=true;save();renderDrill();
  const f=app.querySelector(".feedback");f&&f.scrollIntoView({block:"nearest",behavior:"smooth"});
}
function missText(k){
  const tmp=document.createElement("div");
  if(k.t==="fields"){tmp.innerHTML=k.prompt;return{q:tmp.textContent,a:k.fields.map(f=>`${f.label}: ${f.type==="prefix"?"/"+f.ans:f.ans}`).join(" · ")}}
  if(k.t==="choice"){tmp.innerHTML=k.prompt;return{q:tmp.textContent,a:k.opts[k.ans]}}
  if(k.t==="match")return{q:`Match ${k.cols[0]} to ${k.cols[1]}`,a:k.rows.filter((r,i)=>!P.res[i]).map(r=>`${r.p}: ${r.ok.join(" or ")}`).join(" · ")};
  tmp.innerHTML=k.prompt;return{q:tmp.textContent,a:k.items.map((x,i)=>`${i+1}. ${x}`).join(" ")}}
function logDrill(){if(!P||P.logged||!P.n)return;P.logged=true;const d=P.d,s=dstat(d.id);s.c+=P.c;s.n+=P.n;s.runs++;const p=Math.round(100*P.c/P.n);if(P.n>=3)s.best=s.best==null?p:Math.max(s.best,p);logSession({kind:"drill",name:d.title,c:P.c,n:P.n})}
function drillDone(){
  const d=P.d;
  if(!P.n){P=null;homeTab="practice";home();return}
  logDrill();
  const p=Math.round(100*P.c/P.n);
  app.innerHTML=`
  <div class="qtop"><h2>${esc(d.title)}: done</h2></div>
  <section class="score"><div class="big">${p}<small>%</small></div><div class="t"><b>${P.c} of ${P.n} right</b><p class="muted">${p>=80?"That's exam-ready territory. Keep it ticking over.":d.type==="subnet"?"Write the block sizes out (128, 64, 32, 16, 8, 4) and go again. It gets quicker every round.":"Have another go. The ones you missed are listed below."}</p></div></section>
  <div class="actions"><button class="btn main" id="dagain">Go again</button><button class="btn" id="dmenu">Back to practice</button></div>
  ${P.miss.length?`<h3>To look at again</h3><div class="dmiss">${P.miss.map(m=>`<div><span>${esc(m.q)}</span><span class="muted">${esc(m.a)}</span></div>`).join("")}</div>`:""}`;
  document.getElementById("dagain").addEventListener("click",()=>startDrill(d));
  document.getElementById("dmenu").addEventListener("click",()=>{P=null;homeTab="practice";home()});
  window.scrollTo({top:0});
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
  if(seen&&!F.logged){F.logged=true;today().f+=seen;logSession({kind:"flash",name:"Flashcards",c:F.got,n:seen})}
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
  opt=opt||{};F=null;ttsStop();
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
  logAnswer(ob,ok);
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
  {const r=done.filter(it=>it.pick===0).length;logSession({kind:R.mock?"mock":"quiz",name:R.name,mock:R.mock?R.mock.id:null,c:r,n:done.length})}
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
if("serviceWorker" in navigator&&location.protocol!=="file:"&&!window.QB_EMBEDDED){
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
