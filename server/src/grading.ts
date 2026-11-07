import Anthropic from "@anthropic-ai/sdk";

// AI grading of explain-back answers: lenient on language, strict on understanding.

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export type Result = "clear" | "almost" | "not_yet";

export interface GradeOutput {
  result: Result;
  questions: { index: number; verdict: Result; feedback: string }[];
  followup_question: string | null;
  gap_explanation: string | null;
  weak_topics: string[];
}

const SYSTEM = `You grade "explain-back" answers for a beginner learning full stack web development. The learner built a small task, committed it to GitHub, and now explains their own code in their own words. Your job is to check whether they actually understand what they built.

How to grade:
- Be lenient on language and strict on understanding. Hinglish, mixed Hindi and English, spelling and grammar mistakes never cost marks. Wrong concepts do.
- Correctness: is the explanation technically right?
- Ownership: does it refer to the learner's own code (their file names, variable names, class names, the choices they made), or is it a generic textbook answer that could be about anyone's code?
- Depth: does it explain why, not only what?

Result levels:
- "clear": understands it. All answers are correct, specific to their code, and show the why.
- "almost": mostly right with one gap, or answers are correct but generic and don't match their own code. Ask exactly one follow-up question in followup_question that targets the gap.
- "not_yet": a key misunderstanding. Put a short, kind explanation of the gap in gap_explanation (teach the concept, don't hand over a solution to paste).

Copy-paste handling: read the learner's actual commit. Good follow-up questions point at specific lines, like "Line 14 uses a for loop. Why not forEach?" If the answers don't match the code, give "almost" plus a follow-up about a specific line. Never accuse the learner of cheating or of using AI.

Tone: encouraging, direct, short. Address the learner as "you". Feedback per question is one to three sentences.

weak_topics: short topic names (2-5 words, e.g. "CSS box model", "semantic HTML") for any concept they got wrong or vague. Empty when the result is clear.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["result", "questions", "followup_question", "gap_explanation", "weak_topics"],
  properties: {
    result: { type: "string", enum: ["clear", "almost", "not_yet"] },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "verdict", "feedback"],
        properties: {
          index: { type: "integer" },
          verdict: { type: "string", enum: ["clear", "almost", "not_yet"] },
          feedback: { type: "string" },
        },
      },
    },
    followup_question: { type: ["string", "null"] },
    gap_explanation: { type: ["string", "null"] },
    weak_topics: { type: "array", items: { type: "string" } },
  },
} as const;

export interface GradeInput {
  dayTitle: string;
  taskSummary: string;
  questions: { q: string; lookFor: string[] }[];
  answers: string[];
  commitText: string;
  followup?: { question: string; answer: string };
}

export class GradingError extends Error {}

export async function grade(input: GradeInput): Promise<GradeOutput> {
  const qa = input.questions
    .map((q, i) => `Question ${i + 1}: ${q.q}\nKey ideas a correct answer covers: ${q.lookFor.join("; ")}\nLearner's answer: ${input.answers[i]?.trim() || "(empty)"}`)
    .join("\n\n");

  let task = `Day: ${input.dayTitle}\nBuild task: ${input.taskSummary}\n\nThe learner's commit (added lines are numbered with their line number in the new file):\n<commit>\n${input.commitText}\n</commit>\n\n<explain_back>\n${qa}\n</explain_back>`;

  if (input.followup) {
    task += `\n\nYou previously graded this "almost" and asked a follow-up question.\nFollow-up question: ${input.followup.question}\nLearner's follow-up answer: ${input.followup.answer.trim() || "(empty)"}\n\nGrade again with the follow-up included. If the follow-up answer closes the gap, upgrade the result to "clear". If not, keep "almost" (with no new follow-up question, set followup_question to null) or use "not_yet" if it reveals a key misunderstanding.`;
  }

  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: task }],
    });

    if (response.stop_reason === "refusal") {
      throw new GradingError("The grader declined this request. Use self-assessment for this day.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new GradingError("The grader's reply was cut off. Please try again.");
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const out = JSON.parse(text) as GradeOutput;
    if (out.result !== "almost") out.followup_question = null;
    if (input.followup) out.followup_question = null; // only one follow-up per attempt
    return out;
  } catch (e) {
    if (e instanceof GradingError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new GradingError("The Anthropic API key is invalid. Check ANTHROPIC_API_KEY in server/.env.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new GradingError("The API key doesn't have access. Check your Anthropic Console billing and credits.");
    if (e instanceof Anthropic.RateLimitError) throw new GradingError("Too many grading requests right now. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) throw new GradingError(`The grading request was rejected: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new GradingError("Could not reach the Anthropic API. Check your internet connection.");
    if (e instanceof Anthropic.APIError) throw new GradingError(`Grading service error (${e.status}). Try again shortly.`);
    if (e instanceof SyntaxError) throw new GradingError("The grader returned an unreadable result. Please try again.");
    throw e;
  }
}
