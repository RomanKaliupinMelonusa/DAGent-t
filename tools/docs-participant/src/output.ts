import * as vscode from "vscode";

let outputChannel: vscode.LogOutputChannel | undefined;

/** Initialise the shared output channel. Called once from activate(). */
export function initOutputChannel(): vscode.LogOutputChannel {
  outputChannel = vscode.window.createOutputChannel("@docs Participant", {
    log: true,
  });
  return outputChannel;
}

/** Get the shared output channel. Must be called after initOutputChannel(). */
export function getOutputChannel(): vscode.LogOutputChannel {
  if (!outputChannel) {
    throw new Error("@docs: output channel not initialised — activate() must run first");
  }
  return outputChannel;
}
