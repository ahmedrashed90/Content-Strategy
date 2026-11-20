/** The dedicated Marketing -> Strategy publication contract. No app plan/task mutations. */
import { createHash } from 'node:crypto';

export const AGENDA_SCHEMA = 'mzj-agenda-publishing/v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['ready','waiting_file','needs_publish_type','unsupported_storage']);
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value,max=255) => {if(typeof value!=='string')return '';if(value.length>max)error('حقل نصي أكبر من الحد المسموح');return value.trim();};
const error = reason => { throw new Error(reason); };
const numeric = value => Number.isInteger(value) && value > 0 && value <= 16000 ? value : null;

function validPlatform(value) {
  if (!object(value) || !UUID.test(value.id)) error('معرّف منصة النشر غير صالح');
  return { id:value.id.toLowerCase(), code:text(value.code,64), name:text(value.name,130) };
}
function validPostType(value) {
  if (!object(value) || !UUID.test(value.id)) error('معرّف نوع النشر غير صالح');
  return { id:value.id.toLowerCase(), name:text(value.name,130), width:numeric(value.width), height:numeric(value.height) };
}
function validMedia(file) {
  if (!object(file) || !UUID.test(file.id)) error('معرّف الملف النهائي غير صالح');
  if (!/^(image|video)\/[A-Za-z0-9.+-]+$/.test(text(file.mimeType,100))) error('نوع الملف النهائي غير مدعوم');
  return { id:file.id.toLowerCase(), name:text(file.name,255)||'final-media', mimeType:text(file.mimeType,100),
    fileSize:Number.isSafeInteger(file.fileSize) && file.fileSize >= 0 ? file.fileSize : 0,
    formatId:text(file.formatId,120), width:numeric(file.width), height:numeric(file.height) };
}
function normalizedEntry(value,agendaId) {
  if (!object(value) || !UUID.test(value.lineId) || !UUID.test(value.productId) || !UUID.test(value.taskId)) error('معرّفات المطلوب غير صحيحة');
  const lineId=value.lineId.toLowerCase();
  const platform=value.platform==null?null:validPlatform(value.platform);
  const postType=value.postType==null?null:validPostType(value.postType);
  const expectedId=`${lineId}:${postType?.id||'unassigned'}`;
  if (String(value.id||'').toLowerCase() !== expectedId) error('معرّف سجل النشر غير مطابق لرقم المطلوب ونوعه');
  // A Marketing draft can have a post type but no linked platform yet. Keep it incomplete.
  if (platform && !postType) error('نوع النشر غير محدد للمنصة');
  if (!isoDate(value.scheduledOn)) error('تاريخ النشر غير صالح');
  const fileStatus=text(value.fileStatus,40);
  if (!STATUSES.has(fileStatus)) error('حالة الملف النهائي غير مدعومة');
  if (!Array.isArray(value.files) || value.files.length>32) error('عدد الملفات النهائية غير صالح');
  const files=value.files.map(validMedia);
  if ((fileStatus==='ready') !== (files.length>0)) error('حالة الجاهزية غير متوافقة مع عدد الملفات');
  if (files.length && !postType) error('لا يمكن ربط ملف بدون نوع نشر');
  if (new Set(files.map(f=>f.id)).size!==files.length) error('ملف نهائي مكرر');
  return {
    id:expectedId,agendaId, lineId,productId:value.productId.toLowerCase(),taskId:value.taskId.toLowerCase(),
    taskNo:text(value.taskNo,90), taskName:text(value.taskName,350), requestNo:text(value.requestNo,110),
    requirementNumber:Number.isInteger(value.requirementNumber)&&value.requirementNumber>0?value.requirementNumber:null,
    ideaName:text(value.ideaName,400),productIdea:text(value.productIdea,400),ideaCode:text(value.ideaCode,80),mediaKind:text(value.mediaKind,40),
    scheduledOn:value.scheduledOn,platform,postType,
    // Do not truncate publication copy: Marketing is the source of truth.
    caption:typeof value.caption==='string' && value.caption.length<=60000 ? value.caption : (value.caption==null?'':error('الكابشن أكبر من الحد المسموح')) ,
    hashtags:typeof value.hashtags==='string' && value.hashtags.length<=30000 ? value.hashtags : (value.hashtags==null?'':error('الهاشتاجات أكبر من الحد المسموح')),
    publishStatus:text(value.publishStatus,80)||null,fileStatus,
    fileNote:text(value.fileNote,350),files,
  };
}

export function normalizePublicationSnapshot(raw) {
  if (!object(raw) || raw.ok!==true || raw.schema!==AGENDA_SCHEMA || raw.sourceSystem!=='mzj-marketing')
    error('صيغة مزامنة أجندة التسويق غير مدعومة');
  const original=raw.agenda;
  if (!object(original) || !UUID.test(original.id)) error('معرّف الأجندة غير صالح');
  if (!isoDate(original.publishFrom)||!isoDate(original.publishTo)||original.publishFrom>original.publishTo)
    error('نطاق تاريخ الأجندة غير صالح');
  const agenda={id:original.id.toLowerCase(),planNo:text(original.planNo,110),name:text(original.name,300)||'أجندة بدون اسم',
    publishFrom:original.publishFrom,publishTo:original.publishTo,reviewStatus:text(original.reviewStatus,90),
    updatedAt:original.updatedAt==null?'':text(String(original.updatedAt),80)};
  if (!Array.isArray(raw.entries)||!raw.entries.length||raw.entries.length>1500) error('الأجندة لا تحتوي على عدد صالح من سجلات النشر');
  const entries=raw.entries.map(x=>normalizedEntry(x,agenda.id));
  if (new Set(entries.map(x=>x.id)).size!==entries.length) error('تم استلام سجل نشر مكرر بنفس المعرّف');
  const totals={posts:entries.length,ready:entries.filter(x=>x.fileStatus==='ready').length,
    waiting:entries.filter(x=>x.fileStatus==='waiting_file').length,
    incomplete:entries.filter(x=>!['ready','waiting_file'].includes(x.fileStatus)).length};
  return {schema:AGENDA_SCHEMA,sourceSystem:'mzj-marketing',agenda,entries,totals};
}

export function publicationRevision(snapshot) {
  return createHash('sha256').update(JSON.stringify({agenda:snapshot.agenda,entries:snapshot.entries})).digest('hex');
}

/** Each Firestore revision block stays far below the 1MiB document limit. */
export function splitPublicationEntries(entries,maxBytes=105000) {
  const groups=[];
  let current=[],used=0;
  for(const entry of entries){
    const bytes=Buffer.byteLength(JSON.stringify(entry),'utf8')+3;
    if (bytes>maxBytes) error('بيانات منشور واحد تجاوزت حد التخزين');
    if (current.length && used+bytes>maxBytes){groups.push(current);current=[];used=0;}
    current.push(entry);used+=bytes;
  }
  if(current.length) groups.push(current);
  return groups;
}
