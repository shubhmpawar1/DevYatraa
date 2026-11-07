import { Router } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { one, q } from "../db.js";
import { addDays, dayName, maxDate, pretty, today, weekday } from "../dates.js";
import { fetchCommit } from "../github.js";
import { aiEnabled } from "../grading.js";
import { ah, HttpError } from "../http.js";
import { nthWorkingDay, pace, planState, TOTAL_CONTENT_DAYS, weekOf } from "../plan.js";
import { requireProfile } from "./profile.js";

export const miscRouter = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(here, "../../../content");
const readContent = (f: string) => JSON.parse(readFileSync(path.join(contentDir, f), "utf8"));
const curriculum = readContent("curriculum.json");
const phaseOfWeek = (w: number) => curriculum.phases.find((p: any) => w >= p.weeks[0] && w <= p.weeks[1]);

miscRouter.get("/curriculum", ah(async (_req, res) => res.json(curriculum)));

// ---------- Dashboard ----------

miscRouter.get("/dashboard", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const st = await planState(p);
  const current = st.currentDay ? await one("SELECT day_number, title, week, phase FROM content_days WHERE day_number=$1", [st.currentDay]) : null;
  const weak = await q("SELECT id, topic, day_number, source FROM weak_topics WHERE user_id=$1 AND resolved=false ORDER BY id DESC", [req.userId]);
  const dsa = await one<{ solved: string; total: string }>(
    "SELECT (SELECT count(*) FROM dsa_progress WHERE user_id=$1 AND status='solved') AS solved, (SELECT count(*) FROM dsa_problems) AS total",
    [req.userId],
  );
  const apt = await one<{ avg: string | null; n: string }>(
    "SELECT round(avg(score::numeric/total)*100) AS avg, count(*) AS n FROM quiz_results WHERE user_id=$1 AND kind='aptitude'",
    [req.userId],
  );
  const completedByPhase = await q<{ phase: number; n: string }>(
    `SELECT c.phase, count(*) AS n FROM day_progress d JOIN content_days c ON c.day_number=d.day_number
     WHERE d.user_id=$1 AND d.status IN ('completed','skipped_tested') GROUP BY c.phase`,
    [req.userId],
  );
  const phases = curriculum.phases.map((ph: any) => {
    const days = (ph.weeks[1] - ph.weeks[0] + 1) * curriculum.daysPerWeek;
    const done = Number(completedByPhase.find((r) => r.phase === ph.phase)?.n ?? 0);
    return { phase: ph.phase, title: ph.title, days, done };
  });
  const recentLog = await q("SELECT day_number, log_date, done, hard, minutes FROM progress_log WHERE user_id=$1 ORDER BY id DESC LIMIT 5", [req.userId]);
  const contentAvailable = await one<{ max: number | null }>("SELECT max(day_number) AS max FROM content_days");

  let finishMessage: string | null = null;
  if (st.finishMovedBy > 0) finishMessage = `Finish date moved to ${pretty(st.projectedFinish)}.`;
  else if (st.finishMovedBy < 0) finishMessage = `You're ahead: finish date is now ${pretty(st.projectedFinish)}.`;

  res.json({
    profile: { ...p, restDayName: dayName(p.rest_day) },
    plan: st,
    projectedFinishPretty: pretty(st.projectedFinish),
    originalFinishPretty: pretty(st.originalFinish),
    finishMessage,
    startPretty: pretty(p.start_date),
    isRestDay: weekday(today()) === p.rest_day,
    current,
    currentWeek: st.currentDay ? weekOf(st.currentDay) : null,
    contentAvailableUntil: contentAvailable?.max ?? 0,
    totalDays: TOTAL_CONTENT_DAYS,
    percent: Math.round((st.doneCount / TOTAL_CONTENT_DAYS) * 100),
    phases,
    weak,
    dsa: { solved: Number(dsa?.solved ?? 0), total: Number(dsa?.total ?? 0) },
    aptitude: { avg: apt?.avg ? Number(apt.avg) : null, tests: Number(apt?.n ?? 0) },
    recentLog,
    aiGrading: aiEnabled(),
  });
}));

// ---------- Whole plan ----------

miscRouter.get("/plan", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const st = await planState(p);
  const content = await q<{ day_number: number; title: string; module_id: string }>("SELECT day_number, title, module_id FROM content_days");
  const titles = new Map(content.map((c) => [c.day_number, c]));
  const prog = await q<{ day_number: number; status: string; completed_on: string | null }>(
    "SELECT day_number, status, completed_on FROM day_progress WHERE user_id=$1", [req.userId],
  );
  const pm = new Map(prog.map((r) => [r.day_number, r]));
  const t = today();
  const from = st.completedToday ? addDays(t, 1) : t;
  const start = from > p.start_date ? from : p.start_date;
  let k = 0;
  const days = [];
  for (let n = 1; n <= TOTAL_CONTENT_DAYS; n++) {
    const pr = pm.get(n);
    const done = pr && (pr.status === "completed" || pr.status === "skipped_tested");
    let target: string | null = null;
    if (!done) {
      k++;
      target = nthWorkingDay(start, Math.ceil(k / pace(p.track_months) - 1e-9), p.rest_day);
    }
    const c = titles.get(n);
    const w = weekOf(n);
    days.push({
      day: n, week: w, phase: phaseOfWeek(w)?.phase ?? 1, title: c?.title ?? null, module: c?.module_id ?? null,
      status: pr?.status === "completed" || pr?.status === "skipped_tested" ? pr.status : n === st.currentDay ? "current" : "upcoming",
      date: done ? pr!.completed_on : target,
    });
  }
  res.json({ days, phases: curriculum.phases, restDayName: dayName(p.rest_day), track: p.track_months, currentDay: st.currentDay });
}));

// ---------- Date-by-date schedule ----------

/**
 * Each lesson is split into parts, in the order they're done. The weights are the share of the
 * lesson's time. On slower tracks a lesson spans several dates, so each part lands on the date
 * where its midpoint falls. On the 6-month track a whole lesson lands on one date.
 */
const PARTS = [
  { kind: "learn", w: 0.25 },
  { kind: "dsa", w: 0.2 },
  { kind: "build", w: 0.35 },
  { kind: "aptitude", w: 0.1 },
  { kind: "submit", w: 0.1 },
] as const;

const firstSentence = (s: string) => {
  const m = s.match(/^.*?[.!?](\s|$)/);
  const out = (m ? m[0] : s).trim();
  return out.length > 160 ? out.slice(0, 157) + "…" : out;
};

function partTask(kind: string, day: number, title: string | null, data: any) {
  if (!data) {
    const names: Record<string, string> = { learn: "Learn", dsa: "DSA practice", build: "Build task", aptitude: "Aptitude practice", submit: "Submit proof + explain-back" };
    return { day, kind, label: names[kind], detail: "Content comes in a later batch" };
  }
  switch (kind) {
    case "learn":
      return { day, kind, label: `Learn: ${title}`, detail: (data.learn?.concepts ?? []).slice(0, 3).join(" · ") };
    case "dsa":
      return { day, kind, label: `DSA: ${data.dsa?.pattern ?? "practice"}`, detail: `${data.dsa?.problems?.length ?? 0} problems` };
    case "build":
      return { day, kind, label: "Build", detail: firstSentence(data.build?.task ?? "") };
    case "aptitude":
      return { day, kind, label: `Aptitude: ${data.aptitude?.topic ?? "practice"}`, detail: `${data.aptitude?.questions?.length ?? 0} questions` };
    default:
      return { day, kind, label: "Submit proof + explain-back", detail: data.proof ? firstSentence(data.proof) : "" };
  }
}

miscRouter.get("/plan/schedule", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const st = await planState(p);
  const limit = Math.min(Math.max(Number(req.query.days) || 10000, 1), 10000);
  const content = await q<{ day_number: number; title: string; data: any }>("SELECT day_number, title, data FROM content_days");
  const byDay = new Map(content.map((c) => [c.day_number, c]));
  const prog = await q<{ day_number: number; status: string; completed_on: string | null }>(
    "SELECT day_number, status, completed_on FROM day_progress WHERE user_id=$1 AND status IN ('completed','skipped_tested')", [req.userId],
  );
  const done = new Set(prog.map((r) => r.day_number));
  const t = today();
  const start = maxDate(p.start_date, st.completedToday ? addDays(t, 1) : t);
  const rate = pace(p.track_months);

  // Remaining lessons in order, each broken into dated parts.
  const tasksByIndex = new Map<number, any[]>(); // working-day index (0-based) -> tasks
  let k = 0;
  let lastIndex = -1;
  for (let n = 1; n <= TOTAL_CONTENT_DAYS; n++) {
    if (done.has(n)) continue;
    const c = byDay.get(n);
    let cum = 0;
    for (const part of PARTS) {
      const mid = k + cum + part.w / 2;
      cum += part.w;
      const idx = Math.floor(mid / rate + 1e-9);
      if (!tasksByIndex.has(idx)) tasksByIndex.set(idx, []);
      tasksByIndex.get(idx)!.push(partTask(part.kind, n, c?.title ?? null, c?.data ?? null));
      lastIndex = Math.max(lastIndex, idx);
    }
    k++;
  }

  const dates: any[] = [];
  // Lessons finished today show on today's row.
  if (st.completedToday) {
    const finished = prog.filter((r) => r.completed_on === t).map((r) => ({
      day: r.day_number, kind: "done", label: `Done: ${byDay.get(r.day_number)?.title ?? `Day ${r.day_number}`}`, detail: "",
    }));
    dates.push({ date: t, rest: false, tasks: finished });
  }
  let d = start;
  let idx = 0;
  while (idx <= lastIndex && dates.length < limit) {
    if (weekday(d) === p.rest_day) {
      dates.push({ date: d, rest: true, tasks: [] });
    } else {
      dates.push({ date: d, rest: false, tasks: tasksByIndex.get(idx) ?? [] });
      idx++;
    }
    d = addDays(d, 1);
  }

  res.json({ today: t, currentDay: st.currentDay, track: p.track_months, restDayName: dayName(p.rest_day), dates });
}));

// ---------- Module test-out ----------

async function moduleInfo(userId: number) {
  const mods = await q<{ id: string; title: string; phase: number; skippable: boolean; test: any }>("SELECT * FROM modules ORDER BY phase, id");
  const out = [];
  for (const m of mods) {
    const days = await q<{ day_number: number; status: string | null }>(
      `SELECT c.day_number, d.status FROM content_days c LEFT JOIN day_progress d ON d.day_number=c.day_number AND d.user_id=$1
       WHERE c.module_id=$2 ORDER BY c.day_number`,
      [userId, m.id],
    );
    const last = await one<{ passed: boolean; score: number; total: number; weak: string[]; taken_at: string }>(
      "SELECT passed, score, total, weak, taken_at FROM module_tests WHERE user_id=$1 AND module_id=$2 ORDER BY id DESC LIMIT 1",
      [userId, m.id],
    );
    const retryAt = last && !last.passed ? new Date(new Date(last.taken_at).getTime() + 24 * 3600 * 1000) : null;
    const remaining = days.filter((d) => d.status !== "completed" && d.status !== "skipped_tested").length;
    out.push({
      id: m.id, title: m.title, phase: m.phase, skippable: m.skippable && Boolean(m.test),
      days: days.map((d) => ({ day: d.day_number, status: d.status ?? "open" })),
      remaining,
      lastTest: last ?? null,
      retryAt: retryAt && retryAt > new Date() ? retryAt.toISOString() : null,
    });
  }
  return out;
}

miscRouter.get("/modules", ah(async (req, res) => {
  await requireProfile(req.userId);
  res.json(await moduleInfo(req.userId));
}));

async function testableModule(userId: number, id: string) {
  const m = (await moduleInfo(userId)).find((x) => x.id === id);
  if (!m) throw new HttpError(404, "Module not found.");
  if (!m.skippable) throw new HttpError(400, "This module can't be skipped. Git basics, DSA and capstone explain-backs are mandatory.");
  if (m.remaining === 0) throw new HttpError(400, "You've already finished this module.");
  if (m.retryAt) throw new HttpError(429, `You can retry this test after ${new Date(m.retryAt).toLocaleString("en-IN")}.`);
  const row = await one<{ test: any }>("SELECT test FROM modules WHERE id=$1", [id]);
  return { m, test: row!.test };
}

miscRouter.get("/modules/:id/test", ah(async (req, res) => {
  await requireProfile(req.userId);
  const { m, test } = await testableModule(req.userId, String(req.params.id));
  res.json({
    id: m.id, title: m.title, passPercent: test.passPercent,
    questions: test.questions.map((x: any) => ({ q: x.q, code: x.code ?? null, options: x.options })),
    buildTask: test.buildTask,
  });
}));

miscRouter.post("/modules/:id/test", ah(async (req, res) => {
  await requireProfile(req.userId);
  const id = String(req.params.id);
  const body = z.object({ answers: z.array(z.number().int().nullable()), commitUrl: z.string().trim().url() }).parse(req.body);
  const { m, test } = await testableModule(req.userId, id);
  const info = await fetchCommit(body.commitUrl);
  if (!info.verified) throw new HttpError(400, `Build task commit: ${info.reason}`);

  const wrong = test.questions.filter((x: any, i: number) => body.answers[i] !== x.answer);
  const score = test.questions.length - wrong.length;
  const pct = Math.round((score / test.questions.length) * 100);
  const passed = pct >= test.passPercent;
  const weakTopics = [...new Set<string>(wrong.map((x: any) => x.topic))];
  const weakDays = [...new Set<number>(wrong.map((x: any) => x.day))];

  await q("INSERT INTO module_tests (user_id, module_id, score, total, passed, weak, commit_url) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [req.userId, id, score, test.questions.length, passed, JSON.stringify(weakTopics), body.commitUrl]);

  if (passed) {
    for (const d of m.days) {
      if (d.status !== "completed") {
        await q(
          `INSERT INTO day_progress (user_id, day_number, status) VALUES ($1,$2,'skipped_tested')
           ON CONFLICT (user_id, day_number) DO UPDATE SET status='skipped_tested'`, [req.userId, d.day]);
      }
    }
  } else {
    for (const t of weakTopics) {
      await q("INSERT INTO weak_topics (user_id, topic, source) VALUES ($1,$2,'test_out')", [req.userId, t]);
    }
  }
  const results = test.questions.map((x: any, i: number) => ({ correct: x.answer, chosen: body.answers[i] ?? null, topic: x.topic }));
  res.json({
    passed, score, total: test.questions.length, pct, weakTopics,
    shortModuleDays: passed ? [] : m.days.filter((d) => weakDays.includes(d.day) && d.status !== "completed").map((d) => d.day),
    results,
  });
}));

// After a failed test-out: keep only the days covering weak parts.
miscRouter.post("/modules/:id/short", ah(async (req, res) => {
  await requireProfile(req.userId);
  const id = String(req.params.id);
  const m = (await moduleInfo(req.userId)).find((x) => x.id === id);
  if (!m || !m.lastTest || m.lastTest.passed) throw new HttpError(400, "Take the module test first.");
  const row = await one<{ test: any }>("SELECT test FROM modules WHERE id=$1", [id]);
  const weak = new Set(m.lastTest.weak);
  const weakDays = new Set<number>(row!.test.questions.filter((x: any) => weak.has(x.topic)).map((x: any) => x.day));
  const skipped: number[] = [];
  for (const d of m.days) {
    if (!weakDays.has(d.day) && d.status !== "completed" && d.status !== "skipped_tested") {
      await q(
        `INSERT INTO day_progress (user_id, day_number, status) VALUES ($1,$2,'skipped_tested')
         ON CONFLICT (user_id, day_number) DO UPDATE SET status='skipped_tested'`, [req.userId, d.day]);
      skipped.push(d.day);
    }
  }
  res.json({ skipped, keep: [...weakDays] });
}));

// ---------- DSA tracker ----------

miscRouter.get("/dsa", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const rows = await q(
    `SELECT pr.*, dp.status, dp.notes FROM dsa_problems pr
     LEFT JOIN dsa_progress dp ON dp.problem_id = pr.id AND dp.user_id = $1 ORDER BY pr.sort`, [req.userId]);
  const target = p.goal === "top" ? 300 : p.goal === "product" ? 200 : 150;
  res.json({ problems: rows, target, curatedGoal: 300 });
}));

miscRouter.put("/dsa/:id", ah(async (req, res) => {
  await requireProfile(req.userId);
  const body = z.object({ status: z.enum(["solved", "revisit"]).nullable(), notes: z.string().max(2000).optional() }).parse(req.body);
  const id = String(req.params.id);
  if (!body.status) {
    await q("DELETE FROM dsa_progress WHERE user_id=$1 AND problem_id=$2", [req.userId, id]);
  } else {
    await q(
      `INSERT INTO dsa_progress (user_id, problem_id, status, notes) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, problem_id) DO UPDATE SET status=$3, notes=COALESCE($4, dsa_progress.notes), updated_at=now()`,
      [req.userId, id, body.status, body.notes ?? null]);
  }
  res.json({ ok: true });
}));

// ---------- Interview prep ----------

miscRouter.get("/interview", ah(async (req, res) => {
  await requireProfile(req.userId);
  const checked = await q<{ item_id: string }>("SELECT item_id FROM interview_checks WHERE user_id=$1", [req.userId]);
  res.json({ sections: readContent("interview.json"), checked: checked.map((c) => c.item_id) });
}));

miscRouter.put("/interview/:id", ah(async (req, res) => {
  await requireProfile(req.userId);
  const { checked } = z.object({ checked: z.boolean() }).parse(req.body);
  if (checked) await q("INSERT INTO interview_checks (user_id, item_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.userId, req.params.id]);
  else await q("DELETE FROM interview_checks WHERE user_id=$1 AND item_id=$2", [req.userId, req.params.id]);
  res.json({ ok: true });
}));

// ---------- Progress log ----------

miscRouter.get("/log", ah(async (req, res) => {
  await requireProfile(req.userId);
  res.json(await q("SELECT id, day_number, log_date, done, hard, minutes FROM progress_log WHERE user_id=$1 ORDER BY log_date DESC, id DESC", [req.userId]));
}));

miscRouter.post("/log", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const body = z.object({
    day_number: z.number().int().min(1).optional(), done: z.string().min(1).max(2000),
    hard: z.string().max(2000).optional(), minutes: z.number().int().min(0).max(1440).optional(),
  }).parse(req.body);
  const st = await planState(p);
  await q("INSERT INTO progress_log (user_id, day_number, log_date, done, hard, minutes) VALUES ($1,$2,$3,$4,$5,$6)",
    [req.userId, body.day_number ?? st.currentDay ?? TOTAL_CONTENT_DAYS, today(), body.done, body.hard || null, body.minutes ?? null]);
  res.json({ ok: true });
}));

// Markdown export to share with Claude when writing the next content batch.
miscRouter.get("/log/export", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const st = await planState(p);
  const rows = await q("SELECT day_number, log_date, done, hard, minutes FROM progress_log WHERE user_id=$1 ORDER BY log_date, id", [req.userId]);
  const weak = await q("SELECT topic, source FROM weak_topics WHERE user_id=$1 AND resolved=false", [req.userId]);
  const tests = await q("SELECT kind, day_number, score, total FROM quiz_results WHERE user_id=$1 ORDER BY id", [req.userId]);
  let md = `# Progress log\n\nTrack: ${p.track_months} months, ${p.hours} hrs/day, ${dayName(p.rest_day)} off. Days done: ${st.doneCount}/${TOTAL_CONTENT_DAYS}. Current day: ${st.currentDay ?? "finished"}. Projected finish: ${pretty(st.projectedFinish)}.\n\n`;
  md += "| Date | Day | What was done | Where it was hard | Minutes |\n|---|---|---|---|---|\n";
  for (const r of rows) md += `| ${r.log_date} | ${r.day_number} | ${String(r.done).replace(/\n/g, " ")} | ${String(r.hard ?? "").replace(/\n/g, " ")} | ${r.minutes ?? ""} |\n`;
  md += `\n## Open weak topics\n\n${weak.length ? weak.map((w) => `- ${w.topic} (${w.source})`).join("\n") : "- none"}\n`;
  md += `\n## Quiz scores\n\n${tests.length ? tests.map((t) => `- Day ${t.day_number} ${t.kind}: ${t.score}/${t.total}`).join("\n") : "- none"}\n`;
  res.type("text/markdown").send(md);
}));

// ---------- Revision ----------

miscRouter.get("/revision", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const st = await planState(p);
  const weak = await q("SELECT id, topic, day_number, source, created_at FROM weak_topics WHERE user_id=$1 AND resolved=false ORDER BY id DESC", [req.userId]);
  const recent = await q(
    `SELECT c.day_number, c.title, c.data->'revision' AS revision, c.data->'learn'->'concepts' AS concepts
     FROM day_progress d JOIN content_days c ON c.day_number = d.day_number
     WHERE d.user_id=$1 AND d.status='completed' ORDER BY d.completed_at DESC LIMIT 3`, [req.userId]);
  const revisit = await q(
    `SELECT pr.id, pr.title, pr.url, pr.pattern FROM dsa_progress dp JOIN dsa_problems pr ON pr.id=dp.problem_id
     WHERE dp.user_id=$1 AND dp.status='revisit' ORDER BY dp.updated_at DESC LIMIT 5`, [req.userId]);
  res.json({ weak, recent, revisit, missedInARow: st.missedInARow });
}));

miscRouter.post("/weak/:id/resolve", ah(async (req, res) => {
  await requireProfile(req.userId);
  await q("UPDATE weak_topics SET resolved=true WHERE id=$1 AND user_id=$2", [Number(req.params.id), req.userId]);
  res.json({ ok: true });
}));
