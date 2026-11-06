// Public UI schema: NO private social-account metrics live in published JS.
// The reviewed data belongs to ../data/MZJ-baseline-2026-v1.json (outside site).
export const PLATFORM_ORDER = ['facebook','instagram','tiktok','snapchat'];

const empty = (name, notes = []) => ({
  name, source: 'لم يُحمّل المرجع من Firestore بعد',
  period: 'غير متاح حتى استيراد المرجع',
  countAccuracy: 'بانتظار البيانات',
  followers: null, follows: null, unfollows: null, netFollows: null,
  views: null, organicViews: null, paidViews: null, interactions: null,
  saudiFollowersPercent: null, notes
});

export const INITIAL_BASELINE = Object.freeze({
  id: 'baseline-2026-v1',
  schemaVersion: 1,
  registrationDate: '2026-11-06',
  title: 'المرجع الأول قبل تطبيق استراتيجية المحتوى الجديدة',
  status: 'pre-strategy',
  platforms: {
    facebook: empty('Facebook'),
    instagram: empty('Instagram'),
    tiktok: empty('TikTok'),
    snapchat: empty('Snapchat')
  },
  methodology: []
});
