/* MZJ visual theme manager. No API, Firestore, or business-logic effects. */
(function () {
  'use strict';
  const catalog = [{"id":"01","file":"01-signature.css","name":"سيجنتشر MZJ","subtitle":"البني الأصلي في نسخة أكثر فخامة ووضوحًا","palette":["#48221D","#FCFAF8","#FFFFFF","#873C31"],"radius":18},{"id":"02","file":"02-champagne.css","name":"شامبين رويال","subtitle":"عاجي شامبين ولمسات ذهبية هادئة","palette":["#312821","#F7F4ED","#FFFDF8","#785244"],"radius":16},{"id":"03","file":"03-pearl.css","name":"بيرل إكزكيوتيف","subtitle":"سايد بار فاتح ونقاء مؤسسي وتباين مريح","palette":["#F3F5F4","#F5F7F7","#FFFFFF","#754A48"],"radius":15},{"id":"04","file":"04-rosewood.css","name":"روزوود ستوديو","subtitle":"وردي ترابي وخمري راقٍ بأيقونات ناعمة","palette":["#572D39","#FCF5F5","#FFFCFC","#995769"],"radius":22},{"id":"05","file":"05-graphite.css","name":"جرافيت إكزكيوتيف","subtitle":"رمادي جرافيتي مع عنابي متناغم","palette":["#272C36","#F5F6F8","#FFFFFF","#894B4A"],"radius":12},{"id":"06","file":"06-desert.css","name":"ديزرت مينيمال","subtitle":"بيج رملي مع قائمة جانبية فاتحة وخطوط دقيقة","palette":["#F0E8DB","#F8F5EF","#FFFDF8","#754C3D"],"radius":15},{"id":"07","file":"07-frost.css","name":"فروست جلاس","subtitle":"طبقات زجاجية شفافة ولمسات أرجوانية دافئة","palette":["#403041","#F7F3F7","rgba(255,255,255,.88)","#865572"],"radius":23},{"id":"08","file":"08-editorial.css","name":"إديتوريال كونتراست","subtitle":"مؤسسي حاد بتقسيمات دقيقة وأيقونات خطية","palette":["#2A2422","#F6F4F1","#FFFEFC","#543530"],"radius":7}];
  const byId = new Map(catalog.map(item => [item.id, item]));
  const storageKey = 'mzj.contentStrategy.theme.v1';
  const safeRead = () => { try { return localStorage.getItem(storageKey) || ''; } catch { return ''; } };
  let applied = byId.has(safeRead()) ? safeRead() : '';
  let previewed = applied;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = 'mzj-selected-theme';
  const setVisual = id => {
    if (!id || !byId.has(id)) {
      document.documentElement.removeAttribute('data-mzj-theme');
      link.removeAttribute('href');
      if (link.isConnected) link.remove();
      previewed = '';
      return;
    }
    const nextHref = './themes/' + byId.get(id).file;
    // Load the selected palette *after* the common stylesheet, without duplicating CSS.
    if (!link.isConnected) document.head.appendChild(link);
    if (link.getAttribute('href') !== nextHref) link.setAttribute('href', nextHref);
    document.documentElement.setAttribute('data-mzj-theme', id);
    previewed = id;
  };
  setVisual(applied);
  const api = Object.freeze({
    catalog: Object.freeze(catalog.map(item => Object.freeze(item))),
    applied: () => applied,
    previewed: () => previewed,
    preview(id) { if (!byId.has(id)) return false; setVisual(id); return true; },
    apply(id) {
      if (!byId.has(id)) return false;
      // The selection remains active even if browser storage is disabled.
      applied = id;
      try { localStorage.setItem(storageKey, id); } catch { /* session-only fallback */ }
      setVisual(id);
      return true;
    },
    cancel() { setVisual(applied); },
    restoreDefault() {
      applied = '';
      try { localStorage.removeItem(storageKey); } catch { /* session-only fallback */ }
      setVisual('');
    },
  });
  Object.defineProperty(window, 'MZJTheme', { value: api, writable: false, configurable: false });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    applied = byId.has(event.newValue) ? event.newValue : '';
    setVisual(applied);
  });
})();
