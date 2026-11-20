/** Private binary relay. The browser never receives a Drive URL or server integration key. */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { requireOwner,json,PublicationError,uuid,agendaDetails,marketingOrigin,marketingKey } from './_publication-store.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{ok:false,error:'Method not allowed'});}
  let streaming=false;
  try{
    await requireOwner(req);
    const agendaId=String(req.query?.agendaId||''),fileId=String(req.query?.fileId||'');
    if(!uuid(agendaId)||!uuid(fileId))throw new PublicationError(400,'معرّف الأجندة أو الملف غير صالح');
    const snapshot=await agendaDetails(agendaId);
    // The requested media must belong to a synced, currently ready entry.
    const matched=snapshot.entries.find(entry=>entry.fileStatus==='ready'&&entry.files.some(f=>f.id===fileId.toLowerCase()));
    const file=matched?.files.find(f=>f.id===fileId.toLowerCase());
    if(!file)throw new PublicationError(404,'الملف غير موجود ضمن الملفات النهائية المعتمدة للأجندة');
    const url=new URL('/api/strategy-integration/publication-file',marketingOrigin());
    url.searchParams.set('planId',agendaId);url.searchParams.set('fileId',fileId);
    let upstream;
    try{upstream=await fetch(url,{headers:{Authorization:`Bearer ${marketingKey()}`,Accept:'application/octet-stream,*/*'},redirect:'error',signal:AbortSignal.timeout(85000)});}
    catch{throw new PublicationError(502,'تعذر الحصول على الملف الفعلي من Google Drive عبر التسويق');}
    if(!upstream.ok||!upstream.body)throw new PublicationError(upstream.status===404?404:502,'الملف النهائي غير متاح حاليًا أو تم إلغاء اعتماده');
    const type=String(upstream.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(type.includes('json')||type.includes('html'))throw new PublicationError(502,'المصدر لم يُرجع ملف الصورة أو الفيديو الفعلي');
    const name=String(file.name||'final-media').replace(/[\r\n\\"/]/g,'_').slice(0,200);
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Type',file.mimeType);
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    const length=String(upstream.headers.get('content-length')||'');if(/^\d+$/.test(length))res.setHeader('Content-Length',length);
    res.status(200);streaming=true;
    await pipeline(Readable.fromWeb(upstream.body),res);
  }catch(err){
    if(streaming){console.error('Publication media stream interrupted',{kind:err?.name||'error'});return;}
    if(err instanceof PublicationError)return json(res,err.status,{ok:false,error:err.message});
    console.error('Publication media unavailable',{kind:err?.name||'error'});
    return json(res,500,{ok:false,error:'تعذر جلب الملف الفعلي للنشر'});
  }
}
