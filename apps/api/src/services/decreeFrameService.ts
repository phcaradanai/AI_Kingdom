/**
 * Decree Frame Service
 *
 * Deterministic, zero-AI-call service that extracts a structured "problem frame"
 * from the King's raw decree before the council convenes. The frame is injected
 * into each specialist agent's user prompt so agents focus their analysis on the
 * right problem type and answer the key questions specific to this decree — rather
 * than having to infer the problem structure from unstructured prose alone.
 *
 * Three outputs:
 *   problemType  — category of work (BUG_FIX, FEATURE_ADDITION, etc.)
 *   domainSignals — system areas likely involved (auth, api-routes, database, …)
 *   keyQuestions  — 3 targeted questions this council should specifically address
 */

export type ProblemType =
  | "BUG_FIX"
  | "FEATURE_ADDITION"
  | "ARCHITECTURE_CHANGE"
  | "INFORMATION_REQUEST"
  | "DIAGNOSIS"
  | "GENERAL_TASK";

export type DecreeFrame = {
  problemType: ProblemType;
  domainSignals: string[];
  keyQuestions: string[];
};

// ── Problem type detection ───────────────────────────────────────────────────

const PROBLEM_PATTERNS: Array<{ type: ProblemType; score: number; keywords: string[] }> = [
  {
    type: "BUG_FIX",
    score: 3,
    keywords: ["fix", "bug", "broken", "crash", "error", "fails", "not working", "wrong output",
      "แก้บั๊ก", "บั๊ก", "ผิดพลาด", "ไม่ทำงาน", "ขัดข้อง", "แก้บัค", "บัค"]
  },
  {
    type: "FEATURE_ADDITION",
    score: 3,
    keywords: ["add", "create", "build", "implement", "new feature", "develop", "enable",
      "เพิ่ม", "สร้าง", "พัฒนา", "เปิดใช้งาน", "ทำฟีเจอร์", "ทำระบบ"]
  },
  {
    type: "ARCHITECTURE_CHANGE",
    score: 3,
    keywords: ["refactor", "rewrite", "redesign", "restructure", "migrate architecture", "overhaul",
      "ปรับโครงสร้าง", "รื้อ", "ออกแบบใหม่", "ปรับปรุงสถาปัตยกรรม"]
  },
  {
    type: "DIAGNOSIS",
    score: 3,
    keywords: ["investigate", "diagnose", "root cause", "trace", "why is", "what is causing",
      "วิเคราะห์สาเหตุ", "หาสาเหตุ", "ตรวจสอบสาเหตุ", "ทำไมถึง"]
  },
  {
    type: "INFORMATION_REQUEST",
    score: 2,
    keywords: ["how do", "what is", "explain", "understand", "show me", "describe", "what are",
      "อธิบาย", "คืออะไร", "ทำงานอย่างไร", "บอกฉัน", "ขอดู", "อยากรู้"]
  }
];

function detectProblemType(text: string): ProblemType {
  const lower = text.toLowerCase();
  const scores = new Map<ProblemType, number>();

  for (const pattern of PROBLEM_PATTERNS) {
    let s = 0;
    for (const kw of pattern.keywords) {
      if (lower.includes(kw)) s += pattern.score;
    }
    if (s > 0) scores.set(pattern.type, (scores.get(pattern.type) ?? 0) + s);
  }

  if (scores.size === 0) return "GENERAL_TASK";

  // Highest scoring wins; ties break in PROBLEM_PATTERNS order (first defined wins)
  let best: ProblemType = "GENERAL_TASK";
  let bestScore = 0;
  for (const pattern of PROBLEM_PATTERNS) {
    const s = scores.get(pattern.type) ?? 0;
    if (s > bestScore) { bestScore = s; best = pattern.type; }
  }
  return best;
}

// ── Domain signal detection ──────────────────────────────────────────────────

const DOMAIN_PATTERNS: Array<{ domain: string; keywords: string[] }> = [
  {
    domain: "auth",
    keywords: ["auth", "login", "logout", "password", "jwt", "token", "session", "permission", "role",
      "rbac", "credential", "ล็อกอิน", "สิทธิ์", "การยืนยันตัวตน", "รหัสผ่าน"]
  },
  {
    domain: "api-routes",
    keywords: ["api", "endpoint", "route", "controller", "middleware", "rest", "request", "response",
      "handler", "http", "get ", "post ", "put ", "delete ", "patch "]
  },
  {
    domain: "database",
    keywords: ["database", " db", "schema", "migration", "model", "table", "prisma", "query", "sql",
      "ฐานข้อมูล", "ตาราง", "สคีมา"]
  },
  {
    domain: "frontend-ui",
    keywords: ["ui", "component", "react", "page", "layout", "view", "form", "button", "modal",
      "frontend", "vite", "หน้า", "ส่วนหน้า", "หน้าจอ", "ปุ่ม"]
  },
  {
    domain: "testing",
    keywords: ["test", "spec", "coverage", "unit test", "integration test", "typecheck", "jest",
      "ทดสอบ", "test case", "ทดสอบระบบ"]
  },
  {
    domain: "security",
    keywords: ["security", "rate limit", "vulnerab", "sanitize", "xss", "injection", "csrf",
      "ความปลอดภัย", "ช่องโหว่", "จำกัดอัตรา"]
  },
  {
    domain: "performance",
    keywords: ["cache", "performance", "optimiz", "speed", "latency", "slow", "memory", "load",
      "ประสิทธิภาพ", "แคช", "ความเร็ว"]
  }
];

function detectDomains(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const { domain, keywords } of DOMAIN_PATTERNS) {
    if (keywords.some((kw) => lower.includes(kw))) matched.push(domain);
  }
  return matched.slice(0, 4); // cap to keep frame concise
}

// ── Key question matrix ──────────────────────────────────────────────────────
// Each entry: (problemType, mode) → 3 targeted questions the council should address.
// "default" is the fallback for any mode not explicitly listed.

const KEY_QUESTIONS: Record<ProblemType, Record<string, string[]>> = {
  BUG_FIX: {
    BUILD: [
      "Where exactly does the failure occur — which file, function, or data path is the root cause?",
      "What is the minimal change that resolves it without affecting adjacent behavior?",
      "What validation command or test would confirm the fix?"
    ],
    default: [
      "What is the exact symptom — what breaks, when, and under what conditions?",
      "What prior change or interaction likely introduced this?",
      "What is a safe diagnostic step that reveals the root cause without worsening the situation?"
    ]
  },
  FEATURE_ADDITION: {
    BUILD: [
      "What existing interfaces, types, and files does this feature extend or depend on?",
      "What are the key edge cases, failure modes, and permission checks this feature must handle?",
      "What is the exact change set — which files to create or edit, and what new behavior do they get?"
    ],
    PLAN: [
      "What is the end state — what will be demonstrably true when this feature is complete?",
      "What dependencies exist and what must be built or decided first?",
      "What are the riskiest assumptions that must be validated before committing to this approach?"
    ],
    default: [
      "What does success look like for this feature, and what is explicitly out of scope?",
      "What existing system behavior does this feature interact with or change?",
      "What are the key tradeoffs between the available implementation approaches?"
    ]
  },
  ARCHITECTURE_CHANGE: {
    BUILD: [
      "What is the full scope — which files, interfaces, and API contracts change?",
      "What is the migration path for existing callers or data that depend on the current structure?",
      "What is the phased implementation order to avoid leaving the system in a broken intermediate state?"
    ],
    PLAN: [
      "What problem does this architecture change solve that the current design cannot?",
      "What changes and what explicitly stays the same — where is the scope boundary?",
      "How should the transition be sequenced to allow incremental validation at each phase?"
    ],
    default: [
      "What is driving this change and what constraints bound the new design?",
      "What breaks for existing code, callers, or data if this change is made?",
      "What is a safe, reversible first step to validate the new direction before full commitment?"
    ]
  },
  INFORMATION_REQUEST: {
    ASK: [
      "What specific decision or concern is the King trying to resolve with this question?",
      "What known system constraints or prior Kingdom decisions limit the available answers?",
      "What are the key tradeoffs the King needs to weigh before acting?"
    ],
    default: [
      "What is the core question and what context is needed to answer it precisely?",
      "What relevant Kingdom patterns, prior decisions, or code already bears on this?",
      "What recommendation or output format does the King expect?"
    ]
  },
  DIAGNOSIS: {
    BUILD: [
      "What is the observable symptom, and what evidence points most directly to the root cause?",
      "Which system boundaries, service interactions, or data paths could be involved?",
      "What data, log output, or targeted test would confirm or rule out the leading hypothesis?"
    ],
    default: [
      "What is the failure pattern — consistent, intermittent, or triggered by specific conditions?",
      "What changed recently that could have introduced this behavior?",
      "What is safe to investigate first without risking further system impact?"
    ]
  },
  GENERAL_TASK: {
    BUILD: [
      "What existing code is directly affected by this task?",
      "What are the acceptance criteria — what must be true for this task to be complete?",
      "What is the risk level and what validation command confirms success?"
    ],
    ASK: [
      "What is the core question or problem the King needs resolved?",
      "What relevant context from the codebase or prior decisions bears on this?",
      "What recommendation or output does the King expect?"
    ],
    default: [
      "What is the specific objective and what would a complete, correct result look like?",
      "What constraints or prior decisions bound the approach?",
      "What is the single most important thing to get right here?"
    ]
  }
};

function getKeyQuestions(problemType: ProblemType, mode: string): string[] {
  const byType = KEY_QUESTIONS[problemType];
  return byType[mode] ?? byType.default ?? KEY_QUESTIONS.GENERAL_TASK.default!;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function extractDecreeFrame(command: string, mode: string): DecreeFrame {
  const normalizedMode = (mode ?? "").toUpperCase();
  const problemType = detectProblemType(command);
  const domainSignals = detectDomains(command);
  const keyQuestions = getKeyQuestions(problemType, normalizedMode);
  return { problemType, domainSignals, keyQuestions };
}

export function buildDecreeFrameSection(frame: DecreeFrame): string {
  const lines: string[] = [
    `## Decree Analysis`,
    `Problem type: ${frame.problemType.replace(/_/g, " ")}`,
    frame.domainSignals.length > 0 ? `Domain signals: ${frame.domainSignals.join(", ")}` : "",
    `Key council questions:`,
    ...frame.keyQuestions.map((q, i) => `${i + 1}. ${q}`)
  ];
  return lines.filter(Boolean).join("\n");
}
