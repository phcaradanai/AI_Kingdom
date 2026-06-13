/**
 * Validates commands against the runner allowlist before execution.
 * Pure function — no I/O, easy to test.
 *
 * Design: command + args are validated separately.
 * The allowlist is intersected with per-job allowedCommands if provided.
 * A command cannot WIDEN the global allowlist.
 */

export type CommandValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

type AllowedEntry = {
  command: string;
  // If undefined: all args are allowed for this command
  // If defined: args must satisfy this predicate
  argMatcher?: (args: string[]) => boolean;
};

/** Global hardcoded allowlist — never widened by per-job config */
export const GLOBAL_ALLOWLIST: AllowedEntry[] = [
  { command: "git", argMatcher: (args) => validateGitArgs(args) },
  { command: "npm", argMatcher: (args) => allowedNpmSubcommands(args) },
  { command: "ls" },
  {
    command: "cat",
    argMatcher: (args) => {
      // Only allow cat package.json — block cat .env, cat *.env, etc.
      if (args.length !== 1) return false;
      const target = (args[0] as string).toLowerCase();
      return target === "package.json" || target === "./package.json";
    }
  }
];

const allowedGitSubcommands = new Set(["status", "diff", "log", "show", "checkout", "add", "commit", "push"]);

/** Pattern for safe feature branch names: kingdom/job-<hex8>-<slug> */
const SAFE_BRANCH_PATTERN = /^kingdom\/job-[0-9a-f]{1,16}-[a-z0-9-]{1,50}$/;

/** Protected branches that must never be pushed to */
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "develop", "development", "release"]);

function isProtectedBranch(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_BRANCH_NAMES.has(lower) || lower.startsWith("release/") || lower.startsWith("hotfix/");
}

function validateGitArgs(args: string[]): boolean {
  const sub = args[0] ?? "INVALID";

  if (!allowedGitSubcommands.has(sub)) return false;

  switch (sub) {
    case "status":
    case "log":
      return true;

    case "diff":
      // Allow: git diff, git diff --stat, git diff HEAD, git diff <file>
      // Block: git diff with dangerous redirect patterns (caught by injection check)
      return args.length <= 3;

    case "show":
      return args.length <= 2;

    case "checkout": {
      // Must be: git checkout -b kingdom/job-<hex>-<slug>
      if (args[1] !== "-b") return false;
      const branch = args[2];
      if (!branch) return false;
      return SAFE_BRANCH_PATTERN.test(branch);
    }

    case "add": {
      // git add <file> or git add -A or git add .
      // Block path traversal — must not start with ../
      if (args.length < 2) return false;
      return args.slice(1).every((a) => !a.startsWith("../") && !a.startsWith("/") && a !== "--");
    }

    case "commit": {
      // Must be: git commit -m "<message>" — exactly 3 args
      if (args[1] !== "-m" || !args[2]) return false;
      const msg = args[2];
      // Message must not contain shell injection
      return !/[`$<>|;&]/.test(msg) && msg.length <= 200;
    }

    case "push": {
      // Must be: git push origin <safe-branch>
      // Block: --force, -f, --tags, --no-verify, main, master, develop, release*
      if (args[1] !== "origin") return false;
      const branch = args[2];
      if (!branch) return false;
      if (isProtectedBranch(branch)) return false;
      if (!SAFE_BRANCH_PATTERN.test(branch)) return false;
      // No extra flags allowed
      if (args.length > 3) return false;
      return true;
    }

    default:
      return false;
  }
}

function allowedNpmSubcommands(args: string[]): boolean {
  if (args.length === 0) return false;
  const sub = args[0] as string;
  // Allow: npm install (no extra args that could be --script-shell etc.)
  if (sub === "install" && args.length === 1) return true;
  // Allow: npm run <script> where script is in approved list
  if (sub === "run" && args.length === 2) {
    const script = args[1] as string;
    return APPROVED_ROOT_NPM_SCRIPTS.has(script);
  }
  if (sub === "run" && args.length === 4) {
    const script = args[1] as string;
    const workspaceFlag = args[2] as string;
    const workspace = args[3] as string;
    return APPROVED_NPM_SCRIPTS.has(script)
      && workspaceFlag === "--workspace"
      && APPROVED_NPM_WORKSPACES.has(workspace);
  }
  return false;
}

export const APPROVED_NPM_SCRIPTS = new Set([
  "typecheck",
  "test",
  "build",
  "lint"
]);

export const APPROVED_ROOT_NPM_SCRIPTS = new Set([
  "typecheck",
  "build",
  "lint"
]);

export const APPROVED_NPM_WORKSPACES = new Set([
  "@ai-kingdom/api",
  "@ai-kingdom/runner",
  "@ai-kingdom/web"
]);

/** Patterns that indicate shell injection regardless of command */
const SHELL_INJECTION_PATTERNS = [
  /[|&;`$<>]/,   // pipes, redirections, substitutions, semicolons
  /\$\(/,        // command substitution $(...)
  /`/,           // backtick substitution
  /&&/,          // AND chain
  /\|\|/         // OR chain
];

/** Blocked commands — checked before allowlist */
export const BLOCKED_COMMANDS = new Set([
  "rm", "rmdir", "del",
  "sudo", "su", "doas",
  "chmod", "chown", "chgrp",
  "curl", "wget", "fetch",
  "ssh", "scp", "sftp", "rsync",
  "docker", "docker-compose", "kubectl", "helm",
  "nc", "netcat", "nmap", "telnet",
  "env", "printenv", "export", "set",
  "bash", "sh", "zsh", "fish", "pwsh", "powershell",
  "python", "python3", "ruby", "perl", "node",
  "eval", "exec",
  "kill", "pkill", "killall",
  "cron", "crontab",
  "dd", "mkfs", "mount", "umount"
]);

export function validateCommand(command: string, args: string[], jobAllowedCommands?: string[]): CommandValidationResult {
  // 1. Reject empty command
  if (!command.trim()) {
    return { allowed: false, reason: "Empty command" };
  }

  // 2. Reject shell injection in command name or any arg
  const allParts = [command, ...args];
  for (const part of allParts) {
    for (const pattern of SHELL_INJECTION_PATTERNS) {
      if (pattern.test(part)) {
        return { allowed: false, reason: `Shell injection pattern detected in: ${part}` };
      }
    }
  }

  // 3. Reject blocked commands (binary name only, strip path)
  const binaryName = command.split("/").pop() ?? command;
  if (BLOCKED_COMMANDS.has(binaryName.toLowerCase())) {
    return { allowed: false, reason: `Command is blocked: ${binaryName}` };
  }

  // 4. Reject absolute paths pointing outside typical project tools
  if (command.startsWith("/") && !command.startsWith("/usr/") && !command.startsWith("/opt/")) {
    return { allowed: false, reason: `Absolute path not allowed: ${command}` };
  }

  // 5. If per-job allowedCommands specified, command must be in that list too
  if (jobAllowedCommands && jobAllowedCommands.length > 0) {
    if (!jobAllowedCommands.includes(binaryName)) {
      return { allowed: false, reason: `Command not in job allowedCommands: ${binaryName}` };
    }
  }

  // 6. Must match global allowlist (command + args)
  const entry = GLOBAL_ALLOWLIST.find((e) => e.command === binaryName);
  if (!entry) {
    return { allowed: false, reason: `Command not in global allowlist: ${binaryName}` };
  }

  if (entry.argMatcher && !entry.argMatcher(args)) {
    return { allowed: false, reason: `Args not permitted for ${binaryName}: ${args.join(" ")}` };
  }

  return { allowed: true };
}
