import type { TaskMode } from "@prisma/client";
import { extractDecreeFrame } from "./decreeFrameService.js";

export type ModeAdvice = {
  originalMode: TaskMode;
  correctedMode: TaskMode;
  reason: string;
};

// Question/explanation framing markers. If any match, the decree is an information
// request — the King wants an answer, not an execution plan. Veto any mode flip.
const QUESTION_FRAME_MARKERS = [
  // English interrogatives and explanation requests
  "explain", "describe", "tell me", "show me",
  "what is", "what are", "what's", "what should",
  "how do", "how does", "how to", "how can", "how should", "how would", "how will",
  // "why" only vetoes in question form; "investigate why X" is a research directive not a question
  "why is", "why are", "why does", "why do", "why can't", "why won't", "why?",
  "which ", "when should",
  // Thai explanation / question markers
  "อธิบาย", "บอกฉัน", "บอกว่า", "คืออะไร", "ทำงานอย่างไร",
  "อย่างไร", "ไหม", "หรือไม่", "หรือเปล่า", "ขอดู", "ช่วยอธิบาย"
];

function hasQuestionFraming(text: string): boolean {
  const lower = text.toLowerCase();
  return QUESTION_FRAME_MARKERS.some((marker) => lower.includes(marker));
}

// Maps decreeFrameService problemType → the TaskMode it signals.
// Only types that are unambiguously actionable (not INFORMATION_REQUEST or GENERAL_TASK).
const PROBLEM_TYPE_TO_MODE: Partial<Record<string, TaskMode>> = {
  PLAN_REQUEST: "PLAN",
  FEATURE_ADDITION: "BUILD",
  BUG_FIX: "BUILD",
  ARCHITECTURE_CHANGE: "BUILD",
  DIAGNOSIS: "RESEARCH"
};

function reasonFor(problemType: string): string {
  switch (problemType) {
    case "PLAN_REQUEST":
      return "decree signals planning intent — switched to PLAN mode for roadmap/milestone output";
    case "FEATURE_ADDITION":
      return "decree signals feature implementation — switched to BUILD mode";
    case "BUG_FIX":
      return "decree signals bug fix — switched to BUILD mode";
    case "ARCHITECTURE_CHANGE":
      return "decree signals structural change — switched to BUILD mode";
    case "DIAGNOSIS":
      return "decree signals investigative intent — switched to RESEARCH mode";
    default:
      return "mode auto-corrected based on decree intent";
  }
}

/**
 * Examines the King's decree and advises a mode correction when the selected mode
 * (ASK by default) does not match the decree's actual intent.
 *
 * Only corrects ASK → PLAN/BUILD/RESEARCH. PLAN/BUILD/RESEARCH are deliberate King
 * choices and are never overridden. Returns null when no correction is warranted.
 */
export function adviseModeCorrection(command: string, selectedMode: TaskMode): ModeAdvice | null {
  // ASK is the default; PLAN/BUILD/RESEARCH are explicit King choices — never override those.
  if (selectedMode !== "ASK") return null;

  // Veto: question/explanation framing means the King wants an answer, not execution.
  if (hasQuestionFraming(command)) return null;

  const frame = extractDecreeFrame(command, selectedMode);
  const suggestedMode = PROBLEM_TYPE_TO_MODE[frame.problemType];

  if (!suggestedMode || suggestedMode === selectedMode) return null;

  return {
    originalMode: selectedMode,
    correctedMode: suggestedMode,
    reason: reasonFor(frame.problemType)
  };
}
