import { GenericCliAdapter } from "./genericCliAdapter.js";

export class ClaudeCodeAdapter extends GenericCliAdapter {
  override supportsCapability(capability: string): boolean {
    return ["coding", "implementation", "test fixing", "refactoring", "codebase understanding"].includes(capability.toLowerCase());
  }
}
