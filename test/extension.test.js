const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { expandPath, quoteUnix, quoteWindows } = require("../src/core/path-utils");
const { baseArgs, commandLine, legacyOdooRunCommandLine } = require("../src/core/command-builder");
const { discoverModulesInPath, findCurrentModule } = require("../src/core/module-discovery");
const { debugConfiguration, writeLaunchConfigs } = require("../src/infrastructure/launch-config");
const { normalizeModules } = require("../src/features/odoo/odoo-runner");
const { TerminalManager } = require("../src/infrastructure/terminal-manager");

const registeredCommands = [];
const vscodeStub = {
  EventEmitter: class {
    constructor() { this.event = () => {}; }
    fire() {}
    dispose() {}
  },
  ThemeIcon: class { constructor(name) { this.name = name; } },
  TreeItem: class { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } },
  TreeItemCollapsibleState: { None: 0, Expanded: 1 },
  ConfigurationTarget: { Workspace: 2 },
  commands: {
    registerCommand(name) {
      registeredCommands.push(name);
      return { dispose() {} };
    },
  },
  window: {
    createTreeView() { return { dispose() {} }; },
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration() { return { get() {}, update: async () => {} }; },
  },
};
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};
const extension = require("../src/extension");
const activationContext = { subscriptions: [] };
extension.activate(activationContext);
Module._load = originalLoad;
assert.strictEqual(registeredCommands.length, 15);
assert.strictEqual(activationContext.subscriptions.length, 18);
assert.ok(registeredCommands.includes("vdxOdooRunner.installCurrentModule"));

assert.deepStrictEqual(normalizeModules(" a, b, ,a "), "a,b,a");
assert.strictEqual(normalizeModules("  ,  "), undefined);
assert.deepStrictEqual(baseArgs({ configPath: "/tmp/odoo.conf", database: "demo", devMode: "reload" }), [
  "-c", "/tmp/odoo.conf", "-d", "demo", "--dev", "reload",
]);
assert.strictEqual(expandPath("${workspaceFolder}/.venv", "/workspace/project"), "/workspace/project/.venv");
assert.strictEqual(quoteUnix("/tmp/a file"), "'/tmp/a file'");
assert.strictEqual(quoteWindows("C:\\Odoo Project\\odoo-bin"), '"C:\\Odoo Project\\odoo-bin"');

const settings = {
  pythonPath: "/tmp/python",
  odooBin: "/tmp/odoo-bin",
  configPath: "/tmp/odoo.conf",
  database: "",
  devMode: "",
};
assert.ok(commandLine(settings).includes("/tmp/odoo-bin"));
assert.ok(legacyOdooRunCommandLine(settings).includes("/tmp/python"));

let commandTerminalOptions;
let commandTerminalText;
const commandTerminal = new TerminalManager(
  {
    window: {
      createTerminal(options) {
        commandTerminalOptions = options;
        return {
          show() {},
          sendText(command) { commandTerminalText = command; },
          dispose() {},
        };
      },
    },
  },
  { root: () => "/tmp" },
);
commandTerminal.showCommand({ cwd: "/tmp/project" }, "Ruff: Check Current Module", "ruff check module");
assert.deepStrictEqual(commandTerminalOptions, {
  name: "Ruff: Check Current Module",
  cwd: "/tmp/project",
});
assert.strictEqual(commandTerminalText, "ruff check module");
assert.deepStrictEqual(debugConfiguration({ ...settings, cwd: "/tmp" }, "Odoo: Debug"), {
  name: "Odoo: Debug",
  type: "debugpy",
  request: "launch",
  program: "/tmp/odoo-bin",
  python: "/tmp/python",
  cwd: "/tmp",
  args: ["-c", "/tmp/odoo.conf"],
  console: "integratedTerminal",
  justMyCode: false,
  env: { PYTHONUNBUFFERED: "1", PYTHONPATH: "/tmp" },
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vdx-odoo-runner-test-"));
const modulePath = path.join(tempRoot, "my_module");
fs.mkdirSync(modulePath);
fs.writeFileSync(path.join(modulePath, "__manifest__.py"), "{\"name\": \"My Module\"}\n");
assert.deepStrictEqual(discoverModulesInPath(tempRoot, fs), [{ name: "my_module", title: "My Module", path: modulePath }]);
assert.deepStrictEqual(findCurrentModule(path.join(modulePath, "models.py"), fs), { name: "my_module", title: "My Module", path: modulePath });
const launchResult = writeLaunchConfigs(tempRoot, { ...settings, cwd: tempRoot }, fs);
assert.strictEqual(launchResult.written, true);
const launch = JSON.parse(fs.readFileSync(path.join(tempRoot, ".vscode", "launch.json"), "utf8"));
assert.deepStrictEqual(launch.configurations.map((item) => item.name), ["Odoo: Run", "Odoo: Debug"]);
fs.rmSync(tempRoot, { recursive: true, force: true });

console.log("extension tests passed");
