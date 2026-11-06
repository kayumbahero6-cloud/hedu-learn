import { S, h, mount, POST, icon, toast } from './core.js';
import { go } from './router.js';

/* ---------------- landing page (signed-out home) ---------------- */
export function landingPage() {
  const feat = (ic, title, text) => h('div', { class: 'lp-feat' }, h('div', { class: 'ic' }, icon(ic)), h('h3', title), h('p', text));
  const grades = (S.meta && S.meta.grades || []).map(g => g.label);
  return h('div', { class: 'lp' },
    h('header', { class: 'lp-nav' }, h('div', { class: 'lp-wrap' },
      h('a', { class: 'lp-brand', href: '#/' }, h('img', { src: '/icons/icon.svg', alt: '' }), 'EduLearn'),
      h('nav', { 'aria-label': 'Main' }, h('a', { class: 't', href: '#features', onclick: e => { e.preventDefault(); document.getElementById('features').scrollIntoView({ behavior: 'smooth' }); } }, 'Features'),
        h('a', { class: 't', href: '#how', onclick: e => { e.preventDefault(); document.getElementById('how').scrollIntoView({ behavior: 'smooth' }); } }, 'How it works'),
        h('a', { class: 'btn quiet', href: '#/login' }, 'Sign in'), h('a', { class: 'btn sun', href: '#/register' }, 'Get started')))),
    h('main', { id: 'main' },
      h('section', { class: 'lp-hero' }, h('div', { class: 'lp-wrap' },
        h('div', h('h1', 'Learning that ', h('em', 'adapts'), ' to every learner.'),
          h('p', { class: 'lead' }, 'Courses from Pre-Nursery to A-Level, vocational skills and local languages. Quizzes that get harder as you improve, fair online exams, and a tutor that explains every mistake.'),
          h('div', { class: 'lp-cta' }, h('a', { class: 'btn sun', href: '#/register' }, 'Create a free account'), h('a', { class: 'btn ghost', href: '#/login' }, 'Sign in')),
          h('div', { class: 'lp-trust' }, ['Email-verified accounts', 'Humans review every proctoring flag', 'Works on phones and slow networks'].map(t => h('span', icon('check'), t)))),
        h('div', { class: 'lp-card', 'aria-hidden': 'true' }, h('strong', 'Today'),
          h('div', { class: 'row2' }, h('div', h('b', 'Fractions: adaptive quiz'), h('div', { class: 'bar' }, h('i', { style: { width: '72%' } }))), h('span', { class: 'chip' }, '72%')),
          h('div', { class: 'row2' }, h('div', h('b', 'Science test'), h('div', { class: 'small muted' }, 'Due Friday')), h('span', { class: 'chip' }, 'Test')),
          h('div', { class: 'row2' }, h('div', h('b', '7-day streak'), h('div', { class: 'small muted' }, '+40 XP earned')), icon('fire', 26))))),
      h('section', { class: 'lp-sec', id: 'features' }, h('div', { class: 'lp-wrap' }, h('h2', 'Everything a school needs, in one place'), h('p', { class: 'sub' }, 'From the first lesson to the final exam, with the safeguards that children and parents expect.'),
        h('div', { class: 'lp-grid' },
          feat('book', 'Complete curriculum', 'Pre-Nursery to A-Level, TVET, languages and regional curricula, with text, video, PDF, 3D, VR and SCORM lessons.'),
          feat('star', 'Adaptive practice', 'Every learner has a mastery level per topic, and each question is chosen to be just hard enough.'),
          feat('check', 'Tests that count once', 'Tests and exams are taken once. Only the teacher can allow a retake, and every retake is logged.'),
          feat('camera', 'Fair proctoring', 'Face, hands and room checks before an exam, then flags for a teacher to review. Learners can appeal.'),
          feat('chat', 'AI study buddy', 'After a test, learners chat with a tutor that explains the working without leaking hidden answers.'),
          feat('shield', 'Safe community', 'Moderated class chat and forums, personal-information blocking for children, and instant reporting.'),
          feat('award', 'Motivation that lasts', 'XP, levels, streaks, badges and leaderboards that learners can opt out of.'),
          feat('mail', 'Verified accounts', 'Every account confirms a real email address before it can sign in.')))),
      h('section', { class: 'lp-sec alt', id: 'how' }, h('div', { class: 'lp-wrap' }, h('h2', 'How it works'), h('p', { class: 'sub' }, 'Up and running in a few minutes.'),
        h('ol', { class: 'lp-steps', style: { padding: 0, margin: 0 } },
          h('li', h('b', 'Sign up and confirm'), 'Choose your role, then click the link we email you.'),
          h('li', h('b', 'Join your class'), 'Students enter the teacher’s class code. Educators pick a school or create one.'),
          h('li', h('b', 'Learn, test, improve'), 'Follow courses, take quizzes and exams, and get feedback and progress at once.')))),
      h('section', { class: 'lp-sec' }, h('div', { class: 'lp-wrap' }, h('h2', 'Built for everyone in education'), h('p', { class: 'sub' }, ''),
        h('div', { class: 'lp-roles' },
          h('div', { class: 'lp-role' }, h('h3', 'Learners'), h('ul', h('li', 'Courses at your level'), h('li', 'Instant feedback and an AI tutor'), h('li', 'Badges, streaks and progress'))),
          h('div', { class: 'lp-role' }, h('h3', 'Educators'), h('ul', h('li', 'Class codes and class analytics'), h('li', 'Auto-graded tests, CSV export'), h('li', 'Review flags, allow retakes'))),
          h('div', { class: 'lp-role' }, h('h3', 'Creators'), h('ul', h('li', 'Publish your own courses'), h('li', 'Video, PDF, 3D, VR and SCORM'), h('li', 'Reviewed before going live')))),
        grades.length > 0 && h('div', { style: { marginTop: '2.4rem' } }, h('h3', 'Levels covered'), h('div', { class: 'lp-chips' }, grades.map(g => h('span', g)))))),
      h('section', { class: 'lp-final' }, h('div', { class: 'lp-wrap' }, h('h2', 'Start learning today'), h('a', { class: 'btn sun', href: '#/register', style: { minHeight: '52px', fontSize: '1.05rem' } }, 'Create your account')))),
    h('footer', { class: 'lp-foot' }, h('div', { class: 'lp-wrap' }, h('span', '© EduLearn. Made in Rwanda for East Africa.'), h('span', 'Face data is optional and stored as an encrypted numeric template, never a photo.'))));
}

/* ---------------- "check your inbox" (after sign-up or a blocked sign-in) ---------------- */
export function inboxView(email, { onBack, devOutbox } = {}) {
  const status = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Send the email again');
  let wait = 0, timer;
  const tick = () => { btn.disabled = wait > 0; btn.textContent = wait > 0 ? `Send again in ${wait}s` : 'Send the email again'; if (wait > 0) { wait--; timer = setTimeout(tick, 1000); } };
  btn.onclick = async () => {
    btn.disabled = true;
    try { const r = await POST('/auth/resend-verification', { email }, { noAuthRedirect: true }); status.textContent = r.message; wait = 60; tick(); }
    catch (e) { status.textContent = e.message; btn.disabled = false; }
  };
  wait = 30; tick();
  return h('div', { class: 'mailbox stack' }, h('div', { class: 'big' }, icon('mail')), h('h2', 'Check your email'),
    h('p', 'We sent a confirmation link to ', h('strong', email), '. Open it to activate your account.'),
    h('ol', h('li', 'Open your inbox (Gmail, Outlook or other).'), h('li', 'Find the message from EduLearn. Look in Spam or Promotions if it is not there.'), h('li', 'Click Confirm my email, then sign in.')),
    devOutbox && h('div', { class: 'banner' }, h('p', 'Email sending is not set up on this server (development mode). The link was printed in the server console.')),
    h('div', { class: 'row', style: { justifyContent: 'center' } }, btn, h('a', { class: 'btn primary', href: '#/login', onclick: () => { clearTimeout(timer); onBack && onBack(); } }, 'Go to sign in')), status,
    h('p', { class: 'small muted' }, 'The link works for 24 hours. Wrong address? ', h('a', { href: '#/register' }, 'Sign up again.')));
}

/* ---------------- /verify?token=… ---------------- */
export function verifyPage({ query }) {
  const box = h('div', { class: 'mailbox stack' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Confirming' }), h('p', 'Confirming your email…'));
  (async () => {
    try {
      const r = await POST('/auth/verify-email', { token: query.token || '' }, { noAuthRedirect: true });
      mount(box, h('div', { class: 'big ok' }, icon('check')), h('h2', r.already ? 'Already confirmed' : 'Email confirmed'), h('p', r.email + ' is verified. You can sign in now.'), h('a', { class: 'btn primary', href: '#/login' }, 'Sign in'));
    } catch (e) {
      mount(box, h('div', { class: 'big bad' }, icon('close')), h('h2', 'We could not confirm that'), h('p', e.message), h('a', { class: 'btn primary', href: '#/login' }, 'Go to sign in'));
    }
  })();
  return h('div', { class: 'auth' }, h('div', { class: 'hero' }, h('div', { class: 'say' }, h('h1', 'EduLearn'), h('p', 'One last step before you start learning.'))), h('main', { class: 'form', id: 'main' }, h('div', { class: 'stack' }, box)));
}
