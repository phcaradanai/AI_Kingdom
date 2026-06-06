import { env } from "../config/env.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      providerId: "openai",
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      defaultModel: env.OPENAI_MODEL
    });
  }
}
