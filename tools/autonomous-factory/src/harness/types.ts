/**
 * harness/types.ts — Minimal structural types for SDK session hooks.
 *
 * The SDK does not re-export hook signatures from its public entry point,
 * so we mirror just the shapes we need to stay decoupled from SDK internals.
 */

import type { ToolResultObject } from "@github/copilot-sdk";

export interface PreToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
}

export interface PreToolUseHookOutput {
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  modifiedArgs?: unknown;
  additionalContext?: string;
  suppressOutput?: boolean;
}

export interface PostToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
  toolResult: ToolResultObject;
}

export interface PostToolUseHookOutput {
  modifiedResult?: ToolResultObject;
  additionalContext?: string;
  suppressOutput?: boolean;
}

export interface SessionHooks {
  onPreToolUse?: (input: PreToolUseHookInput, invocation: { sessionId: string }) => PreToolUseHookOutput | void | Promise<PreToolUseHookOutput | void>;
  onPostToolUse?: (input: PostToolUseHookInput, invocation: { sessionId: string }) => PostToolUseHookOutput | void | Promise<PostToolUseHookOutput | void>;
}
