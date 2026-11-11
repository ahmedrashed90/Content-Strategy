import { getIdea, ideaIsApproved, ideaIsLinked } from './planner.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const platforms={instagram:'إنستغرام',facebook:'فيسبوك',tiktok:'تيك توك',snapchat:'سناب شات'};
export function proposalsPage(state){
  const plan=state.plan;
  if(!plan)return '<div class="page-header"><h1 class="page-title">مقترحات النشر</h1></div><div class="notice">استورد خطة المحتوى أولًا.</div>';
  const active=plan.assets.filter(a=>!a.retiredFromIdeaBank && a.kind!=='carousel_slide' && ideaIsApproved(plan,a.code) && ideaIsLinked(plan,a.code));
  const history=(state.proposals||[]).slice().reverse();
  return `<div class="page-header"><div><div class="page-eyebrow">من الاستراتيجية إلى الأجندة</div><h1 class="page-title">مقترحات النشر</h1><p class="page-description">رتب النشر بعد اعتماد البريف وربط التكليف. المنتج النهائي يجب أن يكون معتمدًا في التسويق قبل تحويل المقترح إلى أجندة.</p></div><div class="p-actions"><button class="btn" data-nav="plan">تقويم النشر</button></div></div>
    <div class="publication-path"><span>الفكرة المعتمدة</span><span>تاسك التسويق</span><span>المنتج المعتمد</span><strong>مقترح النشر</strong><span>أجندة التسويق</span></div>
    <div class="proposal-layout"><section class="card panel proposal-editor"><div class="section-heading"><div><h2>إنشاء مقترح نشر</h2><p>مسودة داخل الاستراتيجية؛ لا تنشر ولا تنشئ أجندة تلقائيًا.</p></div></div>
      <form id="proposal-create" class="proposal-form">
       <label>الفكرة المرتبطة بتاسك<select name="ideaCode" required><option value="">اختر الفكرة</option>${active.map(a=>`<option value="${esc(a.code)}">${esc(a.code)} — ${esc(a.title)}</option>`).join('')}</select></label>
       <label>عنوان المقترح<input name="title" required maxlength="180" placeholder="مثال: تجربة مساحة السيارة للعائلات"/></label>
       <div class="proposal-two"><label>تاريخ النشر المقترح من<input type="date" name="publicationStartDate" required/></label><label>إلى (اختياري)<input type="date" name="publicationEndDate"/></label></div>
       <fieldset><legend>منصات النشر</legend><div class="proposal-platforms">${Object.entries(platforms).map(([key,label])=>`<label><input type="checkbox" name="platforms" value="${key}"/>${label}</label>`).join('')}</div></fieldset>
       <label>الهدف التجاري<textarea name="objective" rows="2" placeholder="استفسارات عن سيارة محددة، تمويل، زيارة المعرض..."></textarea></label>
       <label>فكرة الكابشن السعودي<textarea name="caption" rows="3" placeholder="الصياغة المقترحة للنشر باللهجة السعودية"></textarea></label>
       <label>مرجع المنتج المعتمد في التسويق (اختياري)<input name="marketingProductId" placeholder="أضفه بعد التحقق من اعتماد المنتج"/></label>
       <button class="btn btn-primary" type="submit" ${state.proposalSaving?'disabled':''}>حفظ مسودة المقترح</button>
      </form>
      ${!active.length?'<div class="notice warning">لا توجد أفكار نشطة معتمدة ومرتبطة بتاسك. اعتمد فكرة واربط التكليف أولًا.</div>':''}
    </section>
    <section class="proposal-list"><div class="section-heading"><div><h2>المقترحات المحفوظة</h2><p>مسودات منظمة تمهد لإنشاء الأجندة عند جاهزية الربط بالمنتجات.</p></div></div>
      ${history.length?history.map(p=>`<article class="proposal-item"><div class="proposal-item-head"><strong>${esc(p.title)}</strong><span class="proposal-draft-label">${esc(p.status)}</span></div><div class="proposal-item-meta"><span>${esc(p.ideaCode)}</span><span>${esc(p.publicationStartDate)}${p.publicationEndDate?' — '+esc(p.publicationEndDate):''}</span></div><p>${esc(p.objective||'الهدف لم يحدد')}</p><div class="proposal-platforms">${(p.platforms||[]).map(key=>`<span>${esc(platforms[key]||key)}</span>`).join('')}</div><p class="proposal-product-note">${p.marketingProductId?'مرجع المنتج: '+esc(p.marketingProductId)+' — لم يتم التحقق آليًا من الاعتماد':'بانتظار اعتماد المنتج أو تحديد مرجعه'}</p></article>`).join(''):'<div class="proposal-empty">لا توجد مقترحات بعد. ابدأ باختيار فكرة معتمدة ومرتبطة بتاسك.</div>'}
    </section></div>
    <p class="bridge-footnote">الربط الحالي بسيستم التسويق يدعم إنشاء التاسك فقط، وليس قراءة المنتجات أو إنشاء الأجندات. هذه الصفحة تحفظ مقترحات حقيقية داخل الاستراتيجية؛ إرسالها للتسويق لن يُفعّل إلا بعد إضافة API معتمدة والتحقق من المنتج.</p>`;
}
export function proposalFromForm(form,plan){
  const value=name=>String(form.elements.namedItem(name)?.value||'').trim();
  const code=value('ideaCode'),idea=getIdea(plan,code);
  if(!idea || idea.retiredFromIdeaBank || !ideaIsApproved(plan,code)||!ideaIsLinked(plan,code))throw Error('الفكرة يجب أن تكون معتمدة ومرتبطة بتاسك في التسويق');
  const platforms=[...form.querySelectorAll('input[name="platforms"]:checked')].map(input=>input.value);
  if(!platforms.length)throw Error('اختر منصة نشر واحدة على الأقل');
  return {id:'MP'+Date.now().toString(36).toUpperCase(),title:value('title').slice(0,180),ideaCode:code,
    marketingProductId:value('marketingProductId').slice(0,120),publicationStartDate:value('publicationStartDate'),
    publicationEndDate:value('publicationEndDate'),platforms,
    objective:value('objective').slice(0,4000),caption:value('caption').slice(0,5000),
    notes:'',status:'مسودة'};
}
