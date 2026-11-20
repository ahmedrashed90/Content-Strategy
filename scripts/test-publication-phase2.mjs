/** Deterministic, synthetic-only contract tests. Never contacts Firebase or Google Drive. */
import assert from 'node:assert/strict';
import { normalizePublicationSnapshot, publicationRevision, splitPublicationEntries } from '../lib/publication-contract.js';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const planId=uuid(11),lineId=uuid(12),postId=uuid(13),taskId=uuid(14),fileId=uuid(15),fileTypeId=uuid(16),platformId=uuid(17);
const media={id:fileId,name:'فيديو نهائي - 1080x1920.mp4',mimeType:'video/mp4',fileSize:658299,formatId:fileTypeId,
  width:1080,height:1920,downloadPath:`/api/strategy-integration/publication-file?planId=${planId}&fileId=${fileId}`};
const row={id:`${lineId}:${fileTypeId}`,lineId,productId:postId,taskId,taskNo:'TSK-000224',taskName:'فيديو عن سيارة جديدة',
  requirementNumber:1,requestNo:'TSK-000224-01',ideaCode:'IDEA-22',ideaName:'فيديو تعريفي',mediaKind:'video',scheduledOn:'2026-12-01',
  platform:{id:platformId,name:'Instagram',code:'instagram'},postType:{id:fileTypeId,name:'Reel',width:1080,height:1920},
  caption:'محتوى سعودي كامل دون اختصار\nالسطر الثاني',hashtags:'#MZJ #سيارات',publishStatus:'scheduled',fileStatus:'ready',files:[media]};
const snapshot={ok:true,schema:'mzj-agenda-publishing/v1',sourceSystem:'mzj-marketing',
  agenda:{id:planId,name:'أجندة شهر 12',planNo:'AG-2026-12',publishFrom:'2026-12-01',publishTo:'2026-12-31',reviewStatus:'approved',updatedAt:'2026-11-21T12:00:00Z'},
  entries:[row],totals:{posts:1,ready:1,waiting:0,incomplete:0}};
let normalized=normalizePublicationSnapshot(snapshot);
assert.equal(normalized.totals.ready,1);
assert.equal(normalized.entries[0].caption,row.caption);
assert.equal(normalized.entries[0].requestNo,'TSK-000224-01');
assert.deepEqual(Object.keys(normalized.entries[0].files[0]).sort(),['fileSize','formatId','height','id','mimeType','name','width'].sort());
assert.equal(JSON.stringify(normalized).includes('downloadPath'),false,'Never store the raw Marketing/Drive path in Strategy');
const revision=publicationRevision(normalized);
assert.equal(revision,publicationRevision(normalizePublicationSnapshot(snapshot)),'Idempotent same-snapshot revision');
const waiting=structuredClone(snapshot);waiting.entries[0].fileStatus='waiting_file';waiting.entries[0].files=[];
normalized=normalizePublicationSnapshot(waiting);
assert.equal(normalized.entries[0].files.length,0);
assert.equal(normalized.totals.waiting,1);
assert.notEqual(publicationRevision(normalized),revision,'Newly approved media changes revision');
const incomplete=structuredClone(waiting);incomplete.entries[0].platform=null;incomplete.entries[0].fileStatus='needs_publish_type';
assert.equal(normalizePublicationSnapshot(incomplete).totals.incomplete,1,'A post type may exist without a platform in the draft');
const noType=structuredClone(incomplete);noType.entries[0].postType=null;noType.entries[0].id=`${lineId}:unassigned`;
assert.equal(normalizePublicationSnapshot(noType).entries[0].postType,null);
const invalid=structuredClone(snapshot);invalid.entries[0].files[0].id=uuid(999);
assert.equal(normalizePublicationSnapshot(invalid).entries[0].files[0].id,uuid(999));
const broken=structuredClone(snapshot);broken.entries[0].id='forged-id';
assert.throws(()=>normalizePublicationSnapshot(broken),/معرّف/);
const duplicate=structuredClone(snapshot);duplicate.entries.push(duplicate.entries[0]);
assert.throws(()=>normalizePublicationSnapshot(duplicate),/مكرر/);
const unapproved=structuredClone(snapshot);unapproved.entries[0].fileStatus='waiting_file';
assert.throws(()=>normalizePublicationSnapshot(unapproved),/حالة/);
const changedContent=structuredClone(snapshot);changedContent.entries[0].caption='نص جديد';
assert.notEqual(revision,publicationRevision(normalizePublicationSnapshot(changedContent)));
// Large agenda partitioned safely, maintaining all independently identifiable posting slots.
const large=Array.from({length:330},(_,i)=>({...row,lineId:uuid(2000+i),id:`${uuid(2000+i)}:${fileTypeId}`,caption:'وصف الفكرة '.repeat(140),files:i%3?[]:[media],fileStatus:i%3?'waiting_file':'ready'}));
const many=normalizePublicationSnapshot({...snapshot,entries:large});
const groups=splitPublicationEntries(many.entries);
assert(groups.length>1);
assert.equal(groups.flat().length,330);
assert(groups.every(group=>Buffer.byteLength(JSON.stringify(group),'utf8')<115000));
console.log(`PASS: valid/invalid agenda payload, per-size approvals, incomplete drafts, no Drive links, idempotent revisions, 330 rows in ${groups.length} atomic blocks`);
