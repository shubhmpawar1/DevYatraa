import { Router } from "express";
import { z } from "zod";
import { one, q } from "../db.js";
import { addDays, dayName, diffDays, nextMonday, pretty, roughMonth, today } from "../dates.js";
import { ah, HttpError } from "../http.js";
import {
  getProfile, planState, projectFinish, recommendedTrack, TOTAL_CONTENT_DAYS, trackWarning, type Profile,
} from "../plan.js";

export const profileRouter = Router();

const HOURS_LABEL: Record<string, string> = { "1-2": "1–2 hrs/day", "3-4": "3–4 hrs/day", "5-6": "5–6 hrs/day", "7+": "7+ hrs/day" };
const TRACK_CHANGE_COOLDOWN_DAYS = 14;

const Answers = z.object({
  level: z.enum(["beginner", "some", "builder"]),
  hours: z.enum(["1-2", "3-4", "5-6", "7+"]),
  track_months: z.union([z.literal(6), z.literal(9), z.literal(12)]),
  background: z.enum(["student", "graduate", "professional"]),
  college_year: z.number().int().min(1).max(5).nullable().optional(),
  start: z.enum(["today", "tomorrow", "monday"]),
  rest_day: z.number().int().min(0).max(6),
  goal: z.enum(["any", "product", "top"]),
});
type AnswersT = z.infer<typeof Answers>;

function startDate(start: AnswersT["start"]): string {
  const t = today();
  if (start === "today") return t;
  if (start === "tomorrow") return addDays(t, 1);
  return nextMonday(t);
}

function summarize(a: { track_months: number; hours: string; rest_day: number }, start: string, finish: string): string {
  return `${a.track_months} months, ${HOURS_LABEL[a.hours]}, ${dayName(a.rest_day)} off, starts ${pretty(start).replace(/ \d{4}$/, "")}. Expected finish: ${roughMonth(finish)}.`;
}

function preview(a: AnswersT) {
  const start = startDate(a.start);
  const finish = projectFinish({ from: start, remaining: TOTAL_CONTENT_DAYS, track: a.track_months, restDay: a.rest_day });
  return {
    startDate: start,
    finish,
    finishPretty: pretty(finish),
    summary: summarize(a, start, finish),
    warning: trackWarning(a.track_months, a.hours),
    recommendedTrack: recommendedTrack(a.hours),
  };
}

profileRouter.post("/onboarding/preview", ah(async (req, res) => {
  res.json(preview(Answers.parse(req.body)));
}));

profileRouter.post("/onboarding", ah(async (req, res) => {
  const a = Answers.parse(req.body);
  const p = preview(a);
  await q(
    `INSERT INTO profiles (user_id, level, hours, track_months, background, college_year, start_date, rest_day, goal, original_finish)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id) DO UPDATE SET level=$2, hours=$3, track_months=$4, background=$5, college_year=$6,
       start_date=$7, rest_day=$8, goal=$9, original_finish=$10, updated_at=now()`,
    [req.userId, a.level, a.hours, a.track_months, a.background, a.background === "student" ? a.college_year ?? null : null,
      p.startDate, a.rest_day, a.goal, p.finish],
  );
  res.json(p);
}));

// ---------- Settings ----------

const SettingsPatch = z.object({
  level: z.enum(["beginner", "some", "builder"]).optional(),
  hours: z.enum(["1-2", "3-4", "5-6", "7+"]).optional(),
  track_months: z.union([z.literal(6), z.literal(9), z.literal(12)]).optional(),
  background: z.enum(["student", "graduate", "professional"]).optional(),
  college_year: z.number().int().min(1).max(5).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rest_day: z.number().int().min(0).max(6).optional(),
  goal: z.enum(["any", "product", "top"]).optional(),
});

async function requireProfile(userId: number): Promise<Profile> {
  const p = await getProfile(userId);
  if (!p) throw new HttpError(409, "Finish onboarding first.", { needsOnboarding: true });
  return p;
}

async function hasProgress(userId: number): Promise<boolean> {
  return Boolean(await one("SELECT 1 FROM day_progress WHERE user_id=$1 AND status <> 'open' LIMIT 1", [userId]));
}

function trackChangeAllowedFrom(p: Profile): string | null {
  if (!p.track_changed_at) return null;
  const changed = new Date(p.track_changed_at);
  const local = `${changed.getFullYear()}-${String(changed.getMonth() + 1).padStart(2, "0")}-${String(changed.getDate()).padStart(2, "0")}`;
  const next = addDays(local, TRACK_CHANGE_COOLDOWN_DAYS);
  return next > today() ? next : null;
}

profileRouter.get("/settings", ah(async (req, res) => {
  const p = await requireProfile(req.userId);
  const lockedUntil = trackChangeAllowedFrom(p);
  res.json({
    profile: p,
    trackLockedUntil: lockedUntil,
    trackLockedUntilPretty: lockedUntil ? pretty(lockedUntil) : null,
    startDateEditable: !(await hasProgress(req.userId)),
  });
}));

async function applyPatch(userId: number, body: unknown) {
  const p = await requireProfile(userId);
  const patch = SettingsPatch.parse(body);
  const next: Profile = { ...p, ...patch } as Profile;
  if (patch.start_date && patch.start_date !== p.start_date) {
    if (await hasProgress(userId)) throw new HttpError(400, "Start date can't change after you've completed a day.");
    if (patch.start_date < today()) throw new HttpError(400, "Start date can't be in the past.");
  }
  const trackChanged = patch.track_months !== undefined && patch.track_months !== p.track_months;
  if (trackChanged) {
    const locked = trackChangeAllowedFrom(p);
    if (locked) throw new HttpError(400, `You can change your track again on ${pretty(locked)}. Track changes are limited to once every 2 weeks.`);
  }
  const before = await planState(p);
  const after = await planState(next);
  return { p, next, trackChanged, before, after };
}

profileRouter.post("/settings/preview", ah(async (req, res) => {
  const { next, before, after } = await applyPatch(req.userId, req.body);
  res.json({
    currentFinish: before.projectedFinish,
    currentFinishPretty: pretty(before.projectedFinish),
    newFinish: after.projectedFinish,
    newFinishPretty: pretty(after.projectedFinish),
    deltaDays: diffDays(before.projectedFinish, after.projectedFinish),
    warning: trackWarning(next.track_months, next.hours),
  });
}));

profileRouter.put("/settings", ah(async (req, res) => {
  const { next, trackChanged, after } = await applyPatch(req.userId, req.body);
  // New settings become the new baseline: completed days stay, only remaining days are re-planned.
  await q(
    `UPDATE profiles SET level=$2, hours=$3, track_months=$4, background=$5, college_year=$6, start_date=$7,
       rest_day=$8, goal=$9, original_finish=$10, track_changed_at = CASE WHEN $11 THEN now() ELSE track_changed_at END,
       updated_at=now() WHERE user_id=$1`,
    [req.userId, next.level, next.hours, next.track_months, next.background,
      next.background === "student" ? next.college_year ?? null : null, next.start_date, next.rest_day, next.goal,
      after.projectedFinish, trackChanged],
  );
  res.json({ ok: true, finish: after.projectedFinish, finishPretty: pretty(after.projectedFinish) });
}));

profileRouter.post("/welcome-back", ah(async (req, res) => {
  await q("UPDATE profiles SET welcome_back_seen = $2 WHERE user_id = $1", [req.userId, today()]);
  res.json({ ok: true });
}));

export { requireProfile };
