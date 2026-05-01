/**
 * viz/render.ts — Pure renderers for DAG visualization.
 *
 * Extracted from scripts/viz-pipeline.ts so the renderers can be exercised
 * by the test runner (which scopes to src/**). The CLI wrapper handles
 * argv + compileApm + stdout.
 */

import type { ApmWorkflow, ApmWorkflowNode } from "../apm/index.js";

// ---------------------------------------------------------------------------
// Node styling
// ---------------------------------------------------------------------------

/** Returns the Mermaid node shape brackets as [open, close]. */
function mermaidShape(node: ApmWorkflowNode): [string, string] {
  if (node.type === "approval") return ["{{", "}}"];
  if (node.type === "triage") return [">", "]"];
  if (node.type === "script") return ["[/", "/]"];
  return ["[", "]"];
}

function nodeClass(node: ApmWorkflowNode): string {
  if (node.node_kind === "diagnostic") return "diagnostic";
  if (node.type === "triage") return "triage";
  if (node.type === "approval") return "approval";
  if (node.type === "script") return "script";
  return "agent";
}

function isHiddenFromScheduler(node: ApmWorkflowNode): boolean {
  return !node.triggers.includes("schedule");
}

function nodeLabel(key: string, node: ApmWorkflowNode): string {
  const badges: string[] = [];
  if (isHiddenFromScheduler(node)) badges.push("hidden");
  if (node.middleware) {
    const mode = node.middleware.mode === "replace" ? "=" : "+";
    badges.push(`mw${mode}${node.middleware.names.length}`);
  }
  if (node.salvage_survivor) badges.push("salvage");
  const suffix = badges.length > 0 ? `<br/><i>${badges.join(" · ")}</i>` : "";
  const typeTag = node.type === "agent" && node.agent ? node.agent : node.type;
  return `${key}<br/><small>${typeTag}</small>${suffix}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}

function qualify(wf: string, key: string): string {
  return `${sanitize(wf)}__${sanitize(key)}`;
}

// ---------------------------------------------------------------------------
// Mermaid renderer
// ---------------------------------------------------------------------------

export function renderMermaid(workflows: Record<string, ApmWorkflow>): string {
  const lines: string[] = ["flowchart TD"];
  lines.push("  classDef agent fill:#d4e4ff,stroke:#4a80d0,stroke-width:2px;");
  lines.push("  classDef script fill:#e7f5d4,stroke:#5a8a20,stroke-width:2px;");
  lines.push("  classDef triage fill:#ffe4d4,stroke:#d06a20,stroke-width:2px;");
  lines.push("  classDef approval fill:#f0e4ff,stroke:#8040d0,stroke-width:2px;");
  lines.push("  classDef diagnostic fill:#f5f5f5,stroke:#777,stroke-width:2px,stroke-dasharray: 5 5;");

  for (const [wfName, wf] of Object.entries(workflows)) {
    lines.push(`  subgraph ${sanitize(wfName)}["workflow: ${wfName}"]`);
    const keys = Object.keys(wf.nodes);
    for (const key of keys) {
      const node = wf.nodes[key];
      const [open, close] = mermaidShape(node);
      lines.push(`    ${qualify(wfName, key)}${open}"${nodeLabel(key, node)}"${close}`);
    }
    for (const key of keys) {
      for (const dep of wf.nodes[key].depends_on) {
        lines.push(`    ${qualify(wfName, dep)} --> ${qualify(wfName, key)}`);
      }
    }
    for (const key of keys) {
      const routes = wf.nodes[key].on_failure?.routes;
      if (!routes) continue;
      for (const [domain, target] of Object.entries(routes)) {
        if (!target || target === "$SELF") continue;
        if (!(target in wf.nodes)) continue;
        lines.push(`    ${qualify(wfName, key)} -.${domain}.-> ${qualify(wfName, target)}`);
      }
    }
    for (const key of keys) {
      lines.push(`    class ${qualify(wfName, key)} ${nodeClass(wf.nodes[key])};`);
    }
    lines.push(`  end`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// DOT renderer
// ---------------------------------------------------------------------------

function dotShape(node: ApmWorkflowNode): string {
  if (node.type === "approval") return "hexagon";
  if (node.type === "triage") return "house";
  if (node.type === "script") return "parallelogram";
  return "box";
}

function dotColor(node: ApmWorkflowNode): string {
  if (node.node_kind === "diagnostic") return "#f5f5f5";
  if (node.type === "triage") return "#ffe4d4";
  if (node.type === "approval") return "#f0e4ff";
  if (node.type === "script") return "#e7f5d4";
  return "#d4e4ff";
}

export function renderDot(workflows: Record<string, ApmWorkflow>): string {
  const lines: string[] = [
    "digraph pipeline {",
    "  rankdir=TB;",
    "  node [style=filled, fontname=Helvetica];",
  ];
  let clusterIdx = 0;
  for (const [wfName, wf] of Object.entries(workflows)) {
    lines.push(`  subgraph cluster_${clusterIdx++} {`);
    lines.push(`    label="workflow: ${wfName}";`);
    lines.push(`    style=rounded; color="#bbb";`);
    for (const [key, node] of Object.entries(wf.nodes)) {
      const id = qualify(wfName, key);
      const labelParts = [key, `[${node.type === "agent" && node.agent ? node.agent : node.type}]`];
      if (isHiddenFromScheduler(node)) labelParts.push("(hidden)");
      const dashed = node.node_kind === "diagnostic" ? ',style="filled,dashed"' : "";
      lines.push(
        `    "${id}" [label="${labelParts.join("\\n")}", shape=${dotShape(node)}, fillcolor="${dotColor(node)}"${dashed}];`,
      );
    }
    for (const [key, node] of Object.entries(wf.nodes)) {
      for (const dep of node.depends_on) {
        lines.push(`    "${qualify(wfName, dep)}" -> "${qualify(wfName, key)}";`);
      }
      const routes = node.on_failure?.routes;
      if (!routes) continue;
      for (const [domain, target] of Object.entries(routes)) {
        if (!target || target === "$SELF") continue;
        if (!(target in wf.nodes)) continue;
        lines.push(
          `    "${qualify(wfName, key)}" -> "${qualify(wfName, target)}" [label="${domain}", style=dotted, color=red];`,
        );
      }
    }
    lines.push(`  }`);
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}
