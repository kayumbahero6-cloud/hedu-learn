# EduLearn: educational content and adaptive learning platform

A full-stack web app (Node 22, Express, SQLite, WebSocket, vanilla ES-module front end, no build step) for learners from Pre-Nursery to A-Level, plus vocational, language and regional-curriculum courses.

## Run it
```bash
npm install
SEED_DEMO=1 npm run seed      # demo users and courses (skip in production)
npm start                     # http://localhost:3000
npm test                      # 15 API tests
```
Demo logins (password `Demo1234`): `student@`, `adult@`, `kid@`, `teacher@`, `creator@`, `moderator@`, `admin@edulearn.demo`. Class code `DEMO23`.
Requires Node 22 or newer (uses the built-in `node:sqlite`).

## What is in it
| Area | What it does |
|---|---|
| Onboarding | Email/password with show/hide eye and strength meter, **email confirmation link before first sign-in** (domain/MX check, typo hints, throwaway domains blocked), optional on-device face enrolment (face-api.js; only a 128-number template reaches the server, encrypted), head-turn liveness, optional ID-photo match, guardian consent for under-18s, educators pick or create a school and generate class codes |
| Content | Courses by grade and subject; text, video, PDF, SCORM 1.2/2004, 3D/AR (model-viewer) and VR (A-Frame) lessons; creator studio with moderator review |
| Assessment | Practice, adaptive, test and exam; MCQ, multi-select (partial credit), true/false, short answer; auto-grading; compulsory tests enforced server-side; deadlines auto-submit; **tests and exams can be taken once, and only the teacher can allow a retake** (logged, one extra attempt per grant); CSV export of results |
| Adaptive engine | Per-topic mastery ratings (Elo style); next question chosen by difficulty gap |
| AI feedback | Study Buddy chat after a result. Uses Claude if `ANTHROPIC_API_KEY` is set, otherwise a rule-based tutor. Never reveals hidden answers. Detects distress and alerts staff |
| Proctoring | Pre-exam check (face, hands, surroundings with motion and object detection), then continuous monitoring (second face, identity mismatch, objects, tab leaving). The system flags; a teacher reviews every flag; learners can appeal; snapshots deleted after 30 days |
| Gamification | XP, levels, daily streaks, 15 badges, leaderboards (opt-out) |
| Community | Class chat rooms (WebSocket), forums, moderation (profanity, personal-info blocking for minors, reports, mutes), under-13s limited to class rooms |
| Study hub | **Planner** (daily goal, focus timer, weekly chart, streak), **flashcards** with spaced repetition (Again/Hard/Good/Easy, bulk import), **notes** (search, pin), **tasks** with due dates and priorities |
| Calendar | Month view of personal events, class events set by teachers, assessment open/close dates and task deadlines |
| Messages | Direct messages between learners and their own teachers (learner-to-learner private chat is off for safety), moderated, unread badges, rate limited |
| Class tools (teachers) | **Attendance** (present/absent/late/excused, rates), **gradebook** (class matrix, averages, learners needing support, CSV), **announcements** (pinned, notify the class) |
| Parent view | Parents register as "Parent" and link a child with a one-time code the child creates in Settings (works once, expires in 48 hours, child can remove access any time). They see results, attendance, deadlines, courses, topic strengths and notices, can message the child's teachers, and never see messages, Study Buddy chats or camera images |
| Loading feedback | A progress bar at the top and skeleton placeholders whenever data is loading, plus a "still loading, your connection may be slow" hint after 5 seconds |
| Notice board | Learners see announcements and their own attendance |
| Platform | Accessibility settings, dark theme, en/fr/rw/sw interface, installable PWA, audit log, rate limiting, CSP, health and metrics endpoints |

## Deploy
See `.env.example`, `Dockerfile` and `deploy/` (docker compose and nginx). Read `docs/ARCHITECTURE.md` before relying on it at scale.

## What you must know before real use
- **Scale is designed for, not proven.** The code runs as one process on SQLite. Multi-region, millions of concurrent users and a managed database are an architecture path (documented), not something tested here.
- **Object detection** (phones, books in the room scan) needs the COCO-SSD model. Set `COCO_MODEL_URL` to a copy you host; otherwise the room scan runs in motion-only mode and says so.
- **Face recognition is probabilistic.** It will have false matches and false rejects, worse for some lighting and skin tones. That is why it flags for human review and never fails a learner automatically.
- **Children and biometrics.** Face data of minors needs a lawful basis and guardian consent. Rwanda's data-protection law (Law No. 058/2021) and your school's policies apply. Have them reviewed before launch.
- **Camera proctoring is deterrence, not proof.** A determined cheater can use a second device out of frame.

## Deploy with Netlify (front end) + a backend host
Netlify cannot run this server (it needs a long-running process, a disk and WebSockets), so split it:
1. Deploy the backend where a disk is available (`render.yaml` is a ready example; the `Dockerfile` works anywhere). Note its URL. Back up `DATA_KEY`: losing it makes face templates unreadable.
2. In `netlify.toml` replace `BACKEND` with that host. In `public/config.js` set `wsUrl` to `wss://<that host>/ws`.
3. Connect the repo to Netlify (publish directory `public`, no build command), or run `netlify deploy --prod --dir=public`.
The browser talks only to your Netlify domain for pages and `/api`; chat connects straight to the backend. Netlify proxied requests have size and time limits, so very large video or SCORM uploads may fail through the proxy; test with your biggest file.

## Email confirmation (read this before going live)
New accounts get a confirmation link and cannot sign in until they click it. Set `SMTP_*`, `MAIL_FROM` and `APP_URL` (see `.env.example`). A Gmail address with an App password works. In production the server refuses sign-ups if SMTP is not configured, rather than pretending to send. In development the link is printed in the server console. The MX check only catches made-up domains; the link is what proves the mailbox is real. Gmail limits sending to roughly 500 messages a day, so use a mail service (Brevo, Mailgun, SES) for a large school.

## Retakes
Tests and exams allow one attempt. After a learner submits, the Start button is replaced by "Completed". The teacher opens Results, finds the learner and presses **Allow retake** (optionally with a reason). That adds exactly one attempt and notifies the learner. Practice and adaptive quizzes stay open for repeat practice.

## GitHub
Push the project to a repository: `.github/workflows/ci.yml` runs the tests on every push. GitHub Pages only serves static files, so it cannot run the server; deploy as described above (Netlify for the front end, a Docker host for the API).
