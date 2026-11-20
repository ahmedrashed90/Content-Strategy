/** Owner-only list/read/refresh for Marketing-synced publication agendas. */
import {requireOwner,json,PublicationError,uuid,listAgendas,agendaDetails,fetchMarketingSnapshot,storeSnapshot,savePublicationCopy,savePublicationIdeaTitle} from './_publication-store.js';
export default async function handler(req,res){
  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');return json(res,405,{ok:false,error:'Method not allowed'});}
  try{
    await requireOwner(req);
    if(method==='GET'){
      const agendaId=String(req.query?.agendaId||'');
      return json(res,200,agendaId?{ok:true,...await agendaDetails(agendaId)}:{ok:true,agendas:await listAgendas()});
    }
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(body?.action==='save-idea'){
      const result=await savePublicationIdeaTitle(body.agendaId,body.productId,body.title);
      return json(res,200,result);
    }
    if(body?.action==='save-copy'){
      const result=await savePublicationCopy(body.agendaId,body.entryId,body.caption,body.hashtags);
      return json(res,200,result);
    }
    if(body?.action!=='refresh'||!uuid(body.agendaId))throw new PublicationError(400,'طلب تحديث الأجندة غير صالح');
    // Only an agenda already received from Marketing can be refreshed this way.
    await agendaDetails(body.agendaId);
    const snapshot=await fetchMarketingSnapshot(body.agendaId);
    const result=await storeSnapshot(snapshot);
    return json(res,200,{...result,updated:true});
  }catch(err){
    if(err instanceof PublicationError)return json(res,err.status,{ok:false,error:err.message});
    console.error('Publication agendas error',{kind:err?.name||'error'});
    return json(res,500,{ok:false,error:'تعذر قراءة أو تحديث أجندات النشر'});
  }
}
