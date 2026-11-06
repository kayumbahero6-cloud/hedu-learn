import { S, h, mount, GET, icon, dialog, setTitle, fmtDay, debounce, toast, applyPrefs, PUT, fail, gradeLabel } from './core.js';
import { route, go } from './router.js';

/* ---------------- completion certificate (printable) ---------------- */
route('/certificate/:id', async ({ params }) => {
  const r = await GET('/courses/' + params.id), c = r.course; setTitle('Certificate');
  if (S.user.role !== 'student' || r.percent < 100) return h('div', { class: 'page narrow' }, h('div', { class: 'banner' }, h('p', 'Finish every lesson in this course to earn its certificate.')), h('a', { class: 'btn', href: '#/courses/' + c.id }, 'Back to the course'));
  return h('div', { class: 'page' },
    h('div', { class: 'row no-print', style: { marginBottom: '1rem' } }, h('a', { class: 'btn', href: '#/courses/' + c.id }, 'Back'), h('button', { class: 'btn primary', type: 'button', onclick: () => window.print() }, 'Print or save as PDF')),
    h('div', { class: 'cert' }, h('div', { class: 'cert-in' },
      h('div', { class: 'cert-brand' }, h('img', { src: '/icons/icon.svg', alt: '' }), 'EduLearn'),
      h('p', { class: 'cert-k' }, 'Certificate of completion'), h('p', 'This certifies that'), h('h1', S.user.name), h('p', 'has completed all lessons of'),
      h('h2', c.title), h('p', { class: 'muted' }, [gradeLabel(c.grade_level), c.subject].filter(Boolean).join(' · ')),
      h('div', { class: 'cert-foot' }, h('div', h('strong', fmtDay(Date.now())), h('small', 'Date')), h('div', h('strong', S.user.school ? S.user.school.name : 'EduLearn'), h('small', 'School')), h('div', h('strong', c.creator_name || 'EduLearn'), h('small', 'Course author'))))));
});

/* ---------------- theme toggle ---------------- */
export function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const settings = { ...(S.user.settings || {}), theme: dark ? 'light' : 'dark' };
  S.user.settings = settings; applyPrefs(S.user);
  PUT('/auth/me', { settings }).catch(() => {});
}

/* ---------------- command palette: Ctrl/Cmd+K ---------------- */
let open = false;
export function openPalette() {
  if (open || !S.user) return; open = true;
  const items = [...document.querySelectorAll('.rail nav a')].map(a => ({ label: a.textContent.replace(/\d+$/, '').trim(), href: a.dataset.href, kind: 'Go to' }));
  let extra = [];
  Promise.all([GET('/courses').catch(() => ({ courses: [] })), GET('/assessments').catch(() => ({ assessments: [] }))]).then(([c, a]) => {
    extra = [...c.courses.map(x => ({ label: x.title, href: '/courses/' + x.id, kind: 'Course' })), ...a.assessments.map(x => ({ label: x.title, href: '/assessments/' + x.id, kind: 'Assessment' }))]; draw();
  });
  const input = h('input', { type: 'search', placeholder: 'Search pages, courses, assessments…', 'aria-label': 'Search' });
  const list = h('ul', { role: 'listbox' }); let sel = 0, shown = [];
  const draw = () => {
    const needle = input.value.trim().toLowerCase();
    shown = [...items, ...extra].filter(i => !needle || i.label.toLowerCase().includes(needle)).slice(0, 12);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    mount(list, shown.length ? shown.map((i, n) => h('li', { role: 'option' }, h('a', { href: '#' + i.href, class: n === sel ? 'on' : '', onclick: () => close() }, h('span', { class: 'chip plain' }, i.kind), i.label))) : h('li', { class: 'muted', style: { padding: '.6rem' } }, 'Nothing found'));
  };
  let close = () => {};
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && shown[sel]) { const t = shown[sel].href; close(); go(t); }
  });
  draw();
  const d = dialog({ title: 'Search', body: h('div', { class: 'cmdk' }, input, list, h('p', { class: 'hint' }, h('kbd', '↑'), ' ', h('kbd', '↓'), ' to move, ', h('kbd', 'Enter'), ' to open, ', h('kbd', 'Esc'), ' to close')), actions: [], onClose: () => { open = false; } });
  close = () => { try { d && d.close ? d.close() : document.querySelector('dialog[open]')?.close(); } catch { /* ignore */ } open = false; };
  setTimeout(() => input.focus(), 30);
}
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
