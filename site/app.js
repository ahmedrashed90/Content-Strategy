import { INITIAL_BASELINE, PLATFORM_ORDER } from './baseline.js';
import { FIREBASE_CONFIG, OWNER_UID } from './config.js';
import { connectFirebase, listenToAuth, loginWithEmail, logout, getStoredBaseline, createStoredBaseline } from './firebase.js';
import { loadPublishingPlan, createPublishingPlan, updatePublishingAsset, updatePostWithAssignment, updateManyAssets, updateReviewAssetRows, importPublishingIdeas, replacePublishingIdeas, loadPublishingProposals, createPublishingProposal, createPublishingPost } from './plan-firebase.js';
import { PEOPLE,PLATFORMS,POST_STATUSES,TASK_STATUSES,REVIEW_STATUSES,planPage,tasksPage,ideasPage,archivePage,schedulePage,postDetailPage,assetDetailPage,getIdea,taskCodes,ideaAssets,ideaIsApproved,ideaIsLinked,toBriefText,teamHandoffText,validatePlanSeed,nowInRiyadh } from './planner.js';
import { prepareIdeaBatch, ideaBatchTemplate, validISODate } from './idea-import.js';
import { newBridgeState, reloadBridge, bridgePage, approveBridgeIdea, assignBridgeIdea, selectBridgeIdea, checkBridgeTask } from './marketing-bridge.js';
import { proposalsPage, proposalFromForm } from './proposals.js';

const app = document.getElementById('app');
const isLocalPreview = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).get('preview') === '1'
  && Boolean(globalThis.__MZJ_PREVIEW_DATA__);

const state = {
  ready: isLocalPreview,
  firebaseError: null,
  user: isLocalPreview ? { email: 'preview@localhost', uid: 'local-preview' } : null,
  baseline: isLocalPreview ? (globalThis.__MZJ_PREVIEW_DATA__ || INITIAL_BASELINE) : INITIAL_BASELINE,
  pendingSeed: null,
  baselineStatus: isLocalPreview ? 'preview' : 'loading',
  authError: '',
  signingIn: false,
  storing: false,
  view: 'overview',
  platform: 'facebook',
  modal: null,
  mobileNav: false,
  legacyExists: false,
  upgradeRulesNeeded: false,
  dataError: '',
  plan: isLocalPreview ? (globalThis.__MZJ_PREVIEW_PLAN__ || null) : null,
  planStatus: isLocalPreview ? (globalThis.__MZJ_PREVIEW_PLAN__ ? 'preview' : 'missing') : 'loading',
  planError: '',
  pendingPlan: null,
  planSaving: false,
  planFilter: '',
  calendarMonth: '',
  calendarSelectedDate: '',
  calendarExecutor: 'all',
  calendarPlatform: 'all',
  calendarMedia: 'all',
  calendarStatus: 'all',
  scheduleIdeaCode: '',
  scheduleDate: '',
  ideaImportOpen: false,
  ideaReplaceMode: false,
  proposals: [],
  proposalSaving: false,
  pendingIdeaBatch: null,
  ideaImportError: '',
  importExecutor: '',
  taskPerson: 'الكل',
  taskWeek: 0,
  ideaKind: 'all',
  ideaReviewFilter: 'all',
  ideaSearch: '',
  archiveSearch: '',
  briefReturnView: 'ideas',
  briefReturnScrollY: 0,
  briefBaseline: '',
  selectedPostId: null,
  selectedAssetCode: null,
  bridge: newBridgeState()
};

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const formatDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' });
const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const num = (value, approximate = false) => value == null ? '—' : `${approximate ? '≈ ' : ''}${formatNumber.format(value)}`;
const pct = value => value == null ? '—' : `${formatNumber.format(value)}%`;
const signed = value => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value))}`;
const esc = raw => String(raw ?? '').replace(/[&<>"']/g, x => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[x]);
const platformData = key => state.baseline.platforms[key];
const dateText = input => formatDate.format(new Date(`${input}T12:00:00Z`));
const isOwnerConfigured = OWNER_UID && OWNER_UID !== '__SET_OWNER_UID__';

let toastTimeout;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => el.classList.remove('show'), 3800);
}

function statusTag() {
  if (state.baselineStatus === 'saved') return `<span class="note-tag positive">${icon('shield','ic-sm')} المراجع الأربع محفوظة في Firestore</span>`;
  if (state.baselineStatus === 'saved-v1') return `<span class="note-tag pending">${icon('alert','ic-sm')} المرجع القديم محفوظ — يلزم إضافة Snapchat</span>`;
  if (state.baselineStatus === 'saving') return `<span class="note-tag pending">${icon('refresh','ic-sm')} جارٍ حفظ المرجع</span>`;
  if (state.baselineStatus === 'not-saved') return `<span class="note-tag pending">${icon('alert','ic-sm')} المرجع لم يُستورد بعد</span>`;
  if (state.baselineStatus === 'ready-to-save') return `<span class="note-tag pending">${icon('alert','ic-sm')} جاهز للتثبيت بعد المراجعة</span>`;
  if (state.baselineStatus === 'denied') return `<span class="note-tag pending">${icon('alert','ic-sm')} يلزم تحديث قواعد Firestore</span>`;
  if (state.baselineStatus === 'preview') return `<span class="note-tag pending">${icon('eye','ic-sm')} معاينة محلية — غير محفوظ</span>`;
  return `<span class="note-tag pending">${icon('refresh','ic-sm')} فحص البيانات</span>`;
}

function platformLogo(key, size = '') {
  const inner = {
    facebook: '<span aria-hidden="true">f</span>',
    instagram: `${icon('instagram','ic-lg')}`,
    tiktok: `${icon('tiktok','ic-lg')}`,
    snapchat: `${icon('snapchat','ic-lg')}`
  }[key];
  return `<span class="platform-logo ${key} ${size}" aria-hidden="true">${inner}</span>`;
}

function authView() {
  const connection = state.ready
    ? `<span class="note-tag positive">${icon('check','ic-sm')} اتصال Firebase متاح</span>`
    : state.firebaseError
      ? `<span class="note-tag pending">${icon('alert','ic-sm')} تعذر تحميل Firebase</span>`
      : `<span class="note-tag pending">${icon('refresh','ic-sm')} جارٍ تهيئة الاتصال</span>`;
  return `<div class="auth-screen">
    <section class="auth-main" aria-label="تسجيل الدخول">
      <div class="auth-content">
        <div class="auth-logo"><span class="wordmark">MZJ</span><div><strong>محمد ذعار العجمي للسيارات</strong><small>نظام استراتيجية المحتوى · مستقل</small></div></div>
        <div class="page-eyebrow">${icon('lock','ic-sm')} دخول خاص بصاحب النظام</div>
        <h1>مرحبًا بعودتك</h1>
        <p class="subtitle">سجّل الدخول للاطلاع على بيانات الأداء المرجعية، قبل انطلاق استراتيجية MZJ الجديدة.</p>
        <form class="auth-form" id="login-form">
          <div class="field"><label for="email">البريد الإلكتروني</label><input id="email" name="email" type="email" autocomplete="username" placeholder="name@example.com" required /></div>
          <div class="field"><label for="password">كلمة المرور</label><div class="password-wrap"><input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••••" required /><button type="button" class="show-password" data-action="toggle-password">إظهار</button></div></div>
          ${state.authError ? `<div class="auth-error" role="alert">${esc(state.authError)}</div>` : ''}
          ${state.firebaseError ? `<div class="auth-error" role="alert">تعذر الاتصال بمكتبات Firebase. افتح الموقع عبر HTTPS أو localhost وتأكد من اتصال الإنترنت ثم حدّث الصفحة.</div>` : ''}
          <button class="btn btn-primary auth-submit" type="submit" ${!state.ready || state.signingIn ? 'disabled' : ''}>${icon(state.signingIn ? 'refresh':'lock','ic-sm')} ${state.signingIn ? 'جارٍ التحقق...' : 'تسجيل الدخول'}</button>
        </form>
        <div style="margin-top:18px">${connection}</div>
        <p class="auth-foot">حساب واحد فقط · Firebase Authentication · المشروع <span class="mono" dir="ltr">new-marketing-eaf85</span><br>لا توجد إمكانية لإنشاء حسابات جديدة من الواجهة.</p>
      </div>
    </section>
    <aside class="auth-visual"><div class="auth-visual-inner">
      <div class="intro-mark">MZJ / SOCIAL INTELLIGENCE</div>
      <h2>الأرقام تعرفنا<br>من أين نبدأ.</h2>
      <p>بداية استراتيجية مستمرة أساسها الأرقام الحقيقية، ومقارنة أداء الحسابات قبل وبعد — للوصول في النهاية إلى مبيعات قابلة للقياس.</p>
      <div class="auth-stat-row"><div class="auth-stat"><strong>04</strong><span>منصات لديها بيانات مرجعية</span></div><div class="auth-stat"><strong>01</strong><span>حساب إداري واحد فقط</span></div></div>
    </div></aside>
  </div>`;
}

function setupView() {
  const command = `node scripts/configure-owner.mjs ${state.user?.uid || 'FIREBASE_UID'}`;
  return `<main class="setup-screen">
    <div class="brand" style="border-bottom:0;padding-bottom:8px"><span class="wordmark">MZJ</span><span class="brand-ar">محمد ذعار العجمي للسيارات</span></div>
    <div class="setup-heading"><div class="page-eyebrow">${icon('shield','ic-sm')} خطوة حماية أخيرة</div><h1>تحديد مالك النظام</h1><p class="page-description">تم تسجيل دخولك بنجاح، لكن لم يتم تحديد UID الوحيد المسموح له بالوصول إلى بيانات Firestore بعد.</p></div>
    <div class="card panel">
      <div class="panel-head"><div><h2 class="panel-title">حساب Firebase Authentication</h2><p class="panel-desc">انسخ معرّف المستخدم الفعلي، ثم أضفه إلى ملفات المشروع وقواعد الأمان.</p></div>${icon('key','ic-lg')}</div>
      <div class="setting-row"><span class="k">البريد</span><strong class="v" dir="ltr">${esc(state.user?.email || '')}</strong></div>
      <div class="setting-row"><span class="k">Firebase UID</span><span class="v">${icon('shield','ic-sm')}</span></div>
      <div class="uid-box">${esc(state.user?.uid || '')}</div>
      <div class="header-buttons"><button class="btn btn-primary" data-action="copy-uid">${icon('copy','ic-sm')} نسخ UID</button><button class="btn" data-action="copy-setup-command">${icon('copy','ic-sm')} نسخ أمر الإعداد</button><button class="btn" data-action="logout">${icon('logout','ic-sm')} خروج</button></div>
    </div>
    <div class="card panel" style="margin-top:15px"><h2 class="panel-title">الخطوات المطلوبة</h2>
      <div class="steps" style="margin-top:20px">
        <div class="step"><span class="step-n">1</span><div>افتح مجلد سورس السيستم وشغّل الأمر التالي باستخدام Node.js:<div class="code-box" style="margin-top:8px">${esc(command)}</div></div></div>
        <div class="step"><span class="step-n">2</span><div>انسخ الملف <strong>firestore.rules</strong> بعد التعديل، والصقه في Firebase Console ← Firestore Database ← Rules ثم اضغط <strong>Publish</strong>.</div></div>
        <div class="step"><span class="step-n">3</span><div>أعد تحميل الموقع بعد التعديل، وسترى لوحة الأداء ويمكنك تثبيت المرجع مرة واحدة في Firestore.</div></div>
      </div>
    </div>
    <div class="notice">${icon('info','ic-sm')} قواعد Firestore التي أرسلتها تمنع القراءة والكتابة بالكامل حاليًا، ولذلك لا يمكن الحفظ قبل نشر القواعد الجديدة الخاصة بـ UID الخاص بك.</div>
  </main>`;
}

function upgradePanel() {
  return `<section class="card panel" style="margin-top:18px;border-color:#a7775d">
    <div class="panel-head"><div><h2 class="panel-title">استكمال Snapchat — المرجع v2</h2><p class="panel-desc">المرجع القديم v1 محفوظ كما هو؛ سننشئ وثيقة جديدة تضم الحسابات الأربع، بدون تعديل أو حذف أي تاريخ.</p></div>${icon('database','ic-lg')}</div>
    <div class="notice ${state.upgradeRulesNeeded?'warning':''}">${icon('info','ic-sm')} ${state.upgradeRulesNeeded ? 'قواعد Firestore القديمة لا تسمح بعد بقراءة المرجع v2؛ انسخ الملف firestore.rules من السورس الجديد وانشره أولًا.' : 'انشر قواعد Firestore المرفقة مع الإصدار الجديد قبل تثبيت المرجع.'}</div>
    <div class="uid-box" style="margin:12px 0">data/MZJ-baseline-2026-v2.json</div>
    <div class="field"><label for="baseline-file">اختر ملف المرجع الجديد من جهازك</label><input id="baseline-file" type="file" accept=".json,application/json" /></div>
    <p class="panel-desc" style="margin-top:12px">بعد اختيار الملف، راجع الأرقام ثم اضغط «تثبيت المرجع في Firebase»؛ لن يحدث الحفظ تلقائيًا.</p>
  </section>`;
}

function importBaselinePage() {
  return `<main class="setup-screen">
    <div class="brand" style="border-bottom:0;padding-bottom:8px"><span class="wordmark">MZJ</span><span class="brand-ar">محمد ذعار العجمي للسيارات</span></div>
    <div class="setup-heading"><div class="page-eyebrow">${icon('database','ic-sm')} تأسيس المرجع التاريخي</div><h1>استيراد المرجع المكتمل للمنصات الأربع</h1><p class="page-description">الحساب مُفعّل، وبيانات الأداء ليست ضمن ملفات الموقع العامة لحماية خصوصيتها. نستورد ملف المرجع المرفق ثم نثبته في Firestore تحت حسابك فقط.</p></div>
    <div class="card panel"><div class="panel-head"><div><h2 class="panel-title">ملف المرجع الجاهز</h2><p class="panel-desc">موجود في السورس خارج مجلد الموقع في المسار التالي</p></div>${icon('file','ic-lg')}</div>
      <div class="uid-box" style="text-align:center">data/MZJ-baseline-2026-v2.json</div>
      <div class="field" style="margin-top:15px"><label for="baseline-file">اختر ملف المرجع JSON من جهازك</label><input id="baseline-file" type="file" accept=".json,application/json" style="direction:rtl;text-align:right" /></div>
      <div class="notice">${icon('shield','ic-sm')} بيانات الحسابات لن تُرفع لأي نظام آخر، والحفظ لا يتم إلا عندما تراجع الأرقام وتؤكّد تثبيتها.</div>
      <div class="header-buttons" style="margin-top:16px"><button class="btn" data-action="logout">${icon('logout','ic-sm')} خروج</button><button class="btn" data-nav="settings">${icon('settings','ic-sm')} الإعدادات</button></div>
    </div>
    <div class="notice">${icon('info','ic-sm')} إذا لم تُنشر قواعد Firestore الجديدة بعد، قد تظهر رسالة رفض الوصول. ثبّت قواعد UID الخاصة بك أولًا كما في README.</div>
  </main>`;
}

async function isValidSeed(data) {
  if (!data || typeof data !== 'object' || data.id !== 'baseline-2026-v2' || data.schemaVersion !== 2 || data.status !== 'pre-strategy') return false;
  if (!Array.isArray(data.methodology) || !data.platforms || typeof data.platforms !== 'object') return false;
  if (!PLATFORM_ORDER.every(key => data.platforms[key] && data.platforms[key].name && Array.isArray(data.platforms[key].notes))) return false;
  // SHA-256 of the reviewed canonical seed. The file itself is not bundled
  // into the public website; it is imported once by the authenticated owner.
  const canonical = new TextEncoder().encode(JSON.stringify(data));
  const digest = await crypto.subtle.digest('SHA-256', canonical);
  const signature = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  return signature === '5323fbb326113fb1d5f1bfd8106dbb2f0bab4d0d21b50266d9f020c7eec92f9e';
}

function navButton(id, title, symbol, extra = '') {
  return `<button class="nav-btn ${state.view === id ? 'active' : ''}" data-nav="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(symbol,'ic-sm')} <span>${title}</span>${extra ? `<span class="nav-end">${extra}</span>`:''}</button>`;
}
function sidebar() {
  return `<div class="side-scrim ${state.mobileNav ? 'is-open':''}" data-action="close-menu"></div>
  <aside class="sidebar ${state.mobileNav ? 'is-open':''}" aria-label="القائمة الرئيسية">
    <div class="brand"><span class="wordmark">MZJ</span><span class="brand-ar">محمد ذعار العجمي للسيارات</span><span class="brand-sub">استراتيجية المحتوى | منظومة مستقلة</span></div>
    <div class="menu-label">مساحة العمل</div>
    <nav class="nav-group" aria-label="الأقسام">${navButton('overview','لوحة القيادة','grid')}${navButton('ideas','مراجعة الأفكار','file')}${navButton('archive','أرشيف الأفكار','layers')}${navButton('plan','تقويم النشر والتنشيط','calendar')}${navButton('proposals','مقترحات النشر','file')}${navButton('tasks','التسليمات والإنتاج','clock')}${navButton('bridge','إنشاء التكليفات','compare')}</nav>
    <div class="menu-label">البيانات والتحليل</div>
    <nav class="nav-group" aria-label="بيانات الأداء">${navButton('baseline','المرجع الأساسي','database')}${navButton('platforms','تحليل المنصات','chart')}${navButton('comparison','مقارنة الأداء','compare','قريبًا')}</nav>
    <div class="menu-label">النظام</div>
    <nav class="nav-group">${navButton('settings','الإعدادات والأمان','settings')}</nav>
    <div class="sidebar-bottom">
      <div class="owner-card"><div class="avatar">M</div><div class="owner-info"><strong>مالك النظام</strong><small>${state.baselineStatus === 'preview' ? 'معاينة محلية' : esc(state.user?.email || '')}</small></div>${icon('shield','ic-sm')}</div>
      ${state.baselineStatus !== 'preview' ? `<button class="logout-btn" data-action="logout">${icon('logout','ic-sm')} تسجيل الخروج</button>` : `<span class="minor" style="display:block;text-align:center;margin-top:12px">عرض تجريبي محلي فقط</span>`}
    </div>
  </aside>`;
}

function topbar() {
  const viewName = ({overview:'لوحة القيادة',plan:'تقويم النشر والتنشيط',proposals:'مقترحات النشر',tasks:'التسليمات والإنتاج',ideas:'مراجعة الأفكار',archive:'أرشيف الأفكار',post:'تفاصيل النشر',asset:'مراجعة البريف',baseline:'المرجع الأساسي',platforms:'تحليل المنصات',comparison:'مقارنة الأداء',settings:'الإعدادات والأمان',bridge:'إنشاء التكليفات'})[state.view] || 'لوحة القيادة';
  return `<header class="topbar">
    <div style="display:flex;align-items:center;gap:11px"><button class="menu-toggle" data-action="toggle-menu" aria-label="فتح القائمة">${icon('menu')}</button><div class="crumbs"><span>MZJ</span>${icon('arrow','ic-sm')}<span>استراتيجية المحتوى</span>${icon('arrow','ic-sm')}<b>${viewName}</b></div></div>
    <div class="top-actions"><span class="small-pill">${icon('calendar','ic-sm')} <span>${formatDate.format(new Date())}</span></span><span class="small-pill"><span class="dot ${state.baselineStatus==='saved' ? 'solid-dot':''}"></span> مركز إدارة المحتوى</span></div>
  </header>`;
}

function platformTile(key) {
  const p = platformData(key);
  const empty = p.followers == null;
  const movementText = key === 'snapchat' && !empty
    ? `<strong dir="ltr">${pct(p.followersChangePercent)}</strong>`
    : `<strong class="${p.netFollows < 0?'warn-text':'positive-text'}" dir="ltr">${empty ? '—' : signed(p.netFollows)}</strong>`;
  return `<button class="platform-tile ${empty ? 'empty':''}" data-action="platform" data-platform="${key}" aria-label="فتح تفاصيل ${esc(p.name)}">
    <div class="platform-head"><div class="platform-identity">${platformLogo(key)}<div><div class="platform-name">${esc(p.name)}</div><div class="platform-caption">${empty ? 'البيانات غير متاحة' : 'متابعو الحساب'}</div></div></div>${icon('arrow','ic-sm')}</div>
    <div class="platform-stat"><bdi dir="ltr">${empty ? '—' : num(p.followers,p.followersApprox)}</bdi></div>
    <div class="platform-foot"><span class="label">${empty ? 'بانتظار بيانات موثوقة' : key === 'snapchat' ? 'تغير المتابعين حسب Snapchat' : 'صافي حركة المتابعين'}</span>${movementText}</div>
  </button>`;
}

function viewsPanel() {
  const facebook = platformData('facebook');
  const instagram = platformData('instagram');
  const snapchatStories = platformData('snapchat').profileStories;
  const segment = (p) => {
    const nonPaidName = p.isSnapchat ? 'غير إعلاني' : 'عضوي';
    const o = p.organicViews / p.views * 100;
    const paid = p.paidViews / p.views * 100;
    return `<div class="view-row">
      <div class="view-row-top"><strong>${esc(p.name)}</strong><small>إجمالي <bdi dir="ltr">${num(p.views)}</bdi> مشاهدة</small></div>
      <div class="stacked" role="img" aria-label="${p.name}: ${pct(o)} ${nonPaidName}، ${pct(paid)} ممول"><div class="organic" style="width:${o}%"></div><div class="paid" style="width:${paid}%"></div></div>
      <div class="legend"><span><i class="legend-dot organic"></i> ${nonPaidName} <bdi dir="ltr">${num(p.organicViews)}</bdi> (${pct(Math.round(o*10)/10)})</span><span><i class="legend-dot paid"></i> ممول <bdi dir="ltr">${num(p.paidViews)}</bdi> (${pct(Math.round(paid*10)/10)})</span></div>
    </div>`;
  };
  return `<section class="card panel"><div class="panel-head"><div><h2 class="panel-title">توزيع المشاهدات: عضوي وممول</h2><p class="panel-desc">مقارنات داخل كل منصة وبفترات مختلفة، بدون جمع النتائج بينها</p></div><span class="rounded-icon">${icon('eye')}</span></div>${segment(facebook)}${segment(instagram)}${snapchatStories ? `<div class="divider"></div><p class="panel-desc" style="margin:15px 0">Snapchat — قصص الملف الشخصي فقط (${esc(platformData('snapchat').period)})</p>${segment({name:'Snapchat · قصص الملف الشخصي',isSnapchat:true,views:snapchatStories.views,organicViews:snapchatStories.nonAdViews,paidViews:snapchatStories.paidViews})}` : ''}<div class="notice">${icon('info','ic-sm')} سناب: الرسم يخص قصص الملف فقط، ولا يشمل القصص العامة أو Spotlight. ولا يتوفر فصل مؤكد للعضوي والممول في TikTok.</div></section>`;
}
function followerPanel() {
  const keys = ['facebook','instagram','tiktok'];
  const list = keys.map(key => [key, platformData(key).netFollows]);
  const max = Math.max(...list.map(([,v]) => Math.abs(v || 0)), 1);
  const rows = list.map(([key,v]) => `<div class="follower-row"><div class="follower-name">${platformData(key).name}</div><div class="follower-bar"><div class="fill ${v < 0?'neg':'pos'}" style="width:${Math.abs(v || 0)/max*100}%"></div></div><div class="follower-metric ${v < 0?'warn-text':'positive-text'}" dir="ltr">${signed(v)}</div></div>`).join('');
  return `<section class="card panel"><div class="panel-head"><div><h2 class="panel-title">صافي حركة المتابعين</h2><p class="panel-desc">لكل منصة بحسب نافذة القياس الأصلية</p></div><span class="rounded-icon">${icon('users')}</span></div>${rows}<div class="divider"></div><div class="panel-head" style="margin-bottom:12px"><div><h2 class="panel-title">نسبة المتابعين من السعودية</h2><p class="panel-desc">مؤشر ملاءمة الجمهور في لقطات الحساب</p></div></div>
    ${keys.map(key => {
       const p = platformData(key);
       return `<div class="country-row"><div class="country-label">${p.name}</div><div class="country-track"><div class="country-progress" style="width:${p.saudiFollowersPercent || 0}%"></div></div><strong class="country-value">${pct(p.saudiFollowersPercent)}</strong></div>`;
    }).join('')}
    <p class="panel-desc" style="margin-top:15px">Snapchat عرض تغير المتابعين +0.0% فقط، ولم يوفر عدد الصافي؛ لذلك لم نضفه إلى مخطط صافي المتابعين. باقي النوافذ لا تعني فترة زمنية واحدة.</p>
  </section>`;
}

function insightCards() {
  const fb = platformData('facebook');
  const ig = platformData('instagram');
  const tt = platformData('tiktok');
  const v = tt.featuredVideo;
  const snap = platformData('snapchat');
  return `<div class="insights">
    <article class="card insight"><div class="insight-number">INSIGHT / 01</div><h3>فيسبوك: الوصول يعتمد أساسًا على التمويل</h3><p>من إجمالي <bdi dir="ltr">${num(fb.views)}</bdi> مشاهدة، هناك <bdi dir="ltr">${num(fb.paidViews)}</bdi> مشاهدة ممولة مقابل <bdi dir="ltr">${num(fb.organicViews)}</bdi> عضوية. سنحتاج لاحقًا لقياس قدرة المحتوى الجديد على رفع العضوي.</p></article>
    <article class="card insight"><div class="insight-number">INSIGHT / 02</div><h3>إنستغرام: الحفاظ على الجمهور أولوية</h3><p>سُجّل صافي <bdi dir="ltr">${signed(ig.netFollows)}</bdi> متابعًا خلال لقطة المرجع، مع <bdi dir="ltr">${num(ig.unfollows)}</bdi> إلغاء متابعة مقابل <bdi dir="ltr">${num(ig.follows)}</bdi> متابعة جديدة.</p></article>
    <article class="card insight"><div class="insight-number">INSIGHT / 03</div><h3>تيك توك: بداية الفيديو تستحق الاختبار</h3><p>الفيديو المرجعي عن توسان بلغ متوسط مشاهدة <bdi dir="ltr">${num(v.averageWatchSeconds)}</bdi> ثانية ونسبة إكمال <bdi dir="ltr">${pct(v.fullWatchPercent)}</bdi>. هذه أرقام لفيديو واحد، وليست لجميع فيديوهات الحساب.</p></article>
    ${snap.profileStories ? `<article class="card insight"><div class="insight-number">INSIGHT / 04</div><h3>سناب شات: افصل العضوي عن المدفوع</h3><p>قصص الملف سجلت <bdi dir="ltr">${num(snap.profileStories.views)}</bdi> مشاهدة، منها <bdi dir="ltr">${num(snap.profileStories.paidViews)}</bdi> مدفوعة. أما القصص العامة وSpotlight فلهما تقارير منفصلة.</p></article>` : ''}
  </div>`;
}

function overviewPage() {
  const readyCount = PLATFORM_ORDER.filter(k => platformData(k).followers != null).length;
  const ideaList=state.plan?[...state.plan.assets.filter(a=>a.kind!=='carousel_slide'&&!a.retiredFromIdeaBank),...(state.plan.carousels||[]).filter(group=>taskCodes(state.plan,group.code).some(code=>!state.plan.assets.find(asset=>asset.code===code)?.retiredFromIdeaBank))]:[];
  const approvedCount=ideaList.filter(a=>ideaIsApproved(state.plan,a.code)).length;
  const pendingCount=ideaList.filter(a=>!ideaIsApproved(state.plan,a.code)&&!['مطلوب تعديل','مرفوض'].includes(ideaAssets(state.plan,a.code)[0]?.reviewStatus)).length;
  const linkedCount=ideaList.filter(a=>ideaIsLinked(state.plan,a.code)).length;
  const postCount=state.plan?.posts.length||0;
  return `<section class="workspace-hero card"><div class="workspace-hero-copy"><div class="workspace-eyebrow">${icon('shield','ic-sm')} مركز التحكم في المحتوى | MZJ</div><h1>من فكرة قوية إلى تاسك جاهز للتنفيذ.</h1><p>راجع الأفكار، اعتمد المحتوى المناسب، اختر سيارات الاستوك والمنفذ وموعد التسليم، ثم أنشئ التكليف داخل سيستم التسويق.</p><div class="workspace-hero-actions"><button class="btn workspace-main-cta" data-nav="ideas">فتح مراجعة الأفكار ${icon('arrow','ic-sm')}</button><button class="btn workspace-outline-cta" data-nav="plan">تقويم النشر والتنشيط</button></div></div><div class="workspace-hero-aside"><div class="workspace-progress-icon">${icon('check','ic-lg')}</div><strong>${approvedCount} / ${ideaList.length||0}</strong><span>فكرة معتمدة من بنك الأفكار</span><div class="workspace-progress"><i style="width:${ideaList.length?Math.round(approvedCount/ideaList.length*100):0}%"></i></div><small>لا يتم إنشاء تكليف لفكرة غير معتمدة</small></div></section>
  <section class="workspace-kpis" aria-label="مؤشرات سير عمل المحتوى"><button class="card workspace-kpi" data-nav="ideas"><div class="workspace-kpi-head"><span>في انتظار المراجعة</span>${icon('clock','ic-sm')}</div><strong>${pendingCount}</strong><small>افتح البريف وحدد قرار الفكرة</small></button><button class="card workspace-kpi" data-nav="ideas"><div class="workspace-kpi-head"><span>الأفكار المعتمدة</span>${icon('check','ic-sm')}</div><strong>${approvedCount}</strong><small>جاهزة لاختيار السيارات والتكليف</small></button><button class="card workspace-kpi" data-nav="bridge"><div class="workspace-kpi-head"><span>مرتبطة بتاسك</span>${icon('compare','ic-sm')}</div><strong>${linkedCount}</strong><small>تكليفات مسجلة في سيستم التسويق</small></button><button class="card workspace-kpi" data-nav="plan"><div class="workspace-kpi-head"><span>مواعيد النشر</span>${icon('calendar','ic-sm')}</div><strong>${postCount}</strong><small>افتح تقويم النشر الشهري</small></button></section>
  <div class="workspace-actions-strip"><div><b>خط سير المحتوى</b><span>استيراد فكرة ← مراجعة واعتماد ← تاسك إنتاج ← منتج معتمد ← مقترح نشر ← أجندة التسويق</span></div><button class="btn btn-primary" data-action="open-idea-import">استيراد أفكار جديدة</button></div>
  <section class="card panel baseline-overview"><div><div class="page-eyebrow">${icon('database','ic-sm')} البيانات المرجعية محفوظة</div><h2>مرجع أداء المنصات قبل الاستراتيجية</h2><p>نتابع نتائج المنصات الأربع ونقارنها بعد بدء التنفيذ، بدون تغيير الأرقام التاريخية.</p></div><div class="baseline-overview-right"><strong>${readyCount} <small>/ 4</small></strong><span>منصات جاهزة للمقارنة</span><button class="btn" data-nav="baseline">عرض المرجع</button></div></section>
  <div class="section-heading"><div><h2>الحسابات تحت المتابعة</h2><p>عدد المتابعين في مرجع كل منصة — بدون جمع جماهير متداخلة</p></div><button class="btn btn-text" data-nav="platforms">التفاصيل ${icon('arrow','ic-sm')}</button></div>
  <div class="platform-grid">${PLATFORM_ORDER.map(platformTile).join('')}</div>
  <div class="section-heading"><div><h2>قراءة الأداء قبل الانطلاق</h2><p>بيانات حقيقية من اللقطات السابقة، لا مخطط زمني افتراضي</p></div><span class="note-tag">${icon('clock','ic-sm')} مرجع تاريخي</span></div>
  <div class="two-cols">${viewsPanel()}${followerPanel()}</div>
  <div class="section-heading"><div><h2>ما الذي تخبرنا به الأرقام؟</h2><p>قراءة تحليلية للمؤشرات قبل بداية المحتوى الجديد</p></div></div>
  ${insightCards()}
  <div class="future-strip"><div><h3>من المرجع إلى التحسن القابل للقياس</h3><p>بعد اعتماد المحتوى وبدء النشر، نضيف النتائج الفعلية لكل منصة ونقارنها بالمراجع الأربع دون تغيير أرقامها التاريخية.</p></div><button class="btn btn-primary" data-nav="comparison">كيف ستظهر المقارنة؟ ${icon('arrow','ic-sm')}</button></div>
  ${renderFooter()}`;
}

function metricRows() {
  const metrics = [
    ['المتابعون', p => num(p.followers, p.followersApprox)],
    ['إجمالي المشاهدات', p => num(p.views, p.viewsApprox)],
    ['المشاهدات العضوية', p => num(p.organicViews)],
    ['المشاهدات الممولة', p => num(p.paidViews)],
    ['التفاعلات الإجمالية*', p => num(p.interactions)],
    ['صافي نمو المتابعين', p => signed(p.netFollows)],
    ['المتابعون من السعودية', p => pct(p.saudiFollowersPercent)],
    ['زيارات الملف الشخصي', p => num(p.profileViews)],
    ['مشاهدات قصص الملف — Snapchat فقط', p => num(p.profileStories?.views)],
    ['من قصص الملف: مشاهدات إعلانية', p => num(p.profileStories?.paidViews)],
    ['مشاهدات القصص العامة — Snapchat فقط', p => num(p.publicStories?.views)],
    ['مشاهدات Spotlight — Snapchat فقط', p => num(p.spotlight?.views)]
  ];
  return metrics.map(([name, fn])=> `<tr><td><strong>${name}</strong></td>${PLATFORM_ORDER.map(key=>`<td dir="ltr" style="text-align:right">${fn(platformData(key))}</td>`).join('')}</tr>`).join('');
}

function baselinePage() {
  return `<div class="page-header"><div><div class="page-eyebrow">${icon('lock','ic-sm')} المرجع التاريخي · إصدار ${state.baseline.schemaVersion || 2}</div><h1 class="page-title">بيانات الحسابات قبل الاستراتيجية</h1><p class="page-description">توثيق المؤشرات الأصلية مع مصادرها ومددها، لا يُحدَّث تلقائيًا ولا يُستبدل بعد بدء النشر.</p></div>
    <div class="header-buttons"><button class="btn" data-action="download-json">${icon('download','ic-sm')} تصدير JSON</button><button class="btn" data-action="print">${icon('print','ic-sm')} طباعة</button></div>
  </div>
  <div class="mini-grid">
    <div class="card mini-card"><div class="label">المنصات المرصودة</div><div class="value">${PLATFORM_ORDER.filter(k=>platformData(k).followers!=null).length.toString().padStart(2,'0')}</div><div class="sub">Facebook · Instagram · TikTok · Snapchat</div></div>
    <div class="card mini-card"><div class="label">المنصات بانتظار بيانات</div><div class="value">${PLATFORM_ORDER.filter(k=>platformData(k).followers==null).length.toString().padStart(2,'0')}</div><div class="sub">${platformData('snapchat').followers != null ? 'مرجع المنصات الأربع جاهز' : 'Snapchat بانتظار استيراد الإصدار الجديد'}</div></div>
    <div class="card mini-card"><div class="label">إصدار المرجع</div><div class="value" dir="ltr" style="text-align:right">v${state.baseline.schemaVersion || 2}.0</div><div class="sub">معرّف ثابت داخل النظام</div></div>
    <div class="card mini-card"><div class="label">تاريخ إعداد السجل</div><div class="value" style="font-size:18px;margin-top:12px">${dateText(state.baseline.registrationDate)}</div><div class="sub">لا يساوي فترة قياس المؤشرات</div></div>
  </div>
  <div class="section-heading"><div><h2>المقاييس الأصلية</h2><p>— تعني غير متاح، و≈ تعني قيمة تقريبية</p></div>${statusTag()}</div>
  <div class="table-wrapper"><table><thead><tr><th>المؤشر</th><th>Facebook</th><th>Instagram</th><th>TikTok</th><th>Snapchat</th></tr></thead><tbody>${metricRows()}</tbody></table></div>
  <div class="notice">${icon('info','ic-sm')} * إجمالي تفاعلات Meta هو ${num(platformData('facebook').interactions)} لفيسبوك و${num(platformData('instagram').interactions)} لإنستغرام، وليس التفاعل العضوي وحده. مؤشرات تفاعل TikTok متاحة في شكل لا يماثل تعريف المؤشرين السابقين، لذلك لا توجد قيمة مفترضة في هذا الصف.</div>
  <div class="section-heading"><div><h2>المصادر وفترات القياس</h2><p>الفروق بين الفترات موثّقة في السجل حتى لا تُستخدم أرقام غير قابلة للمقارنة</p></div></div>
  <div class="card panel"><div class="source-list">${PLATFORM_ORDER.map(key=>{
    const p = platformData(key); const valid = p.followers != null;
    return `<div class="source-item"><div>${platformLogo(key)} <strong style="margin-right:8px">${esc(p.name)}</strong><p>${esc(p.source)}</p></div><div class="period">${esc(p.period)}<div class="table-note">${esc(p.countAccuracy)}</div></div><span class="note-tag ${valid?'positive':'pending'}">${valid?'بيانات مرجعية':'لم تكتمل'}</span></div>`;
  }).join('')}</div></div>
  <div class="section-heading"><div><h2>حالة التثبيت في Firebase</h2><p>التثبيت النهائي يتم مرة واحدة فقط مع حماية الوثيقة بقواعد Firestore</p></div></div>
  <div class="card panel">
    <div class="panel-head"><div><h2 class="panel-title">مرجع محمي من الاستبدال</h2><p class="panel-desc">المسار: <bdi dir="ltr" class="mono">baselines/${esc(state.baseline.id)}</bdi></p></div>${statusTag()}</div>
    <p class="page-description" style="margin:0 0 13px">${state.baselineStatus === 'saved' ? 'المرجع المكتمل للمنصات الأربع محفوظ في Firestore، والتعديل أو الحذف ممنوعان في القواعد.' : state.baselineStatus === 'saved-v1' ? 'المرجع القديم ما زال محفوظًا، ولم يتم حفظ المرجع المكتمل بعد.' : 'الملف الجديد جاهز للمراجعة. لن تحفظ أي أرقام إلا بعد موافقتك.'}</p>
    <div class="header-buttons">${state.baselineStatus === 'saved'
      ? `<span class="note-tag positive">${icon('check','ic-sm')} تم التثبيت — لا يمكن تعديل النسخة</span>`
      : `<button class="btn btn-primary" data-action="open-save-modal" ${state.baselineStatus !== 'ready-to-save' ? 'disabled':''}>${icon('lock','ic-sm')} تثبيت المرجع في Firebase</button>`}
      <button class="btn" data-nav="settings">${icon('settings','ic-sm')} إعدادات الربط</button>
    </div>
    ${state.baselineStatus === 'denied' || state.dataError ? `<div class="notice warning">${icon('alert','ic-sm')} ${esc(state.dataError || 'قواعد Firestore تمنع الوصول، راجع نشر قواعد الإصدار v2.')}</div>`:''}
  </div>
  ${state.baselineStatus === 'saved-v1' ? upgradePanel() : ''}
  <div class="section-heading"><div><h2>قواعد توثيق البيانات</h2></div></div>
  <div class="card panel"><ul class="methodology">${state.baseline.methodology.map(t=>`<li>${icon('check','ic-sm')}<span>${esc(t)}</span></li>`).join('')}</ul></div>
  ${renderFooter()}`;
}

function detailMetric(label, value, hint = '') {
  return `<div class="card detail-metric"><div class="metric-label">${esc(label)}</div><div class="metric-value"><bdi dir="ltr">${value}</bdi></div>${hint ? `<div class="metric-sub">${esc(hint)}</div>`:''}</div>`;
}
function platformPage() {
  const key = state.platform;
  const p = platformData(key);
  const empty = p.followers == null;
  const metrics = empty ? [] : key === 'snapchat' ? [
    detailMetric('المتابعون',num(p.followers),'تغير معروض +0.0% في آخر 28 يومًا'),
    detailMetric('زيارات الملف الشخصي',num(p.profileViews),`${signed(p.profileViewsChangePercent)}% مقارنة بالفترة السابقة`),
    detailMetric('مشاهدات قصص الملف',num(p.profileStories.views),`منها ${num(p.profileStories.paidViews)} مشاهدة من الإعلانات`),
    detailMetric('قصص الملف — دون إعلانات',num(p.profileStories.nonAdViews),'حسب الفرق المعروض، وليست مشاهدات جميع محتويات سناب'),
    detailMetric('مشاهدات القصص العامة',num(p.publicStories.views),`${signed(p.publicStories.viewsChangePercent)}% مقارنة بالفترة السابقة`),
    detailMetric('مشاهدات Spotlight',num(p.spotlight.views),`${signed(p.spotlight.viewsChangePercent)}% مقارنة بالفترة السابقة`),
    detailMetric('متوسط مشاهدة القصص العامة',`${num(p.publicStories.averageWatchSeconds)} ثوانٍ`,'محتوى القصص العامة فقط'),
    detailMetric('متوسط مشاهدة Spotlight',`${num(p.spotlight.averageWatchSeconds)} ثوانٍ`,'محتوى Spotlight فقط')
  ] : [
    detailMetric('المتابعون',num(p.followers,p.followersApprox),p.followersApprox?'رقم تقريبي':'عدد الحسابات المتابعة'),
    detailMetric('إجمالي المشاهدات',num(p.views,p.viewsApprox),p.viewsApprox?'رقم تقريبي':'إجمالي الفترة المرجعية'),
    detailMetric('صافي المتابعين',signed(p.netFollows),'من نافذة القياس الأصلية'),
    detailMetric('المتابعون من السعودية',pct(p.saudiFollowersPercent),'وفق لقطة مرجع الحساب'),
    ...(key === 'facebook'||key === 'instagram' ? [
      detailMetric('المشاهدات العضوية',num(p.organicViews),'بدون المشاهدات الممولة'),
      detailMetric('المشاهدات الممولة',num(p.paidViews),'من إجمالي المشاهدات'),
      detailMetric('إجمالي التفاعلات',num(p.interactions),'يشمل العضوي والممول'),
      detailMetric(key==='instagram'?'الوصول':'متابعات جديدة',num(key==='instagram'?p.reach:p.follows),key==='instagram'?'Reach':'فترة لقطة المرجع')
    ] : [
      detailMetric('زيارات الملف الشخصي',num(p.profileViews),'حسب تقرير TikTok'),
      detailMetric('الإعجابات',num(p.likes),'مؤشر تفاعل'),
      detailMetric('التعليقات',num(p.comments),'مؤشر تفاعل'),
      detailMetric('المشاركات',num(p.shares),'مؤشر تفاعل')
    ])
  ];
  return `<div class="page-header"><div><div class="page-eyebrow">${icon('chart','ic-sm')} تحليل المنصات</div><h1 class="page-title">تفاصيل بيانات كل حساب</h1><p class="page-description">المؤشرات المحفوظة من المراجعة السابقة — مع تفصيل نطاق كل رقم.</p></div><button class="btn" data-nav="baseline">${icon('database','ic-sm')} المرجع الكامل</button></div>
  <div class="platform-tabs" role="tablist" aria-label="اختر المنصة">${PLATFORM_ORDER.map(k=>`<button role="tab" class="platform-tab ${key===k?'active':''}" aria-selected="${key===k}" data-platform="${k}" data-action="platform-tab">${esc(platformData(k).name)}</button>`).join('')}</div>
  <section class="card detail-hero"><div><div class="page-eyebrow">${esc(p.name)} | خط الأساس</div><h2>${esc(p.name)}</h2><p>${esc(p.source)}</p><p><strong>فترة القياس:</strong> ${esc(p.period)}</p></div>${platformLogo(key,'logo')}</section>
  ${empty ? `<div class="compare-placeholder" style="margin-top:16px"><div class="rounded-icon">${icon('database','ic-lg')}</div><h2>بيانات Snapchat لم تُستورد بعد</h2><p>مرجع الإصدار القديم v1 لا يتضمن بيانات Snapchat. اختر ملف v2 من المرجع الأساسي حتى تظهر البيانات مع الاحتفاظ بالنسخة التاريخية.</p></div>` : `<div class="detail-grid">${metrics.join('')}</div>`}
  ${key === 'tiktok' ? tiktokExtras(p) : key === 'snapchat' && !empty ? snapchatExtras(p) : ''}

  ${renderFooter()}`;
}


function snapchatExtras(p) {
  const pub = p.publicStories;
  const spot = p.spotlight;
  const profile = p.profileStories;
  const traffic = p.trafficSources;
  const ages = p.engagedStoryAudience.agePercent;
  const delta = x => x == null ? '—' : `${signed(x)}%`;
  const row = (label, value) => `<div class="setting-row"><span class="k">${label}</span><strong class="v" dir="ltr">${value}</strong></div>`;
  const agesEntries = [['35+','35 سنة فأكثر'],['25-34','25–34 سنة'],['21-24','21–24 سنة'],['18-20','18–20 سنة'],['13-17','13–17 سنة']];
  return `<div class="section-heading"><div><h2>التفصيل المرجعي لـ Snapchat Insights</h2><p>الفترة ${esc(p.period)} · لا نجمع مساحات العرض المختلفة في رقم مشاهدات واحد</p></div></div>
    <div class="two-cols">
      <section class="card panel"><h3 class="panel-title">قصص الملف الشخصي · Profile Stories</h3>
        ${row('المشاهدات',num(profile.views))}
        ${row('من الإعلانات',num(profile.paidViews))}
        ${row('تغير المشاهدات',`أكثر من +${num(profile.viewsChangeUpperBoundPercent)}%`)}
        ${row('مشاهدات غير المتابعين',pct(profile.nonFollowerViewsPercent))}
        ${row('غير إعلانية (الفرق)',num(profile.nonAdViews))}
        ${row('حصة المشاهدات الممولة',pct(Math.round(profile.paidViews/profile.views*1000)/10))}
        ${row('المشاهدون',num(profile.viewers))}
        ${row('المشاهدون القادمون من إعلانات',num(profile.viewersFromAds))}
        ${row('متوسط المشاهدة',`${num(profile.averageWatchSeconds)} ثوانٍ`)}
        ${row('تغير متوسط المشاهدة',delta(profile.averageWatchChangePercent))}
        <div class="notice warning">${icon('alert','ic-sm')} إجمالي وقت المشاهدة الظاهر في الصورة <bdi dir="ltr">${num(profile.totalWatchMinutesReported)}</bdi> دقيقة، لكنه لا يتوافق حسابيًا مع حجم المشاهدات. القيمة محفوظة كمعلومة تحتاج تحققًا، ولا تُستخدم للحسابات.</div>
      </section>
      <section class="card panel"><h3 class="panel-title">القصص العامة · Public Stories</h3>
        ${row('المشاهدات',num(pub.views))}
        ${row('تغير المشاهدات',delta(pub.viewsChangePercent))}
        ${row('المشاهدات من غير المتابعين',pct(pub.nonFollowerViewsPercent))}
        ${row('المشاهدون',num(pub.viewers))}
        ${row('تغير المشاهدين',delta(pub.viewersChangePercent))}
        ${row('متوسط المشاهدة',`${num(pub.averageWatchSeconds)} ثوانٍ`)}
        ${row('تغير متوسط المشاهدة',delta(pub.averageWatchChangePercent))}
        ${row('إجمالي وقت المشاهدة',`${num(pub.totalWatchMinutes)} دقيقة`)}
        ${row('تغير إجمالي وقت المشاهدة',delta(pub.totalWatchChangePercent))}
      </section>
      <section class="card panel"><h3 class="panel-title">Spotlight · أداء الفيديوهات القصيرة</h3>
        ${row('المشاهدات',num(spot.views))}
        ${row('تغير المشاهدات',delta(spot.viewsChangePercent))}
        ${row('المشاهدون',num(spot.viewers))}
        ${row('تغير المشاهدين',delta(spot.viewersChangePercent))}
        ${row('متوسط وقت المشاهدة',`${num(spot.averageWatchSeconds)} ثوانٍ`)}
        ${row('تغير متوسط المشاهدة',delta(spot.averageWatchChangePercent))}
        ${row('معدل المشاهدة',pct(spot.averageViewRatePercent))}
        ${row('إجمالي وقت المشاهدة',`${num(spot.totalWatchMinutes)} دقيقة`)}
        ${row('تغير إجمالي وقت المشاهدة',delta(spot.totalWatchChangePercent))}
        ${row('إضافات للمفضلة',num(spot.favorites))}
        ${row('تغير المفضلة',delta(spot.favoritesChangePercent))}
        ${row('مشاركات',num(spot.shares))}
        ${row('تغير المشاركات',delta(spot.sharesChangePercent))}
        ${row('متابعون جدد من Spotlight',num(spot.follows))}
        <div class="notice">${icon('info','ic-sm')} أعلى فيديوهات الحساب تاريخيًا: ${p.historicalTopSpotlight.viewsApprox.map(v => num(v,true)).join('، ')} مشاهدة؛ ليست حصيلة فترة الـ28 يومًا.</div>
      </section>
      <section class="card panel"><h3 class="panel-title">الملف الشخصي ومصادر الزيارة</h3>
        ${row('إجمالي المتابعين',num(p.followers))}
        ${row('تغير المتابعين المعروض',delta(p.followersChangePercent))}
        ${row('زيارات الملف',num(p.profileViews))}
        ${row('تغير زيارات الملف',delta(p.profileViewsChangePercent))}
        ${row('زيارات الملف من الإعلانات',num(p.profileViewsFromAds))}
        ${row('زيارات مصدرها Spotlight',pct(traffic.spotlightPercent))}
        ${row('زيارات مصدرها Discover',pct(traffic.discoverPercent))}
        ${row('زيارات مصدرها Chat',pct(traffic.chatPercent))}
        ${row('زيارات من مصادر أخرى',pct(traffic.otherPercent))}
        ${row('زيارات من البحث',`أقل من ${num(traffic.searchPercentUpperBound)}%`)}
        <div class="notice">${icon('info','ic-sm')} نسب مصادر الزيارات معروضة بعد التقريب في Snapchat، ولا يلزم أن يكون مجموعها 100% بالضبط.</div>
      </section>
    </div>
    <div class="section-heading"><div><h2>الجمهور المتفاعل مع القصص</h2><p>توزيع أعمار الجمهور المتفاعل في آخر 28 يومًا، وليس أعمار جميع متابعي الحساب</p></div></div>
    <section class="card panel" style="max-width:680px">
      ${agesEntries.map(([key,label])=>`<div class="country-row"><div class="country-label">${label}</div><div class="country-track"><div class="country-progress" style="width:${ages[key]}%"></div></div><strong class="country-value">${pct(ages[key])}</strong></div>`).join('')}
      <div class="notice">${icon('alert','ic-sm')} فلتر الجنس في لقطة الشاشة غير مؤكد؛ لا نعتبر هذه النسب وصفًا لجميع المتابعين.</div>
    </section>`;
}

function tiktokExtras(p) {
  const video = p.featuredVideo;
  return `<div class="section-heading"><div><h2>تفاصيل إضافية من TikTok Studio</h2><p>مؤشرات عامة وفيديو مرجعي واحد — ولا تعادل جميعها نفس نافذة القياس</p></div></div>
  <div class="two-cols">
    <section class="card panel"><h3 class="panel-title">مصادر الزيارات وخصائص الجمهور</h3>
      <div class="setting-row"><span class="k">صفحة «لك» For You</span><strong class="v" dir="ltr">${pct(p.forYouTrafficPercent)}</strong></div>
      <div class="setting-row"><span class="k">البحث</span><strong class="v" dir="ltr">${pct(p.searchTrafficPercent)}</strong></div>
      <div class="setting-row"><span class="k">الجمهور عمر 25–34</span><strong class="v" dir="ltr">${pct(p.age25to34Percent)}</strong></div>
      <div class="setting-row"><span class="k">الجمهور عمر 35–44</span><strong class="v" dir="ltr">${pct(p.age35to44Percent)}</strong></div>
      <div class="setting-row"><span class="k">مشاهدون فريدون (آخر 7 أيام تقريبًا)</span><strong class="v" dir="ltr">${num(p.uniqueViewersSevenDays,true)}</strong></div>
      <div class="setting-row"><span class="k">إجمالي الفيديوهات بالحساب وقت المراجعة</span><strong class="v" dir="ltr">${num(p.allTimeAccountVideos)}</strong></div>
    </section>
    <section class="card panel"><h3 class="panel-title">${esc(video.name)}</h3><p class="panel-desc" style="margin-bottom:17px">قياس فيديو واحد؛ لا يجوز تعميمه على كامل الحساب.</p>
      <div class="video-grid">
        <div class="video-stat"><div class="l">المشاهدات</div><div class="v" dir="ltr">${num(video.views,true)}</div></div>
        <div class="video-stat"><div class="l">متوسط المشاهدة</div><div class="v" dir="ltr">${num(video.averageWatchSeconds)}s</div></div>
        <div class="video-stat"><div class="l">نسبة مشاهدة الفيديو كاملًا</div><div class="v" dir="ltr">${pct(video.fullWatchPercent)}</div></div>
        <div class="video-stat"><div class="l">متابعون جدد من الفيديو</div><div class="v" dir="ltr">+${num(video.gainedFollowers)}</div></div>
      </div>
      <p class="panel-desc" style="margin-top:14px">إعجابات ${num(video.likes)} · تعليقات ${num(video.comments)} · مشاركات ${num(video.shares)} · حفظ ${num(video.saves)}</p>
    </section>
  </div>`;
}

function comparisonPage() {
  return `<div class="page-header"><div><div class="page-eyebrow">${icon('compare','ic-sm')} قبل وبعد الاستراتيجية</div><h1 class="page-title">المقارنة القادمة تبدأ من هنا</h1><p class="page-description">خط الأساس جاهز، لكن لا توجد بيانات بعد تطبيق أسلوب النشر الجديد حتى الآن.</p></div>${statusTag()}</div>
  <div class="compare-placeholder">
    <div class="rounded-icon">${icon('compare','ic-lg')}</div><h2>لن نختلق أرقامًا لمرحلة لم تبدأ بعد</h2>
    <p>بعد نشر المحتوى واعتماده، تُسجل النتائج الفعلية وتبدأ المقارنة بمرجع المنصات الأربع. الخطة التشغيلية متاحة حاليًا في قسم خطة النشر.</p>
    <div class="compare-preview"><div class="compare-preview-box"><small>قبل الاستراتيجية</small><strong>مرجع ${state.baseline.schemaVersion === 2 ? 'المنصات الأربع v2' : 'الإصدار القديم v1'}</strong><div style="margin-top:9px">${statusTag()}</div></div>${icon('compare','ic-lg')}<div class="compare-preview-box"><small>بعد بدء الاستراتيجية</small><strong style="color:#a68a7b">بانتظار نتائج حقيقية</strong><div style="margin-top:9px"><span class="note-tag pending">لم يبدأ القياس</span></div></div></div>
  </div>
  <div class="section-heading"><div><h2>متى نضيف نتائج المقارنة؟</h2><p>فترات تشغيل ومراجعة وليست تواريخ إطلاق مفترضة</p></div></div>
  <div class="mini-grid">
    ${[['15 يومًا','اختبار أولي لأداء المحتوى'],['30 يومًا','قراءة شهر تشغيل فعلي'],['90 يومًا','مراجعة اتجاه الأداء'],['شهريًا','تحسين واستمرار']].map(([v,d],i)=>`<div class="card mini-card"><div class="label">${['المراجعة الأولى','المراجعة الثانية','المراجعة الثالثة','المتابعة المستمرة'][i]}</div><div class="value" style="font-size:22px">${v}</div><div class="sub">${d}</div></div>`).join('')}
  </div>
  <div class="notice">${icon('info','ic-sm')} قياس أثر المحتوى على مبيعات السيارات لن يُنسب تلقائيًا إلى المشاهدات. ذلك يحتاج تتبعًا موثوقًا لمصدر الليدات والطلبات داخل CRM في المرحلة اللاحقة، بعد الاتفاق على نطاق الربط.</div>
  ${renderFooter()}`;
}

function settingsPage() {
  return `<div class="page-header"><div><div class="page-eyebrow">${icon('settings','ic-sm')} الإعدادات والأمان</div><h1 class="page-title">نظام مستقل. حساب واحد.</h1><p class="page-description">معلومات الربط والصلاحيات وحالة حفظ المرجع الأساسي.</p></div><button class="btn" data-action="logout" ${state.baselineStatus==='preview'?'disabled':''}>${icon('logout','ic-sm')} تسجيل الخروج</button></div>
  <div class="settings-grid">
    <section class="card panel"><div class="panel-head"><div><h2 class="panel-title">مشروع Firebase</h2><p class="panel-desc">المشروع الجديد فقط — لا علاقة له بنظام التسويق الحالي</p></div><span class="rounded-icon">${icon('database')}</span></div>
      <div class="setting-row"><span class="k">Project ID</span><strong class="v mono" dir="ltr">${esc(FIREBASE_CONFIG.projectId)}</strong></div>
      <div class="setting-row"><span class="k">Authentication</span><strong class="v">Email / Password</strong></div>
      <div class="setting-row"><span class="k">مستخدم النظام</span><strong class="v" dir="ltr">${esc(state.user?.email || '—')}</strong></div>
      <div class="setting-row"><span class="k">حالة المرجع</span><span>${statusTag()}</span></div>
    </section>
    <section class="card panel"><div class="panel-head"><div><h2 class="panel-title">حماية Firestore</h2><p class="panel-desc">السماح لصاحب UID الوحيد فقط</p></div><span class="rounded-icon">${icon('shield')}</span></div>
      <div class="setting-row"><span class="k">مالك النظام</span><strong class="v">حساب واحد</strong></div>
      <div class="setting-row"><span class="k">صلاحية القراءة</span><strong class="v">مرجع v1 وv2 وخطة النشر للمالك فقط</strong></div>
      <div class="setting-row"><span class="k">إنشاء المرجع</span><strong class="v">مرة واحدة</strong></div>
      <div class="setting-row"><span class="k">التعديل</span><strong class="v">مرجع الأداء ثابت؛ خطة النشر قابلة للتحديث</strong></div>
    </section>
  </div>
  ${state.baselineStatus === 'not-saved' ? `<div class="notice warning">${icon('alert','ic-sm')} المرجع غير موجود في Firestore بعد. انتقل إلى النظرة العامة لاستيراد ملف البيانات.</div>` : ''}
  <div class="section-heading"><div><h2>معرّف صاحب الحساب</h2><p>يجب أن يطابق UID المحدد في كود المشروع وقواعد Firestore المنشورة</p></div></div>
  <div class="card panel"><div class="uid-box" style="margin-top:0">${esc(state.user?.uid || '')}</div><button class="btn" data-action="copy-uid">${icon('copy','ic-sm')} نسخ UID</button></div>
  <div class="section-heading"><div><h2>ما الذي تم تنفيذه الآن؟</h2></div></div>
  <div class="card panel"><ul class="methodology"><li>${icon('check','ic-sm')}<span>تسجيل دخول بحساب واحد، وعدم إتاحة إنشاء مستخدمين من السيستم.</span></li><li>${icon('check','ic-sm')}<span>مرجع كامل للمنصات الأربع بعد تثبيت بيانات Snapchat في الإصدار v2.</span></li><li>${icon('check','ic-sm')}<span>إمكانية إنشاء المرجع v2 مرة واحدة مع بقاء v1 محفوظًا بلا تعديل.</span></li><li>${icon('clock','ic-sm')}<span>خطة نشر وإنتاج 28 يومًا، واستيراد JSON، وتكليفات مندوبي الإنتاج، ومراجعة وحفظ تغييرات داخل Firestore؛ الربط الآلي بـCRM غير موجود.</span></li></ul></div>
  ${renderFooter()}`;
}

function modalView() {
  if (state.modal !== 'save') return '';
  return `<div class="modal-overlay" role="presentation" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head"><div class="rounded-icon">${icon('lock','ic-lg')}</div><h2 id="modal-title">تثبيت المرجع المكتمل للمنصات الأربع</h2></div>
    <p>سيُحفظ الإصدار <bdi dir="ltr">baseline-2026-v2</bdi> في Firestore. القواعد تمنع تحديثه أو حذفه، ولا تمس الإصدار التاريخي v1 حتى لو كان محفوظًا سابقًا. تأكد من بيانات الحسابات الأربع وفترات قياسها.</p>
    <div class="notice">${icon('info','ic-sm')} لا يوجد أي اتصال بنظام التسويق الحالي أو CRM في هذه العملية.</div>
    <div class="modal-actions"><button class="btn" data-action="close-modal">إلغاء</button><button class="btn btn-primary" data-action="save-baseline" ${state.storing?'disabled':''}>${icon('lock','ic-sm')} ${state.storing?'جارٍ الحفظ':'تأكيد وتثبيت المرجع'}</button></div>
  </div></div>`;
}

function renderFooter() {
  return `<footer class="footer"><span>MZJ | منظومة استراتيجية المحتوى المستقلة · الإنتاج والنشر 1.6</span><span>هدفنا النهائي: قياس محتوى يؤدي إلى عملاء مؤهلين ومبيعات سيارات فعلية</span></footer>`;
}

function render() {
  document.title = `MZJ | ${state.user ? 'استراتيجية المحتوى' : 'تسجيل الدخول'}`;
  if (!state.user) {
    app.innerHTML = authView(); return;
  }
  if (!isLocalPreview && (!isOwnerConfigured || state.user.uid !== OWNER_UID)) {
    app.innerHTML = !isOwnerConfigured ? setupView() : `<main class="setup-screen"><div class="card panel"><h1 class="page-title">هذا الحساب غير مصرح له</h1><p class="page-description">التطبيق مخصص لمستخدم واحد فقط. معرّف هذا الحساب لا يطابق معرّف مالك النظام المحدد.</p><p class="uid-box">${esc(state.user.uid)}</p><button class="btn" data-action="logout">${icon('logout','ic-sm')} تسجيل الخروج</button></div></main>`;
    return;
  }
  if (state.baselineStatus === 'loading') { app.innerHTML = `<main class="setup-screen"><div class="card panel">${icon('refresh','ic-lg')} <h1 class="page-title">جارٍ فحص المرجع المحفوظ...</h1><p class="page-description">التأكد من وجود نسخة مرجعية في Firestore.</p></div></main>`; return; }
  if (['not-saved','denied'].includes(state.baselineStatus) && !state.pendingSeed && !['settings','plan','tasks','ideas','archive','schedule','post','asset','bridge','proposals'].includes(state.view)) { app.innerHTML = importBaselinePage(); return; }
  const pages = { overview: overviewPage, plan: ()=>planPage(state), tasks: ()=>tasksPage(state), ideas: ()=>ideasPage(state), archive: ()=>archivePage(state), schedule: ()=>schedulePage(state), post: ()=>postDetailPage(state), asset: ()=>assetDetailPage(state), baseline: baselinePage, platforms: platformPage, comparison: comparisonPage, settings: settingsPage, bridge: ()=>bridgePage(state), proposals: ()=>proposalsPage(state) };
  app.innerHTML = `<div class="shell">${sidebar()}<div class="main">${topbar()}<div class="content">${(pages[state.view] || overviewPage)()}</div></div>${modalView()}</div>`;
}

async function boot() {
  render();
  if (isLocalPreview) return;
  try {
    await connectFirebase();
    state.ready = true;
    render();
    listenToAuth(async (user, error) => {
      if (error) { state.firebaseError = error.message; render(); return; }
      state.user = user;
      state.authError = '';
      if (user && isOwnerConfigured && user.uid === OWNER_UID) {
        state.baselineStatus = 'loading';
        render();
        try {
          let completed = null;
          let previous = null;
          let v2Error = null;
          try { completed = await getStoredBaseline('baseline-2026-v2'); }
          catch (err) { v2Error = err; }
          if (!completed) {
            try { previous = await getStoredBaseline('baseline-2026-v1'); }
            catch (err) {
              if (v2Error) throw v2Error;
              // Missing legacy access is nonfatal when v2 access works.
            }
          }
          if (state.user?.uid !== user.uid) return;
          state.legacyExists = Boolean(previous);
          state.upgradeRulesNeeded = Boolean(v2Error);
          state.pendingSeed = null;
          state.dataError = '';
          if (completed) {
            state.baseline = completed;
            state.baselineStatus = 'saved';
          } else if (previous) {
            state.baseline = previous;
            state.baselineStatus = 'saved-v1';
            state.view = 'baseline';
          } else if (v2Error) {
            state.baseline = INITIAL_BASELINE;
            state.baselineStatus = 'denied';
            state.dataError = 'قواعد Firestore تمنع قراءة المرجع الجديد. انشر firestore.rules المرفق ثم أعد تحميل الصفحة.';
          } else {
            state.baseline = INITIAL_BASELINE;
            state.baselineStatus = 'not-saved';
          }
        } catch(err) {
          if (state.user?.uid !== user.uid) return;
          state.baselineStatus = 'denied';
          state.dataError = 'تعذر الوصول إلى Firestore؛ تحقق من حسابك ونشر قواعد v2.';
          console.warn('Firestore access failed:', err.code || err.message);
        }
      } else {
        state.baseline = INITIAL_BASELINE;
        state.baselineStatus = 'loading';
        state.plan=null;
        state.planStatus='loading';
      }
      // Publishing plan uses independent Firestore rules and never changes the baseline.
      if(user && isOwnerConfigured && user.uid===OWNER_UID){
        state.planStatus='loading';
        try{
          const loaded=await loadPublishingPlan();
          if(state.user?.uid!==user.uid)return;
          state.plan=loaded;
          state.planStatus=loaded?'saved':'missing';
          if(loaded){try{state.proposals=await loadPublishingProposals();}catch(err){state.proposals=[];console.warn('Publishing proposals unavailable:',err?.code||err.message);}}
          state.planError='';
        }catch(err){
          state.plan=null;
          state.planStatus='denied';
          state.planError='تعذر قراءة خطة النشر. تحقق من نشر قواعد firestore.rules الجديدة.';
          console.warn('Publishing-plan access failed:',err.code||err.message);
        }
      }
      render();
    });
  } catch(err) {
    state.firebaseError = err.message || 'Firebase module loading failed';
    state.ready = false;
    render();
  }
}

function readableAuthError(error) {
  switch (error?.code) {
    case 'auth/invalid-email': return 'صيغة البريد الإلكتروني غير صحيحة.';
    case 'auth/invalid-credential': return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'auth/user-disabled': return 'هذا الحساب معطل في Firebase Authentication.';
    case 'auth/too-many-requests': return 'تم تقييد محاولات تسجيل الدخول مؤقتًا. حاول لاحقًا.';
    case 'auth/network-request-failed': return 'حدثت مشكلة في الاتصال بالإنترنت.';
    case 'auth/operation-not-allowed': return 'تسجيل الدخول بالإيميل والباسورد غير مفعل في Firebase Authentication.';
    default: return 'تعذر تسجيل الدخول. راجع الحساب وإعدادات Firebase.';
  }
}

async function handleLogin(form) {
  if (!state.ready || state.signingIn) return;
  const email = form.querySelector('#email')?.value.trim();
  const password = form.querySelector('#password')?.value;
  if (!email || !password) return;
  state.signingIn = true;
  state.authError = '';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) { submit.disabled = true; submit.textContent = 'جارٍ التحقق...'; }
  try { await loginWithEmail(email, password); }
  catch (err) {
    state.authError = readableAuthError(err);
    state.signingIn = false;
    render();
  }
  finally { state.signingIn = false; }
}

async function copyValue(textToCopy) {
  try { await navigator.clipboard.writeText(textToCopy); toast('تم النسخ إلى الحافظة'); }
  catch { toast('تعذر النسخ التلقائي. يمكنك تحديد النص ونسخه يدويًا.'); }
}
function downloadJson(data, file) {
  const payload = new Blob([JSON.stringify(data, null, 2)], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(payload);
  const a = document.createElement('a');
  a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('تم تجهيز ملف المرجع للتصدير');
}

async function saveBaseline() {
  if (!state.user || !isOwnerConfigured || state.user.uid !== OWNER_UID || state.storing || state.baselineStatus !== 'ready-to-save' || isLocalPreview) return;
  state.storing = true;
  state.baselineStatus = 'saving';
  render();
  try {
    if (!state.pendingSeed || !await isValidSeed(state.pendingSeed)) throw Error('Missing valid baseline data');
    await createStoredBaseline(state.pendingSeed, state.user.uid);
    const stored = await getStoredBaseline('baseline-2026-v2');
    if (!stored) throw Error('v2 was not found after creating');
    state.baseline = stored;
    state.baselineStatus = 'saved';
    state.pendingSeed = null;
    state.dataError = '';
    state.upgradeRulesNeeded = false;
    state.modal = null;
    toast('تم تثبيت مرجع المنصات الأربع في Firestore بنجاح');
  } catch(err) {
    console.warn('Save failed:', err.code || err.message);
    state.baselineStatus = 'ready-to-save';
    if (err.code === 'permission-denied') {
      state.dataError = 'رفض Firestore عملية إنشاء المرجع v2. انشر قواعد firestore.rules الجديدة ثم أعد المحاولة، ولا تحذف v1.';
      toast('قواعد Firestore ترفض إنشاء المرجع v2. راجع قواعد النسخة الجديدة.');
    } else {
      state.dataError = 'تعذر إتمام الحفظ. تحقق من اتصال Firebase، ولم نفقد الملف المستورد.';
      toast('تعذر إتمام الحفظ. الملف ما زال جاهزًا لإعادة المحاولة.');
    }
    state.modal = null;
  } finally { state.storing = false; render(); }
}


// Production plan import; the source file is user-selected and never fetched from the public site.
async function importPublishingPlan(){
  if(!state.pendingPlan||state.planSaving||!state.user||isLocalPreview)return;
  if(!validatePlanSeed(state.pendingPlan)){toast('فشل التحقق من بنية خطة النشر.');return;}
  state.planSaving=true;state.planError='';render();
  try{
    const saved=await createPublishingPlan(state.pendingPlan,state.user.uid);
    if(!saved||saved.assets.length!==48||saved.posts.length!==28)throw Error('Incomplete imported data');
    state.plan=saved;state.planStatus='saved';state.pendingPlan=null;
    toast('تم استيراد خطة النشر والبريفات والتكليفات في Firestore بنجاح.');
  }catch(err){
    console.warn('Plan import failed:',err.code||err.message);
    state.planError=err.message==='plan-already-exists'?
      'الخطة موجودة مسبقًا. حدّث الصفحة لقراءتها؛ الاستيراد لا يستبدل تكليفاتك الحالية.':
      'فشل حفظ الخطة. انشر قواعد Firestore المرفقة وتحقق من اتصال الشبكة ثم أعد المحاولة.';
    toast('تعذر حفظ خطة النشر. لم تتغير بيانات المرجع الأساسي.');
  }finally{state.planSaving=false;render();}
}
function downloadText(text,filename){
  const blob=new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('تم تجهيز ملف التكليف للتحميل');
}
async function saveAssetEditor(form){
  if(!state.plan||state.planSaving||isLocalPreview)return;
  const code=form.elements.namedItem('assetCode')?.value;
  const codes=taskCodes(state.plan,code);
  const executor=form.elements.namedItem('executor')?.value;
  const status=form.elements.namedItem('status')?.value;
  const comments=form.elements.namedItem('comments')?.value ?? state.plan.assets.find(a=>a.code===taskCodes(state.plan,code)[0])?.comments ?? '';
  const dueDate=form.elements.namedItem('dueDate')?.value||'';
  if(!codes.length||ideaAssets(state.plan,code).some(a=>a.marketingTaskId||a.integrationRequestKey)||
     (executor!==''&&!PEOPLE.includes(executor))||!TASK_STATUSES.includes(status)||
     (dueDate&&!validISODate(dueDate))){toast('تحقق من معلومات التخطيط؛ لا يمكن تعديل تاسك تم ربطه.');return;}
  const changes={executor,status,comments,dueDate};
  state.planSaving=true;
  const submit=form.querySelector('button[type=submit]');if(submit){submit.disabled=true;submit.textContent='جارٍ الحفظ…';}
  try{
    if(codes.length>1)await updateManyAssets(codes,changes);
    else await updatePublishingAsset(code,changes);
    state.plan.assets=state.plan.assets.map(a=>codes.includes(a.code)?{...a,...changes}:a);
    toast('تم حفظ معلومات تخطيط الإنتاج داخل الاستراتيجية.');render();state.briefBaseline=readBriefDraft();
  }catch(err){toast('فشل حفظ معلومات التخطيط. راجع صلاحيات Firebase والاتصال.');console.warn(err);}
  finally{state.planSaving=false;if(submit){submit.disabled=false;submit.textContent='حفظ التخطيط داخل الاستراتيجية';}}
}
async function saveIdeaReview(form,decision){
  if(!state.plan||state.planSaving||isLocalPreview)return;
  const code=form.elements.namedItem('ideaCode')?.value||'';
  const assets=ideaAssets(state.plan,code);
  if(!assets.length||!REVIEW_STATUSES.includes(decision)){toast('قرار المراجعة غير صالح.');return;}
  const current=ideaIsApproved(state.plan,code)?'معتمد':assets.every(a=>a.reviewStatus==='مرفوض')?'مرفوض':'بانتظار المراجعة';
  const restoring=decision==='بانتظار المراجعة';
  if(assets.some(a=>a.integrationRequestKey&&!a.marketingTaskId)){
    toast('فيه طلب تكليف غير محسوم. لازم نتحقق من حالته قبل تغيير مراجعة الفكرة علشان ما يتكررش التاسك.');return;
  }
  if(restoring && !['معتمد','مرفوض'].includes(current)){toast('الفكرة أصلًا بانتظار المراجعة.');return;}
  if(current==='مرفوض'&&!restoring){toast('استرجع الفكرة من الأرشيف أولًا ثم قرر اعتمادها.');return;}
  const hasLinked=assets.some(a=>Boolean(a.marketingTaskId));
  if(restoring && !window.confirm(hasLinked?
    'إعادة الفكرة للمراجعة؟ سيتم الاحتفاظ برقم التاسك الحالي في سجل التكليفات السابقة، ولن يتم حذفه أو تعديله داخل سيستم التسويق. عند إعادة اعتماد الفكرة تقدر تعمل تكليف جديد.':
    'إعادة الفكرة للمراجعة؟ سيظل البريف وسجل القرارات محفوظين.'))return;
  if(decision==='مرفوض'&&!window.confirm('رفض الفكرة ونقلها إلى أرشيف الأفكار؟ يمكنك استرجاعها للمراجعة في أي وقت.'))return;
  const time=new Date().toISOString();
  const rows=assets.map(asset=>{
    const history=[...(Array.isArray(asset.reviewHistory)?asset.reviewHistory:[]).slice(-49),{status:decision,at:time,reviewedByUid:state.user.uid}];
    const changes={reviewStatus:decision,reviewNotes:'',reviewedAt:restoring?null:time,reviewedByUid:restoring?'':state.user.uid,reviewHistory:history};
    if(decision!=='معتمد')Object.assign(changes,{creativeApprovedAt:null,approvedCarMode:'',approvedVehicles:[]});
    if(restoring){
      if(asset.marketingTaskId){
        const record={taskId:asset.marketingTaskId,taskNo:asset.marketingTaskNo||'',itemId:asset.marketingItemId||'',executorName:asset.marketingExecutorName||'',linkedAt:asset.marketingLinkedAt||'',dueDate:asset.dueDate||'',requestKey:asset.integrationRequestKey||'',archivedAt:time};
        changes.previousMarketingTasks=[...(Array.isArray(asset.previousMarketingTasks)?asset.previousMarketingTasks:[]).slice(-29),record];
      }
      Object.assign(changes,{marketingTaskId:'',marketingTaskNo:'',marketingItemId:'',marketingExecutorName:'',marketingLinkedAt:null,integrationRequestKey:'',integrationDraft:null});
    }
    return {code:asset.code,changes};
  });
  state.planSaving=true;
  try{
    await updateReviewAssetRows(rows);
    const updates=new Map(rows.map(row=>[row.code,row.changes]));
    state.plan.assets=state.plan.assets.map(a=>updates.has(a.code)?{...a,...updates.get(a.code)}:a);
    if(restoring){state.bridge.ideaCode='';toast(hasLinked?'تمت إعادة الفكرة للمراجعة وحفظ التاسك السابق في السجل.':'تمت إعادة الفكرة للمراجعة.');}
    else if(decision==='مرفوض'){state.view='archive';toast('تم حفظ الفكرة في الأرشيف.');}
    else toast('تم اعتماد الفكرة. يمكنك تجهيز التكليف.');
    state.briefBaseline='';
  }catch(error){console.warn('Review save failed:',error?.code||error?.message);toast('تعذر حفظ قرار المراجعة. تحقق من قواعد Firebase.');}
  finally{state.planSaving=false;render();if(state.view==='asset')state.briefBaseline=readBriefDraft();}
}

async function savePostEditor(form){
  if(!state.plan||state.planSaving||isLocalPreview)return;
  const post=state.plan.posts.find(p=>p.id===state.selectedPostId);if(!post)return;
  const val=n=>form.elements.namedItem(n)?.value||'';
  const ideaCode=val('ideaCode');const idea=getIdea(state.plan,ideaCode);
  const executor=val('executor');const status=val('status');
  const date=val('publicationDate');const time=val('time');
  const platforms=Object.keys(PLATFORMS).filter(k=>form.elements.namedItem('platform_'+k)?.checked);
  if(!idea||(executor&&!PEOPLE.includes(executor))||!POST_STATUSES.includes(status)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!platforms.length){toast('اختر فكرة ومنصة وتاريخ نشر صالحين.');return;}
  if(!ideaIsApproved(state.plan,ideaCode)&&(!post||post.ideaCode!==ideaCode||['جاهز للنشر','منشور'].includes(status))){toast('الفكرة لم تُعتمد بعد. راجعها قبل تجهيز النشر أو تغيير الفكرة.');return;}
  const captionsByPlatform={},hashtagsByPlatform={};
  for(const key of Object.keys(PLATFORMS)){
    captionsByPlatform[key]=val('caption_'+key);
    hashtagsByPlatform[key]=val('hashtags_'+key);
  }
  const url=val('publishedUrl').trim();
  if(status==='منشور' && !/^https:\/\/[^\s]+$/.test(url)){toast('لحالة منشور، أضف رابط المنشور الصحيح أولًا.');return;}
  const changes={publicationDate:date,time,ideaCode,ideaTitle:idea.title,platforms,
    captionsByPlatform,hashtagsByPlatform,status,publishedUrl:url,notes:form.elements.namedItem('notes')?.value ?? post.notes ?? '',
    actualPublicationDate:post.actualPublicationDate||(status==='منشور'?new Date().toISOString().slice(0,10):null),
    story:{...post.story,frame1:val('storyFrame1'),frame2:val('storyFrame2')}
  };
  const codes=ideaIsLinked(state.plan,ideaCode)?[]:taskCodes(state.plan,ideaCode);
  state.planSaving=true;
  const submit=form.querySelector('button[type=submit]');if(submit){submit.disabled=true;submit.textContent='جارٍ الحفظ…';}
  try{
    await updatePostWithAssignment(post.id,changes,codes,executor);
    state.plan.posts=state.plan.posts.map(p=>p.id===post.id?{...p,...changes}:p);
    state.plan.assets=state.plan.assets.map(a=>codes.includes(a.code)?{...a,executor}:a);
    toast('تم حفظ فكرة اليوم والمنفذ والمنصات والكابشن في Firestore.');render();
  }catch(err){toast('تعذر حفظ النشر في Firestore. لم تُسجّل التعديلات.');console.warn(err);}
  finally{state.planSaving=false;if(submit){submit.disabled=false;submit.textContent='حفظ تعديلات النشر والتكليف';}}
}

// Reusable idea import: validate, preview, skip duplicates, then add only new assets.
async function saveIdeaBatch(){
  if(!state.pendingIdeaBatch||state.planSaving||!state.user||isLocalPreview)return;
  const pending=state.pendingIdeaBatch;
  const entries=pending.items.map(idea=>({...idea,reviewStatus:'بانتظار المراجعة',reviewNotes:'',reviewedAt:null,reviewedByUid:'',reviewHistory:[]}));
  if(!entries.length){toast('كل الأفكار مكررة؛ لا يوجد شيء جديد للحفظ.');return;}
  state.planSaving=true;state.ideaImportError='';render();
  try {
    const loaded=await importPublishingIdeas(entries);
    state.plan=loaded;state.pendingIdeaBatch=null;state.ideaImportOpen=false;
    state.ideaKind='all';state.ideaReviewFilter='بانتظار المراجعة';state.ideaSearch='';
    toast(`تم حفظ ${entries.length} فكرة جديدة، وتخطي ${pending.duplicates.length} مكررة. لم تتغير المنشورات القديمة.`);
  }catch(error){
    console.warn('Idea batch import failed:',error?.code||error?.message);
    state.ideaImportError=error?.message==='idea-already-exists'?'ظهر كود مكرر أثناء الحفظ. حمّل الصفحة واستورد الدفعة مرة أخرى.':'تعذر حفظ الأفكار الجديدة؛ لم تتغير الأفكار السابقة. تحقق من قواعد Firestore والاتصال.';
    toast('فشل حفظ دفعة الأفكار الجديدة.');
  }finally{state.planSaving=false;render();}
}
// Explicit replacement never deletes Marketing tasks, old posts or history.
// A complete plan snapshot downloads before the Firestore write.
async function saveReplacementBatch(){
  if(!state.plan||!state.pendingIdeaBatch||state.planSaving||isLocalPreview)return;
  const confirmation=app.querySelector('#idea-replace-verify')?.value?.trim();
  if(confirmation!=='استبدال'){state.ideaImportError='اكتب كلمة استبدال للتأكيد.';render();return;}
  const entries=state.pendingIdeaBatch.items;
  if(!entries.length){toast('لا توجد أفكار جديدة صالحة للاستيراد.');return;}
  if(!window.confirm('سيتم إخفاء بنك الأفكار الحالي من العرض النشط، وإضافة الأفكار الجديدة. سيبقى سجل النشر وروابط التاسكات محفوظًا. هل تؤكد؟'))return;
  // All current assets, post schedules and historical task links are included.
  downloadJson(state.plan,'MZJ-Idea-Bank-FULL-BACKUP-'+nowInRiyadh()+'.json');
  state.planSaving=true;state.ideaImportError='';render();
  try{
    const loaded=await replacePublishingIdeas(entries,state.pendingIdeaBatch.batchId);
    state.plan=loaded;state.pendingIdeaBatch=null;state.ideaReplaceMode=false;state.ideaImportOpen=false;
    state.ideaKind='all';state.ideaReviewFilter='بانتظار المراجعة';state.ideaSearch='';
    toast('تم استبدال بنك الأفكار النشط مع الاحتفاظ بالتاريخ والمنشورات والتكليفات القديمة.');
  }catch(error){
    console.warn('Idea bank replacement failed:',error?.code||error?.message);
    state.ideaImportError=error?.message==='pending-marketing-assignment'
      ? 'هناك تكليف تسويق معلق لم يحسم رقمه؛ استكمله قبل الاستبدال لتجنب فقد الربط.'
      : 'تعذر استبدال الأفكار. لم تتغير السجلات في حالة فشل المعاملة؛ تحقق من القواعد والأكواد.';
    toast('فشل استبدال بنك الأفكار.');
  }finally{state.planSaving=false;render();}
}
async function savePublishingProposal(form){
  if(state.proposalSaving||isLocalPreview)return;
  let proposal;
  try{proposal=proposalFromForm(form,state.plan);}catch(err){toast(err.message);return;}
  state.proposalSaving=true;
  try{state.proposals=await createPublishingProposal(proposal);toast('تم حفظ مقترح النشر كمسودة داخل الاستراتيجية.');render();}
  catch(err){console.warn('Proposal save failed:',err?.code||err.message);toast('تعذر حفظ المقترح؛ تحقق من قواعد Firestore.');}
  finally{state.proposalSaving=false;render();}
}
async function saveSchedule(form){
  if(!state.plan||state.planSaving||isLocalPreview)return;
  const value=name=>form.elements.namedItem(name)?.value||'';
  const ideaCode=value('ideaCode'),idea=getIdea(state.plan,ideaCode);
  const date=value('publicationDate'),time=value('time');
  const platforms=Object.keys(PLATFORMS).filter(key=>form.elements.namedItem('platform_'+key)?.checked);
  if(!idea||!ideaIsApproved(state.plan,ideaCode)|| !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)) || !/^\d{2}:\d{2}$/.test(time) || !platforms.length){
    toast('اعتمد الفكرة أولًا، ثم اختر تاريخًا ووقتًا ومنصة للنشر.');return;
  }
  const id=`P${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const post={id,publicationDate:date,time,ideaCode,ideaTitle:idea.title,platforms,
    captionsByPlatform:{...(idea.captionsByPlatform||{})},hashtagsByPlatform:{...(idea.hashtagsByPlatform||{})},
    status:'مخطط',publishedUrl:'',notes:'',actualPublicationDate:null,
    story:{code:'',frame1:'',frame2:''}
  };
  state.planSaving=true;
  try {
    await createPublishingPost(post);
    state.plan.posts.push(post);state.calendarMonth=date.slice(0,7);state.calendarSelectedDate=date;
    state.plan.posts.sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate)||a.id.localeCompare(b.id));
    state.view='plan';state.scheduleIdeaCode='';state.scheduleDate='';
    toast('تمت إضافة موعد النشر إلى التقويم بدون تنفيذ أي نشر تلقائي.');
  }catch(error){console.warn('Schedule creation failed:',error?.code||error?.message);toast('تعذر حفظ موعد النشر؛ لم تتغير المواعيد القديمة.');}
  finally{state.planSaving=false;render();}
}

async function submitBridgeApproval(form) {
  if (state.bridge.busy || isLocalPreview) return;
  const selected = [...state.bridge.chosenStocks];
  state.bridge.busy=true;
  try {
    await approveBridgeIdea(state, form.elements.namedItem('carMode').value, selected);
    toast('تم حفظ اختيار السيارات للفكرة المعتمدة. يمكنك تجهيز التكليف الآن.');
    render();
  } catch(error) { toast(error?.message || 'Approval failed'); }
  finally { state.bridge.busy=false; }
}
async function submitBridgeAssignment(form) {
  if (state.bridge.busy || isLocalPreview) return;
  state.bridge.busy=true;
  try {
    const result=await assignBridgeIdea(state,form);
    toast(`\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u062a\u0627\u0633\u0643 ${result.taskNo} \u0648\u0631\u0628\u0637\u0647.`);
    render();
  } catch(error) { toast(error?.message || '\u062a\u0639\u0630\u0631 \u0627\u0644\u0631\u0628\u0637. \u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0648\u0644\u0646 \u064a\u062a\u0643\u0631\u0631 \u0627\u0644\u062a\u0627\u0633\u0643.'); }
  finally { state.bridge.busy=false; }
}

app.addEventListener('submit', event => {
  if(event.target.id==='login-form'){
    event.preventDefault();handleLogin(event.target);return;
  }
  if(event.target.id==='asset-editor'){
    event.preventDefault();saveAssetEditor(event.target);return;
  }
  if(event.target.id==='idea-review-form'){
    event.preventDefault();void saveIdeaReview(event.target,event.submitter?.value||'');return;
  }
  if(event.target.id==='bridge-approval'){
    event.preventDefault();void submitBridgeApproval(event.target);return;
  }
  if(event.target.id==='bridge-assign'){
    event.preventDefault();void submitBridgeAssignment(event.target);return;
  }
  if(event.target.id==='post-editor'){
    event.preventDefault();savePostEditor(event.target);return;
  }
  if(event.target.id==='proposal-create'){event.preventDefault();void savePublishingProposal(event.target);return;}
  if(event.target.id==='schedule-editor'){
    event.preventDefault();void saveSchedule(event.target);return;
  }
});

app.addEventListener('change', async event => {
  if(event.target.id==='calendar-month'){
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){state.calendarMonth=event.target.value;state.calendarSelectedDate='';render();}return;
  }
  if(event.target.id==='calendar-platform'){state.calendarPlatform=event.target.value;render();return;}
  if(event.target.id==='calendar-executor'){state.calendarExecutor=event.target.value;render();return;}
  if(event.target.id==='calendar-media'){state.calendarMedia=event.target.value;render();return;}
  if(event.target.id==='calendar-status'){state.calendarStatus=event.target.value;render();return;}
  if(event.target.id==='idea-import-executor'){state.importExecutor=event.target.value;return;}
  if(event.target.id==='idea-import-file'){
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>1_800_000){state.ideaImportError='الحد الأقصى لملف الأفكار 1.8 ميجابايت.';render();return;}
    try{
      const raw=JSON.parse(await file.text());
      state.pendingIdeaBatch=prepareIdeaBatch(raw,state.plan,{replace:state.ideaReplaceMode});
      state.ideaImportError='';
      toast(`تمت معاينة ${state.pendingIdeaBatch.items.length} فكرة جديدة، وتخطي ${state.pendingIdeaBatch.duplicates.length} مكررة.`);
    }catch(err){state.pendingIdeaBatch=null;state.ideaImportError=err?.message||'ملف JSON غير صالح. استخدم النموذج المعتمد.';}
    render();return;
  }

  if(event.target.id==='bridge-idea'){selectBridgeIdea(state,event.target.value);render();return;}
  if(event.target.id==='bridge-mode'){state.bridge.mode=event.target.value;state.bridge.chosenStocks=[];render();return;}
  if(event.target.matches?.('input[name="cars"]')){
    const value=event.target.value;
    if(event.target.checked){if(!state.bridge.chosenStocks.includes(value))state.bridge.chosenStocks.push(value);}
    else{state.bridge.chosenStocks=state.bridge.chosenStocks.filter(v=>v!==value);}
    const summary=document.querySelector('.bridge-stock-summary strong');
    if(summary)summary.textContent=String(state.bridge.chosenStocks.length);
    return;
  }
  if(event.target.id==='publishing-plan-file'){
    const file=event.target.files?.[0]; if(!file)return;
    if(file.size>950_000){toast('ملف JSON أكبر من الحد المدعوم.');return;}
    try {
      const plan=JSON.parse(await file.text());
      if(!validatePlanSeed(plan))throw Error('invalid schema');
      state.pendingPlan=plan;state.planError='';render();
      toast('تمت قراءة خطة الشهر. راجع الملخص ثم اضغط تأكيد الاستيراد.');
    }catch(err){state.pendingPlan=null;state.planError='ملف غير صالح أو غير متوافق مع خطة الشهر. اختر ملف الاستيراد الأصلي.';render();}
    return;
  }
  if(event.target.id==='task-person'){state.taskPerson=event.target.value;render();return;}
  if(event.target.id==='task-week'){state.taskWeek=Number(event.target.value)||0;render();return;}
  if(event.target.id==='idea-kind'){state.ideaKind=event.target.value;render();return;}
  if(event.target.id==='idea-review-filter'){state.ideaReviewFilter=event.target.value;render();return;}
  if(event.target.id==='post-idea-select'){
    const target=getIdea(state.plan,event.target.value); if(!target)return;
    const form=event.target.form;
    for(const key of Object.keys(PLATFORMS)){
      const box=form.elements.namedItem('platform_'+key);
      const caption=form.elements.namedItem('caption_'+key);
      const hashtags=form.elements.namedItem('hashtags_'+key);
      if(box)box.checked=(target.platforms||[]).includes(key);
      if(caption)caption.value=target.captionsByPlatform?.[key]||'';
      if(hashtags)hashtags.value=target.hashtagsByPlatform?.[key]||'';
    }
    toast('تم تحميل نصوص الفكرة المختارة إلى الحقول؛ اضغط حفظ لتثبيت التغيير.');return;
  }
  if (event.target.id !== 'baseline-file') return;
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 256_000) { toast('حجم ملف المرجع أكبر من المسموح.'); return; }
  try {
    const data = JSON.parse(await file.text());
    if (!await isValidSeed(data)) { toast('ملف المرجع غير صحيح أو يختلف عن الإصدار الذي تمت مراجعته.'); return; }
    state.pendingSeed = data;
    state.dataError = '';
    state.baseline = data;
    state.baselineStatus = 'ready-to-save';
    state.view = 'baseline';
    render();
    toast('تم استيراد المرجع للمراجعة، ولم يُحفظ في Firebase بعد.');
  } catch(err) { toast('تعذر قراءة ملف JSON. تأكد من اختيار الملف الأصلي.'); }
});

function readBriefDraft(){
  return JSON.stringify([...app.querySelectorAll('#idea-review-form [name], #asset-editor [name]')].map(field=>[field.name,field.type==='checkbox'?field.checked:field.value]));
}
function canLeaveBrief(){
  return state.view!=='asset'||!state.briefBaseline||readBriefDraft()===state.briefBaseline||window.confirm('فيه تغييرات في البريف لسه ما اتحفظتش. ترجع من غير حفظ؟');
}
function openBrief(code){
  const previous=state.view;
  if(previous!=='asset'){state.briefReturnView=previous;state.briefReturnScrollY=window.scrollY||0;}
  state.selectedAssetCode=code;
  state.view='asset';render();state.briefBaseline=readBriefDraft();
  window.scrollTo({top:0,behavior:'instant'});
}
app.addEventListener('click', async event => {
  const nav = event.target.closest('[data-nav]');
  if(nav?.dataset.nav==='bridge' && !state.bridge.stock.length && !state.bridge.loading){void reloadBridge(state.bridge).then(render);}
  if (nav) {
    if(!canLeaveBrief())return;
    state.briefBaseline='';
    state.view = nav.dataset.nav;
    state.mobileNav = false;
    state.modal = null;
    render();
    window.scrollTo({top:0,behavior:'instant'});
    return;
  }
  const control = event.target.closest('[data-action]');
  if(control?.dataset.action==='bridge-reload'){state.bridge.error='';void reloadBridge(state.bridge).then(render);return;}
  if(control?.dataset.action==='bridge-check-task'){void checkBridgeTask(state).then(()=>{toast('\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u062d\u0627\u0644\u0629 \u0627\u0644\u062a\u0643\u0644\u064a\u0641');render()}).catch(error=>toast(error.message||'\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u062d\u0627\u0644\u0629'));return;}
  if(control?.dataset.action==='bridge-stock-filter'){state.bridge.stockSearch=document.getElementById('bridge-stock-search')?.value||'';render();return;}
  if(control?.dataset.action==='bridge-open-asset'){selectBridgeIdea(state,control.dataset.id||'');state.view='bridge';state.mobileNav=false;render();if(!state.bridge.stock.length)void reloadBridge(state.bridge).then(render);return;}
  if (!control) return;
  const action = control.dataset.action;
  if(action==='brief-back'){
    if(!canLeaveBrief())return;
    state.view=state.briefReturnView||'ideas';state.briefBaseline='';render();
    window.scrollTo({top:state.briefReturnScrollY||0,behavior:'instant'});return;
  }
  if(action==='archive-search'){state.archiveSearch=app.querySelector('#archive-search')?.value||'';render();return;}
  if(action==='calendar-prev'||action==='calendar-next'){
    const current=state.calendarMonth||[...state.plan.posts].sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate))[0]?.publicationDate.slice(0,7)||nowInRiyadh().slice(0,7);
    const [y,m]=current.split('-').map(Number);
    const next=new Date(Date.UTC(y,m-1+(action==='calendar-prev'?-1:1),1,12));
    state.calendarMonth=`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}`;
    state.calendarSelectedDate='';render();return;
  }
  if(action==='calendar-today'){state.calendarMonth=nowInRiyadh().slice(0,7);state.calendarSelectedDate=nowInRiyadh();render();return;}
  if(action==='calendar-select-day'){state.calendarSelectedDate=control.dataset.date||'';render();return;}
  if(action==='calendar-new-post'||action==='schedule-idea'){
    state.scheduleDate=control.dataset.date||state.calendarSelectedDate||nowInRiyadh();
    state.scheduleIdeaCode=action==='schedule-idea'?(control.dataset.id||''):'';
    state.view='schedule';render();window.scrollTo({top:0,behavior:'instant'});return;
  }
  if(action==='open-idea-import'){state.view='ideas';state.ideaImportOpen=true;state.pendingIdeaBatch=null;state.ideaImportError='';render();window.scrollTo({top:0,behavior:'instant'});return;}
  if(action==='toggle-idea-import'){state.ideaImportOpen=!state.ideaImportOpen;state.ideaImportError='';render();return;}
  if(action==='idea-import-mode'){state.ideaReplaceMode=control.dataset.mode==='replace';state.pendingIdeaBatch=null;state.ideaImportError='';render();return;}
  if(action==='replace-idea-batch'){await saveReplacementBatch();return;}
  if(action==='cancel-idea-batch'){state.pendingIdeaBatch=null;state.ideaImportError='';render();return;}
  if(action==='confirm-idea-batch'){await saveIdeaBatch();return;}
  if(action==='download-idea-template'){downloadJson(ideaBatchTemplate(),'MZJ-New-Ideas-IMPORT-TEMPLATE.json');return;}

  if(action==='confirm-plan-import'){await importPublishingPlan();return;}
  if(action==='open-post'){
    state.selectedPostId=control.dataset.id;state.view='post';render();window.scrollTo({top:0,behavior:'instant'});return;
  }
  if(action==='open-asset'){
    openBrief(control.dataset.id);return;
  }
  if(action==='apply-plan-filter'){state.planFilter=app.querySelector('#plan-filter')?.value||'';render();return;}
  if(action==='clear-plan-filter'){state.planFilter='';state.calendarExecutor='all';state.calendarPlatform='all';state.calendarMedia='all';state.calendarStatus='all';render();return;}
  if(action==='apply-idea-search'){state.ideaSearch=app.querySelector('#idea-search')?.value||'';render();return;}
  if(action==='ideas-filter-review'){state.ideaReviewFilter=control.dataset.status||'all';render();return;}
  if(action==='copy-brief'){await copyValue(toBriefText(state.plan,control.dataset.id));return;}
  if(action==='download-brief'){
    downloadText(toBriefText(state.plan,control.dataset.id),`MZJ-Brief-${control.dataset.id}.txt`);return;
  }
  if(action==='download-handoff'){
    const person=control.dataset.person||'الكل';
    downloadText(teamHandoffText(state.plan,person,state.taskWeek),`MZJ-Handoff-${person==='الكل'?'ALL':person}-W${state.taskWeek||'ALL'}.txt`);return;
  }
  if(action==='export-plan'){
    const {ownerUid,assetCount,postCount,createdAt,...seed}=state.plan;
    seed.assets=seed.assets.map(({updatedAt,...a})=>a);
    seed.posts=seed.posts.map(({updatedAt,...p})=>p);
    downloadJson(seed,'MZJ-Plan-Backup.json');return;
  }
  if (action === 'close-modal' && event.target.closest('.modal') && event.target !== control) return;
  if (action === 'toggle-password') {
    const el = app.querySelector('#password');
    if (el) { el.type = el.type === 'password' ? 'text' : 'password'; control.textContent = el.type === 'password' ? 'إظهار' : 'إخفاء'; }
    return;
  }
  if (action === 'toggle-menu') { state.mobileNav = !state.mobileNav; render(); return; }
  if (action === 'close-menu') { state.mobileNav = false; render(); return; }
  if (action === 'platform' || action === 'platform-tab') {
    state.platform = control.dataset.platform;
    state.view = 'platforms';
    render();
    window.scrollTo({ top:0, behavior:'instant' });
    return;
  }
  if (action === 'logout') { await logout(); return; }
  if (action === 'copy-uid') { await copyValue(state.user?.uid || ''); return; }
  if (action === 'copy-setup-command') { await copyValue(`node scripts/configure-owner.mjs ${state.user?.uid || ''}`); return; }
  if (action === 'download-json') { downloadJson(state.baseline,'MZJ-Baseline-2026-v2.json'); return; }
  if (action === 'print') { window.print(); return; }
  if (action === 'open-save-modal') { if (state.baselineStatus==='ready-to-save' && state.pendingSeed) { state.modal = 'save'; render(); } return; }
  if (action === 'close-modal') { state.modal = null; render(); return; }
  if (action === 'save-baseline') { await saveBaseline(); return; }
});

window.addEventListener('keydown', event => { if (event.key === 'Escape' && state.modal) { state.modal=null; render(); } });
boot();
