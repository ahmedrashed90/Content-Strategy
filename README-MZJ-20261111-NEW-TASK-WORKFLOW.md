# MZJ Content Strategy | Complete source update | 2026-11-11

This directory is a **complete Strategy source tree**, not a patch.

## What changed

- Approved ideas can be used for new Marketing tasks repeatedly. The existing linked Marketing task is not deleted or replaced: previous assignments are kept in `previousMarketingTasks` history.
- In **03 - Task details / Create**, one or more Marketing executors can be selected; **each executor has a different delivery date**. Selector options display **names only**. The person's Marketing department is still available internally to identify photographers.
- A Marketing executor in a photography department is assigned a Drive-link deliverable. Other executors retain final-file uploads. Multiple assignments remain part of one Marketing task.
- The strategy brief maps to the Marketing requirement with: deliverable image/video, creative brief and approved vehicle names, audience/goal/message and creative treatment (hook / VO / detailed script). Marketing provides an Arabic DOCX download for that treatment.
- Task creation remains explicitly user-confirmed, authorized and idempotent under retries; prior task links and stable request keys are preserved.

## Deploy

1. Preserve the active Firebase project, Firestore documents, Vercel environment variables and existing Marketing integration secrets. Back up the current Strategy project.
2. First deploy the matching **Marketing complete-source update** and verify its additive `schema-17` migration succeeds.
3. Publish this complete Strategy source to its existing Vercel project. Framework: Other, Output Directory: `site` (see `vercel.json`). Keep `api/marketing-bridge.js` server side, not exposed in `site`.
4. Preserve/publish the `firestore.rules` appropriate for this version and current owner UID (as described in `MZJ-STRATEGY-API-DEPLOY-README.md`). **Never erase, reset or re-import live strategy plans.**
5. Preview test reusing an already-assigned approved idea, assign photographer + editor with different deadlines, create one Marketing task, and verify that both requirements and saved previous link history appear as expected.

## Local regression checks

```sh
node scripts/qa-20261111-multi-executor-reuse.mjs
node scripts/test-marketing-bridge.mjs
node scripts/qa-72-idea-bank.mjs
node scripts/qa-strategic-agenda.mjs
node scripts/qa-plan.mjs
```

These run offline and do not verify live Vercel or Firebase permissions.
