import { S, h, mount, GET, POST, PUT, DEL, toast, fail, icon, loading, empty, setTitle, fmtDate, fmtDay, ago, confirmBox, askText, dialog } from './core.js';
import { route, go, onLeave } from './router.js';

const tabsBar = (items, cur, hrefFor) => h('div', { class: 'tabs', role: 'tablist' }, items.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === cur), onclick: () => go(hrefFor(k)) }, l)));
const toLocalInput = ms => { const d = new Date(ms - new Date().getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
const fromLocalInput = v => (v ? new Date(v).getTime() : null);
const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', h('h1', title), sub && h('p', { class: 'sub' }, sub)), actions.length > 0 && h('div', { class: 'actions' }, ...actions));
const field = (label, el, hint) => h('div', { class: 'field' }, h('label', label), el, hint && h('span', { class: 'hint' }, hint));

/* ============================================================ calendar */
route('/calendar', async ({ query }) => {
  setTitle('Calendar');
  const now = new Date(), y = Number(query.y) || now.getFullYear(), m = query.m !== undefined ? Number(query.m) : now.getMonth();
  const first = new Date(y, m, 1), start = new Date(y, m, 1 - ((first.getDay() + 6) % 7)), end = new Date(start.getTime() + 42 * 864e5);
  const r = await GET(`/calendar?from=${start.getTime()}&to=${end.getTime()}`);
  const classes = S.user.role === 'educator' ? (await GET('/classrooms')).classrooms : [];
  const byDay = {}; for (const e of r.events) (byDay[new Date(e.starts_at).toDateString()] ||= []).push(e);
  const nav = d => { const x = new Date(y, m + d, 1); go(`/calendar?y=${x.getFullYear()}&m=${x.getMonth()}`); };
  const show = e => dialog({ title: e.title, body: h('div', { class: 'stack tight' }, h('p', h('strong', fmtDate(e.starts_at)), e.ends_at ? ' to ' + fmtDate(e.ends_at) : ''), e.classroom_name && h('p', 'Class: ' + e.classroom_name), e.notes && h('p', e.notes), h('span', { class: 'chip plain' }, e.kind || e.source)),
    actions: [e.link && { label: 'Open', kind: 'primary', onClick: () => { go(e.link); } }, e.editable && { label: 'Delete', kind: 'danger', onClick: async () => { try { await DEL('/calendar/' + e.id); toast('Event deleted', 'ok'); go(`/calendar?y=${y}&m=${m}&r=${Date.now()}`); } catch (er) { fail(er); return false; } } }, { label: 'Close' }].filter(Boolean) });
  const add = (day) => {
    const f = { title: h('input', { maxlength: 120, placeholder: 'Event title' }), at: h('input', { type: 'datetime-local', value: toLocalInput((day || new Date()).setHours(9, 0, 0, 0)) }), kind: h('select', ['event', 'exam', 'lesson', 'meeting', 'holiday'].map(k => h('option', { value: k }, k))), notes: h('textarea', { maxlength: 1000, rows: 3 }),
      cls: h('select', h('option', { value: '' }, 'Only me'), classes.map(c => h('option', { value: c.id }, 'Class: ' + c.name))) };
    dialog({ title: 'Add to calendar', body: h('div', { class: 'stack' }, field('Title', f.title), field('When', f.at), field('Type', f.kind), classes.length > 0 && field('Visible to', f.cls), field('Notes', f.notes)),
      actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', close: false, onClick: async close => { try { await POST('/calendar', { title: f.title.value, starts_at: fromLocalInput(f.at.value), kind: f.kind.value, notes: f.notes.value, classroom_id: f.cls.value || undefined }); close(); toast('Added', 'ok'); go(`/calendar?y=${y}&m=${m}&r=${Date.now()}`); } catch (e) { fail(e); return false; } } }] });
  };
  const cells = []; for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 864e5), evs = byDay[d.toDateString()] || [], today = d.toDateString() === now.toDateString();
    cells.push(h('div', { class: 'cal-cell' + (d.getMonth() !== m ? ' dim' : '') + (today ? ' today' : '') }, h('button', { class: 'cal-day', type: 'button', 'aria-label': 'Add event on ' + d.toDateString(), onclick: () => add(d) }, d.getDate()),
      evs.slice(0, 3).map(e => h('button', { class: 'cal-ev ' + (e.kind || 'event'), type: 'button', title: e.title, onclick: () => show(e) }, e.title)), evs.length > 3 && h('small', { class: 'muted' }, `+${evs.length - 3} more`)));
  }
  const upcoming = r.events.filter(e => e.starts_at >= Date.now()).slice(0, 6);
  return h('div', { class: 'page wide' }, pageHead('Calendar', 'Your events, class events, assessment deadlines and tasks.', h('button', { class: 'btn primary', type: 'button', onclick: () => add() }, 'Add event')),
    h('div', { class: 'cal-head' }, h('button', { class: 'btn sm', onclick: () => nav(-1), 'aria-label': 'Previous month' }, '‹'), h('h2', first.toLocaleDateString([], { month: 'long', year: 'numeric' })), h('button', { class: 'btn sm', onclick: () => nav(1), 'aria-label': 'Next month' }, '›'), h('button', { class: 'btn sm', onclick: () => go('/calendar') }, 'Today')),
    h('div', { class: 'cal-grid', role: 'grid' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => h('div', { class: 'cal-dow' }, d)), cells),
    h('section', { class: 'block' }, h('h2', 'Coming up'), upcoming.length ? h('div', { class: 'list' }, upcoming.map(e => h('button', { class: 'item', type: 'button', onclick: () => show(e) }, h('div', { class: 'grow' }, h('strong', e.title), h('span', { class: 'meta' }, fmtDate(e.starts_at))), h('span', { class: 'chip plain' }, e.kind || e.source)))) : empty('Nothing coming up', 'Click a day to add an event.')));
});

/* ============================================================ messages */
route('/messages', async ({ query }) => {
  setTitle('Messages');
  const [thr, con] = await Promise.all([GET('/messages/threads'), GET('/messages/contacts')]);
  const withId = Number(query.with) || null;
  const pane = h('div', { class: 'msg-pane' }, withId ? loading() : h('div', { class: 'empty' }, h('h3', 'Select a conversation'), h('p', 'Or start a new one with the button above.')));
  let timer; onLeave(() => clearInterval(timer));
  const open = async uid => {
    const c = await GET('/messages/with/' + uid);
    const list = h('div', { class: 'msg-list', 'aria-live': 'polite' }, c.messages.map(m => h('div', { class: 'bubble ' + (m.sender_id === S.user.id ? 'me' : 'them') }, h('p', m.body), h('small', ago(m.created_at)))));
    const input = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Write a message…', 'aria-label': 'Message' });
    const send = async () => { const body = input.value.trim(); if (!body) return; try { await POST('/messages', { to: uid, body }); input.value = ''; go(`/messages?with=${uid}&r=${Date.now()}`); } catch (e) { fail(e); } };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    mount(pane, h('div', { class: 'msg-top' }, h('strong', c.user.name), h('span', { class: 'chip plain' }, c.user.role)), list, c.can_send ? h('div', { class: 'msg-send' }, input, h('button', { class: 'btn primary', type: 'button', onclick: send }, 'Send')) : h('p', { class: 'banner' }, 'You can no longer message this person.'));
    list.scrollTop = list.scrollHeight;
    clearInterval(timer); timer = setInterval(async () => { try { const n = await GET('/messages/with/' + uid); if (n.messages.length !== c.messages.length) go(`/messages?with=${uid}&r=${Date.now()}`); } catch { /* ignore */ } }, 15000);
  };
  if (withId) open(withId).catch(fail);
  const newChat = () => dialog({ title: 'New message', body: con.contacts.length ? h('div', { class: 'list' }, con.contacts.map(c => h('a', { class: 'item', href: '#/messages?with=' + c.id, onclick: () => document.querySelector('dialog')?.close() }, h('div', { class: 'grow' }, h('strong', c.name), h('span', { class: 'meta' }, c.context || c.role)), h('span', { class: 'chip plain' }, c.role)))) : h('p', S.user.role === 'student' ? 'Join a class to message your teacher.' : 'No contacts yet.'), actions: [{ label: 'Close' }] });
  return h('div', { class: 'page wide' }, pageHead('Messages', S.user.role === 'student' ? 'Message your teachers. Private chat between learners is switched off for safety.' : 'Message your learners and colleagues.', h('button', { class: 'btn primary', type: 'button', onclick: newChat }, 'New message')),
    h('div', { class: 'msg-wrap' }, h('div', { class: 'msg-threads' }, thr.threads.length ? thr.threads.map(t => h('a', { class: 'msg-t' + (t.user.id === withId ? ' on' : ''), href: '#/messages?with=' + t.user.id }, h('div', { class: 'grow' }, h('strong', t.user.name), h('small', (t.last.mine ? 'You: ' : '') + t.last.body)), t.unread > 0 && h('span', { class: 'count' }, t.unread))) : h('p', { class: 'muted', style: { padding: '1rem' } }, 'No conversations yet.')), pane));
});

/* ============================================================ study hub: planner, flashcards, notes, tasks */
route('/study', async ({ query }) => {
  setTitle('Study');
  const tab = ['planner', 'cards', 'notes', 'tasks'].includes(query.tab) ? query.tab : 'planner';
  const body = h('div', loading());
  const tabs = tabsBar([['planner', 'Planner'], ['cards', 'Flashcards'], ['notes', 'Notes'], ['tasks', 'Tasks']], tab, k => '/study?tab=' + k);
  ({ planner, cards, notes, tasks }[tab])(body, query).catch(e => mount(body, h('div', { class: 'banner err' }, e.message)));
  return h('div', { class: 'page' }, pageHead('Study', 'Plan your time, memorise with flashcards, keep notes and track tasks.'), tabs, body);
});

async function planner(body) {
  const p = await GET('/planner'); const pct = Math.min(100, Math.round(100 * p.today_minutes / p.goal.daily_minutes)), max = Math.max(30, ...p.week.map(d => d.minutes));
  let secs = 0, tick = null, running = false, subj = h('input', { placeholder: 'Subject (optional)', maxlength: 60, 'aria-label': 'Subject' });
  const clockEl = h('div', { class: 'timer', role: 'timer' }, '25:00'); let target = 25 * 60;
  const draw = () => { const left = Math.max(0, target - secs); clockEl.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; };
  const log = async minutes => { try { const r = await POST('/study-sessions', { minutes, subject: subj.value }); toast(r.goal_met ? 'Daily goal reached!' : `${minutes} minutes logged`, 'ok'); go('/study?tab=planner&r=' + Date.now()); } catch (e) { fail(e); } };
  const startBtn = h('button', { class: 'btn primary', type: 'button' }, 'Start focus session');
  startBtn.onclick = () => {
    if (running) { clearInterval(tick); running = false; const m = Math.floor(secs / 60); startBtn.textContent = 'Start focus session'; secs = 0; draw(); if (m >= 1) log(m); else toast('Stopped. Sessions under a minute are not logged.'); return; }
    running = true; startBtn.textContent = 'Stop and log time'; tick = setInterval(() => { secs++; draw(); if (secs >= target) { startBtn.click(); toast('Focus session complete. Take a short break.', 'ok'); } }, 1000);
  };
  onLeave(() => clearInterval(tick));
  const lens = h('select', { 'aria-label': 'Session length' }, [15, 25, 45, 60].map(m => h('option', { value: m, selected: m === 25 }, m + ' min'))); lens.onchange = () => { if (!running) { target = Number(lens.value) * 60; draw(); } };
  mount(body, h('div', { class: 'grid2' },
    h('section', { class: 'block', style: { marginTop: 0 } }, h('h2', 'Today'), h('div', { class: 'big-num' }, p.today_minutes, h('small', ` / ${p.goal.daily_minutes} min`)), h('div', { class: 'xpbar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: pct + '%' } })),
      h('p', { class: 'muted' }, `${p.streak} day study streak, ${p.lessons_week} of ${p.goal.weekly_lessons} lessons this week`),
      h('div', { class: 'row' }, h('label', { class: 'small' }, 'Daily goal (min) '), h('input', { type: 'number', min: 5, max: 600, value: p.goal.daily_minutes, style: { width: '6rem' }, id: 'g-min', 'aria-label': 'Daily goal in minutes' }), h('label', { class: 'small' }, 'Lessons / week '), h('input', { type: 'number', min: 1, max: 50, value: p.goal.weekly_lessons, style: { width: '5rem' }, id: 'g-les', 'aria-label': 'Weekly lesson goal' }),
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await PUT('/planner/goal', { daily_minutes: Number(document.getElementById('g-min').value), weekly_lessons: Number(document.getElementById('g-les').value) }); toast('Goals saved', 'ok'); go('/study?tab=planner&r=' + Date.now()); } catch (e) { fail(e); } } }, 'Save goals'))),
    h('section', { class: 'block', style: { marginTop: 0 } }, h('h2', 'Focus timer'), clockEl, h('div', { class: 'row' }, lens, subj), h('div', { class: 'row', style: { marginTop: '.6rem' } }, startBtn, h('button', { class: 'btn', type: 'button', onclick: async () => { const v = await askText('Log study time', { label: 'Minutes studied', multiline: false, yes: 'Log', required: 1 }); if (v && Number(v) > 0) log(Math.round(Number(v))); } }, 'Log time manually')))),
    h('section', { class: 'block' }, h('h2', 'Last 7 days', h('span', { class: 'more' }, `${p.week_total} min total`)), h('div', { class: 'bars' }, p.week.map(d => h('div', { class: 'bar-col', title: `${d.day}: ${d.minutes} min` }, h('div', { class: 'bar-fill', style: { height: Math.max(3, 100 * d.minutes / max) + '%' } }), h('small', new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'short' }))))),
      p.subjects.length > 0 && h('p', { class: 'muted' }, 'By subject: ' + p.subjects.map(s => `${s.subject} ${s.minutes} min`).join(', '))));
  draw();
}

async function cards(body, query) {
  if (query.deck) return studyDeck(body, Number(query.deck), query.mode);
  const r = await GET('/decks');
  const create = async () => { const t = await askText('New flashcard deck', { label: 'Deck name', multiline: false, yes: 'Create', required: 2 }); if (!t) return; try { const x = await POST('/decks', { title: t }); go('/study?tab=cards&deck=' + x.id + '&mode=edit'); } catch (e) { fail(e); } };
  mount(body, h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('button', { class: 'btn primary', type: 'button', onclick: create }, 'New deck')),
    r.decks.length ? h('div', { class: 'grid2' }, r.decks.map(d => h('div', { class: 'block deck', style: { marginTop: 0 } }, h('h3', d.title), h('p', { class: 'muted' }, `${d.total} cards, ${d.due} due now`), h('div', { class: 'row' }, h('a', { class: 'btn primary sm' + (d.due ? '' : ' disabled'), href: '#/study?tab=cards&deck=' + d.id + '&mode=study', 'aria-disabled': String(!d.due) }, d.due ? `Study ${d.due}` : 'All caught up'), h('a', { class: 'btn sm', href: '#/study?tab=cards&deck=' + d.id + '&mode=edit' }, 'Edit cards'),
      h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmBox(`Delete "${d.title}" and its ${d.total} cards?`, { yes: 'Delete', danger: true })) { await DEL('/decks/' + d.id); go('/study?tab=cards&r=' + Date.now()); } } }, 'Delete'))))) : empty('No decks yet', 'Make a deck, add questions and answers, and the app schedules each card for you.', h('button', { class: 'btn primary', onclick: create }, 'Create your first deck')));
}
async function studyDeck(body, id, mode) {
  if (mode === 'edit') {
    const d = await GET('/decks/' + id); const f = h('input', { maxlength: 500, placeholder: 'Front (question)', 'aria-label': 'Front' }), b = h('input', { maxlength: 1000, placeholder: 'Back (answer)', 'aria-label': 'Back' });
    const add = async () => { try { await POST(`/decks/${id}/cards`, { front: f.value, back: b.value }); go(`/study?tab=cards&deck=${id}&mode=edit&r=${Date.now()}`); } catch (e) { fail(e); } };
    b.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    const bulk = h('textarea', { rows: 5, placeholder: 'Paste many cards: one per line as  question ; answer', 'aria-label': 'Bulk cards' });
    return mount(body, h('div', { class: 'crumbs' }, h('a', { href: '#/study?tab=cards' }, 'Decks'), ' / ' + d.deck.title), h('div', { class: 'fields' }, f, b), h('div', { class: 'row', style: { margin: '.6rem 0 1rem' } }, h('button', { class: 'btn primary', type: 'button', onclick: add }, 'Add card')),
      h('details', h('summary', 'Add many at once'), bulk, h('button', { class: 'btn sm', type: 'button', style: { marginTop: '.5rem' }, onclick: async () => { const cards = bulk.value.split('\n').map(l => l.split(';')).filter(p => p.length >= 2).map(p => ({ front: p[0].trim(), back: p.slice(1).join(';').trim() })); if (!cards.length) return toast('Use  question ; answer  on each line', 'err'); try { const r = await POST(`/decks/${id}/cards`, { cards }); toast(`${r.added} cards added`, 'ok'); go(`/study?tab=cards&deck=${id}&mode=edit&r=${Date.now()}`); } catch (e) { fail(e); } } }, 'Add them')),
      d.cards.length ? h('div', { class: 'list' }, d.cards.map(c => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', c.front), h('span', { class: 'meta' }, c.back)), h('button', { class: 'btn sm quiet', type: 'button', 'aria-label': 'Delete card', onclick: async () => { await DEL('/cards/' + c.id); go(`/study?tab=cards&deck=${id}&mode=edit&r=${Date.now()}`); } }, icon('trash'))))) : empty('No cards yet'));
  }
  const s = await GET(`/decks/${id}/study`); let i = 0, shown = false, again = 0;
  const render = () => {
    if (i >= s.cards.length) return mount(body, h('div', { class: 'empty' }, h('div', { class: 'big' }, icon('check')), h('h3', 'Session complete'), h('p', `${s.cards.length} cards reviewed${again ? `, ${again} to see again soon` : ''}.`), h('a', { class: 'btn primary', href: '#/study?tab=cards' }, 'Back to decks')));
    const c = s.cards[i];
    const rate = async g => { try { await POST(`/cards/${c.id}/review`, { grade: g }); if (g === 0) again++; i++; shown = false; render(); } catch (e) { fail(e); } };
    mount(body, h('div', { class: 'crumbs' }, h('a', { href: '#/study?tab=cards' }, 'Decks'), ` / ${s.deck.title} (${i + 1} of ${s.cards.length})`),
      h('div', { class: 'flash', role: 'group', 'aria-live': 'polite' }, h('p', { class: 'flash-q' }, c.front), shown && h('p', { class: 'flash-a' }, c.back)),
      !shown ? h('button', { class: 'btn primary block', type: 'button', onclick: () => { shown = true; render(); } }, 'Show answer') : h('div', { class: 'row rate' }, [['Again', 0, 'danger'], ['Hard', 1, ''], ['Good', 2, 'good'], ['Easy', 3, 'sun']].map(([l, g, k]) => h('button', { class: 'btn ' + k, type: 'button', onclick: () => rate(g) }, l))));
  };
  render();
}

async function notes(body) {
  const search = h('input', { type: 'search', placeholder: 'Search notes…', 'aria-label': 'Search notes' });
  const area = h('div'); const load = async () => {
    const r = await GET('/notes?q=' + encodeURIComponent(search.value));
    mount(area, r.notes.length ? h('div', { class: 'grid2' }, r.notes.map(n => h('article', { class: 'block note', style: { marginTop: 0 } }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, (n.pinned ? '★ ' : '') + n.title), h('button', { class: 'btn sm quiet', type: 'button', onclick: async () => { await PUT('/notes/' + n.id, { pinned: !n.pinned }); load(); } }, n.pinned ? 'Unpin' : 'Pin')), h('p', { class: 'note-body' }, n.body.slice(0, 400)), h('small', { class: 'muted' }, 'Edited ' + ago(n.updated_at)), h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => edit(n) }, 'Edit'), h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmBox('Delete this note?', { yes: 'Delete', danger: true })) { await DEL('/notes/' + n.id); load(); } } }, 'Delete'))))) : empty('No notes', 'Write down what you learn. Notes are private to you.'));
  };
  const edit = n => { const t = h('input', { value: n ? n.title : '', maxlength: 120, placeholder: 'Title' }), b = h('textarea', { rows: 10, maxlength: 20000, placeholder: 'Write here…' }, n ? n.body : '');
    dialog({ title: n ? 'Edit note' : 'New note', body: h('div', { class: 'stack' }, field('Title', t), field('Note', b)), actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', close: false, onClick: async close => { try { n ? await PUT('/notes/' + n.id, { title: t.value, body: b.value }) : await POST('/notes', { title: t.value, body: b.value }); close(); load(); } catch (e) { fail(e); return false; } } }] }); };
  search.addEventListener('input', () => { clearTimeout(search._t); search._t = setTimeout(load, 250); });
  mount(body, h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('div', { class: 'grow' }, search), h('button', { class: 'btn primary', type: 'button', onclick: () => edit(null) }, 'New note')), area); await load();
}

async function tasks(body) {
  const p = await GET('/planner'), t = h('input', { maxlength: 160, placeholder: 'Add a task, e.g. Finish Chapter 4 questions', 'aria-label': 'New task' }), due = h('input', { type: 'date', 'aria-label': 'Due date' }), pri = h('select', { 'aria-label': 'Priority' }, [['1', 'Normal'], ['2', 'High'], ['0', 'Low']].map(([v, l]) => h('option', { value: v }, l)));
  const add = async () => { try { await POST('/tasks', { title: t.value, due_at: due.value ? new Date(due.value + 'T17:00').getTime() : undefined, priority: Number(pri.value) }); go('/study?tab=tasks&r=' + Date.now()); } catch (e) { fail(e); } };
  t.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  const open = p.tasks.filter(x => !x.done), done = p.tasks.filter(x => x.done);
  const row = x => h('div', { class: 'item' + (x.done ? ' done' : '') }, h('input', { type: 'checkbox', checked: !!x.done, 'aria-label': 'Done: ' + x.title, onchange: async e => { await PUT('/tasks/' + x.id, { done: e.target.checked }); go('/study?tab=tasks&r=' + Date.now()); } }), h('div', { class: 'grow' }, h('strong', x.title), x.due_at && h('span', { class: 'meta' }, (x.due_at < Date.now() && !x.done ? 'Overdue: ' : 'Due ') + fmtDay(x.due_at))), x.priority === 2 && h('span', { class: 'chip ember' }, 'High'), h('button', { class: 'btn sm quiet', type: 'button', 'aria-label': 'Delete task', onclick: async () => { await DEL('/tasks/' + x.id); go('/study?tab=tasks&r=' + Date.now()); } }, icon('trash')));
  mount(body, h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('div', { class: 'grow' }, t), due, pri, h('button', { class: 'btn primary', type: 'button', onclick: add }, 'Add')),
    open.length ? h('div', { class: 'list' }, open.map(row)) : empty('No open tasks', 'Add homework, revision and reminders. Tasks with a due date also appear in your calendar.'), done.length > 0 && h('details', { style: { marginTop: '1rem' } }, h('summary', `${done.length} completed`), h('div', { class: 'list' }, done.map(row))));
}

/* ============================================================ notice board (announcements + attendance) */
route('/notices', async () => {
  setTitle('Notices');
  const [n, att] = await Promise.all([GET('/notices'), S.user.role === 'student' ? GET('/attendance/mine') : Promise.resolve({ classes: [] })]);
  return h('div', { class: 'page' }, pageHead('Notice board', 'Announcements from your teachers' + (S.user.role === 'student' ? ' and your attendance.' : '.')),
    att.classes.length > 0 && h('section', { class: 'block', style: { marginTop: 0 } }, h('h2', 'My attendance'), h('div', { class: 'grid2' }, att.classes.map(c => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', c.name), h('span', { class: 'meta' }, c.marked ? `${c.present} present, ${c.absent} absent, ${c.late} late of ${c.marked} days` : 'No days recorded yet')), c.rate !== null && h('span', { class: 'chip ' + (c.rate >= 90 ? 'leaf' : c.rate >= 75 ? 'sun' : 'ember') }, c.rate + '%'))))),
    h('section', { class: 'block', style: att.classes.length ? {} : { marginTop: 0 } }, h('h2', 'Announcements'), n.announcements.length ? h('div', { class: 'list' }, n.announcements.map(a => h('article', { class: 'item notice' }, h('div', { class: 'grow' }, h('strong', (a.pinned ? '\u{1F4CC} ' : '') + a.title), h('p', { style: { margin: '.3rem 0' } }, a.body), h('span', { class: 'meta' }, `${a.author}, ${a.classroom_name}, ${ago(a.created_at)}`))))) : empty('No announcements', 'When a teacher posts a notice for your class, it appears here.')));
});

/* ============================================================ class tools (teacher): attendance, gradebook, announcements */
route('/classes/:id/manage', async ({ params, query }) => {
  const tab = ['attendance', 'gradebook', 'announcements'].includes(query.tab) ? query.tab : 'attendance'; const cid = params.id;
  const c = (await GET('/classrooms/' + cid)).classroom; setTitle(c.name + ' tools');
  const body = h('div', loading());
  ({ attendance: attendanceTab, gradebook: gradebookTab, announcements: announceTab }[tab])(body, cid, query).catch(e => mount(body, h('div', { class: 'banner err' }, e.message)));
  return h('div', { class: 'page wide' }, h('div', { class: 'crumbs' }, h('a', { href: '#/classes' }, 'Classes'), ' / ', h('a', { href: '#/classes/' + cid }, c.name)), pageHead(c.name + ': class tools', 'Attendance, gradebook and announcements.'), tabsBar([['attendance', 'Attendance'], ['gradebook', 'Gradebook'], ['announcements', 'Announcements']], tab, k => `/classes/${cid}/manage?tab=${k}`), body);
});
async function attendanceTab(body, cid, query) {
  const day = query.day || new Date().toISOString().slice(0, 10); const r = await GET(`/classrooms/${cid}/attendance?day=${day}`);
  const st = {}; r.roster.forEach(s => { st[s.id] = s.status || 'present'; });
  const sel = s => h('select', { 'aria-label': 'Status for ' + s.name, onchange: e => { st[s.id] = e.target.value; } }, ['present', 'absent', 'late', 'excused'].map(v => h('option', { value: v, selected: v === st[s.id] }, v[0].toUpperCase() + v.slice(1))));
  mount(body, h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('label', 'Date '), h('input', { type: 'date', value: r.day, max: new Date().toISOString().slice(0, 10), style: { width: 'auto' }, onchange: e => go(`/classes/${cid}/manage?tab=attendance&day=${e.target.value}`) }),
    h('button', { class: 'btn', type: 'button', onclick: () => { r.roster.forEach(s => { st[s.id] = 'present'; }); mount(body); attendanceTab(body, cid, query); } }, 'Reset all to present'),
    h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { const x = await PUT(`/classrooms/${cid}/attendance`, { day: r.day, records: r.roster.map(s => ({ student_id: s.id, status: st[s.id] })) }); toast(`Attendance saved for ${x.saved} learners`, 'ok'); } catch (e) { fail(e); } } }, 'Save attendance')),
    r.roster.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', h('tr', ['Learner', 'Status', 'Attendance rate', 'Absences'].map(x => h('th', x)))), h('tbody', r.roster.map(s => h('tr', h('td', s.name), h('td', sel(s)), h('td', s.rate === null ? '' : h('span', { class: 'chip ' + (s.rate >= 90 ? 'leaf' : s.rate >= 75 ? 'sun' : 'ember') }, s.rate + '%')), h('td', s.absences)))))) : empty('No learners in this class yet'));
}
async function gradebookTab(body, cid) {
  const g = await GET(`/classrooms/${cid}/gradebook`);
  const cls = v => (v === null ? '' : v >= 70 ? 'leaf' : v >= 40 ? 'sun' : 'ember');
  const csv = () => { const q = v => '"' + String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""') + '"'; const rows = [['Learner', ...g.assessments.map(a => a.title), 'Average']].concat(g.rows.map(r => [r.name, ...r.scores, r.average])); const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }); const a = h('a', { href: URL.createObjectURL(blob), download: 'gradebook.csv' }); document.body.append(a); a.click(); a.remove(); };
  mount(body, h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('button', { class: 'btn', type: 'button', onclick: csv }, icon('download'), 'Export CSV'), h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print')),
    g.at_risk.length > 0 && h('div', { class: 'banner warn' }, h('p', h('strong', 'Needs support (average under 40%): '), g.at_risk.join(', '))),
    g.rows.length && g.assessments.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table gradebook' }, h('thead', h('tr', h('th', 'Learner'), g.assessments.map(a => h('th', { title: a.title }, a.title.length > 18 ? a.title.slice(0, 17) + '…' : a.title)), h('th', 'Average'))),
      h('tbody', g.rows.map(r => h('tr', h('td', r.name), r.scores.map(v => h('td', v === null ? h('span', { class: 'muted' }, '–') : h('span', { class: 'chip ' + cls(v) }, v + '%'))), h('td', r.average === null ? '' : h('strong', r.average + '%')))), h('tr', { class: 'foot' }, h('td', h('strong', 'Class average')), g.column_averages.map(v => h('td', v === null ? '' : h('strong', v + '%'))), h('td', ''))))) : empty('Nothing to show yet', 'Publish an assessment for this class and results will appear here.'));
}
async function announceTab(body, cid) {
  const r = await GET(`/classrooms/${cid}/announcements`);
  const t = h('input', { maxlength: 120, placeholder: 'Title', 'aria-label': 'Title' }), m = h('textarea', { rows: 4, maxlength: 4000, placeholder: 'Message to the whole class…', 'aria-label': 'Message' }), pin = h('input', { type: 'checkbox' });
  mount(body, h('section', { class: 'block', style: { marginTop: 0 } }, h('h2', 'Post an announcement'), h('div', { class: 'stack' }, t, m, h('label', { class: 'check' }, pin, h('span', 'Pin to the top')), h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { await POST(`/classrooms/${cid}/announcements`, { title: t.value, body: m.value, pinned: pin.checked }); toast('Posted. Learners have been notified.', 'ok'); go(`/classes/${cid}/manage?tab=announcements&r=${Date.now()}`); } catch (e) { fail(e); } } }, 'Post')))),
    h('section', { class: 'block' }, h('h2', 'Posted'), r.announcements.length ? h('div', { class: 'list' }, r.announcements.map(a => h('article', { class: 'item' }, h('div', { class: 'grow' }, h('strong', (a.pinned ? '\u{1F4CC} ' : '') + a.title), h('p', { style: { margin: '.3rem 0' } }, a.body), h('span', { class: 'meta' }, ago(a.created_at))), h('button', { class: 'btn sm', type: 'button', onclick: async () => { await PUT('/announcements/' + a.id, { pinned: !a.pinned }); go(`/classes/${cid}/manage?tab=announcements&r=${Date.now()}`); } }, a.pinned ? 'Unpin' : 'Pin'), h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (await confirmBox('Delete this announcement?', { yes: 'Delete', danger: true })) { await DEL('/announcements/' + a.id); go(`/classes/${cid}/manage?tab=announcements&r=${Date.now()}`); } } }, 'Delete')))) : empty('Nothing posted yet')));
}
