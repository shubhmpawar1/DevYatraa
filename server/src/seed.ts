// Applies the schema and loads content/*.json into the database. Safe to re-run after adding a new week.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, q } from "./db.js";
import { DAYS_PER_WEEK } from "./plan.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(here, "../../content");
const read = (f: string) => JSON.parse(readFileSync(path.join(contentDir, f), "utf8"));

async function main() {
  await pool.query(readFileSync(path.resolve(here, "../db/schema.sql"), "utf8"));

  const curriculum = read("curriculum.json");
  const phaseOfWeek = (w: number) =>
    curriculum.phases.find((p: any) => w >= p.weeks[0] && w <= p.weeks[1])?.phase ?? 1;

  const weekFiles = readdirSync(contentDir).filter((f) => /^week\d+\.json$/.test(f)).sort();
  let dayCount = 0;
  for (const f of weekFiles) {
    for (const d of read(f)) {
      const week = Math.ceil(d.day / DAYS_PER_WEEK);
      await q(
        `INSERT INTO content_days (day_number, week, phase, module_id, title, data)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (day_number) DO UPDATE SET week=$2, phase=$3, module_id=$4, title=$5, data=$6`,
        [d.day, week, phaseOfWeek(week), d.module, d.title, d],
      );
      dayCount++;
    }
  }

  for (const m of read("modules.json")) {
    await q(
      `INSERT INTO modules (id, title, phase, skippable, test) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET title=$2, phase=$3, skippable=$4, test=$5`,
      [m.id, m.title, m.phase, m.skippable, m.test ? JSON.stringify(m.test) : null],
    );
  }

  let sort = 0;
  for (const group of read("dsa.json")) {
    for (const [slug, title, difficulty] of group.problems) {
      await q(
        `INSERT INTO dsa_problems (id, title, pattern, difficulty, url, sort) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET title=$2, pattern=$3, difficulty=$4, url=$5, sort=$6`,
        [slug, title, group.pattern, difficulty, `https://leetcode.com/problems/${slug}/`, sort++],
      );
    }
  }

  console.log(`Seeded ${dayCount} content days, ${read("modules.json").length} modules, ${sort} DSA problems.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
