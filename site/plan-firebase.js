// The content plan is independent from the immutable social-account baseline.
// The seed JSON is never bundled into public /site JS or HTML.
import { connectFirebase } from './firebase.js';

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
  const [assets,posts] = await Promise.all([
    api.getDocs(api.collection(db,...base,'assets')),
    api.getDocs(api.collection(db,...base,'posts'))
  ]);
  return { ...found.data(),
    assets: assets.docs.map(doc=>doc.data()).sort((a,b)=>a.code.localeCompare(b.code)),
    posts: posts.docs.map(doc=>doc.data()).sort((a,b)=>a.day-b.day)
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
