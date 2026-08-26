const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getRuffSettings } = require("../../infrastructure/runner-settings");
const { discoverRuffConfigs } = require("../../core/module-discovery");
const { ruffCommandLine } = require("../../core/command-builder");

const execFileAsync = promisify(execFile);

class RuffRunner {
  constructor(vscode, workspace, terminal, onRefresh = () => {}, dependencies = {}) {
    this.vscode = vscode;
    this.workspace = workspace;
    this.terminal = terminal;
    this.onRefresh = onRefresh;
    this.fs = dependencies.fs || fs;
  }

  settings() {
    return getRuffSettings(this.vscode, this.workspace, this.fs);
  }

  async configure() {
    const root = this.workspace.root();
    if (!root) {
      this.vscode.window.showErrorMessage("Open an Odoo project folder first.");
      return false;
    }
    const current = this.settings();
    if (!current.pythonPath || !this.fs.existsSync(current.pythonPath)) {
      this.vscode.window.showErrorMessage("Configure a valid Python virtual environment before configuring Ruff.");
      return false;
    }
    const ruffPath = path.join(path.dirname(current.pythonPath), process.platform === "win32" ? "ruff.exe" : "ruff");
    try {
      const install = () => execFileAsync(current.pythonPath, ["-m", "pip", "install", "ruff"], { cwd: current.cwd || root, maxBuffer: 4 * 1024 * 1024 });
      if (this.vscode.window.withProgress) {
        await this.vscode.window.withProgress({ location: this.vscode.ProgressLocation?.Notification, title: "Installing Ruff in the project virtual environment...", cancellable: false }, install);
      } else {
        await install();
      }
    } catch (error) {
      const detail = String(error.stderr || error.message || "").trim().split("\n").slice(-3).join(" ");
      this.vscode.window.showErrorMessage(`Could not install Ruff. ${detail}`.trim());
      return false;
    }
    if (!this.fs.existsSync(ruffPath)) {
      this.vscode.window.showErrorMessage(`Ruff installation completed, but ${ruffPath} was not found.`);
      return false;
    }
    const configs = discoverRuffConfigs(root, this.workspace.currentModule()?.path, this.fs);
    const choices = [
      { label: "$(search) Let Ruff auto-detect configuration", description: "Use pyproject.toml, ruff.toml or .ruff.toml from the file hierarchy", path: "" },
      ...configs.map((configPath) => ({ label: path.basename(configPath), description: configPath, path: configPath })),
      { label: "$(edit) Choose another config file...", description: "Use an explicit Ruff configuration file", manual: true },
    ];
    const choice = await this.vscode.window.showQuickPick(choices, { title: "Ruff configuration", placeHolder: "Choose automatic discovery or an explicit config file", ignoreFocusOut: true });
    if (!choice) return false;
    let configPath = choice.path || "";
    if (choice.manual) {
      const selected = await this.vscode.window.showOpenDialog({ title: "Select Ruff configuration", canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { Ruff: ["toml"] } });
      if (selected?.[0]) configPath = selected[0].fsPath;
      else {
        const entered = await this.vscode.window.showInputBox({ prompt: "Ruff configuration path (leave empty for auto-detect)", placeHolder: "${workspaceFolder}/ruff.toml", ignoreFocusOut: true });
        if (entered === undefined) return false;
        configPath = this.workspace.expand(entered) || "";
      }
    }
    if (configPath && !this.fs.existsSync(configPath)) {
      this.vscode.window.showErrorMessage("The selected Ruff configuration does not exist.");
      return false;
    }
    const cfg = this.vscode.workspace.getConfiguration("odooRunner", this.workspace.resource());
    await cfg.update("ruffPath", ruffPath, this.vscode.ConfigurationTarget.Workspace);
    await cfg.update("ruffConfigPath", configPath, this.vscode.ConfigurationTarget.Workspace);
    this.onRefresh();
    this.vscode.window.showInformationMessage("Ruff configured for this workspace.");
    return true;
  }

  async check(scope) {
    const root = this.workspace.root();
    if (!root) return this.vscode.window.showErrorMessage("Open an Odoo project folder first.");
    const target = scope === "file" ? this.workspace.activeFilePath() : this.workspace.currentModule()?.path;
    const label = scope === "file" ? "Current File" : "Current Module";
    if (!target || !this.fs.existsSync(target)) return this.vscode.window.showErrorMessage(scope === "file" ? "Open and save a Python file before running Ruff." : "Open a file inside an Odoo module before running Ruff.");
    const settings = this.settings();
    this.terminal.showShell(settings, `Ruff: Check ${label}`, ruffCommandLine(settings, [target]));
  }
}

module.exports = { RuffRunner };
