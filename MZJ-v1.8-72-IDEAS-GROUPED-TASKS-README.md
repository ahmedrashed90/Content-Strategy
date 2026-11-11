# MZJ — 72 Creative Ideas + Grouped Marketing Tasks (2026-11-11)

## Sources and integrity
- Complete import: `data/MZJ-72-IDEAS-FULL-CORRECTED-IMPORT-20261111.json`.
- 36 legacy concepts + 36 full production briefs, retaining full original copy, scripts, captions, visual notes and safeguards.
- 41 video briefs; 31 image ideas; 58 per-image design cards. Existing video scene voice-over and audio corrections retained.
- Every idea has one `marketingCategory` among:
  - تعريفي - بالبراند (22)
  - تعريفي - بالويب سايت (8)
  - تعريفي - مواصفات السيارات (27)
  - بيعي - قسط (2)
  - بيعي - كاش (13)
- Some classification choices are editorial because original source did not say cash versus finance: review creative/category fit before approval, and do not add prices/finance claims.
- Four ideas from the 36 new briefs remain blocked as the source specified: numbers 6, 22, 27 and 28 (car return policy, cheapest car, trade-up, employee financing). JSON retains their content; approval is blocked until original conditions are verified.

## Import and safeguarding
1. Use a staging instance of the Content Strategy project and download a backup of the existing ideas.
2. Import the single 72-idea JSON file with **استبدال بنك الأفكار** **once**, not «إضافة أفكار». The replacement **soft retires** active ideas. It does not delete prior tasks, records, historical posts or Firestore documents. The new immutable idea codes avoid collisions with previously imported 36-idea batches.
3. Inspect the resulting active count: 72, and review the category assignments.
4. Ensure no outstanding strategy -> marketing assignment request exists before replacing; the system intentionally blocks replacement until pending requests are resolved.

## Task workflow
- Select one of the five categories, then one or more approved, non-linked ideas in **the same category**.
- Pick and confirm associated real cars for each idea. Compare options require two actual cars; a non-specific idea can use «لا تحتاج سيارة».
- Select one current Marketing task type, one eligible executor, a due date and image/video platform formats (different checkboxes for each).
- Task title is automatically `<category> (<idea 1> + <idea 2> ...)`. Full idea titles are preserved; over 250 characters is blocked by UI rather than truncated to avoid misleading titles.
- One task per selected idea group, and one Marketing work item per idea. A multi-image idea displays separate image cards inside the idea's one Marketing work item; Marketing already supports selecting multiple files for a final upload. Actual readiness is calculated by Marketing's existing format/review logic (not a new image-card-count metric).
- Task and individual work item naming never prefixes idea IDs; IDs persist internally for tracking and deduplication.
- A shared idempotency request key is written before Marketing creation. Pending batches can be recovered with saved idea selection and original values. No automatic task creation; user must press «إنشاء».
- Marketing task UI cards are implemented in the separate `ahmedrashed90/MZJ-Platform` branch `feature/strategy-multi-idea-brief-cards-20261111`. Deploying Content Strategy alone will not update the Marketing task detail UI.

## UI and validation
- Photo and carousel ideas show one distinct card per image, with exact screen copy, visual treatment, any supporting text and notes.
- No legacy I03, I04, etc. codes in creative cards; internal identifiers are retained for Firestore links.
- `Escape` on idea detail returns to previous screen with an unsaved-edit confirmation.
- Run `node scripts/qa-72-idea-bank.mjs` to check import counts, categories, source-blocked ideas, image cards and grouped naming.
- This code is a **development branch only**, not a live deployment. Test creating one safe task from staging, review file upload/readiness, then deploy both projects in a controlled release. Keep existing Firestore Rules and environment secrets unchanged unless official deployment requires an explicitly approved update.
