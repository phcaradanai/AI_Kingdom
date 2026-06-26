/**
 * HTTP client for communicating with the AI Kingdom API.
 * Uses RUNNER_TOKEN for all requests.
 */

import type { ImportedPatchStatus } from "./importedPatchStatus.js";
import type { RunnerExternalAgent, RunnerExternalAgentRun } from "./externalAgents/types.js";
export type { ImportedPatchStatus } from "./importedPatchStatus.js";

export interface ApiClientConfig {
  baseUrl: string;
  runnerToken: string;
}

export interface AutomationJob {
  id: string;
  workOrderId: string;
  projectId: string | null;
  agentId: string | null;
  runnerId: string | null;
  status: string;
  mode: string;
  commandPolicy: string | null;
  allowedCommands: string[];
  planJson: unknown;
  patchSummary: string | null;
  logsPreview: string | null;
  provenance: Record<string, unknown> | null;
  localDocumentSnapshotId?: string | null;
  repositorySnapshotId?: string | null;
  contextRequired?: boolean;
  contextValidationStatus?: string | null;
  contextValidationSummary?: Record<string, unknown> | null;
  importedPatch?: string | null;
  importedPatchStatus?: ImportedPatchStatus | null;
  workOrder: {
    id: string;
    title: string;
    status: string;
    projectId: string | null;
    assignedExternalAgentId?: string | null;
    assignedExternalAgent?: RunnerExternalAgent | null;
  };
  externalAgentRuns?: RunnerExternalAgentRun[];
  project: { id: string; name: string } | null;
  agent: { id: string; slug: string; name: string; title: string } | null;
}

export class ApiClient {
  private headers: Record<string, string>;

  constructor(private config: ApiClientConfig) {
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.runnerToken}`
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API ${method} ${path} failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async heartbeat(meta?: {
    version?: string;
    hostname?: string;
    agentCapabilities?: unknown;
    cliProbeResult?: import("./cliProbeRunner.js").CliProbeResult;
  }): Promise<{ pendingCliProbe?: { agentId: string; type: string } }> {
    return this.request("POST", "/api/runner/heartbeat", meta ?? {});
  }

  async claimJob(): Promise<{ job: AutomationJob | null }> {
    return this.request("POST", "/api/runner/jobs/claim", {});
  }

  async updateStatus(jobId: string, status: string, data?: { patchSummary?: string; logsPreview?: string; importedPatchStatus?: ImportedPatchStatus | null }): Promise<void> {
    await this.request("PATCH", `/api/runner/jobs/${jobId}/status`, { status, ...data });
  }

  async recordStep(jobId: string, step: {
    sequence: number;
    stepType: string;
    title: string;
    detail?: string | null;
    status: string;
    command?: string | null;
    args?: string[];
    output?: string | null;
    exitCode?: number | null;
    durationMs?: number | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.request("POST", `/api/runner/jobs/${jobId}/step`, step);
  }

  async markExternalAgentRunRunning(jobId: string, payload: { workspacePath: string; commandTemplate: string }): Promise<void> {
    await this.request("POST", `/api/runner/jobs/${jobId}/external-agent-run/running`, payload);
  }

  async completeExternalAgentRun(jobId: string, payload: {
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "NEEDS_REVIEW";
    outputText?: string | null;
    artifactPaths?: string[];
    logPath?: string | null;
    exitCode?: number | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.request("POST", `/api/runner/jobs/${jobId}/external-agent-run/complete`, payload);
  }

  async submitReport(jobId: string, report: {
    summary: string;
    filesChanged: string[];
    commandsRun: string[];
    testsRun: string[];
    testResult: string;
    errors: string[];
    decisionsMade: string[];
    remainingWork: string[];
    nextRecommendedAction?: string | null;
    rawOutput?: string | null;
    patchSummary?: string | null;
    logsPreview?: string | null;
    contextUsed?: Record<string, unknown> | null;
  }): Promise<void> {
    // The API caps each errors[] entry at 1000 chars; oversized validation/agent
    // failure strings would otherwise 400 the whole report. Truncate defensively.
    const capped = {
      ...report,
      errors: report.errors.map((e) => (e.length > 1000 ? `${e.slice(0, 997)}...` : e))
    };
    await this.request("POST", `/api/runner/jobs/${jobId}/report`, capped);
  }

  async submitPatchArtifact(jobId: string, payload: {
    title: string;
    summary: string;
    diffStat?: string | null;
    diffPreview?: string | null;
    fullPatch?: string | null;
    filesChanged: string[];
    validationResults?: Array<{ command: string; exitCode: number | null; durationMs: number; cwd?: string; stdout?: string; stderr?: string; output: string; success: boolean; timedOut?: boolean }>;
    branchName?: string | null;
  }): Promise<{ id: string }> {
    return this.request("POST", `/api/runner/jobs/${jobId}/patch-artifact`, payload);
  }

  async markBranchPushed(jobId: string, artifactId: string, branchName: string): Promise<void> {
    await this.request("POST", `/api/runner/jobs/${jobId}/patch-artifacts/${artifactId}/branch-pushed`, { branchName });
  }

  async getPatchArtifact(artifactId: string): Promise<{ validationStatus: string; riskLevel: string }> {
    return this.request("GET", `/api/runner/patch-artifacts/${artifactId}`);
  }

  async getRunnerSettings(): Promise<{
    allowBranchPush: boolean;
    allowPrCreate: boolean;
    requireFreshLocalContext: boolean;
    externalAgentBridgeEnabled: boolean;
    allowExternalAgentWrite: boolean;
    allowExternalAgentNetwork: boolean;
    allowExternalAgentBranchPush: boolean;
    allowExternalAgentPrCreate: boolean;
    allowExternalAgentDeploy: boolean;
    maxExternalAgentRuntimeSeconds: number;
    maxExternalAgentAutoRetries: number;
  }> {
    return this.request("GET", "/api/runner/settings");
  }
}
