// Verifies GitHub commit links and fetches their diffs for explain-back grading.

const COMMIT_RE = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/commit\/([0-9a-f]{7,40})\/?(?:[?#].*)?$/i;

export interface ParsedCommit { owner: string; repo: string; sha: string }

export function parseCommitUrl(url: string): ParsedCommit | null {
  const m = url.trim().match(COMMIT_RE);
  return m ? { owner: m[1], repo: m[2], sha: m[3].toLowerCase() } : null;
}

export interface CommitInfo {
  verified: boolean;
  sha: string;
  message?: string;
  files?: { filename: string; status: string; patch?: string }[];
  reason?: string;
}

/** Diffs bigger than this are not sent to the grader; the grader is told which files were left out. */
const MAX_DIFF_CHARS = 150_000;

export async function fetchCommit(url: string): Promise<CommitInfo> {
  const p = parseCommitUrl(url);
  if (!p) return { verified: false, sha: "", reason: "Not a GitHub commit link. It should look like https://github.com/you/repo/commit/abc1234" };
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "jobready-dev-plan" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/commits/${p.sha}`, { headers });
    if (res.status === 404 || res.status === 422) {
      return { verified: false, sha: p.sha, reason: "GitHub could not find this commit. Is the repo public and the link correct?" };
    }
    if (!res.ok) {
      return { verified: false, sha: p.sha, reason: `GitHub returned ${res.status}. Try again in a few minutes (or set GITHUB_TOKEN to raise the rate limit).` };
    }
    const data: any = await res.json();
    return {
      verified: true,
      sha: String(data.sha).toLowerCase(),
      message: data.commit?.message,
      files: (data.files ?? []).map((f: any) => ({ filename: f.filename, status: f.status, patch: f.patch })),
    };
  } catch (e) {
    return { verified: false, sha: p.sha, reason: "Could not reach GitHub. Check your internet connection." };
  }
}

/** Formats a commit as text for the grader, with line numbers on added lines so questions can cite them. */
export function commitAsText(info: CommitInfo): string {
  if (!info.files?.length) return "(No file changes were available for this commit.)";
  let out = `Commit message: ${info.message ?? ""}\n\n`;
  const skipped: string[] = [];
  for (const f of info.files) {
    if (!f.patch) { skipped.push(`${f.filename} (binary or too large for GitHub to show)`); continue; }
    const block = `=== ${f.filename} (${f.status}) ===\n${numberPatch(f.patch)}\n\n`;
    if (out.length + block.length > MAX_DIFF_CHARS) { skipped.push(`${f.filename} (left out: diff too large)`); continue; }
    out += block;
  }
  if (skipped.length) out += `Files not shown: ${skipped.join(", ")}\n`;
  return out;
}

function numberPatch(patch: string): string {
  let newLine = 0;
  return patch
    .split("\n")
    .map((line) => {
      const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (h) { newLine = Number(h[1]); return line; }
      if (line.startsWith("-")) return `     ${line}`;
      const out = `${String(newLine).padStart(4)} ${line}`;
      newLine++;
      return out;
    })
    .join("\n");
}
