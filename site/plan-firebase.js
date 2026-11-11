// The content plan is independent from the immutable social-account baseline.
// The seed JSON is never bundled into public /site JS or HTML.
import { connectFirebase } from './firebase.js';
import { validISODate } from './idea-import.js';

export const PLAN_ID = 'mzj-2026-launch-cycle-01';
const base = ['contentPlans', PLAN_ID];

async function sdk() {
  const connection = await connectFirebase();
  return { db: connection.firestore, api: connection.api.dbSdk };
}

export async function loadPublishingPlan() {
  const {db,api} = await sdk();
  const reference = api.doc(db,...base);
  const found = await api.getDoc(reference);
  if (!found.exists()) return null;
  const [assets,posts,runs] = await Promise.all([
    api.getDocs(api.collection(db,...base,'assets')),
    api.getDocs(api.collection(db,...base,'posts')),
    api.getDocs(api.collection(db,...base,'taskRuns'))
  ]);
  return { ...found.data(), taskRuns:runs.docs.map(doc=>({id:doc.id,...doc.data()})),
    assets: assets.docs.map(doc=>doc.data()).sort((a,b)=>a.code.localeCompare(b.code)),
    posts: posts.docs.map(doc=>doc.data()).sort((a,b)=>String(a.publicationDate||'').localeCompare(String(b.publicationDate||'')) || String(a.time||'').localeCompare(String(b.time||'')) || String(a.id).localeCompare(String(b.id)))
  };
}

export async function createPublishingPlan(seed,uid) {
  const {db,api} = await sdk();
  const docRef = api.doc(db,...base);
  if ((await api.getDoc(docRef)).exists()) throw new Error('plan-already-exists');
  const { assets,posts,...meta } = seed;
  const batch = api.writeBatch(db);
  batch.set(docRef, {...meta,ownerUid:uid,assetCount:assets.length,postCount:posts.length,
    createdAt:api.serverTimestamp()});
  for (const asset of assets) batch.set(api.doc(db,...base,'assets',asset.code),asset);
  for (const post of posts) batch.set(api.doc(db,...base,'posts',post.id),post);
  await batch.commit();
  return loadPublishingPlan();
}

export async function updatePublishingAsset(code,changes) {
  const {db,api}=await sdk();
  await api.updateDoc(api.doc(db,...base,'assets',code), {...changes,updatedAt:api.serverTimestamp()});
}

export async function updatePublishingPost(id,changes) {
  const {db,api}=await sdk();
  await api.updateDoc(api.doc(db,...base,'posts',id), {...changes,updatedAt:api.serverTimestamp()});
}

// Changes to publication + executor are atomic, including the four carousel slides.
export async function updatePostWithAssignment(postId,postChanges,assetCodes,executor) {
  const {db,api}=await sdk();
  const batch=api.writeBatch(db);
  batch.update(api.doc(db,...base,'posts',postId), {...postChanges,updatedAt:api.serverTimestamp()});
  for(const code of assetCodes) batch.update(api.doc(db,...base,'assets',code), {
    executor,updatedAt:api.serverTimestamp()
  });
  await batch.commit();
}

export async function updateManyAssets(codes,changes) {
  const {db,api}=await sdk();
  const batch=api.writeBatch(db);
  for(const code of codes) batch.update(api.doc(db,...base,'assets',code), {
    ...changes,updatedAt:api.serverTimestamp()
  });
  await batch.commit();
}

// Applies a review decision atomically even when previous task links differ per asset.
// Never writes to the Marketing System and never deletes task records.
export async function updateReviewAssetRows(rows){
  if(!Array.isArray(rows)||!rows.length||rows.some(row=>!row?.code||!row?.changes))throw Error('invalid-review-update');
  const {db,api}=await sdk();
  const batch=api.writeBatch(db);
  for(const row of rows)batch.update(api.doc(db,...base,'assets',row.code),{...row.changes,updatedAt:api.serverTimestamp()});
  await batch.commit();
}

// One atomic write links every slide or media asset to the same real Marketing task.
export async function linkMarketingTask(links) {
  const {db,api}=await sdk();
  const batch=api.writeBatch(db);
  for(const link of links)batch.update(api.doc(db,...base,'assets',link.code),{
    marketingTaskId:link.taskId,marketingTaskNo:link.taskNo,
    marketingItemId:link.itemId,marketingExecutorName:link.executorName,
    marketingLinkedAt:api.serverTimestamp(),updatedAt:api.serverTimestamp()
  });
  await batch.commit();
}

// Each attempt to execute an approved idea is an INDEPENDENT record.
// Never overwrite the original idea or the prior Marketing task link.
export async function saveStrategyTaskRun(requestKey,data){
  const {db,api}=await sdk();
  const ref=api.doc(db,...base,'taskRuns',requestKey);
  const previous=await api.getDoc(ref);
  if(previous.exists()){
    if(JSON.stringify(previous.data().draft)!==JSON.stringify(data.draft))
      throw Error('بيانات التكليف المحفوظ اختلفت. افتح الطلب السابق قبل إنشاء جديد.');
    return {id:requestKey,...previous.data()};
  }
  await api.setDoc(ref,{draft:data.draft,status:'pending',createdAt:api.serverTimestamp()});
  return {id:requestKey,draft:data.draft,status:'pending'};
}
export async function finishStrategyTaskRun(requestKey,result){
  const {db,api}=await sdk();
  const ref=api.doc(db,...base,'taskRuns',requestKey);
  await api.updateDoc(ref,{status:'linked',taskId:result.id,taskNo:result.taskNo,
    linkedItems:result.items.map(i=>({id:i.id,clientKey:i.client_key})),
    linkedAt:api.serverTimestamp()});
}

// Adds new ideas WITHOUT modifying existing posts, assets, or root plan metadata.
export async function importPublishingIdeas(ideas){
  if(!Array.isArray(ideas)||!ideas.length||ideas.length>80)throw Error('invalid-batch');
  const {db,api}=await sdk();
  for(const idea of ideas){
    if(!/^[A-Za-z0-9_-]{3,44}$/.test(idea.code)||!['video','image'].includes(idea.kind)||!['','محمود','بلال','عبدالله'].includes(idea.executor)||idea.status!=='لم يبدأ'||idea.reviewStatus!=='بانتظار المراجعة')throw Error('invalid-idea');
    if((await api.getDoc(api.doc(db,...base,'assets',idea.code))).exists())throw Error('idea-already-exists');
  }
  const batch=api.writeBatch(db);
  for(const idea of ideas)batch.set(api.doc(db,...base,'assets',idea.code),{...idea,createdAt:api.serverTimestamp()});
  await batch.commit();
  return loadPublishingPlan();
}

// New publishing slots, independently of the initial fixed 28-day seed.
export async function createPublishingPost(post){
  if(!post?.id||!post?.ideaCode||!validISODate(post.publicationDate)||!Array.isArray(post.platforms)||!post.platforms.length||post.status!=='مخطط')throw Error('invalid-post');
  const {db,api}=await sdk();
  const ref=api.doc(db,...base,'posts',post.id);
  if((await api.getDoc(ref)).exists())throw Error('post-already-exists');
  await api.setDoc(ref,{...post,createdAt:api.serverTimestamp()});
  return post;
}


// Replace the visible idea bank without deleting history, published posts, task links,
// review events or Marketing records. The write is atomic (up to 400 operations).
// Retired assets remain readable for historical posts, but are hidden from active workflows.
export async function replacePublishingIdeas(ideas, batchId) {
  if (!Array.isArray(ideas) || !ideas.length || ideas.length > 80) throw Error('invalid-batch');
  const {db,api}=await sdk();
  const assetsRef=api.collection(db,...base,'assets');
  const snapshot=await api.getDocs(assetsRef);
  const existing=snapshot.docs.map(row=>({id:row.id,data:row.data(),ref:row.ref}));
  const allCodes=new Set(existing.map(row=>row.id));
  const unique=new Set();
  for (const idea of ideas) {
    if (!/^[A-Za-z0-9_-]{3,44}$/.test(idea.code) ||
        !['video','image'].includes(idea.kind) ||
        !['','محمود','بلال','عبدالله'].includes(idea.executor) ||
        idea.status!=='لم يبدأ' || idea.reviewStatus!=='بانتظار المراجعة' ||
        allCodes.has(idea.code) || unique.has(idea.code)) throw Error('invalid-replacement-idea');
    unique.add(idea.code);
  }
  const active=existing.filter(row=>!row.data.retiredFromIdeaBank);
  // An unconfirmed remote task creation must be resolved before retiring its idea.
  if (active.some(row=>row.data.integrationRequestKey && !row.data.marketingTaskId))
    throw Error('pending-marketing-assignment');
  if (active.length+ideas.length>400)throw Error('replacement-too-large');
  const batch=api.writeBatch(db);
  for (const row of active)batch.update(row.ref,{
    retiredFromIdeaBank:true,retiredAt:api.serverTimestamp(),
    retiredReason:'استبدال بنك الأفكار - '+String(batchId||'').slice(0,60),
    updatedAt:api.serverTimestamp()
  });
  for (const idea of ideas)batch.set(api.doc(db,...base,'assets',idea.code),{
    ...idea,retiredFromIdeaBank:false,createdAt:api.serverTimestamp()
  });
  await batch.commit();
  return loadPublishingPlan();
}
