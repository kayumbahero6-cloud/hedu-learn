'use strict';
/* One shared rule for "may this learner start another attempt?".
 * Tests and exams are single-attempt: once submitted, the learner cannot redo them unless the teacher grants a retake
 * (each grant adds one attempt). A teacher may also set a higher base allowance. Practice and adaptive quizzes follow max_attempts (0 = unlimited). */
const { q } = require('./db');

function allowance(a) { return (a.kind === 'test' || a.kind === 'exam') ? Math.max(1, a.max_attempts || 1) : (a.max_attempts || 0); }
function info(userId, a) {
  const used = q.get(`SELECT COUNT(*) c FROM attempts WHERE assessment_id=? AND user_id=? AND status!='in_progress'`, a.id, userId).c;
  const grants = q.get('SELECT COUNT(*) c FROM retake_grants WHERE assessment_id=? AND user_id=?', a.id, userId).c;
  const base = allowance(a);
  const total = base === 0 ? 0 : base + grants;
  return { used, grants, allowed: total, unlimited: total === 0, left: total === 0 ? null : Math.max(0, total - used), locked: total !== 0 && used >= total };
}
module.exports = { info, allowance };
