const vscode = require("vscode");
const { WorkspaceContext } = require("./infrastructure/workspace-context");
const { TerminalManager } = require("./infrastructure/terminal-manager");
const { OdooRunner } = require("./features/odoo/odoo-runner");
const { RuffRunner } = require("./features/ruff/ruff-runner");
const { RunnerTreeProvider } = require("./ui/runner-tree-provider");

function activate(context) {
  const workspace = new WorkspaceContext(vscode);
  const terminal = new TerminalManager(vscode, workspace);
  let provider;
  const refresh = () => provider?.refresh();
  const odoo = new OdooRunner(vscode, workspace, terminal, refresh);
  const ruff = new RuffRunner(vscode, workspace, terminal, refresh, { configureRunner: () => odoo.configure() });
  const commands = {
    "vdxOdooRunner.setup": () => odoo.configure(),
    "vdxOdooRunner.run": () => odoo.run(),
    "vdxOdooRunner.debug": () => odoo.debug(),
    "vdxOdooRunner.updateModule": () => odoo.oneShot("update"),
    "vdxOdooRunner.updateAddonsFolder": () => odoo.updateAddonsFolder(),
    "vdxOdooRunner.installModule": () => odoo.oneShot("install"),
    "vdxOdooRunner.installCurrentModule": () => odoo.installCurrentModule(),
    "vdxOdooRunner.testModule": () => odoo.oneShot("test"),
    "vdxOdooRunner.testCurrentModule": () => odoo.testCurrentModule(),
    "vdxOdooRunner.generateConfigs": () => odoo.generateConfigs(),
    "vdxOdooRunner.updateSelectedModule": (moduleName) => odoo.oneShot("update", moduleName),
    "vdxOdooRunner.refreshModules": refresh,
    "vdxOdooRunner.configureRuff": () => ruff.configure(),
    "vdxOdooRunner.ruffCheckCurrentFile": () => ruff.check("file"),
    "vdxOdooRunner.ruffCheckCurrentModule": () => ruff.check("module"),
  };
  for (const [name, handler] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(name, handler));
  provider = new RunnerTreeProvider(vscode, odoo, ruff);
  context.subscriptions.push(provider);
  context.subscriptions.push(vscode.window.createTreeView("vdxOdooRunner.panel", { treeDataProvider: provider, showCollapseAll: false }));
  context.subscriptions.push({ dispose: () => terminal.dispose() });
}

function deactivate() {}

module.exports = { activate, deactivate };
