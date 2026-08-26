const fs = require("fs");
const { expandPath } = require("../core/path-utils");
const { findCurrentModule } = require("../core/module-discovery");

class WorkspaceContext {
  constructor(vscode, dependencies = {}) {
    this.vscode = vscode;
    this.fs = dependencies.fs || fs;
  }

  folder() {
    const activeUri = this.vscode.window.activeTextEditor?.document?.uri;
    return (activeUri && this.vscode.workspace.getWorkspaceFolder?.(activeUri)) ||
      this.vscode.workspace.workspaceFolders?.[0];
  }

  root() {
    return this.folder()?.uri.fsPath;
  }

  resource() {
    return this.folder()?.uri;
  }

  expand(value) {
    return expandPath(value, this.root());
  }

  activeFilePath() {
    const uri = this.vscode.window.activeTextEditor?.document?.uri;
    if (!uri || (uri.scheme && uri.scheme !== "file")) return undefined;
    return uri.fsPath;
  }

  currentModule() {
    return findCurrentModule(this.activeFilePath(), this.fs);
  }
}

module.exports = { WorkspaceContext };
