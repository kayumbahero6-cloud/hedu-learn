'use strict';
/* Study and classroom tools: calendar, direct messages, notes, flashcards (spaced repetition), study planner, tasks, attendance, announcements, gradebook. */
const express = require('express');
const { q, tx } = require('../db');
const A = require('../access');
const M = require('../moderation');
const { ageOf, auth, requireRole } = require('../auth');
const { HttpError, wrap, S, int, clamp, notify, audit, perUser, flag, round2 } = require('../util');

const router = express.Router();
const isTeacher = u => u.role === 'educator' || u.role === 'admin';
const dayOf = (ms = Date.now()) => new Date(ms + require('../config').TZ_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);
const validDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const ownerOf = (table, id, user) => { const r = q.get(`SELECT * FROM ${table} WHERE id=?`, id); if (!r || r.user_id !== user.id) throw new HttpError(404, 'Not found'); return r; };

/* ============================================================ calendar */
router.get('/calendar', auth, wrap(async (req, res) => {
  const u = req.user, from = int(req.query.from, Date.now() - 31 * 864e5), to = int(req.query.to, Date.now() + 62 * 864e5);
  const mine = q.all('SELECT id,title,notes,starts_at,ends_at,kind,classroom_id,user_id FROM events WHERE user_id=? AND classroom_id IS NULL AND starts_at BETWEEN ? AND ?', u.id, from, to)
    .map(e => ({ ...e, source: 'personal', editable: true }));
  const classIds = u.role === 'student' ? q.all('SELECT classroom_id id FROM enrollments WHERE student_id=?', u.id).map(r => r.id) : q.all('SELECT id FROM classrooms WHERE teacher_id=? AND archived=0', u.id).map(r => r.id);
  const cls = classIds.length ? q.all(`SELECT e.id,e.title,e.notes,e.starts_at,e.ends_at,e.kind,e.classroom_id,e.user_id,c.name classroom_name FROM events e JOIN classrooms c ON c.id=e.classroom_id
      WHERE e.classroom_id IN (${classIds.map(() => '?').join(',')}) AND e.starts_at BETWEEN ? AND ?`, ...classIds, from, to).map(e => ({ ...e, source: 'class', editable: e.user_id === u.id })) : [];
  const dl = u.role === 'student' && classIds.length ? q.all(`SELECT a.id,a.title,a.kind,a.closes_at,a.opens_at FROM assessments a WHERE a.published=1 AND a.classroom_id IN (${classIds.map(() => '?').join(',')})
      AND ((a.closes_at BETWEEN ? AND ?) OR (a.opens_at BETWEEN ? AND ?))`, ...classIds, from, to, from, to) : [];
  const deadlines = [];
  for (const a of dl) {
    if (a.closes_at && a.closes_at >= from && a.closes_at <= to) deadlines.push({ id: 'a' + a.id + 'c', title: `${a.title} closes`, starts_at: a.closes_at, kind: 'deadline', source: 'assessment', link: '/assessments/' + a.id });
    if (a.opens_at && a.opens_at >= from && a.opens_at <= to) deadlines.push({ id: 'a' + a.id + 'o', title: `${a.title} opens`, starts_at: a.opens_at, kind: 'assessment', source: 'assessment', link: '/assessments/' + a.id });
  }
  const tasks = q.all('SELECT id,title,due_at starts_at FROM tasks WHERE user_id=? AND done=0 AND due_at BETWEEN ? AND ?', u.id, from, to).map(t => ({ ...t, id: 't' + t.id, kind: 'task', source: 'task', link: '/study?tab=tasks' }));
  res.json({ events: [...mine, ...cls, ...deadlines, ...tasks].sort((a, b) => a.starts_at - b.starts_at) });
}));
const eventBody = b => {
  const title = S(b.title, 120); if (title.length < 2) throw new HttpError(400, 'Give the event a title');
  const starts = int(b.starts_at); if (!starts) throw new HttpError(400, 'Choose a date and time');
  const ends = b.ends_at ? int(b.ends_at) : null; if (ends && ends < starts) throw new HttpError(400, 'The end must be after the start');
  return { title, notes: S(b.notes, 1000), starts, ends, kind: ['event', 'exam', 'lesson', 'holiday', 'meeting'].includes(b.kind) ? b.kind : 'event' };
};
router.post('/calendar', auth, perUser({ windowMs: 60e3, max: 30 }), wrap(async (req, res) => {
  const b = req.body || {}, e = eventBody(b); let cid = null;
  if (b.classroom_id) { if (!A.isTeacherOf(req.user, int(b.classroom_id))) throw new HttpError(403, 'Only the class teacher can add class events'); cid = int(b.classroom_id); }
  const id = q.run('INSERT INTO events(user_id,classroom_id,title,notes,starts_at,ends_at,kind,created_at) VALUES(?,?,?,?,?,?,?,?)', req.user.id, cid, e.title, e.notes, e.starts, e.ends, e.kind, Date.now()).id;
  if (cid) for (const r of q.all('SELECT student_id FROM enrollments WHERE classroom_id=?', cid)) notify(r.student_id, 'New class event', e.title, '/calendar');
  res.status(201).json({ id });
}));
router.put('/calendar/:id', auth, wrap(async (req, res) => {
  const ev = q.get('SELECT * FROM events WHERE id=?', int(req.params.id)); if (!ev || ev.user_id !== req.user.id) throw new HttpError(404, 'Event not found');
  const e = eventBody({ ...ev, ...req.body });
  q.run('UPDATE events SET title=?,notes=?,starts_at=?,ends_at=?,kind=? WHERE id=?', e.title, e.notes, e.starts, e.ends, e.kind, ev.id); res.json({ ok: true });
}));
router.delete('/calendar/:id', auth, wrap(async (req, res) => { const ev = ownerOf('events', int(req.params.id), req.user); q.run('DELETE FROM events WHERE id=?', ev.id); res.json({ ok: true }); }));

/* ============================================================ direct messages
 * Safety: learners can only message their own teachers (and teachers their learners). No learner-to-learner private chat. */
function contactsFor(u) {
  if (u.role === 'student') return q.all(`SELECT DISTINCT u.id,u.name,u.role,c.name context FROM enrollments e JOIN classrooms c ON c.id=e.classroom_id JOIN users u ON u.id=c.teacher_id WHERE e.student_id=? ORDER BY u.name`, u.id);
  if (u.role === 'parent') return q.all(`SELECT DISTINCT t.id,t.name,t.role,(c.name || ' (' || ch.name || ')') context FROM parent_links pl JOIN users ch ON ch.id=pl.student_id JOIN enrollments e ON e.student_id=ch.id JOIN classrooms c ON c.id=e.classroom_id JOIN users t ON t.id=c.teacher_id WHERE pl.parent_id=? ORDER BY t.name`, u.id);
  if (u.role === 'educator') return q.all(`SELECT u.id,u.name,u.role,c.name context FROM classrooms c JOIN enrollments e ON e.classroom_id=c.id JOIN users u ON u.id=e.student_id WHERE c.teacher_id=?
      UNION SELECT p.id,p.name,p.role,('Parent of ' || ch.name) context FROM classrooms c JOIN enrollments e ON e.classroom_id=c.id JOIN users ch ON ch.id=e.student_id JOIN parent_links pl ON pl.student_id=ch.id JOIN users p ON p.id=pl.parent_id WHERE c.teacher_id=? ORDER BY 2`, u.id, u.id);
  return q.all(`SELECT id,name,role,'' context FROM users WHERE id!=? AND status='active' AND role IN ('educator','creator','moderator','admin') ORDER BY name LIMIT 200`, u.id);
}
const mayMessage = (u, otherId) => A.isStaffRole(u) || contactsFor(u).some(c => c.id === otherId) || (() => { const o = q.get('SELECT role FROM users WHERE id=?', otherId); return !!o && o.role !== 'student' && u.role !== 'student' && q.get('SELECT 1 x FROM users a JOIN users b ON a.school_id=b.school_id WHERE a.id=? AND b.id=? AND a.school_id IS NOT NULL', u.id, otherId); })();
router.get('/messages/contacts', auth, wrap(async (req, res) => res.json({ contacts: contactsFor(req.user) })));
router.get('/messages/threads', auth, wrap(async (req, res) => {
  const me = req.user.id;
  const rows = q.all(`SELECT m.*, CASE WHEN m.sender_id=? THEN m.recipient_id ELSE m.sender_id END other_id FROM dm m WHERE m.id IN (
      SELECT MAX(id) FROM dm WHERE sender_id=? OR recipient_id=? GROUP BY CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END) ORDER BY m.id DESC LIMIT 100`, me, me, me, me);
  const threads = rows.map(r => { const o = q.get('SELECT id,name,role FROM users WHERE id=?', r.other_id); return { user: o, last: { body: r.body.slice(0, 120), mine: r.sender_id === me, at: r.created_at }, unread: q.get('SELECT COUNT(*) c FROM dm WHERE sender_id=? AND recipient_id=? AND read_at IS NULL', r.other_id, me).c }; }).filter(t => t.user);
  res.json({ threads, unread: threads.reduce((s, t) => s + t.unread, 0) });
}));
router.get('/messages/with/:uid', auth, wrap(async (req, res) => {
  const me = req.user.id, other = int(req.params.uid), o = q.get('SELECT id,name,role FROM users WHERE id=?', other);
  if (!o) throw new HttpError(404, 'User not found');
  if (!mayMessage(req.user, other) && !q.get('SELECT 1 x FROM dm WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)', me, other, other, me)) throw new HttpError(403, 'You cannot message this person');
  q.run('UPDATE dm SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at IS NULL', Date.now(), other, me);
  const messages = q.all(`SELECT id,sender_id,body,created_at,read_at FROM dm WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 200`, me, other, other, me).reverse();
  res.json({ user: o, messages, can_send: mayMessage(req.user, other) });
}));
router.post('/messages', auth, perUser({ windowMs: 60e3, max: 20, message: 'You are sending messages very fast. Please wait a moment.' }), wrap(async (req, res) => {
  const to = int(req.body && req.body.to); if (!to || to === req.user.id) throw new HttpError(400, 'Choose who to message');
  if (!q.get('SELECT 1 x FROM users WHERE id=? AND status=\'active\'', to)) throw new HttpError(404, 'User not found');
  if (!mayMessage(req.user, to)) throw new HttpError(403, 'You can only message your own teachers or learners');
  const age = ageOf(req.user), chk = M.check(req.body && req.body.body, { minor: age !== null && age < 18 });
  if (chk.blocked) throw new HttpError(400, chk.reasons.join(' ') || 'That message cannot be sent', 'moderated');
  const id = q.run('INSERT INTO dm(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)', req.user.id, to, chk.text, Date.now()).id;
  notify(to, `Message from ${req.user.name}`, chk.text.slice(0, 80), '/messages?with=' + req.user.id);
  res.status(201).json({ id });
}));

/* ============================================================ notes */
router.get('/notes', auth, wrap(async (req, res) => {
  const needle = S(req.query.q, 80).toLowerCase(), lesson = int(req.query.lesson_id);
  let rows = q.all('SELECT * FROM notes WHERE user_id=? ' + (lesson ? 'AND lesson_id=? ' : '') + 'ORDER BY pinned DESC, updated_at DESC LIMIT 300', ...(lesson ? [req.user.id, lesson] : [req.user.id]));
  if (needle) rows = rows.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(needle));
  res.json({ notes: rows });
}));
router.post('/notes', auth, perUser({ windowMs: 60e3, max: 40 }), wrap(async (req, res) => {
  const b = req.body || {}, title = S(b.title, 120) || 'Untitled note', now = Date.now();
  const id = q.run('INSERT INTO notes(user_id,course_id,lesson_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', req.user.id, int(b.course_id), int(b.lesson_id), title, S(b.body, 20000), now, now).id;
  res.status(201).json({ id });
}));
router.put('/notes/:id', auth, wrap(async (req, res) => {
  const n = ownerOf('notes', int(req.params.id), req.user), b = req.body || {};
  q.run('UPDATE notes SET title=?, body=?, pinned=?, updated_at=? WHERE id=?', b.title !== undefined ? (S(b.title, 120) || 'Untitled note') : n.title, b.body !== undefined ? S(b.body, 20000) : n.body, b.pinned !== undefined ? flag(b.pinned) : n.pinned, Date.now(), n.id);
  res.json({ ok: true });
}));
router.delete('/notes/:id', auth, wrap(async (req, res) => { const n = ownerOf('notes', int(req.params.id), req.user); q.run('DELETE FROM notes WHERE id=?', n.id); res.json({ ok: true }); }));

/* ============================================================ flashcards (SM-2 style spaced repetition) */
router.get('/decks', auth, wrap(async (req, res) => {
  const now = Date.now();
  res.json({ decks: q.all(`SELECT d.*, (SELECT COUNT(*) FROM cards WHERE deck_id=d.id) total, (SELECT COUNT(*) FROM cards WHERE deck_id=d.id AND due_at<=?) due FROM decks d WHERE d.user_id=? ORDER BY d.id DESC`, now, req.user.id) });
}));
router.post('/decks', auth, perUser({ windowMs: 60e3, max: 20 }), wrap(async (req, res) => {
  const title = S(req.body && req.body.title, 100); if (title.length < 2) throw new HttpError(400, 'Give the deck a name');
  if (q.get('SELECT COUNT(*) c FROM decks WHERE user_id=?', req.user.id).c >= 100) throw new HttpError(400, 'Deck limit reached');
  res.status(201).json({ id: q.run('INSERT INTO decks(user_id,title,subject,created_at) VALUES(?,?,?,?)', req.user.id, title, S(req.body.subject, 60), Date.now()).id });
}));
router.delete('/decks/:id', auth, wrap(async (req, res) => { const d = ownerOf('decks', int(req.params.id), req.user); q.run('DELETE FROM decks WHERE id=?', d.id); res.json({ ok: true }); }));
router.get('/decks/:id', auth, wrap(async (req, res) => {
  const d = ownerOf('decks', int(req.params.id), req.user);
  res.json({ deck: d, cards: q.all('SELECT id,front,back,due_at,reps,lapses,interval_days FROM cards WHERE deck_id=? ORDER BY id', d.id) });
}));
router.post('/decks/:id/cards', auth, perUser({ windowMs: 60e3, max: 120 }), wrap(async (req, res) => {
  const d = ownerOf('decks', int(req.params.id), req.user), b = req.body || {};
  const list = Array.isArray(b.cards) ? b.cards.slice(0, 200) : [b];
  if (q.get('SELECT COUNT(*) c FROM cards WHERE deck_id=?', d.id).c + list.length > 2000) throw new HttpError(400, 'A deck can hold 2000 cards');
  let n = 0; tx(() => { for (const c of list) { const f = S(c.front, 500), k = S(c.back, 1000); if (!f || !k) continue; q.run('INSERT INTO cards(deck_id,front,back,due_at,created_at) VALUES(?,?,?,?,?)', d.id, f, k, Date.now(), Date.now()); n++; } });
  if (!n) throw new HttpError(400, 'A card needs a front and a back');
  res.status(201).json({ added: n });
}));
router.delete('/cards/:id', auth, wrap(async (req, res) => {
  const c = q.get('SELECT c.id FROM cards c JOIN decks d ON d.id=c.deck_id WHERE c.id=? AND d.user_id=?', int(req.params.id), req.user.id); if (!c) throw new HttpError(404, 'Card not found');
  q.run('DELETE FROM cards WHERE id=?', c.id); res.json({ ok: true });
}));
router.get('/decks/:id/study', auth, wrap(async (req, res) => {
  const d = ownerOf('decks', int(req.params.id), req.user);
  res.json({ deck: d, cards: q.all('SELECT id,front,back,reps FROM cards WHERE deck_id=? AND due_at<=? ORDER BY due_at LIMIT 30', d.id, Date.now()) });
}));
// grade: 0 again, 1 hard, 2 good, 3 easy
router.post('/cards/:id/review', auth, wrap(async (req, res) => {
  const c = q.get('SELECT c.* FROM cards c JOIN decks d ON d.id=c.deck_id WHERE c.id=? AND d.user_id=?', int(req.params.id), req.user.id); if (!c) throw new HttpError(404, 'Card not found');
  const g = clamp(int(req.body && req.body.grade, 2), 0, 3);
  let { ease, interval_days: iv, reps, lapses } = c;
  if (g === 0) { reps = 0; lapses++; iv = 0; ease = Math.max(1.3, ease - 0.2); }
  else { reps++; iv = reps === 1 ? (g === 3 ? 4 : 1) : reps === 2 ? (g === 3 ? 8 : 3) : Math.round(iv * ease * (g === 1 ? 0.8 : g === 3 ? 1.3 : 1)); ease = clamp(ease + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0), 1.3, 3); }
  const due = g === 0 ? Date.now() + 10 * 60e3 : Date.now() + iv * 864e5;
  q.run('UPDATE cards SET ease=?, interval_days=?, reps=?, lapses=?, due_at=? WHERE id=?', round2(ease), iv, reps, lapses, due, c.id);
  res.json({ next_due: due, interval_days: iv });
}));

/* ============================================================ planner: goals, study timer, tasks */
router.get('/planner', auth, wrap(async (req, res) => {
  const u = req.user.id, today = dayOf();
  const goal = q.get('SELECT * FROM goals WHERE user_id=?', u) || { daily_minutes: 30, weekly_lessons: 5 };
  const days = []; for (let i = 6; i >= 0; i--) days.push(dayOf(Date.now() - i * 864e5));
  const rows = q.all('SELECT day, SUM(minutes) m FROM study_sessions WHERE user_id=? AND day>=? GROUP BY day', u, days[0]);
  const by = Object.fromEntries(rows.map(r => [r.day, r.m]));
  const week = days.map(d => ({ day: d, minutes: by[d] || 0 }));
  const lessonsWeek = q.get('SELECT COUNT(*) c FROM progress WHERE user_id=? AND completed=1 AND completed_at>=?', u, Date.now() - 7 * 864e5).c;
  const subjects = q.all('SELECT IFNULL(NULLIF(subject,\'\'),\'General\') subject, SUM(minutes) minutes FROM study_sessions WHERE user_id=? AND day>=? GROUP BY 1 ORDER BY 2 DESC', u, days[0]);
  let streak = 0; for (let i = 0; i < 365; i++) { const d = dayOf(Date.now() - i * 864e5), m = q.get('SELECT SUM(minutes) m FROM study_sessions WHERE user_id=? AND day=?', u, d).m || 0; if (m >= 1) streak++; else if (i > 0) break; else continue; }
  res.json({ goal, today_minutes: by[today] || 0, week, week_total: week.reduce((s, d) => s + d.minutes, 0), lessons_week: lessonsWeek, subjects, streak,
    tasks: q.all('SELECT * FROM tasks WHERE user_id=? ORDER BY done, IFNULL(due_at, 9e15), priority DESC LIMIT 100', u) });
}));
router.put('/planner/goal', auth, wrap(async (req, res) => {
  const dm = clamp(int(req.body && req.body.daily_minutes, 30), 5, 600), wl = clamp(int(req.body && req.body.weekly_lessons, 5), 1, 50);
  q.run('INSERT INTO goals(user_id,daily_minutes,weekly_lessons) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET daily_minutes=excluded.daily_minutes, weekly_lessons=excluded.weekly_lessons', req.user.id, dm, wl);
  res.json({ ok: true });
}));
router.post('/study-sessions', auth, perUser({ windowMs: 60e3, max: 20 }), wrap(async (req, res) => {
  const m = int(req.body && req.body.minutes); if (!m || m < 1 || m > 240) throw new HttpError(400, 'Enter between 1 and 240 minutes');
  q.run('INSERT INTO study_sessions(user_id,minutes,subject,day,created_at) VALUES(?,?,?,?,?)', req.user.id, m, S(req.body.subject, 60), dayOf(), Date.now());
  const today = q.get('SELECT SUM(minutes) m FROM study_sessions WHERE user_id=? AND day=?', req.user.id, dayOf()).m, goal = q.get('SELECT daily_minutes FROM goals WHERE user_id=?', req.user.id) || { daily_minutes: 30 };
  res.status(201).json({ today_minutes: today, goal_met: today >= goal.daily_minutes });
}));
router.post('/tasks', auth, perUser({ windowMs: 60e3, max: 40 }), wrap(async (req, res) => {
  const title = S(req.body && req.body.title, 160); if (title.length < 2) throw new HttpError(400, 'Describe the task');
  if (q.get('SELECT COUNT(*) c FROM tasks WHERE user_id=? AND done=0', req.user.id).c >= 200) throw new HttpError(400, 'Finish some tasks before adding more');
  res.status(201).json({ id: q.run('INSERT INTO tasks(user_id,title,due_at,priority,created_at) VALUES(?,?,?,?,?)', req.user.id, title, int(req.body.due_at), clamp(int(req.body.priority, 1), 0, 2), Date.now()).id });
}));
router.put('/tasks/:id', auth, wrap(async (req, res) => { const t = ownerOf('tasks', int(req.params.id), req.user); q.run('UPDATE tasks SET done=?, title=? WHERE id=?', req.body && req.body.done !== undefined ? flag(req.body.done) : t.done, req.body && req.body.title ? S(req.body.title, 160) : t.title, t.id); res.json({ ok: true }); }));
router.delete('/tasks/:id', auth, wrap(async (req, res) => { const t = ownerOf('tasks', int(req.params.id), req.user); q.run('DELETE FROM tasks WHERE id=?', t.id); res.json({ ok: true }); }));

/* ============================================================ attendance */
const STATUS = ['present', 'absent', 'late', 'excused'];
router.get('/classrooms/:id/attendance', auth, wrap(async (req, res) => {
  const cid = int(req.params.id); if (!A.isTeacherOf(req.user, cid)) throw new HttpError(403, 'Only the class teacher can take attendance');
  const day = validDay(String(req.query.day || '')) ? req.query.day : dayOf();
  const roster = q.all(`SELECT u.id,u.name, a.status, a.note,
      (SELECT COUNT(*) FROM attendance x WHERE x.classroom_id=? AND x.student_id=u.id AND x.status='absent') absences,
      (SELECT COUNT(*) FROM attendance x WHERE x.classroom_id=? AND x.student_id=u.id) days_marked,
      (SELECT COUNT(*) FROM attendance x WHERE x.classroom_id=? AND x.student_id=u.id AND x.status IN ('present','late')) days_present
      FROM enrollments e JOIN users u ON u.id=e.student_id LEFT JOIN attendance a ON a.classroom_id=e.classroom_id AND a.student_id=u.id AND a.day=? WHERE e.classroom_id=? ORDER BY u.name`, cid, cid, cid, day, cid);
  res.json({ day, roster: roster.map(r => ({ ...r, rate: r.days_marked ? Math.round(100 * r.days_present / r.days_marked) : null })) });
}));
router.put('/classrooms/:id/attendance', auth, wrap(async (req, res) => {
  const cid = int(req.params.id); if (!A.isTeacherOf(req.user, cid)) throw new HttpError(403, 'Only the class teacher can take attendance');
  const day = String(req.body && req.body.day || ''); if (!validDay(day)) throw new HttpError(400, 'Choose a valid date');
  if (Date.parse(day) > Date.now() + 864e5) throw new HttpError(400, 'You cannot mark attendance for a future date');
  const recs = Array.isArray(req.body.records) ? req.body.records : [];
  const enrolled = new Set(q.all('SELECT student_id id FROM enrollments WHERE classroom_id=?', cid).map(r => r.id)); let n = 0;
  tx(() => { for (const r of recs) { const sid = int(r.student_id); if (!enrolled.has(sid) || !STATUS.includes(r.status)) continue;
    q.run('INSERT INTO attendance(classroom_id,student_id,day,status,note,marked_by) VALUES(?,?,?,?,?,?) ON CONFLICT(classroom_id,student_id,day) DO UPDATE SET status=excluded.status, note=excluded.note, marked_by=excluded.marked_by', cid, sid, day, r.status, S(r.note, 200), req.user.id); n++; } });
  audit(req, 'attendance', { classroom: cid, day, n }); res.json({ saved: n });
}));
router.get('/attendance/mine', auth, wrap(async (req, res) => {
  const rows = q.all(`SELECT c.id classroom_id, c.name, COUNT(a.day) marked, SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) present, SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) absent, SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) late
      FROM enrollments e JOIN classrooms c ON c.id=e.classroom_id LEFT JOIN attendance a ON a.classroom_id=c.id AND a.student_id=e.student_id WHERE e.student_id=? GROUP BY c.id ORDER BY c.name`, req.user.id);
  res.json({ classes: rows.map(r => ({ ...r, rate: r.marked ? Math.round(100 * r.present / r.marked) : null })) });
}));

/* ============================================================ announcements */
router.get('/classrooms/:id/announcements', auth, wrap(async (req, res) => {
  const cid = int(req.params.id); if (!A.classroomAccess(req.user, cid)) throw new HttpError(403, 'No access to this class');
  res.json({ announcements: q.all('SELECT a.*, u.name author FROM announcements a JOIN users u ON u.id=a.author_id WHERE a.classroom_id=? ORDER BY a.pinned DESC, a.created_at DESC LIMIT 100', cid) });
}));
router.post('/classrooms/:id/announcements', auth, perUser({ windowMs: 60e3, max: 10 }), wrap(async (req, res) => {
  const cid = int(req.params.id); if (!A.isTeacherOf(req.user, cid)) throw new HttpError(403, 'Only the class teacher can post announcements');
  const title = S(req.body && req.body.title, 120), body = S(req.body && req.body.body, 4000); if (title.length < 2 || body.length < 2) throw new HttpError(400, 'Write a title and a message');
  const id = q.run('INSERT INTO announcements(classroom_id,author_id,title,body,pinned,created_at) VALUES(?,?,?,?,?,?)', cid, req.user.id, title, body, flag(req.body.pinned), Date.now()).id;
  for (const r of q.all('SELECT student_id FROM enrollments WHERE classroom_id=?', cid)) notify(r.student_id, 'Announcement: ' + title, body.slice(0, 100), '/notices');
  res.status(201).json({ id });
}));
router.put('/announcements/:id', auth, wrap(async (req, res) => {
  const a = q.get('SELECT * FROM announcements WHERE id=?', int(req.params.id)); if (!a || !A.isTeacherOf(req.user, a.classroom_id)) throw new HttpError(404, 'Not found');
  q.run('UPDATE announcements SET pinned=? WHERE id=?', flag(req.body && req.body.pinned), a.id); res.json({ ok: true });
}));
router.delete('/announcements/:id', auth, wrap(async (req, res) => {
  const a = q.get('SELECT * FROM announcements WHERE id=?', int(req.params.id)); if (!a || !A.isTeacherOf(req.user, a.classroom_id)) throw new HttpError(404, 'Not found');
  q.run('DELETE FROM announcements WHERE id=?', a.id); res.json({ ok: true });
}));
router.get('/notices', auth, wrap(async (req, res) => {
  const ids = (req.user.role === 'student' ? q.all('SELECT classroom_id id FROM enrollments WHERE student_id=?', req.user.id) : q.all('SELECT id FROM classrooms WHERE teacher_id=?', req.user.id)).map(r => r.id);
  res.json({ announcements: ids.length ? q.all(`SELECT a.*, u.name author, c.name classroom_name FROM announcements a JOIN users u ON u.id=a.author_id JOIN classrooms c ON c.id=a.classroom_id WHERE a.classroom_id IN (${ids.map(() => '?').join(',')}) ORDER BY a.pinned DESC, a.created_at DESC LIMIT 100`, ...ids) : [] });
}));

/* ============================================================ gradebook */
router.get('/classrooms/:id/gradebook', auth, wrap(async (req, res) => {
  const cid = int(req.params.id); if (!A.isTeacherOf(req.user, cid)) throw new HttpError(403, 'Only the class teacher can see the gradebook');
  const asm = q.all(`SELECT id,title,kind,pass_mark FROM assessments WHERE classroom_id=? AND published=1 AND kind IN ('test','exam','practice','adaptive') ORDER BY id`, cid);
  const students = q.all('SELECT u.id,u.name FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.classroom_id=? ORDER BY u.name', cid);
  const best = new Map(); for (const r of q.all(`SELECT t.assessment_id aid, t.user_id uid, MAX(100.0*t.score/t.max_score) pct FROM attempts t JOIN assessments a ON a.id=t.assessment_id WHERE a.classroom_id=? AND t.status='submitted' AND t.max_score>0 GROUP BY t.assessment_id, t.user_id`, cid)) best.set(r.aid + ':' + r.uid, Math.round(r.pct));
  const rows = students.map(s => { const scores = asm.map(a => best.has(a.id + ':' + s.id) ? best.get(a.id + ':' + s.id) : null); const done = scores.filter(x => x !== null); return { ...s, scores, average: done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null, completed: done.length }; });
  const colAvg = asm.map((a, i) => { const v = rows.map(r => r.scores[i]).filter(x => x !== null); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; });
  res.json({ assessments: asm, rows, column_averages: colAvg, at_risk: rows.filter(r => r.average !== null && r.average < 40).map(r => r.name) });
}));

module.exports = router;
