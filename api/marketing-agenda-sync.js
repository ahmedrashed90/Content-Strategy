/** Server-to-server endpoint registered in Marketing phase 1: POST /api/marketing-agenda-sync */
import {requireSyncKey,json,PublicationError,storeSnapshot} from './_publication-store.js';
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{ok:false,error:'Method not allowed'});}
  try{
    requireSyncKey(req);
    if(Number(req.headers['content-length']||0)>2500000)return json(res,413,{ok:false,error:'حجم المزامنة كبير جدًا'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(Buffer.byteLength(JSON.stringify(body||{}),'utf8')>2500000)return json(res,413,{ok:false,error:'حجم المزامنة كبير جدًا'});
    const result=await storeSnapshot(body);
    return json(res,200,result);
  }catch(err){
    if(err instanceof PublicationError)return json(res,err.status,{ok:false,error:err.message});
    if(err instanceof SyntaxError||/^(.+غير صالح|.+غير صحيحة|.+غير مدعوم|.+مكرر|.+يجب|.+تجاوزت|.+لا تحتوي|.+غير متوافقة|.+لا يمكن)/.test(String(err?.message||'')))return json(res,400,{ok:false,error:err.message});
    console.error('Publication agenda sync failed',{kind:err?.name||'error'});
    return json(res,500,{ok:false,error:'تعذر حفظ الأجندة في الاستراتيجية'});
  }
}
