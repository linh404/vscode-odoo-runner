const fs = require("fs");
const path = require("path");
const { applyWorkspaceSettings, getSettings, isValid } = require("../../infrastructure/runner-settings");
const { discoverModules, discoverModulesInPath, findCurrentAddonsPath } = require("../../core/module-discovery");
const { baseArgs, commandLine, legacyOdooRunCommandLine, testCommandLine } = require("../../core/command-builder");
const { writeLaunchConfigs } = require("../../infrastructure/launch-config");

function normalizeModules(value) {
  const modules = String(value || "")
    .split(",")
    .map((module) => module.trim())
    .filter(Boolean);
  return modules.length ? modules.join(",") : undefined;
}

class OdooRunner {
  constructor(vscode, workspace, terminal, onRefresh = () => {}, dependencies = {}) {
    this.vscode = vscode;
    this.workspace = workspace;
    this.terminal = terminal;
    this.onRefresh = onRefresh;
    this.fs = dependencies.fs || fs;
    this.path = dependencies.path || path;
  }

  settings() {
    return getSettings(this.vscode, this.workspace, this.fs);
  }

  modules(settings = this.settings()) {
    return discoverModules(settings, this.workspace.root(), (value) => this.workspace.expand(value), this.fs);
  }

  async ensureSettings() {
    const current = this.settings();
    if (isValid(current, this.fs)) return current;
    const setup = await this.vscode.window.showInformationMessage(
      "VDX Odoo Runner needs its paths configured.",
      "Configure",
      "Cancel",
    );
    if (setup !== "Configure" || !(await this.configure())) return null;
    const updated = this.settings();
    if (!isValid(updated, this.fs)) {
      this.vscode.window.showErrorMessage("Odoo Runner paths are still invalid. Check the workspace settings.");
      return null;
    }
    return updated;
  }

  async pickPath(label, candidates, filters) {
    const paths = [...new Set(candidates.filter(Boolean).map((candidate) => this.workspace.expand(candidate)).filter((candidate) => this.fs.existsSync(candidate)))];
    const items = paths.map((candidate) => ({ label: this.path.basename(candidate), description: candidate, path: candidate }));
    items.push({ label: "$(edit) Enter path manually...", description: "Use this if the path is not listed." });
    const picked = await this.vscode.window.showQuickPick(items, {
      title: label,
      placeHolder: paths.length ? "Select a detected path" : "No path detected; enter it manually",
      ignoreFocusOut: true,
    });
    if (!picked) return undefined;
    if (picked.path) return picked.path;
    const selected = await this.vscode.window.showOpenDialog({
      title: `Select ${label}`,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters,
    });
    if (selected?.[0]) return selected[0].fsPath;
    return this.vscode.window.showInputBox({ prompt: label, placeHolder: "${workspaceFolder}/...", ignoreFocusOut: true });
  }

  discoverOdooBins(root) {
    const candidates = [
      this.path.join(root, "..", "odoo", "odoo-bin"),
      this.path.join(root, "..", "..", "odoo", "odoo-bin"),
      this.path.join(root, "odoo", "odoo-bin"),
      this.path.join(root, "odoo-bin"),
    ];
    try {
      const parents = [this.path.dirname(root), this.path.dirname(this.path.dirname(root))];
      for (const parent of parents) {
        for (const entry of this.fs.readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) candidates.push(this.path.join(parent, entry.name, "odoo-bin"));
        }
      }
    } catch {
      // Keep standard candidates when a parent directory cannot be read.
    }
    return candidates;
  }

  discoverConfigs(root, odooBin) {
    const odooRoot = odooBin ? this.path.dirname(odooBin) : this.path.join(root, "..", "odoo");
    const configDir = this.path.join(odooRoot, "config");
    const candidates = [
      this.path.join(configDir, `${this.path.basename(root)}.conf`),
      this.path.join(configDir, "odoo.conf"),
    ];
    try {
      for (const entry of this.fs.readdirSync(configDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(conf|cfg)$/i.test(entry.name)) candidates.push(this.path.join(configDir, entry.name));
      }
    } catch {
      // The manual picker remains available when no config directory exists.
    }
    return candidates;
  }

  async configure() {
    const root = this.workspace.root();
    if (!root) {
      this.vscode.window.showErrorMessage("Open an Odoo project folder first.");
      return false;
    }
    const current = this.settings();
    const pythonPath = await this.pickPath("Python interpreter", [
      current.pythonPath,
      this.path.join(root, ".venv", "bin", "python"),
      this.path.join(root, "venv", "bin", "python"),
      this.path.join(root, ".venv", "Scripts", "python.exe"),
      this.path.join(root, "venv", "Scripts", "python.exe"),
    ], { Python: ["python", "python3"] });
    if (!pythonPath) return false;
    const odooBin = await this.pickPath("Odoo odoo-bin", [current.odooBin, ...this.discoverOdooBins(root)], { Odoo: ["odoo-bin"] });
    if (!odooBin) return false;
    const configPath = await this.pickPath("Odoo config", [current.configPath, ...this.discoverConfigs(root, this.workspace.expand(odooBin))], { Config: ["conf", "cfg"] });
    if (!configPath) return false;
    if (![pythonPath, odooBin, configPath].every((value) => this.fs.existsSync(this.workspace.expand(value)))) {
      this.vscode.window.showErrorMessage("One selected path does not exist. Run Configure Runner again and choose a detected file.");
      return false;
    }
    const database = await this.vscode.window.showInputBox({ prompt: "Default database (leave empty to ask each run)", value: current.database || "", ignoreFocusOut: true });
    if (database === undefined) return false;
    const devMode = await this.vscode.window.showQuickPick(["", "all", "reload", "xml", "werkzeug"], { placeHolder: "Select Odoo dev mode (empty is lightest)", canPickMany: false });
    if (devMode === undefined) return false;
    const cfg = this.vscode.workspace.getConfiguration("odooRunner", this.workspace.resource());
    const target = this.vscode.ConfigurationTarget.Workspace;
    await cfg.update("pythonPath", pythonPath, target);
    await cfg.update("odooBin", odooBin, target);
    await cfg.update("configPath", configPath, target);
    await cfg.update("database", database, target);
    await cfg.update("devMode", devMode, target);
    await applyWorkspaceSettings(this.vscode, this.workspace, { pythonPath, odooBin, disablePylance: current.disablePylance });
    await this.generateConfigs(this.settings());
    this.onRefresh();
    this.vscode.window.showInformationMessage("VDX Odoo Runner configured for this workspace.");
    return true;
  }

  async askDatabase(settings) {
    if (settings.database) return settings.database;
    return this.vscode.window.showInputBox({ prompt: "Database", placeHolder: "test-ttt", ignoreFocusOut: true });
  }

  async askModules(label, settings, kind) {
    if (kind !== "update") return normalizeModules(await this.vscode.window.showInputBox({ prompt: label, placeHolder: "sv_hr,sv_hr_contract", ignoreFocusOut: true }));
    const current = this.workspace.currentModule();
    const modules = this.modules(settings);
    const actions = [];
    if (current) actions.push({ label: "$(target) Current Module", description: `${current.name} — ${current.title}`, detail: current.path, action: "current" });
    if (modules.length) actions.push({ label: "$(list-selection) Select Modules", description: `${modules.length} module(s) detected from addons_path`, action: "select" });
    actions.push({ label: "$(edit) Enter Manually", description: "Type one or more comma-separated module names", action: "manual" });
    const action = await this.vscode.window.showQuickPick(actions, { title: label, placeHolder: "Choose how to select modules", ignoreFocusOut: true });
    if (!action) return undefined;
    if (action.action === "current") return current.name;
    if (action.action === "manual") return normalizeModules(await this.vscode.window.showInputBox({ prompt: label, placeHolder: "sv_hr,sv_hr_contract", ignoreFocusOut: true }));
    const selected = await this.vscode.window.showQuickPick(modules.map((module) => ({ label: module.name, description: module.title, detail: module.path, moduleName: module.name })), { title: "Select modules to update", placeHolder: "Select one or more modules", canPickMany: true, ignoreFocusOut: true });
    return selected?.length ? selected.map((module) => module.moduleName).join(",") : undefined;
  }

  async oneShot(kind, selectedModules) {
    const settings = await this.ensureSettings();
    if (!settings) return;
    const database = await this.askDatabase(settings);
    if (!database) return;
    const modules = normalizeModules(selectedModules) || await this.askModules(kind === "update" ? "Modules to update" : kind === "install" ? "Modules to install" : "Test module(s)", settings, kind);
    if (!modules) return;
    const extra = ["-d", database];
    if (kind === "update") extra.push("-u", modules);
    if (kind === "install") extra.push("-i", modules);
    if (kind === "test") extra.push("--test-enable", "--test-tags", modules);
    extra.push("--stop-after-init");
    this.terminal.showShell({ ...settings, database: "" }, `Odoo: ${kind}`, (kind === "test" ? testCommandLine : commandLine)({ ...settings, database: "" }, extra));
  }

  async run() {
    const settings = await this.ensureSettings();
    if (settings) this.terminal.showOdooRun(settings, legacyOdooRunCommandLine(settings));
  }

  async debug() {
    const settings = await this.ensureSettings();
    if (!settings) return;
    this.terminal.stop();
    const ok = await this.vscode.debug.startDebugging(this.workspace.folder(), {
      type: "debugpy", request: "launch", name: "Odoo: Debug", program: settings.odooBin, python: settings.pythonPath,
      cwd: settings.cwd || this.workspace.root(), args: baseArgs(settings), console: "integratedTerminal", justMyCode: false,
      env: { PYTHONUNBUFFERED: "1", PYTHONPATH: this.path.dirname(settings.odooBin) },
    });
    if (!ok) this.vscode.window.showErrorMessage("Could not start debugpy. Ensure the Python Debugger extension is installed.");
  }

  async updateAddonsFolder() {
    const settings = await this.ensureSettings();
    if (!settings) return;
    const addonsPath = findCurrentAddonsPath(settings, this.workspace.currentModule(), this.workspace.root(), (value) => this.workspace.expand(value), this.fs);
    if (!addonsPath) return this.vscode.window.showErrorMessage("Open a file inside an Odoo addon folder before updating it.");
    const modules = discoverModulesInPath(addonsPath, this.fs);
    if (!modules.length) return this.vscode.window.showErrorMessage(`No Odoo addons found in ${addonsPath}.`);
    const answer = await this.vscode.window.showWarningMessage(`Update all ${modules.length} addons in ${this.path.basename(addonsPath)}?`, "Update Addons", "Cancel");
    if (answer === "Update Addons") await this.oneShot("update", modules.map((module) => module.name).join(","));
  }

  async testCurrentModule() {
    const current = this.workspace.currentModule();
    if (!current) return this.vscode.window.showErrorMessage("Open a file inside an Odoo module before running its tests.");
    await this.oneShot("test", current.name);
  }

  async generateConfigs(settings) {
    const root = this.workspace.root();
    if (!root) return;
    const resolved = settings || await this.ensureSettings();
    if (!resolved) return;
    try {
      const result = writeLaunchConfigs(root, resolved, this.fs);
      if (!result.written && result.reason === "invalid-json") this.vscode.window.showWarningMessage("Existing launch.json is not valid JSON; it was not modified.");
    } catch (error) {
      this.vscode.window.showErrorMessage(`Could not write VS Code launch configuration. ${error.message || error}`);
    }
  }
}

module.exports = { OdooRunner, normalizeModules };
