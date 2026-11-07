# Job-Ready Dev Plan

A day-wise plan that takes a complete beginner to a job-ready full stack developer, built from `doc/Job-Ready Dev Plan — Business Requirements Document.docx`.

**Stack (as taught in the plan):** Angular 22 + Tailwind CSS 4 · Express + TypeScript · PostgreSQL · JWT auth · Claude API for explain-back grading.

## Run it

Requires Node 20+ and PostgreSQL running locally.

```bash
# 1. Database (once)
createdb jobready

# 2. API
cd server
npm install
cp .env.example .env        # then set JWT_SECRET (and optionally ANTHROPIC_API_KEY)
npm run seed                # creates tables and loads content/*.json
npm run dev                 # http://localhost:3000

# 3. Frontend (second terminal)
cd client
npm install
npm start                   # http://localhost:4200 (proxies /api to :3000)
```

For a single-server setup (e.g. on Coolify), run `npm run build` in `client/` and start the API. It serves the built app from `client/dist`.

## AI grading

Explain-back answers are graded by Claude (`claude-opus-5-5`), which reads the learner's actual GitHub commit: lenient on language (Hinglish is fine), strict on understanding, with Clear / Almost / Not yet results.

- Set `ANTHROPIC_API_KEY` in `server/.env`. This is a **paid, pay-as-you-go** key from console.anthropic.com. For one learner it costs very little, but it isn't free.
- Without a key the app uses **self-assessment**: the learner writes answers, sees the key ideas, and grades honestly.
- Optional `GITHUB_TOKEN` raises GitHub's commit-check rate limit from 60 to 5000 per hour.

## What's built (mapped to the BRD)

| BRD area | Where |
|---|---|
| 7-question onboarding, one per screen, with summary and track/hours warning | `/onboarding` |
| Daily task template: goal, learn, build, hint ladder, proof, explain-back, DSA, aptitude, revision | `/day/:n` |
| Proof of work: GitHub commit links verified via the GitHub API; streaks count only verified commits | `server/src/github.ts`, `plan.ts` |
| Explain-back: 3 questions, 3 attempts/day, one follow-up for "Almost", unlock + move on after 3 misses | `server/src/routes/days.ts`, `grading.ts` |
| Predict-the-output quizzes, debug labs, AI-allowed level banner (no AI in weeks 1–8) | day screen |
| Missed days push the plan forward, gentle "finish date moved" message, welcome-back after 5+ missed days | `plan.ts`, dashboard |
| Settings: completed days kept, only remaining days re-planned, preview finish date before saving, track change once per 2 weeks | `/settings` |
| Test-out: 10 questions + build task, 80% pass, weak parts + shorter module, 24h retry; Git basics not skippable | `/modules` |
| 6/9/12-month tracks (same content, less per day) | `plan.ts` `pace()` |
| Dashboard: progress, streak, phases, weak topics, DSA and aptitude stats | `/` |
| DSA tracker by pattern, interview prep checklist, progress log with Markdown export | `/dsa`, `/interview`, `/log` |

Not built yet: portfolio/resume builder, Firebase/Forgejo bonus tracks, mentor role.

## Adding content

Content lives in `content/` and is written in 1–2 week batches:

- `content/week01.json`: Days 1–6 (Git basics, HTML, CSS, flexbox + debug lab)
- `content/modules.json`: modules and their test-out questions
- `content/dsa.json`, `content/interview.json`, `content/curriculum.json`

To add a week, create `content/week02.json` (Days 7–12) in the same shape and run `npm run seed` again. Export the progress log (Log → Download .md) and share it when the next batch is written.

## Testing tips

`FAKE_TODAY=2026-11-20 npm run dev` makes the server act as if it's that date, so you can check missed days and the welcome-back screen.
