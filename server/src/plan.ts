import { q, one } from "./db.js";
import { addDays, diffDays, maxDate, today, weekday } from "./dates.js";

/** The curriculum is written as 26 weeks x 6 working days at the 6-month pace. */
export const TOTAL_CONTENT_DAYS = 156;
export const DAYS_PER_WEEK = 6;

export type Track = 6 | 9 | 12;
export type Hours = "1-2" | "3-4" | "5-6" | "7+";

/** Content days covered per working day. Longer tracks keep the same content, less per day. */
export function pace(track: number): number {
  if (track === 6) return 1;
  if (track === 9) return 2 / 3;
  return 1 / 2;
}

/** Hours needed per day for each track, per the BRD's track table. */
const TRACK_HOURS: Record<number, Hours[]> = {
  6: ["7+", "5-6"],
  9: ["7+", "5-6", "3-4"],
  12: ["7+", "5-6", "3-4", "1-2"],
};

export function trackWarning(track: number, hours: string): string | null {
  if (!TRACK_HOURS[track]?.includes(hours as Hours)) {
    const need = track === 6 ? "6–8" : track === 9 ? "3–4" : "1–2";
    return `The ${track}-month track needs about ${need} hours a day. With ${hours} hours, a longer track is more realistic.`;
  }
  if (track === 6 && hours === "5-6") {
    return "The 6-month track is designed for 6–8 hours a day. 5–6 hours will be tight; expect some pushed days.";
  }
  return null;
}

export function recommendedTrack(hours: string): Track {
  if (hours === "7+") return 6;
  if (hours === "1-2") return 12;
  return 9;
}

export function isWorkingDay(date: string, restDay: number): boolean {
  return weekday(date) !== restDay;
}

/** Date of the n-th working day (1-based) counting from `from` inclusive. */
export function nthWorkingDay(from: string, n: number, restDay: number): string {
  let d = from;
  let count = 0;
  for (;;) {
    if (isWorkingDay(d, restDay)) {
      count++;
      if (count >= n) return d;
    }
    d = addDays(d, 1);
  }
}

export function workingDaysNeeded(remainingContentDays: number, track: number): number {
  return Math.max(0, Math.ceil(remainingContentDays / pace(track) - 1e-9));
}

export function projectFinish(opts: { from: string; remaining: number; track: number; restDay: number }): string {
  const n = workingDaysNeeded(opts.remaining, opts.track);
  if (n === 0) return opts.from;
  return nthWorkingDay(opts.from, n, opts.restDay);
}

export interface Profile {
  user_id: number;
  level: string;
  hours: string;
  track_months: number;
  background: string;
  college_year: number | null;
  start_date: string;
  rest_day: number;
  goal: string;
  original_finish: string;
  track_changed_at: string | null;
  welcome_back_seen: string | null;
}

export async function getProfile(userId: number): Promise<Profile | undefined> {
  return one<Profile>("SELECT * FROM profiles WHERE user_id = $1", [userId]);
}

export interface PlanState {
  doneCount: number;
  remaining: number;
  currentDay: number | null;   // next day to work on
  projectedFinish: string;
  originalFinish: string;
  finishMovedBy: number;       // calendar days later than the baseline (negative = earlier)
  missedInARow: number;        // working days with no completion since last completion
  showWelcomeBack: boolean;
  notStartedYet: boolean;
  streak: number;
  completedToday: boolean;
}

/** Recomputes the plan from progress. Completed days are never touched; only remaining days move. */
export async function planState(profile: Profile): Promise<PlanState> {
  const t = today();
  const rows = await q<{ day_number: number; status: string; completed_on: string | null }>(
    "SELECT day_number, status, completed_on FROM day_progress WHERE user_id = $1 AND status IN ('completed','skipped_tested')",
    [profile.user_id],
  );
  const done = new Set(rows.map((r) => r.day_number));
  let currentDay: number | null = null;
  for (let i = 1; i <= TOTAL_CONTENT_DAYS; i++) {
    if (!done.has(i)) { currentDay = i; break; }
  }
  const doneCount = done.size;
  const remaining = TOTAL_CONTENT_DAYS - doneCount;
  const completedToday = rows.some((r) => r.status === "completed" && r.completed_on === t);

  // Work starts today unless today's work is already done (then tomorrow), and never before Day 1's date.
  const from = maxDate(profile.start_date, completedToday ? addDays(t, 1) : t);
  const projectedFinish = projectFinish({ from, remaining, track: profile.track_months, restDay: profile.rest_day });

  // Missed days: working days strictly between the last completion (or the day before start) and today.
  const lastDone = rows
    .filter((r) => r.status === "completed" && r.completed_on)
    .map((r) => r.completed_on as string)
    .sort()
    .pop();
  const anchor = lastDone ?? addDays(profile.start_date, -1);
  let missedInARow = 0;
  if (t > profile.start_date || lastDone) {
    for (let d = addDays(anchor, 1); d < t; d = addDays(d, 1)) {
      if (isWorkingDay(d, profile.rest_day)) missedInARow++;
    }
  }

  return {
    doneCount,
    remaining,
    currentDay,
    projectedFinish,
    originalFinish: profile.original_finish,
    finishMovedBy: diffDays(profile.original_finish, projectedFinish),
    missedInARow,
    showWelcomeBack: missedInARow >= 5 && profile.welcome_back_seen !== t,
    notStartedYet: t < profile.start_date,
    streak: await streak(profile),
    completedToday,
  };
}

/** Consecutive working days (rest days skipped) with at least one verified GitHub commit. */
export async function streak(profile: Profile): Promise<number> {
  const rows = await q<{ commit_date: string }>(
    "SELECT DISTINCT commit_date FROM commits WHERE user_id = $1 AND verified = true",
    [profile.user_id],
  );
  const dates = new Set(rows.map((r) => r.commit_date));
  let d = today();
  // Today not done yet doesn't break the streak.
  if (!dates.has(d)) d = addDays(d, -1);
  let count = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (!isWorkingDay(d, profile.rest_day)) { d = addDays(d, -1); continue; }
    if (!dates.has(d)) break;
    count++;
    d = addDays(d, -1);
  }
  return count;
}

export function weekOf(day: number): number {
  return Math.ceil(day / DAYS_PER_WEEK);
}

export function aiLevel(day: number): { level: "no_ai" | "review_only"; label: string } {
  return weekOf(day) <= 8
    ? { level: "no_ai", label: "No AI this week. Write every line yourself." }
    : { level: "review_only", label: "AI allowed only for review and explanation, never for writing code." };
}
