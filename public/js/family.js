import { S, h, mount, GET, POST, DEL, toast, fail, icon, loading, empty, setTitle, fmtDate, fmtDay, ago, confirmBox } from './core.js';
import { route, go } from './router.js';

const rateChip = v => h('span', { class: 'chip ' + (v === null ? 'plain' : v >= 70 ? 'leaf' : v >= 50 ? 'sun' : 'ember') }, v === null ? 'n/a' : v + '%');

/* Parent home: link a child, then see how they are doing. Read-only. */
export async function familyHome() {
  setTitle('Family');
  const r = await GET('/family/children'); const sel = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('child')) || (r.children[0] && r.children[0].id);
  const panel = h('div', sel ? loading('Loading your child’s progress') : '');
  if (sel) loadChild(sel, panel);
  const code = h('input', { placeholder: 'Enter the 8-character code', maxlength: 12, 'aria-label': 'Link code', autocomplete: 'off', style: { textTransform: 'uppercase', letterSpacing: '.15em', maxWidth: '18rem' } });
  const link = async () => { try { const x = await POST('/family/link', { code: code.value }); toast(`${x.child.name} is now linked`, 'ok'); go('/?child=' + x.child.id + '&r=' + Date.now()); } catch (e) { fail(e); } };
  code.addEventListener('keydown', e => { if (e.key === 'Enter') link(); });
  return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', h('h1', `Hello, ${S.user.name.split(' ')[0]}`), h('p', { class: 'sub' }, 'See how your children are doing at school.'))),
    r.children.length > 0 && h('div', { class: 'kid-tabs', role: 'group', 'aria-label': 'Children' }, r.children.map(c => h('button', { type: 'button', 'aria-pressed': String(c.id === sel), onclick: () => go('/?child=' + c.id + '&r=' + Date.now()) }, c.name))),
    panel,
    h('section', { class: 'block' }, h('h2', r.children.length ? 'Link another child' : 'Link your child'),
      h('p', { class: 'muted' }, 'Ask your child to open Settings, then "Family access", and press "Create a code". Type that code here. It works once and expires after 48 hours.'),
      h('div', { class: 'row' }, code, h('button', { class: 'btn primary', type: 'button', onclick: link }, 'Link child')),
      r.children.length > 0 && h('div', { class: 'row', style: { marginTop: '.8rem' } }, r.children.map(c => h('button', { class: 'btn sm quiet', type: 'button', onclick: async () => { if (await confirmBox(`Stop seeing ${c.name}?`, { yes: 'Unlink', danger: true })) { await DEL('/family/children/' + c.id); go('/?r=' + Date.now()); } } }, 'Unlink ' + c.name.split(' ')[0])))));
}

async function loadChild(id, panel) {
  try {
    const d = await GET('/family/children/' + id), c = d.child;
    mount(panel,
      d.attention.length > 0 && h('div', { class: 'banner warn', role: 'status' }, h('p', h('strong', 'Worth a look')), h('ul', { style: { margin: '.3rem 0 0', paddingLeft: '1.1rem' } }, d.attention.map(a => h('li', a)))),
      h('div', { class: 'stat-row' }, h('div', { class: 'stat' }, h('b', d.average === null ? '–' : d.average + '%'), h('span', 'Average result')), h('div', { class: 'stat' }, h('b', String(d.study_minutes_week)), h('span', 'Study minutes this week')),
        h('div', { class: 'stat' }, h('b', String(c.streak || 0)), h('span', 'Day streak')), h('div', { class: 'stat' }, h('b', String(c.xp || 0)), h('span', 'XP earned'))),
      h('div', { class: 'grid2' },
        h('section', { class: 'block', style: { marginTop: 0 } }, h('h2', 'Recent results'), d.results.length ? h('div', { class: 'list' }, d.results.map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', x.title), h('span', { class: 'meta' }, `${x.kind}, ${fmtDay(x.submitted_at)}`)), rateChip(x.percent), h('span', { class: 'chip ' + (x.percent >= x.pass_mark ? 'leaf' : 'ember') }, x.percent >= x.pass_mark ? 'Passed' : 'Not yet')))) : empty('No results yet')),
        h('section', { class: 'block', style: { marginTop: 0 } }, h('h2', 'Coming up'), d.upcoming.length ? h('div', { class: 'list' }, d.upcoming.map(a => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', a.title), h('span', { class: 'meta' }, a.closes_at ? 'Closes ' + fmtDate(a.closes_at) : 'No deadline')), a.done ? h('span', { class: 'chip leaf' }, 'Done') : a.compulsory ? h('span', { class: 'chip ember' }, 'Compulsory') : h('span', { class: 'chip plain' }, a.kind)))) : empty('Nothing due'))),
      h('div', { class: 'grid2' },
        h('section', { class: 'block' }, h('h2', 'Attendance'), d.attendance.length ? h('div', { class: 'list' }, d.attendance.map(a => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', a.name), h('span', { class: 'meta' }, a.marked ? `${a.present} present, ${a.absent} absent of ${a.marked} days` : 'No days recorded')), a.rate !== null && rateChip(a.rate)))) : empty('Not in a class yet')),
        h('section', { class: 'block' }, h('h2', 'Courses'), d.courses.length ? h('div', { class: 'list' }, d.courses.map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', x.title), h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': x.percent, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: x.percent + '%' } }))), h('span', { class: 'meta' }, x.percent + '%')))) : empty('No courses started'))),
      d.mastery.length > 0 && h('section', { class: 'block' }, h('h2', 'Topic strengths'), h('p', { class: 'muted' }, 'Higher means more confident. Topics are sorted from the one needing most practice.'), d.mastery.slice(0, 8).map(m => h('div', { class: 'topic' }, h('span', { class: 'name' }, m.topic), h('div', { class: 'xpbar' }, h('i', { style: { width: Math.max(4, Math.min(100, m.rating / 10)) + '%' } })), h('span', { class: 'meta' }, `${m.correct}/${m.answered} correct`)))),
      d.classes.length > 0 && h('section', { class: 'block' }, h('h2', 'Teachers'), h('div', { class: 'list' }, d.classes.map(k => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', k.teacher), h('span', { class: 'meta' }, k.name + (k.subject ? ', ' + k.subject : ''))), h('a', { class: 'btn sm', href: '#/messages' }, icon('mail'), 'Message'))))),
      d.notices.length > 0 && h('section', { class: 'block' }, h('h2', 'School notices'), h('div', { class: 'list' }, d.notices.map(n => h('article', { class: 'item notice' }, h('div', { class: 'grow' }, h('strong', n.title), h('p', { style: { margin: '.3rem 0' } }, n.body), h('span', { class: 'meta' }, `${n.classroom_name}, ${ago(n.created_at)}`)))))),
      h('p', { class: 'muted small' }, 'You see results and progress only. Private messages, Study Buddy chats and exam camera images are never shown to parents.'));
  } catch (e) { mount(panel, h('div', { class: 'banner err' }, e.message)); }
}

/* Card shown in a student's Settings: create a one-time code and manage linked parents. */
export function familyAccessCard() {
  const box = h('div', loading('Loading'));
  const draw = async () => {
    const r = await GET('/family/links');
    mount(box, h('p', { class: 'muted' }, 'Let a parent or guardian see your progress, results and attendance. They cannot see your messages or chats.'),
      r.parents.length > 0 && h('div', { class: 'list' }, r.parents.map(p => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', p.name), h('span', { class: 'meta' }, 'Linked ' + fmtDay(p.created_at))), h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmBox(`Remove ${p.name}'s access?`, { yes: 'Remove', danger: true })) { await DEL('/family/links/' + p.id); draw(); } } }, 'Remove')))),
      h('div', { class: 'row', style: { marginTop: '.8rem' } }, h('button', { class: 'btn', type: 'button', onclick: async () => { try { const x = await POST('/family/code'); mount(box, h('p', 'Give this code to your parent. It works once and expires in 48 hours.'), h('div', { class: 'link-code', 'aria-live': 'polite' }, x.code), h('button', { class: 'btn', type: 'button', style: { marginTop: '.8rem' }, onclick: draw }, 'Done')); } catch (e) { fail(e); } } }, 'Create a code')));
  };
  draw().catch(e => mount(box, h('div', { class: 'banner err' }, e.message)));
  return h('section', { class: 'block' }, h('h2', 'Family access'), box);
}
