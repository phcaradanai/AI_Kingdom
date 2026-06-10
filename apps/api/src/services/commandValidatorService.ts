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
  { command: "git", argMatcher: (args) => allowedGitSubcommands.has(args[0] ?? "INVALID") },
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

const allowedGitSubcommands = new Set(["status", "diff", "log", "show"]);

function allowedNpmSubcommands(args: string[]): boolean {
  if (args.length === 0) return false;
  const sub = args[0] as string;
  // Allow: npm install (no extra args that could be --script-shell etc.)
  if (sub === "install" && args.length === 1) return true;
  // Allow: npm run <script> where script is in approved list
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
