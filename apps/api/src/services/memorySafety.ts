const RAW_REASONING_PATTERNS = [
  /raw\s+(chain[-\s]?of[-\s]?thought|reasoning|scratchpad)/i,
  /chain[-\s]?of[-\s]?thought/i,
  /internal\s+(monologue|reasoning|scratchpad)/i,
  /private\s+(reasoning|scratchpad|thoughts)/i,
  /<think>[\s\S]*?<\/think>/i,
  /\bthought\s+process\b/i,
  /\breasoning\s+trace\b/i
];

export function containsRawReasoning(value: string): boolean {
  return RAW_REASONING_PATTERNS.some((pattern) => pattern.test(value));
}

export function isForbiddenMemoryContent(title: string, content: string): boolean {
  return containsRawReasoning(title) || containsRawReasoning(content);
}
