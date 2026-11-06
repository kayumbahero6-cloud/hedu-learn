'use strict';
/* Parent and guardian view. A parent can only see a child who has handed over a one-time link code (or whose account they were linked to by that child).
 * Parents see progress, results, attendance, deadlines and announcements. They never see proctoring images, private messages or Study Buddy chats. */
const express = require('express');
const { q } = require('../db');
const C = require('../crypto');
const { auth, requireRole } = require('../auth');
const { HttpError, wrap, S, int, notify, audit, perUser } = require('../util');

const router = express.Router();
const dayOf = (ms = Date.now()) => new Date(ms + require('../config').TZ_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);

/* ---- student side ---- */
router.post('/family/code', auth, requireRole('student'), perUser({ windowMs: 3600e3, max: 10, message: 'Too many codes requested. Try again later.' }), wrap(async (req, res) => {
  q.run('DELETE FROM link_codes WHERE student_id=? AND used_at IS NULL', req.user.id);
  const code = C.randomCode(8), exp = Date.now() + 48 * 3600e3;
  q.run('INSERT INTO link_codes(code,student_id,expires_at) VALUES(?,?,?)', code, req.user.id, exp);
  res.status(201).json({ code, expires_at: exp });
}));
router.get('/family/links', auth, requireRole('student'), wrap(async (req, res) => {
  res.json({ parents: q.all('SELECT u.id,u.name,pl.created_at FROM parent_links pl JOIN users u ON u.id=pl.parent_id WHERE pl.student_id=? ORDER BY pl.created_at', req.user.id) });
}));
router.delete('/family/links/:parentId', auth, requireRole('student'), wrap(async (req, res) => {
  q.run('DELETE FROM parent_links WHERE student_id=? AND parent_id=?', req.user.id, int(req.params.parentId)); audit(req, 'family_unlink', { parent: int(req.params.parentId) }); res.json({ ok: true });
}));

/* ---- parent side ---- */
router.post('/family/link', auth, requireRole('parent'), perUser({ windowMs: 15 * 60e3, max: 10, message: 'Too many attempts. Wait a few minutes and try again.' }), wrap(async (req, res) => {
  const code = S(req.body && req.body.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const row = code && q.get('SELECT * FROM link_codes WHERE code=?', code);
  if (!row || row.used_at || row.expires_at < Date.now()) throw new HttpError(400, 'That code is not valid or has expired. Ask your child to create a new one in Settings.', 'bad_code');
  if (q.get('SELECT COUNT(*) c FROM parent_links WHERE parent_id=?', req.user.id).c >= 10) throw new HttpError(400, 'You can link up to 10 children');
  q.run('INSERT OR IGNORE INTO parent_links(parent_id,student_id,created_at) VALUES(?,?,?)', req.user.id, row.student_id, Date.now());
  q.run('UPDATE link_codes SET used_at=? WHERE code=?', Date.now(), code);
  notify(row.student_id, 'Parent linked', `${req.user.name} can now see your progress. You can remove this in Settings.`, '/settings');
  audit(req, 'family_link', { student: row.student_id });
  const stu = q.get('SELECT id,name FROM users WHERE id=?', row.student_id);
  res.status(201).json({ child: stu });
}));
router.get('/family/children', auth, requireRole('parent'), wrap(async (req, res) => {
  res.json({ children: q.all('SELECT u.id,u.name,u.grade_level,u.xp,u.streak FROM parent_links pl JOIN users u ON u.id=pl.student_id WHERE pl.parent_id=? ORDER BY u.name', req.user.id) });
}));
router.delete('/family/children/:id', auth, requireRole('parent'), wrap(async (req, res) => { q.run('DELETE FROM parent_links WHERE parent_id=? AND student_id=?', req.user.id, int(req.params.id)); res.json({ ok: true }); }));

router.get('/family/children/:id', auth, requireRole('parent'), wrap(async (req, res) => {
  const sid = int(req.params.id);
  if (!q.get('SELECT 1 x FROM parent_links WHERE parent_id=? AND student_id=?', req.user.id, sid)) throw new HttpError(404, 'Child not found');
  const ch = q.get('SELECT id,name,grade_level,xp,streak,best_streak FROM users WHERE id=?', sid), now = Date.now();
  const classes = q.all('SELECT c.id,c.name,c.subject,t.name teacher FROM enrollments e JOIN classrooms c ON c.id=e.classroom_id JOIN users t ON t.id=c.teacher_id WHERE e.student_id=?', sid);
  const cids = classes.map(c => c.id), inList = cids.map(() => '?').join(',');
  const attendance = q.all(`SELECT c.name, COUNT(a.day) marked, SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) present, SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) absent
      FROM enrollments e JOIN classrooms c ON c.id=e.classroom_id LEFT JOIN attendance a ON a.classroom_id=c.id AND a.student_id=e.student_id WHERE e.student_id=? GROUP BY c.id`, sid)
    .map(a => ({ ...a, rate: a.marked ? Math.round(100 * a.present / a.marked) : null }));
  const results = q.all(`SELECT a.title, a.kind, a.pass_mark, t.submitted_at, ROUND(100.0*t.score/t.max_score) percent, t.passed FROM attempts t JOIN assessments a ON a.id=t.assessment_id
      WHERE t.user_id=? AND t.status='submitted' AND t.max_score>0 ORDER BY t.submitted_at DESC LIMIT 15`, sid);
  const upcoming = cids.length ? q.all(`SELECT a.id,a.title,a.kind,a.closes_at,a.opens_at,a.compulsory,
      (SELECT COUNT(*) FROM attempts t WHERE t.assessment_id=a.id AND t.user_id=? AND t.status!='in_progress') done FROM assessments a WHERE a.published=1 AND a.classroom_id IN (${inList}) AND (a.closes_at IS NULL OR a.closes_at>?) ORDER BY IFNULL(a.closes_at, 9e15) LIMIT 10`, sid, ...cids, now) : [];
  const courses = q.all(`SELECT c.id,c.title,(SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) total,
      (SELECT COUNT(*) FROM progress pr JOIN lessons l ON l.id=pr.lesson_id WHERE l.course_id=c.id AND pr.user_id=? AND pr.completed=1) done FROM course_enrollments ce JOIN courses c ON c.id=ce.course_id WHERE ce.user_id=? LIMIT 12`, sid, sid)
    .map(c => ({ ...c, percent: c.total ? Math.round(100 * c.done / c.total) : 0 }));
  const mastery = q.all('SELECT topic, ROUND(rating) rating, answered, correct FROM mastery WHERE user_id=? AND answered>0 ORDER BY rating', sid);
  const d7 = dayOf(now - 6 * 864e5);
  const study = q.get('SELECT IFNULL(SUM(minutes),0) m FROM study_sessions WHERE user_id=? AND day>=?', sid, d7).m;
  const notices = cids.length ? q.all(`SELECT a.title,a.body,a.created_at,c.name classroom_name FROM announcements a JOIN classrooms c ON c.id=a.classroom_id WHERE a.classroom_id IN (${inList}) ORDER BY a.created_at DESC LIMIT 5`, ...cids) : [];
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.percent, 0) / results.length) : null;
  const attention = [];
  if (avg !== null && avg < 50) attention.push(`Recent average is ${avg}%. A chat with the teacher may help.`);
  for (const a of attendance) if (a.rate !== null && a.rate < 80) attention.push(`Attendance in ${a.name} is ${a.rate}%.`);
  for (const u of upcoming) if (u.compulsory && !u.done && u.closes_at && u.closes_at - now < 3 * 864e5) attention.push(`"${u.title}" is compulsory and closes soon.`);
  res.json({ child: ch, classes, attendance, results, average: avg, upcoming, courses, mastery, study_minutes_week: study, notices, attention });
}));

module.exports = router;
