// שני טלפונים מריצים את מודול האפליקציה האמיתי על ענן אחד, עם תורים ואופליין.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, moduleSource } from './receipt-scan-harness.mjs';
import { createCloud } from './shared-return-fake.mjs';
const ROOT = 'artifacts/berman-app-classic/public/data/';
const LEGACY = ROOT + 'drafts/returns';
const tick = async () => { for (let i = 0; i < 25; i++) await new Promise(r => setImmediate(r)); };
const plain = (r, s) => JSON.parse(r.run('JSON.stringify(' + s + ')'));
const qty = (r, id='code_101') => r.run(`returnsList.find(x => x.productId === '${id}')?.qty || 0`);
function phone(cloud, name, { storage=new Map(), online=true, clock=1000 }={}) {
  const c = cloud.client(); c.setOnline(online);
  const r = runtime({storage}); r.client=c; r.queue=[];
  r.context.__fs=c.fs; r.context.__clock=clock;
  r.context.__cloudTask=async (_label, task) => {
    if (!c.isOnline()) { r.queue.push(task); return true; }
    cloud.put(task.path.join('/'), task.data); return true;
  };
  r.run(`for (const k of ['doc','onSnapshot','runTransaction','getDocFromServer','updateDoc','deleteField','setDoc']) globalThis[k]=__fs[k];
    runCloudTask=__cloudTask; runCloudTaskSilent=__cloudTask; deviceName=${JSON.stringify(name)};
    Date.now=()=>__clock; window.location={href:''}; navigator.onLine=${online};
    currentView='returns'; mainMode='returns';`);
  if (r.run(`typeof startReturnsEvents === 'function'`)) r.run('startReturnsEvents()');
  else {
    const begin=moduleSource.indexOf("  const rdRef = doc(db, 'artifacts', appId, 'public', 'data', 'drafts', 'returns');");
    const end=moduleSource.indexOf("  const rcRef =", begin);
    r.run(moduleSource.slice(begin,end));
  }
  r.flush = async () => {
    if (r.run(`typeof returnsEvents !== 'undefined' && !!returnsEvents`)) await r.run('returnsEvents.flush()');
    else { const jobs=r.callbacks.splice(0); for (const fn of jobs) if (String(fn).includes('save returns draft')) await fn(); }
    if (c.isOnline()) for (const task of r.queue.splice(0)) cloud.put(task.path.join('/'),task.data);
    await tick();
  };
  r.online = async v => { c.setOnline(v);r.run('navigator.onLine='+v); if(v) await r.flush(); };
  r.scan = (id='code_101') => r.run(`addReturn('${id}')`);
  r.send = async () => {r.run('openReturnsSend()');await r.run(`performSend({name:'בדיקה',phone:'0500000000'})`);await tick();};
  return r;
}
function drafts(cloud){return cloud.paths(ROOT+'returns/').map(p=>cloud.get(p));}

test('אופליין: סריקה במחסן ושינוי בטלפון אחר נשמרים יחד',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();
 await a.online(false);a.scan();b.scan('code_238');await b.flush();await a.online(true);
 assert.equal(qty(a),1);assert.equal(qty(a,'code_238'),1);assert.equal(qty(b),1);
});
test('שני טלפונים באותה שנייה באותו מוצר: היחידות מתחברות',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();a.scan();b.scan();await Promise.all([a.flush(),b.flush()]);
 assert.equal(qty(a),2);assert.equal(qty(b),2);
});
test('שעונים רחוקים בשעות לא קובעים איזו סריקה נשארת',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א',{clock:1000}),b=phone(cloud,'ב',{clock:99999999});await tick();
 b.scan('code_238');await b.flush();a.scan();await a.flush();assert.equal(qty(b),1);assert.equal(qty(b,'code_238'),1);
});
test('סריקה מיד אחרי שליחה נכנסת לטיוטה הבאה בלבד',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();a.scan();await a.flush();b.run('__clock=2000');
 await b.online(false); await a.send(); b.scan(); await b.online(true); await a.flush(); assert.equal(drafts(cloud).length,1);
 assert.equal(drafts(cloud)[0].items[0].qty,1);assert.equal(qty(a),1);assert.equal(qty(b),1);
});
test('שני שולחים יחד: רשומה אחת ורק שליחה אחת לוואטסאפ',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();a.scan();await a.flush();
 a.run('openReturnsSend()');b.run('openReturnsSend()');await Promise.all([a.run(`performSend({name:'א',phone:'0500000000'})`),b.run(`performSend({name:'ב',phone:'0500000000'})`)]);await tick();
 assert.equal(drafts(cloud).length,1);assert.equal([a,b].filter(r=>r.run('window.location.href').includes('wa.me')).length,1);
});
test('טלפון שנפתח אחרי שבוע לא מחזיר פריטים שכבר נשלחו',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א');await tick();a.scan();await a.flush();const stale=new Map(a.storage);
 await a.send();await a.flush();const b=phone(cloud,'ב',{storage:stale,online:false,clock:900000});b.scan('code_238');await b.online(true);
 assert.equal(qty(b),0);assert.equal(qty(b,'code_238'),1);
});

test('סריקה ראשונה לפני סיום העלייה נשמרת מקומית לפני חיבור לענן',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א',{online:false});a.scan();assert.equal(qty(a),1);
 assert.equal(Object.keys(JSON.parse(a.storage.get('bm_return_events_v1')).pending).length,1);
 await a.online(true);assert.equal(qty(a),1);
});
test('העברת הטיוטה הישנה מהשרת בשני טלפונים היא פעם אחת',async()=>{
 const cloud=createCloud();cloud.put(LEGACY,{draftIds:{weekly:'old'},slots:{weekly:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:9}],daily:[]},dates:{weekly:'2026-10-01'}});
 const a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();assert.equal(qty(a),9);assert.equal(qty(b),9);assert.equal(a.run('returnsDocDate'),'2026-10-01');
 await a.send();await b.flush();assert.equal(qty(b),0);assert.equal(drafts(cloud)[0].items[0].qty,9);
});
test('טיוטה ישנה שתעודתה כבר קיימת אינה נכנסת שוב לטיוטה',async()=>{
 const cloud=createCloud();cloud.put(ROOT+'returns/old',{items:[{productId:'code_101',qty:9}]});cloud.put(LEGACY,{draftIds:{weekly:'old'},slots:{weekly:[{productId:'code_101',name:'בדיקה',qty:9}]}});
 const a=phone(cloud,'א');await tick();assert.equal(qty(a),0);
});
test('תור ישן של טיוטה ושליחה מבודד, וכתיבת SDK ישנה לא נוגעת באירועים',async()=>{
 const old={op:'set',path:LEGACY.split('/'),data:{slots:{weekly:[{productId:'code_101',qty:99}]}},operationId:'returns_draft'};
 const final={op:'set',path:(ROOT+'returns/old').split('/'),data:{operationId:'old',items:[{productId:'code_101',qty:99}]},operationId:'old'};
 const storage=new Map([['bm_cloud_failed_writes_v1',JSON.stringify([{id:'draft',task:old},{id:'final',task:final}])]]);
 const cloud=createCloud(),a=phone(cloud,'א',{storage});await tick();a.scan();await a.flush();
 assert.equal(a.run('cloudFailedWrites.length'),0);assert.ok(storage.get('bm_returns_old_queue_v138'));
 a.context.__old=old;await assert.rejects(a.run('executeCloudTask(__old)'),/שמירת החזרות ישנה/);assert.equal(cloud.get(LEGACY),null);
 cloud.put(LEGACY,old.data);await tick();assert.equal(qty(a),1);
});
test('הפחתה 9 ל־4 והוספה מטלפון אחר מתחברות, וההסרה לא מוחקת את ההוספה',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();for(let n=0;n<9;n++)a.scan();await a.flush();
 await a.online(false);a.run("changeReturnQty('code_101',-5)");b.scan();await b.flush();await a.online(true);
 assert.equal(qty(a),5);assert.equal(qty(b),5);
 await a.online(false);a.run("removeReturn('code_101')");b.scan();await b.flush();await a.online(true);assert.equal(qty(a),1);assert.equal(qty(b),1);
});
test('אין מקום בטלפון: סריקה לא מסומנת כנשמרה ולא נשלחת בלי גיבוי',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א');await tick();a.scan();await a.flush();
 a.run("localStorage.setItem=()=>{throw new Error('quota')};");a.scan();await tick();assert.equal(qty(a),1);assert.match(a.toasts.at(-1),/אין מקום/);
 assert.equal(Object.keys(cloud.get(ROOT+'drafts/returns_events_berman_v1').events).length,1);
});
test('כישלון שליחה משאיר סריקות, ושתי שליחות הבאות יוצרות מזהים שונים',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א');await tick();a.scan();await a.flush();await a.online(false);await a.send();assert.equal(drafts(cloud).length,0);assert.equal(qty(a),1);assert.equal(a.run('window.location.href'),'');
 await a.online(true);await a.send();a.scan();await a.flush();await a.send();assert.equal(drafts(cloud).length,2);assert.ok(drafts(cloud).every(x=>x.items[0].qty===1));
});
test('תשובת שליחה אבדה: ניסיון חוזר מוצא את אותה רשומה בלי כפל',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א');await tick();a.scan();await a.flush();cloud.loseReplyAfterCommit=true;await a.send();assert.equal(drafts(cloud).length,1);assert.equal(a.run('window.location.href'),'');
 cloud.loseReplyAfterCommit=false;await a.run(`performSend({name:'בדיקה',phone:'0500000000'})`);await tick();assert.equal(drafts(cloud).length,1);assert.match(a.run('window.location.href'),/wa.me/);
});
test('החזרה לרשימה והמחיקה עם גיבוי הן עסקה אחת גם בשני טלפונים',async()=>{
 const cloud=createCloud(),source={id:'saved',credited:false,items:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:3}]};cloud.put(ROOT+'returns/saved',source);
 const a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();for(const r of [a,b]){r.context.source=source;r.run('returns=[structuredClone(source)]');}
 await Promise.all([a.run("saveReturnUnsend('saved')"),b.run("saveReturnUnsend('saved')")]);await tick();assert.equal(cloud.get(ROOT+'returns/saved'),null);assert.equal(cloud.paths('/trash/').length,1);assert.equal(qty(a),3);assert.equal(qty(b),3);
});
test('ביטול החזרה לרשימה לא מוריד סריקה שנוספה בטלפון השני',async()=>{
 const cloud=createCloud(),source={id:'saved',credited:false,items:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:3}]};cloud.put(ROOT+'returns/saved',source);
 const a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();a.context.source=source;a.run('returns=[structuredClone(source)];globalThis.undo=null;showToast=(text,label,cb)=>{if(cb)undo=cb}');
 await a.run("saveReturnUnsend('saved')");await tick();b.scan();await b.flush();await a.run('undo()');await tick();assert.equal(qty(a),1);assert.ok(cloud.get(ROOT+'returns/saved'));assert.equal(cloud.paths('/trash/').length,0);
});

test('גיבוי התור מלא: הפעולה הישנה נשארת בטלפון אך אינה יכולה לכתוב לענן',async()=>{
 const task={op:'set',path:LEGACY.split('/'),data:{slots:{weekly:[{productId:'code_101',qty:9}]}},operationId:'returns_draft'},storage=new Map([['bm_cloud_failed_writes_v1',JSON.stringify([{id:'queued',task}])]]);
 const r=runtime({storage,globals:{localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(k==='bm_returns_old_queue_v138')throw Error('quota');storage.set(k,v)},removeItem:k=>storage.delete(k)}}});
 assert.equal(r.run('cloudFailedWrites.length'),1);assert.equal(JSON.parse(storage.get('bm_cloud_failed_writes_v1')).length,1);r.context.oldtask={op:'batch',writes:[task]};await assert.rejects(r.run('executeCloudTask(oldtask)'),/שמירת החזרות ישנה/);
});
test('תאריך מטלפון אחר נשמר בניווט בין שבועית ויומית',async()=>{
 const cloud=createCloud(),a=phone(cloud,'א'),b=phone(cloud,'ב');await tick();a.scan();await a.flush();a.run("returnsDocDate='2026-10-01';saveReturnsDraft()");await a.flush();
 assert.equal(b.node('retDocDate').value,'2026-10-01');b.node('retDocDate').value='2026-09-01';
 await b.click('ret-slot',''); // הקלט עצמו אינו מקור חדש; רק אירוע input אמיתי משנה תאריך.
 b.run("switchReturnsSlot('daily');switchReturnsSlot('weekly')");b.scan();await b.flush();assert.equal(a.run('returnsDocDate'),'2026-10-01');
});
test('גיבוי כללי אינו מוחק מצבות או מחליף תעודות שנשלחו מהמנגנון',async()=>{
 const r=runtime(), ledger={schemaVersion:1,app:'berman',sent:{event:'saved'}},record={returnEventSend:{app:'berman',slot:'weekly',epoch:0},items:[{productId:'code_101',qty:4}]},ops=[];
 r.context.__ledger=ledger;r.context.__record=record;r.context.__ops=ops;
 r.run(`setView=()=>{};logAction=async()=>{};globalThis.collection=(_db,...p)=>p.join('/');globalThis.doc=(_db,...p)=>p.join('/');globalThis.getDocs=async path=>({docs:path.endsWith('/drafts')?[{id:'returns_events_berman_v1',ref:path+'/returns_events_berman_v1',data:()=>__ledger}]:path.endsWith('/returns')?[{id:'saved',ref:path+'/saved',data:()=>__record}]:[]});commitBackupOpQueue=async x=>{__ops.push(...x);return x.length;};`);
 r.context.backup={backupType:'berman-firestore-full',appId:'berman-app-classic',collections:{drafts:{returns_events_berman_v1:{events:{old:{}}}},returns:{saved:{items:[{qty:99}]}}}};
 await r.run('applyBackupToCloud(backup)');assert.equal(ops.some(x=>String(x.ref).includes('returns_events_berman_v1')||String(x.ref).endsWith('/returns/saved')),false);
});

test('ביטול החזרה לרשימה אחרי הסרת הפריטים נחסם בלי להחיות את התעודה',async()=>{
 const cloud=createCloud(),source={id:'saved',credited:false,items:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:3}]};cloud.put(ROOT+'returns/saved',source);
 const a=phone(cloud,'א');await tick();a.context.source=source;a.run('returns=[structuredClone(source)];globalThis.undo=null;showToast=(text,label,cb)=>{if(cb)undo=cb}');
 await a.run("saveReturnUnsend('saved')");a.run("globalThis.originalUndo=undo;removeReturn('code_101')");await a.flush();await a.run('originalUndo()');await tick();assert.equal(cloud.get(ROOT+'returns/saved'),null);assert.equal(qty(a),0);
});
test('ביטול העברת פער שחלקו הוסר נחסם ואינו מוחק את שאר היחידות',async()=>{
 const cloud=createCloud(),source={id:'carried',credited:true,items:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:3,noteQty:0}],carriedNotes:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:3}]};cloud.put(ROOT+'returns/carried',source);
 const a=phone(cloud,'א');await tick();a.context.source=source;a.run('returns=[structuredClone(source)];returnsList=[{productId:"carry_a",name:"מוצר בדיקה",barcode:"101",qty:1,carried:true,carriedFrom:"carried",manual:true}];saveReturnsDraft()');await a.flush();await a.run('undoReturnCarry("carried")');await tick();
 assert.equal(cloud.get(ROOT+'returns/carried').carriedNotes[0].qty,3);assert.equal(qty(a,'carry_a'),1);
});

test('שחזור מסל המחזור אינו יוצר תעודה כפולה אחרי שהפריטים חזרו לרשימה',async()=>{
 const r=runtime();r.run('trash=[{trashId:"unsent",collectionName:"returns",originalId:"sent",reason:"unsend-return",data:{items:[{qty:3}]}}]');
 await r.run('restoreTrashItem("unsent")');assert.equal(r.writes.length,0);assert.match(r.toasts.at(-1),/אי אפשר לשחזר בנפרד/);
});

test('גיבוי ישן ו-set גנרי אינם מחיים מקור ללא תג לאחר החזרה לרשימה',async()=>{
 const cloud=createCloud(),source={id:'legacy',credited:false,items:[{productId:'code_101',name:'מוצר בדיקה',barcode:'101',qty:3}]};cloud.put(ROOT+'returns/legacy',source);
 const a=phone(cloud,'א');await tick();a.context.source=source;a.run('returns=[structuredClone(source)]');await a.run('saveReturnUnsend("legacy")');await tick();
 assert.equal(cloud.get(ROOT+'returns/legacy'),null);assert.equal(qty(a),3);assert.ok(cloud.get(ROOT+'drafts/returns_events_berman_v1').protectedRecords.legacy);
 a.context.backupRows={legacy:source};a.context.empty={docs:[]};assert.equal(await a.run('restoreReturnsBackupDocs(backupRows,empty)'),0);
 a.context.restore={op:'set',path:(ROOT+'returns/legacy').split('/'),data:source,operationId:'restore_old'};await assert.rejects(a.run('executeCloudTask(restore)'),/שחזור ישן/);
 a.context.restoreBatch={op:'batch',writes:[{...a.context.restore},{op:'delete',path:[...ROOT.split('/').filter(Boolean),'trash','copy']}]};await assert.rejects(a.run('executeCloudTask(restoreBatch)'),/שחזור ישן/);
 assert.equal(cloud.get(ROOT+'returns/legacy'),null);assert.equal(qty(a),3);
});
