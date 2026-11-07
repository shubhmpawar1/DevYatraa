import { Router } from "express";
import { z } from "zod";
import { one, q } from "../db.js";
import { today } from "../dates.js";
import { commitAsText, fetchCommit } from "../github.js";
import { aiEnabled, grade, GradingError, type GradeOutput } from "../grading.js";
import { ah, HttpError } from "../http.js";
import { aiLevel, planState, type Profile } from "../plan.js";
import { requireProfile } from "./profile.js";

export const daysRouter = Router();

const MAX_ATTEMPTS_PER_DAY = 3;
const UNLOCK_AFTER_MISSES = 3;

interface DayRow { day_number: number; week: number; phase: number; module_id: string; title: string; data: any }
interface ProgressRow {
  status: string; commit_url: string | null; commit_verified: boolean; hints_used: number; grade: string | null; completed_on: string | null;
}

async function loadDay(n: number): Promise<DayRow> {
  const d = await one<DayRow>("SELECT * FROM content_days WHERE day_number = $1", [n]);
  if (!d) throw new HttpError(404, "This day's content hasn't been written yet. It comes in the next batch.", { comingSoon: true });
  return d;
}

async function progress(userId: number, n: number): Promise<ProgressRow> {
  return (
    (await one<ProgressRow>("SELECT * FROM day_progress WHERE user_id=$1 AND day_number=$2", [userId, n])) ?? {
      status: "open", commit_url: null, commit_verified: false, hints_used: 0, grade: null, completed_on: null,
    }
  );
}

async function upsertProgress(userId: number, n: number, set: Record<string, unknown>) {
  const cols = Object.keys(set);
  const vals = Object.values(set);
  await q(
    `INSERT INTO day_progress (user_id, day_number, ${cols.join(",")}) VALUES ($1,$2,${cols.map((_, i) => `$${i + 3}`).join(",")})
     ON CONFLICT (user_id, day_number) DO UPDATE SET ${cols.map((c, i) => `${c}=$${i + 3}`).join(",")}`,
    [userId, n, ...vals],
  );
}

/** The current day and every earlier day can be opened; later days stay locked. */
async function assertOpenable(profile: Profile, n: number) {
  const st = await planState(profile);
  if (st.currentDay !== null && n > st.currentDay) {
    throw new HttpError(403, `Finish Day ${st.currentDay} first. Days unlock in order.`, { currentDay: st.currentDay });
  }
  return st;
}

async function attemptStats(userId: number, n: number) {
  const rows = await q<{ id: number; attempt_on: string; result: string; followup_q: string | null; followup_a: string | null; feedback: any; answers: any; graded_by: string; created_at: string }>(
    "SELECT * FROM explain_attempts WHERE user_id=$1 AND day_number=$2 ORDER BY id",
    [userId, n],
  );
  const t = today();
  const todayCount = rows.filter((r) => r.attempt_on === t).length;
  const misses = rows.filter((r) => r.result !== "clear").length;
  return { rows, todayCount, misses, last: rows[rows.length - 1] ?? null };
}

function personalNotes(p: Profile) {
  const dsa = p.goal === "top"
    ? "Your goal is a top product company: solve every problem listed, then re-solve one older problem without notes."
    : p.goal === "product"
      ? "Your goal is a good product company: solve all listed problems."
      : "Your goal is any developer job: solve at least the first listed problem; the rest are a bonus.";
  let aptitude = "Do the questions untimed first, then check answers.";
  if (p.background === "student" && (p.college_year ?? 0) >= 3) aptitude = "Placement season is close: give aptitude full weight and time yourself (about 1 minute per question).";
  else if (p.background === "graduate") aptitude = "Job tests are close: time yourself at about 1 minute per question.";
  else if (p.background === "professional") aptitude = "Keep aptitude light on weekdays and do the timed set on weekends.";
  const schedule = p.background === "professional"
    ? "Working professional plan: on weekdays do Learn + DSA; save the Build task for your longer days around the weekend."
    : null;
  return { dsa, aptitude, schedule };
}

// ---------- Read a day ----------

daysRouter.get("/:n", ah(async (req, res) => {
  const n = Number(req.params.n);
  const profile = await requireProfile(req.userId);
  const st = await assertOpenable(profile, n);
  const day = await loadDay(n);
  const pr = await progress(req.userId, n);
  const att = await attemptStats(req.userId, n);
  const unlocked = att.misses >= UNLOCK_AFTER_MISSES;
  const d = day.data;
  const hintsShown = unlocked ? 3 : pr.hints_used;
  const quizzes = await q("SELECT kind, score, total, taken_at FROM quiz_results WHERE user_id=$1 AND day_number=$2 ORDER BY id DESC", [req.userId, n]);
  const commits = await q("SELECT url, verified, message, commit_date FROM commits WHERE user_id=$1 AND day_number=$2 ORDER BY id", [req.userId, n]);
  const hasClear = pr.grade === "clear" || pr.grade === "self_clear" || pr.grade === "moved_on";

  res.json({
    day: n,
    week: day.week,
    phase: day.phase,
    module: day.module_id,
    title: day.title,
    goal: d.goal,
    learn: d.learn,
    build: d.build,
    hints: d.hints.slice(0, hintsShown),
    hintsTotal: d.hints.length,
    proof: d.proof,
    explainBack: d.explainBack.map((e: any) => ({ q: e.q })),
    lastHintExplanation: unlocked ? d.lastHintExplanation : null,
    predict: (d.predict ?? []).map((p: any) => ({ q: p.q, code: p.code ?? null, options: p.options })),
    debugLab: d.debugLab,
    dsa: d.dsa,
    aptitude: { topic: d.aptitude.topic, questions: d.aptitude.questions.map((x: any) => ({ q: x.q, options: x.options })) },
    revision: d.revision,
    aiLevel: aiLevel(n),
    notes: personalNotes(profile),
    status: pr.status,
    isCurrent: st.currentDay === n,
    commitUrl: pr.commit_url,
    commitVerified: pr.commit_verified,
    commits,
    grade: pr.grade,
    aiGrading: aiEnabled(),
    attempts: {
      todayCount: att.todayCount,
      maxPerDay: MAX_ATTEMPTS_PER_DAY,
      misses: att.misses,
      unlocked,
      history: att.rows.map((r) => ({
        id: r.id, result: r.result, feedback: r.feedback, followupQuestion: r.followup_q, followupAnswer: r.followup_a,
        gradedBy: r.graded_by, answers: r.answers, date: r.attempt_on,
      })),
    },
    canComplete: pr.status === "open" && pr.commit_verified && hasClear,
    quizzes,
  });
}));

// ---------- Hints ----------

daysRouter.post("/:n/hint", ah(async (req, res) => {
  const n = Number(req.params.n);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  const day = await loadDay(n);
  const pr = await progress(req.userId, n);
  const used = Math.min(day.data.hints.length, pr.hints_used + 1);
  await upsertProgress(req.userId, n, { hints_used: used });
  res.json({ hints: day.data.hints.slice(0, used) });
}));

// ---------- Proof of work ----------

daysRouter.post("/:n/commit", ah(async (req, res) => {
  const n = Number(req.params.n);
  const { url } = z.object({ url: z.string().trim().url() }).parse(req.body);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  await loadDay(n);
  const info = await fetchCommit(url);
  if (!info.verified) throw new HttpError(400, info.reason ?? "Could not verify this commit.");
  const dup = await one<{ day_number: number }>("SELECT day_number FROM commits WHERE user_id=$1 AND sha=$2", [req.userId, info.sha]);
  if (dup && dup.day_number !== n) throw new HttpError(400, `This commit was already submitted for Day ${dup.day_number}. Each day needs its own commit.`);
  if (!dup) {
    await q(
      "INSERT INTO commits (user_id, day_number, url, sha, verified, message, commit_date) VALUES ($1,$2,$3,$4,true,$5,$6)",
      [req.userId, n, url, info.sha, info.message ?? null, today()],
    );
  }
  await upsertProgress(req.userId, n, { commit_url: url, commit_verified: true });
  res.json({ ok: true, message: info.message, files: info.files?.map((f) => f.filename) ?? [] });
}));

// ---------- Explain-back ----------

const AnswersBody = z.object({ answers: z.array(z.string().max(4000)).length(3) });

async function checkAttemptAllowed(userId: number, n: number, pr: ProgressRow) {
  if (pr.status !== "open") throw new HttpError(400, "This day is already complete.");
  if (!pr.commit_url) throw new HttpError(400, "Submit your commit link first. Explain-back questions are about your own code.");
  const att = await attemptStats(userId, n);
  if (att.todayCount >= MAX_ATTEMPTS_PER_DAY) {
    throw new HttpError(429, "You've used all 3 attempts for today. Review the feedback and try again tomorrow.");
  }
  if (att.last && att.last.result === "almost" && att.last.followup_q && !att.last.followup_a) {
    throw new HttpError(400, "Answer the follow-up question first.");
  }
}

async function addWeakTopics(userId: number, n: number, topics: string[], source: string) {
  for (const t of topics.slice(0, 5)) {
    const exists = await one("SELECT 1 FROM weak_topics WHERE user_id=$1 AND lower(topic)=lower($2) AND resolved=false", [userId, t]);
    if (!exists) await q("INSERT INTO weak_topics (user_id, day_number, topic, source) VALUES ($1,$2,$3,$4)", [userId, n, t, source]);
  }
}

async function runGrade(day: DayRow, commitUrl: string, answers: string[], followup?: { question: string; answer: string }): Promise<GradeOutput> {
  const info = await fetchCommit(commitUrl);
  if (!info.verified) throw new HttpError(502, info.reason ?? "Could not load your commit from GitHub.");
  try {
    return await grade({
      dayTitle: `Day ${day.day_number}: ${day.title}`,
      taskSummary: day.data.build.task,
      questions: day.data.explainBack,
      answers,
      commitText: commitAsText(info),
      followup,
    });
  } catch (e) {
    if (e instanceof GradingError) throw new HttpError(502, e.message);
    throw e;
  }
}

daysRouter.post("/:n/explain", ah(async (req, res) => {
  const n = Number(req.params.n);
  if (!aiEnabled()) throw new HttpError(400, "AI grading isn't set up. Use self-assessment.");
  const { answers } = AnswersBody.parse(req.body);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  const day = await loadDay(n);
  const pr = await progress(req.userId, n);
  await checkAttemptAllowed(req.userId, n, pr);

  const out = await runGrade(day, pr.commit_url!, answers);
  const row = await one<{ id: number }>(
    `INSERT INTO explain_attempts (user_id, day_number, attempt_on, answers, followup_q, result, feedback, graded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'ai') RETURNING id`,
    [req.userId, n, today(), JSON.stringify(answers), out.followup_question, out.result, JSON.stringify(out)],
  );
  if (out.result === "clear") await upsertProgress(req.userId, n, { grade: "clear" });
  if (out.result === "not_yet") await addWeakTopics(req.userId, n, out.weak_topics, "explain_back");
  res.json({ attemptId: row!.id, ...out });
}));

daysRouter.post("/:n/followup", ah(async (req, res) => {
  const n = Number(req.params.n);
  const { attemptId, answer } = z.object({ attemptId: z.number().int(), answer: z.string().min(1).max(4000) }).parse(req.body);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  const day = await loadDay(n);
  const pr = await progress(req.userId, n);
  const a = await one<{ answers: string[]; followup_q: string | null; followup_a: string | null; result: string }>(
    "SELECT answers, followup_q, followup_a, result FROM explain_attempts WHERE id=$1 AND user_id=$2 AND day_number=$3",
    [attemptId, req.userId, n],
  );
  if (!a || a.result !== "almost" || !a.followup_q || a.followup_a) throw new HttpError(400, "There's no open follow-up question for this attempt.");

  const out = await runGrade(day, pr.commit_url!, a.answers, { question: a.followup_q, answer });
  await q("UPDATE explain_attempts SET followup_a=$2, result=$3, feedback=$4 WHERE id=$1", [attemptId, answer, out.result, JSON.stringify({ ...out, followup_question: a.followup_q })]);
  if (out.result === "clear") await upsertProgress(req.userId, n, { grade: "clear" });
  else await addWeakTopics(req.userId, n, out.weak_topics, "explain_back");
  res.json({ attemptId, ...out });
}));

// Self-assessment when AI grading is off: reveal key ideas, then the learner grades honestly.
daysRouter.post("/:n/self-check", ah(async (req, res) => {
  const n = Number(req.params.n);
  AnswersBody.parse(req.body);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  const day = await loadDay(n);
  const pr = await progress(req.userId, n);
  await checkAttemptAllowed(req.userId, n, pr);
  res.json({ keyIdeas: day.data.explainBack.map((e: any) => e.lookFor) });
}));

daysRouter.post("/:n/self-grade", ah(async (req, res) => {
  const n = Number(req.params.n);
  const body = AnswersBody.extend({ result: z.enum(["clear", "almost", "not_yet"]), weakTopic: z.string().max(80).optional() }).parse(req.body);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  await loadDay(n);
  const pr = await progress(req.userId, n);
  await checkAttemptAllowed(req.userId, n, pr);
  await q(
    `INSERT INTO explain_attempts (user_id, day_number, attempt_on, answers, result, feedback, graded_by) VALUES ($1,$2,$3,$4,$5,$6,'self')`,
    [req.userId, n, today(), JSON.stringify(body.answers), body.result, JSON.stringify({ result: body.result, questions: [] })],
  );
  if (body.result === "clear") await upsertProgress(req.userId, n, { grade: "self_clear" });
  else if (body.weakTopic) await addWeakTopics(req.userId, n, [body.weakTopic], "explain_back");
  res.json({ ok: true });
}));

daysRouter.post("/:n/move-on", ah(async (req, res) => {
  const n = Number(req.params.n);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  const day = await loadDay(n);
  const att = await attemptStats(req.userId, n);
  if (att.misses < UNLOCK_AFTER_MISSES) throw new HttpError(400, "Moving on unlocks after 3 attempts that aren't Clear.");
  await upsertProgress(req.userId, n, { grade: "moved_on" });
  await addWeakTopics(req.userId, n, [day.title], "explain_back");
  res.json({ ok: true });
}));

// ---------- Quizzes ----------

daysRouter.post("/:n/quiz", ah(async (req, res) => {
  const n = Number(req.params.n);
  const body = z.object({ kind: z.enum(["aptitude", "predict"]), answers: z.array(z.number().int().nullable()) }).parse(req.body);
  const profile = await requireProfile(req.userId);
  await assertOpenable(profile, n);
  const day = await loadDay(n);
  const qs = body.kind === "aptitude" ? day.data.aptitude.questions : (day.data.predict ?? []);
  if (!qs.length) throw new HttpError(400, "No quiz for this day.");
  const results = qs.map((x: any, i: number) => ({ correct: x.answer, chosen: body.answers[i] ?? null, ok: body.answers[i] === x.answer, why: x.why }));
  const score = results.filter((r: any) => r.ok).length;
  await q("INSERT INTO quiz_results (user_id, day_number, kind, score, total) VALUES ($1,$2,$3,$4,$5)", [req.userId, n, body.kind, score, qs.length]);
  if (score / qs.length < 0.6) {
    const topic = body.kind === "aptitude" ? `Aptitude: ${day.data.aptitude.topic}` : `Predict-the-output: ${day.title}`;
    await addWeakTopics(req.userId, n, [topic], "quiz");
  }
  res.json({ score, total: qs.length, results });
}));

// ---------- Complete ----------

daysRouter.post("/:n/complete", ah(async (req, res) => {
  const n = Number(req.params.n);
  const log = z.object({
    done: z.string().max(2000).optional(),
    hard: z.string().max(2000).optional(),
    minutes: z.number().int().min(0).max(1440).optional(),
  }).parse(req.body ?? {});
  const profile = await requireProfile(req.userId);
  const st = await assertOpenable(profile, n);
  if (st.currentDay !== n) throw new HttpError(400, "Only the current day can be completed.");
  await loadDay(n);
  const pr = await progress(req.userId, n);
  if (!pr.commit_verified) throw new HttpError(400, "Add a verified GitHub commit link as proof first.");
  if (!["clear", "self_clear", "moved_on"].includes(pr.grade ?? "")) throw new HttpError(400, "Pass the explain-back check first.");
  const t = today();
  await upsertProgress(req.userId, n, { status: "completed", completed_at: new Date().toISOString(), completed_on: t });
  if (log.done?.trim()) {
    await q("INSERT INTO progress_log (user_id, day_number, log_date, done, hard, minutes) VALUES ($1,$2,$3,$4,$5,$6)",
      [req.userId, n, t, log.done.trim(), log.hard?.trim() || null, log.minutes ?? null]);
  }
  res.json({ ok: true, plan: await planState(profile) });
}));
