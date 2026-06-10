/**
 * Command validator for the runner sandbox.
 * Mirrors apps/api/src/services/commandValidatorService.ts — kept in sync manually.
 */

export type CommandValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

type AllowedEntry = {
  command: string;
  argMatcher?: (args: string[]) => boolean;
};

export const GLOBAL_ALLOWLIST: AllowedEntry[] = [
  { command: "git", argMatcher: (args) => validateGitArgs(args) },
  { command: "npm", argMatcher: (args) => allowedNpmSubcommands(args) },
  { command: "ls" },
  {
    command: "cat",
    argMatcher: (args) => {
      if (args.length !== 1) return false;
      const target = (args[0] as string).toLowerCase();
      return target === "package.json" || target === "./package.json";
    }
  }
];

const allowedGitSubcommands = new Set(["status", "diff", "log", "show", "checkout", "add", "commit", "push"]);

const SAFE_BRANCH_PATTERN = /^kingdom\/job-[0-9a-f]{1,16}-[a-z0-9-]{1,50}$/;
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "develop", "development", "release"]);

function isProtectedBranch(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_BRANCH_NAMES.has(lower) || lower.startsWith("release/") || lower.startsWith("hotfix/");
}

function validateGitArgs(args: string[]): boolean {
  const sub = args[0] ?? "INVALID";
  if (!allowedGitSubcommands.has(sub)) return false;

  switch (sub) {
    case "status": case "log": return true;
    case "diff": return args.length <= 3;
    case "show": return args.length <= 2;
    case "checkout": {
      if (args[1] !== "-b") return false;
      const branch = args[2];
      if (!branch) return false;
      return SAFE_BRANCH_PATTERN.test(branch);
    }
    case "add": {
      if (args.length < 2) return false;
      return args.slice(1).every((a) => !a.startsWith("../") && !a.startsWith("/") && a !== "--");
    }
    case "commit": {
      if (args[1] !== "-m" || !args[2]) return false;
      const msg = args[2];
      return !/[`$<>|;&]/.test(msg) && msg.length <= 200;
    }
    case "push": {
      if (args[1] !== "origin") return false;
      const branch = args[2];
      if (!branch || isProtectedBranch(branch)) return false;
      if (!SAFE_BRANCH_PATTERN.test(branch)) return false;
      if (args.length > 3) return false;
      return true;
    }
    default: return false;
  }
}

function allowedNpmSubcommands(args: string[]): boolean {
  if (args.length === 0) return false;
  const sub = args[0] as string;
  if (sub === "install" && args.length === 1) return true;
  if (sub === "run" && args.length === 2) {
    const script = args[1] as string;
    return APPROVED_NPM_SCRIPTS.has(script);
  }
  return false;
}

export const APPROVED_NPM_SCRIPTS = new Set([
  "typecheck",
  "test",
  "build",
  "lint"
]);

const SHELL_INJECTION_PATTERNS = [
  /[|&;`$<>]/,
  /\$\(/,
  /`/,
  /&&/,
  /\|\|/
];

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
  if (!command.trim()) {
    return { allowed: false, reason: "Empty command" };
  }

  const allParts = [command, ...args];
  for (const part of allParts) {
    for (const pattern of SHELL_INJECTION_PATTERNS) {
      if (pattern.test(part)) {
        return { allowed: false, reason: `Shell injection pattern detected in: ${part}` };
      }
    }
  }

  const binaryName = command.split("/").pop() ?? command;
  if (BLOCKED_COMMANDS.has(binaryName.toLowerCase())) {
    return { allowed: false, reason: `Command is blocked: ${binaryName}` };
  }

  if (command.startsWith("/") && !command.startsWith("/usr/") && !command.startsWith("/opt/")) {
    return { allowed: false, reason: `Absolute path not allowed: ${command}` };
  }

  if (jobAllowedCommands && jobAllowedCommands.length > 0) {
    if (!jobAllowedCommands.includes(binaryName)) {
      return { allowed: false, reason: `Command not in job allowedCommands: ${binaryName}` };
    }
  }

  const entry = GLOBAL_ALLOWLIST.find((e) => e.command === binaryName);
  if (!entry) {
    return { allowed: false, reason: `Command not in global allowlist: ${binaryName}` };
  }

  if (entry.argMatcher && !entry.argMatcher(args)) {
    return { allowed: false, reason: `Args not permitted for ${binaryName}: ${args.join(" ")}` };
  }

  return { allowed: true };
}
