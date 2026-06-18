import { GenericCliAdapter } from "./genericCliAdapter.js";

export class CodexAdapter extends GenericCliAdapter {
  override supportsCapability(capability: string): boolean {
    return ["coding", "implementation", "test generation", "bug fixing", "code review"].includes(capability.toLowerCase());
  }
}
