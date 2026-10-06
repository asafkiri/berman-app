// גבול ענן משותף לבדיקות ההחזרות הקיימות; כל לוגיקת האפליקציה והמנוע אמיתית.
import { createCloud } from './shared-return-fake.mjs';
const ROOT='artifacts/berman-app-classic/public/data/';
export function returnsCloud(rt) {
  const cloud=createCloud(),client=cloud.client();
  rt.context.__returnFs=client.fs;
  rt.returnCloud=cloud;
  rt.startReturnsCloud=async()=>{
  rt.run(`for (const k of ['doc','onSnapshot','runTransaction','getDocFromServer','updateDoc','deleteField','setDoc']) globalThis[k]=__returnFs[k];`);
    const rows=JSON.parse(rt.run('JSON.stringify({items:returnsList,date:returnsDocDate})'));
    const docs=JSON.parse(rt.run('JSON.stringify(returns)'));
    for(const record of docs) {const {id,...data}=record;cloud.put(ROOT+'returns/'+id,data);}
    const original=rt.run('runCloudTask');
    rt.context.__returnBoundary=async(label,task)=>{ const result=await original(label,task);if(result!==false && task.path?.includes('returns')) {
      const path=task.path.join('/');cloud.put(path,task.op==='update'?{...cloud.get(path),...task.data}:task.data);
    } return result; };
    rt.run('runCloudTask=__returnBoundary; startReturnsEvents()');
    await rt.run('returnsEvents.start()');
    rt.context.__returnRows=rows;
    rt.run('returnsList=__returnRows.items; returnsDocDate=__returnRows.date; saveReturnsDraft()');
    await rt.run('returnsEvents.flush()');
  };
  rt.savedReturnWrites=()=>cloud.writes.filter(w=>w.path.startsWith(ROOT+'returns/')).map(w=>({...w,path:w.path.split('/')}));
  return rt;
}
