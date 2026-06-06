import { env } from "../config/env.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AIProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}

export class OpenAICompatibleProvider implements AIProvider {
  async complete(messages: ChatMessage[]): Promise<string> {
    if (!env.OPENAI_API_KEY) {
      return localFallback(messages);
    }

    const response = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages,
        temperature: 0.35
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI provider error ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return payload.choices?.[0]?.message?.content?.trim() || "The council could not produce a response.";
  }
}

function localFallback(messages: ChatMessage[]): string {
  const system = messages.find((message) => message.role === "system")?.content.toLowerCase() ?? "";
  const user = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  if (system.includes("grand vizier")) {
    return `Grand Vizier decree: convene the most relevant council members, align on immediate priorities, and preserve this command in kingdom memory. Final counsel: ${user.slice(0, 240)}`;
  }

  if (system.includes("architect")) {
    return "Architecture counsel: define clear service boundaries, protect type contracts between web and API, keep persistence explicit through Prisma, and ship the smallest complete workflow before expanding integrations.";
  }

  if (system.includes("general")) {
    return "Execution counsel: split the campaign into discovery, build, verification, launch, and iteration milestones with one accountable owner and measurable exit criteria for each stage.";
  }

  if (system.includes("researcher")) {
    return "Research counsel: validate assumptions with current sources, document unknowns, and distinguish evidence from strategic inference before committing resources.";
  }

  if (system.includes("treasurer")) {
    return "Treasury counsel: track implementation cost, recurring AI spend, infrastructure spend, and expected ROI so the kingdom can choose the highest-leverage work first.";
  }

  return `Council response: ${user}`;
}

export const aiProvider = new OpenAICompatibleProvider();
