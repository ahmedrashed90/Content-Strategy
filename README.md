# MZJ | النظام المستقل للاستراتيجية والمقارنة — النسخة التأسيسية 1.0

> This is a **phase-one standalone** system for ONE owner. It does **not** modify MZJ's existing marketing/CRM systems. It is a static, dependency-free frontend using Firebase Web SDK browser modules and Firestore.

## ما الذي تم بناؤه؟

- لوحة متابعة عربية RTL بهوية MZJ: بني `#4A211C` وكريمي `#F3E8DC` وخط Tajawal.
- تسجيل دخول مستخدم واحد باستخدام Firebase Email/Password الموجود بالفعل.
- أرقام Facebook وInstagram وTikTok السابقة، مع توضيح الفترات والمصادر والأرقام التقريبية؛ Snapchat بانتظار البيانات. **المرجع الكامل ليس ضمن ملفات الموقع المنشورة؛ هو ملف JSON مستقل للاستيراد بعد الدخول.**
- حفظ المرجع في Firestore **مرة واحدة** وإغلاق تحديثه أو حذفه في القواعد.
- بطاقة تفصيل لكل منصة، وتصدير JSON، وإمكانية طباعة التقرير من المتصفح.
- شاشة للمقارنة المستقبلية بدون اختلاق مؤشرات جديدة أو نتائج للمبيعات.
- إعداد مالك واحد عبر Firebase Auth UID، مع قواعد Firestore محدودة للمسار المرجعي.

## ما لم يتم تنفيذه الآن؟

بنك الأفكار، خطط الإنتاج والنشر، استراتيجيات الـ45 سؤال، قياس المبيعات وCRM، تكامل المنصات وتحديثاتها التلقائية — كلها بعد تحليل إجابات الإدارة. **لا يوجد ربط أو تغيير في الأنظمة الحالية.**

## التشغيل لأول مرة

1. فك الضغط. افتح `MZJ-visual-preview.html` للمعاينة السريعة (غير تفاعلية). لتشغيل السيستم الحقيقي، شغّل موقعًا محليًا من المجلد — بدون npm:

   ```bash
   python -m http.server 8080 --directory site
   ```

   ثم افتح `http://localhost:8080` (لا تفتح الملف بالنقر المباشر بسبب ES Modules).

2. تأكد من إنشاء **Cloud Firestore Database** في Firebase Console (إذا لم تُنشأ)، واترك القواعد الحالية التي تمنع الجميع حتى إعداد الحساب.
3. أنشئ مستخدمًا واحدًا من Firebase Console > Authentication > Users إن لم يكن موجودًا. أنت فعّلت Email/Password بالفعل.
4. سجّل الدخول في الصفحة. ستظهر شاشة **تهيئة المالك** وبها UID الفعلي. انسخه.
5. داخل المجلد شغّل الأمر التالي بعد استبدال الجزء الأخير بـ UID المنسوخ:

   ```bash
   node scripts/configure-owner.mjs YOUR_FIREBASE_AUTH_UID
   ```

   هذا الأمر يحدد صاحب النظام في `site/config.js` و`firestore.rules` فقط.
6. انسخ ملف `firestore.rules` بالكامل إلى Firebase Console > Firestore Database > Rules ثم اضغط **Publish**. بدون ذلك لن يتم الحفظ، لأن القواعد الحالية `allow read, write: if false`.
7. أعد تحميل الصفحة، سجّل الدخول، وستظهر شاشة **استيراد المرجع**. اختر الملف `data/MZJ-baseline-2026-v1.json` الموجود في المجلد الذي فككت ضغطه. راجع الأرقام التي ستظهر ثم اضغط **تثبيت المرجع في Firebase**. الحفظ يحدث فقط بعد تأكيدك.
8. للمعاينة البصرية قبل إعداد Firebase استخدم `MZJ-visual-preview.html` من جذر حزمة السورس (صفحة شكل فقط وغير متصلة بالبيانات). لا تنشر هذا الملف على الإنترنت لأنه يتضمن لقطة مرجعية بصرية.

### النشر على Vercel أو Firebase Hosting

- مشروع ثابت (Static Site)؛ لا يحتاج Build Command.
- بعد ضبط UID ونشر قواعد Firestore: في Vercel اختر المشروع من جذر السورس واجعل **Output Directory = site** وFramework = Other وBuild Command فارغًا؛ أو ارفع محتويات مجلد `site` إلى استضافة ثابتة. ملف `vercel.json` يحدد Output Directory مسبقًا.
- **Firebase Authentication > Settings > Authorized domains:** أضف اسم النطاق الذي ستستضيف عليه الموقع؛ من غير ذلك قد يُرفض تسجيل الدخول.
- `firebase.json` مهيأ لخدمة Firebase Hosting، ولكن استخدم إعدادات الـ CLI حسب مشروعك.
- لا تنشر ملف Service Account JSON أو مفاتيح خادم ولا ترفعها إلى المستودع.

## بنية البيانات

الوثيقة الوحيدة التي تكتبها النسخة التأسيسية:

`baselines/baseline-2026-v1`

والقواعد تسمح للـ UID الوحيد بـ `get` و `create` مرة واحدة، وتمنع `update`, `delete`, `list` وبقية المسارات. إذا استدعت مراجعة المصدر تصحيحًا لاحقًا، أنشئ إصدارًا مرجعيًا جديدًا بعد مراجعة تصميم الإصدار 2، ولا تستبدل التاريخ بشكل صامت.

## قواعد الدقة

- تاريخ تثبيت البيانات لا يعني الفترة الزمنية الفعلية للمؤشرات.
- أرقام Meta وTikTok مأخوذة من فترات غير متطابقة؛ لا جمع لأرقام المشاهدات كأنها فترة واحدة.
- مشاهدات TikTok والمتابعون حوالي (تقريبية) وليست أرقامًا يقينية.
- 445 و108 تفاعلًا في Meta إجمالي وليست تفاعلًا عضويًا.
- لا توجد بيانات أداء لـSnapchat معتمدة حتى الآن.
- لم تُسجل بعد أرقام ليدات/مبيعات معزوة للمحتوى؛ لذلك لا تظهر أرقام تجارية مخترعة.

## ملاحظات أمان

- Firebase Web Config علني بطبيعته ولا يغني عن قواعد Firestore، وهو ليس Service Account key.
- يجب حصر مستخدمي Firebase Authentication في حسابك فقط وعدم تمكين إنشاء حسابات عامة.
- قبل تعيين UID، قواعد Firestore في المصدر الافتراضي تقفل جميع العمليات.
- ملف المرجع الفعلي `data/MZJ-baseline-2026-v1.json` موجود **خارج** مجلد `site` المنشور، ومستثنى من نشر Firebase Hosting وVercel عند اتباع إعدادات المشروع. لا ترفع الملف أو صفحة `MZJ-visual-preview.html` علنًا. بعد الاستيراد تُحمّل البيانات من Firestore وفق UID المالك فقط.
- الموقع يحتاج اتصال إنترنت لتحميل Firebase SDK وخط Tajawal عند التشغيل الفعلي.

## الأدوات

HTML, CSS, JavaScript ES modules, Firebase Web SDK from Google CDN, Firestore Security Rules. لا تحتاج إلى تثبيت حزم أو تشغيل build.
