const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

let runTerminal;
let runnerProvider;
let terminalGeneration = 0;

function rootPath() {
  return workspaceFolder()?.uri.fsPath;
}

function workspaceFolder() {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  return (activeUri && vscode.workspace.getWorkspaceFolder?.(activeUri)) ||
    vscode.workspace.workspaceFolders?.[0];
}

function workspaceResource() {
  return workspaceFolder()?.uri;
}

function expand(value) {
  if (!value) return value;
  const root = rootPath() || process.cwd();
  const expanded = value
    .replace(/\$\{workspaceFolder\}/g, root)
    .replace(/\$\{workspaceFolderBasename\}/g, path.basename(root))
    .replace(/^~(?=$|[\\/])/, process.env.HOME || process.env.USERPROFILE || "")
    .trim();
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
}

function settings() {
  const cfg = vscode.workspace.getConfiguration("odooRunner", workspaceResource());
  const root = rootPath();
  const configuredPython = expand(cfg.get("pythonPath"));
  const configuredOdooBin = expand(cfg.get("odooBin"));
  const configuredConfig = expand(cfg.get("configPath"));
  const pythonPath = [
    configuredPython,
    root && path.join(root, ".venv", "bin", "python"),
    root && path.join(root, ".venv", "Scripts", "python.exe"),
    root && path.join(root, "venv", "Scripts", "python.exe"),
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const odooBin = [
    configuredOdooBin,
    root && path.join(root, "..", "odoo", "odoo-bin"),
    root && path.join(root, "odoo-bin"),
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const odooRoot = odooBin ? path.dirname(odooBin) : undefined;
  const configPath = [
    configuredConfig,
    odooRoot && path.join(odooRoot, "config", `${root ? path.basename(root) : "odoo"}.conf`),
    odooRoot && path.join(odooRoot, "config", "odoo.conf"),
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const configuredCwd = expand(cfg.get("cwd"));
  return {
    pythonPath,
    odooBin,
    configPath,
    database: cfg.get("database", ""),
    devMode: cfg.get("devMode", ""),
    cwd: configuredCwd && fs.existsSync(configuredCwd) ? configuredCwd : rootPath(),
    disablePylance: cfg.get("disablePylance", true),
  };
}

function ruffSettings() {
  const cfg = vscode.workspace.getConfiguration("odooRunner", workspaceResource());
  const root = rootPath();
  const configured = String(cfg.get("ruffPath", "") || "").trim();
  const configuredPath = expand(configured);
  const ruffPath = [
    configuredPath,
    root && path.join(root, ".venv", "bin", "ruff"),
    root && path.join(root, "venv", "bin", "ruff"),
    root && path.join(root, ".venv", "Scripts", "ruff.exe"),
    root && path.join(root, "venv", "Scripts", "ruff.exe"),
  ].find((candidate) => candidate && fs.existsSync(candidate)) ||
    (configured && !configured.includes("${") ? configured : "ruff");
  const configuredConfig = expand(cfg.get("ruffConfigPath", ""));
  return {
    ...settings(),
    ruffPath,
    ruffConfigPath: configuredConfig && fs.existsSync(configuredConfig) ? configuredConfig : "",
  };
}

function discoverRuffConfigs(root) {
  const starts = [root, currentModule()?.path].filter(Boolean);
  const configs = [];
  for (const start of starts) {
    let current = start;
    while (current) {
      for (const filename of ["pyproject.toml", "ruff.toml", ".ruff.toml"]) {
        const candidate = path.join(current, filename);
        if (fs.existsSync(candidate)) configs.push(candidate);
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      if (start === root && current === root) break;
      current = parent;
    }
  }
  return [...new Set(configs)];
}

function quoteUnix(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quoteWindows(value) {
  return `"${String(value).replace(/(["^])/g, "^$1").replace(/%/g, "%%")}"`;
}

function quote(value) {
  return process.platform === "win32" ? quoteWindows(value) : quoteUnix(value);
}

function baseArgs(s) {
  const args = ["-c", s.configPath];
  if (s.database) args.push("-d", s.database);
  if (s.devMode) args.push("--dev", s.devMode);
  return args;
}

function activationScript(s) {
  if (process.platform === "win32") return undefined;
  const interpreter = s.pythonPath || s.ruffPath;
  if (!interpreter) return undefined;
  const candidate = path.join(path.dirname(interpreter), "activate");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function shellCommand(s, executable, args) {
  const command = [executable, ...args]
    .map(quote)
    .join(" ");
  const activation = activationScript(s);
  return activation ? `. ${quote(activation)} && ${command}` : command;
}

function commandLine(s, extra = []) {
  return shellCommand(s, s.pythonPath, [s.odooBin, ...baseArgs(s), ...extra]);
}

function testCommandLine(s, extra = []) {
  // Odoo's process exit code is the stable cross-platform test result.
  return commandLine(s, extra);
}

// Legacy Odoo Run behavior: invoke the configured interpreter directly,
// without activation or replacing the existing terminal.
function legacyOdooRunCommandLine(s, extra = []) {
  return [s.pythonPath, s.odooBin, ...baseArgs(s), ...extra]
    .map(quote)
    .join(" ");
}

function ruffCommandLine(s, extra = []) {
  const args = ["check"];
  if (s.ruffConfigPath) args.push("--config", s.ruffConfigPath);
  args.push(...extra);
  return shellCommand(s, s.ruffPath, args);
}

function valid(s) {
  return s.pythonPath && s.odooBin && s.configPath &&
    fs.existsSync(s.pythonPath) && fs.existsSync(s.odooBin) && fs.existsSync(s.configPath);
}

function existingPaths(candidates) {
  return [...new Set(candidates.filter(Boolean).map(expand).filter((candidate) => fs.existsSync(candidate)))];
}

async function pickPath(label, candidates, filters) {
  const paths = existingPaths(candidates);
  const items = paths.map((candidate) => ({
    label: path.basename(candidate),
    description: candidate,
    path: candidate,
  }));
  items.push({ label: "$(edit) Enter path manually...", description: "Use this if the path is not listed." });
  const picked = await vscode.window.showQuickPick(items, {
    title: label,
    placeHolder: paths.length ? "Select a detected path" : "No path detected; enter it manually",
    ignoreFocusOut: true,
  });
  if (!picked) return undefined;
  if (picked.path) return picked.path;
  const selected = await vscode.window.showOpenDialog({
    title: `Select ${label}`,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters,
  });
  if (selected?.[0]) return selected[0].fsPath;
  return vscode.window.showInputBox({
    prompt: label,
    placeHolder: "${workspaceFolder}/...",
    ignoreFocusOut: true,
  });
}

async function configureRuff() {
  const root = rootPath();
  if (!root) {
    vscode.window.showErrorMessage("Open an Odoo project folder first.");
    return false;
  }
  const current = settings();
  if (!current.pythonPath || !fs.existsSync(current.pythonPath)) {
    vscode.window.showErrorMessage("Configure a valid Python virtual environment before configuring Ruff.");
    return false;
  }
  const ruffPath = path.join(path.dirname(current.pythonPath), process.platform === "win32" ? "ruff.exe" : "ruff");
  const install = async () => {
    await execFileAsync(current.pythonPath, ["-m", "pip", "install", "ruff"], {
      cwd: current.cwd || root,
      maxBuffer: 4 * 1024 * 1024,
    });
  };
  try {
    if (vscode.window.withProgress) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation?.Notification,
          title: "Installing Ruff in the project virtual environment...",
          cancellable: false,
        },
        install,
      );
    } else {
      await install();
    }
  } catch (error) {
    const detail = String(error.stderr || error.message || "").trim().split("\n").slice(-3).join(" ");
    vscode.window.showErrorMessage(`Could not install Ruff. ${detail}`.trim());
    return false;
  }
  if (!fs.existsSync(ruffPath)) {
    vscode.window.showErrorMessage(`Ruff installation completed, but ${ruffPath} was not found.`);
    return false;
  }

  const configs = discoverRuffConfigs(root);
  const configItems = [
    {
      label: "$(search) Let Ruff auto-detect configuration",
      description: "Use pyproject.toml, ruff.toml or .ruff.toml from the file hierarchy",
      path: "",
    },
    ...configs.map((configPath) => ({
      label: path.basename(configPath),
      description: configPath,
      path: configPath,
    })),
    {
      label: "$(edit) Choose another config file...",
      description: "Use an explicit Ruff configuration file",
      manual: true,
    },
  ];
  const configChoice = await vscode.window.showQuickPick(configItems, {
    title: "Ruff configuration",
    placeHolder: "Choose automatic discovery or an explicit config file",
    ignoreFocusOut: true,
  });
  if (!configChoice) return false;
  let configPath = configChoice.path || "";
  if (configChoice.manual) {
    const selected = await vscode.window.showOpenDialog({
      title: "Select Ruff configuration",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { Ruff: ["toml"] },
    });
    if (selected?.[0]) {
      configPath = selected[0].fsPath;
    } else {
      const entered = await vscode.window.showInputBox({
        prompt: "Ruff configuration path (leave empty for auto-detect)",
        placeHolder: "${workspaceFolder}/ruff.toml",
        ignoreFocusOut: true,
      });
      if (entered === undefined) return false;
      configPath = expand(entered) || "";
    }
  }
  if (configPath && !fs.existsSync(configPath)) {
    vscode.window.showErrorMessage("The selected Ruff configuration does not exist.");
    return false;
  }

  const cfg = vscode.workspace.getConfiguration("odooRunner", workspaceResource());
  const target = vscode.ConfigurationTarget.Workspace;
  await cfg.update("ruffPath", ruffPath, target);
  await cfg.update("ruffConfigPath", configPath, target);
  refreshModules();
  vscode.window.showInformationMessage("Ruff configured for this workspace.");
  return true;
}

function discoverOdooBins(root) {
  const candidates = [
    path.join(root, "..", "odoo", "odoo-bin"),
    path.join(root, "..", "..", "odoo", "odoo-bin"),
    path.join(root, "odoo", "odoo-bin"),
    path.join(root, "odoo-bin"),
  ];
  try {
    const parents = [path.dirname(root), path.dirname(path.dirname(root))];
    for (const parent of parents) {
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push(path.join(parent, entry.name, "odoo-bin"));
      }
    }
  } catch {
    // Keep the standard candidates when the parent directory cannot be read.
  }
  return candidates;
}

function discoverConfigs(root, odooBin) {
  const odooRoot = odooBin ? path.dirname(odooBin) : path.join(root, "..", "odoo");
  const configDir = path.join(odooRoot, "config");
  const candidates = [
    path.join(configDir, `${path.basename(root)}.conf`),
    path.join(configDir, "odoo.conf"),
  ];
  try {
    for (const entry of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(conf|cfg)$/i.test(entry.name)) candidates.push(path.join(configDir, entry.name));
    }
  } catch {
    // The manual picker remains available when there is no config directory.
  }
  return candidates;
}

function manifestPath(modulePath) {
  for (const filename of ["__manifest__.py", "__openerp__.py"]) {
    const candidate = path.join(modulePath, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function moduleInfo(modulePath) {
  const manifest = manifestPath(modulePath);
  if (!manifest) return undefined;
  let title = path.basename(modulePath);
  try {
    const source = fs.readFileSync(manifest, "utf8");
    const match = source.match(/["']name["']\s*:\s*(["'])(.*?)\1/s);
    if (match?.[2]) title = match[2];
  } catch {
    // Keep the directory name when the manifest cannot be read.
  }
  return { name: path.basename(modulePath), title, path: modulePath };
}

function addonPaths(s) {
  const paths = [rootPath()];
  if (!s.configPath) return paths.filter(Boolean);
  try {
    const source = fs.readFileSync(s.configPath, "utf8");
    const match = source.match(/^\s*addons_path\s*=\s*(.+)$/im);
    if (match?.[1]) {
      for (const value of match[1].split(",")) {
        const expanded = expand(value.trim());
        if (expanded) paths.push(expanded);
      }
    }
  } catch {
    // The workspace root remains a useful fallback when the config is unavailable.
  }
  return [...new Set(paths.filter((candidate) => candidate && fs.existsSync(candidate)))];
}

function discoverModules(s) {
  const modules = new Map();
  for (const addonsPath of addonPaths(s)) {
    for (const info of discoverModulesInPath(addonsPath)) {
      if (!modules.has(info.name)) modules.set(info.name, info);
    }
  }
  return [...modules.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function discoverModulesInPath(addonsPath) {
  const modules = new Map();
  const direct = moduleInfo(addonsPath);
  if (direct) modules.set(direct.name, direct);
  let entries;
  try {
    entries = fs.readdirSync(addonsPath, { withFileTypes: true });
  } catch {
    return [...modules.values()];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const info = moduleInfo(path.join(addonsPath, entry.name));
    if (info && !modules.has(info.name)) modules.set(info.name, info);
  }
  return [...modules.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function currentAddonsPath(s) {
  const current = currentModule();
  if (!current) return undefined;
  return addonPaths(s)
    .filter((addonsPath) => {
      const relative = path.relative(addonsPath, current.path);
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    })
    .sort((left, right) => right.length - left.length)[0];
}

function currentModule() {
  const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
  if (!activePath) return undefined;
  const root = rootPath();
  let current = activePath;
  try {
    if (!fs.statSync(current).isDirectory()) current = path.dirname(current);
  } catch {
    current = path.dirname(current);
  }
  while (current && current !== path.dirname(current)) {
    const info = moduleInfo(current);
    if (info) return info;
    current = path.dirname(current);
  }
  return undefined;
}

function normalizeModules(value) {
  const modules = String(value || "")
    .split(",")
    .map((module) => module.trim())
    .filter(Boolean);
  return modules.length ? modules.join(",") : undefined;
}

async function configure() {
  if (!rootPath()) {
    vscode.window.showErrorMessage("Open an Odoo project folder first.");
    return false;
  }
  const current = settings();
  const root = rootPath();
  const pythonPath = await pickPath(
    "Python interpreter",
    [current.pythonPath, path.join(root, ".venv", "bin", "python"), path.join(root, "venv", "bin", "python")],
    { Python: ["python", "python3"] }
  );
  if (!pythonPath) return false;
  const odooBin = await pickPath("Odoo odoo-bin", [current.odooBin, ...discoverOdooBins(root)], { Odoo: ["odoo-bin"] });
  if (!odooBin) return false;
  const configPath = await pickPath("Odoo config", [current.configPath, ...discoverConfigs(root, expand(odooBin))], { Config: ["conf", "cfg"] });
  if (!configPath) return false;
  if (!fs.existsSync(expand(pythonPath)) || !fs.existsSync(expand(odooBin)) || !fs.existsSync(expand(configPath))) {
    vscode.window.showErrorMessage("One selected path does not exist. Run Configure Runner again and choose a detected file.");
    return false;
  }
  const database = await vscode.window.showInputBox({
    prompt: "Default database (leave empty to ask each run)",
    value: current.database || "",
    ignoreFocusOut: true,
  });
  if (database === undefined) return false;
  const devMode = await vscode.window.showQuickPick(
    ["", "all", "reload", "xml", "werkzeug"],
    { placeHolder: "Select Odoo dev mode (empty is lightest)", canPickMany: false }
  );
  if (devMode === undefined) return false;

  const cfg = vscode.workspace.getConfiguration("odooRunner", workspaceResource());
  const target = vscode.ConfigurationTarget.Workspace;
  await cfg.update("pythonPath", pythonPath, target);
  await cfg.update("odooBin", odooBin, target);
  await cfg.update("configPath", configPath, target);
  await cfg.update("database", database, target);
  await cfg.update("devMode", devMode, target);
  await applyWorkspaceSettings({ pythonPath, odooBin, disablePylance: current.disablePylance });
  await generateConfigs(settings());
  refreshModules();
  vscode.window.showInformationMessage("VDX Odoo Runner configured for this workspace.");
  return true;
}

async function applyWorkspaceSettings(values) {
  const cfg = vscode.workspace.getConfiguration(undefined, workspaceResource());
  const target = vscode.ConfigurationTarget.Workspace;
  if (values.pythonPath) await cfg.update("python.defaultInterpreterPath", values.pythonPath, target);
  const extra = cfg.get("python.analysis.extraPaths", []);
  const paths = [...new Set([...(Array.isArray(extra) ? extra : []), "${workspaceFolder}", path.dirname(values.odooBin || "")])];
  await cfg.update("python.analysis.extraPaths", paths.filter(Boolean), target);
  if (values.disablePylance) await cfg.update("python.languageServer", "None", target);
}

async function ensureSettings() {
  const s = settings();
  if (valid(s)) return s;
  const setup = await vscode.window.showInformationMessage(
    "VDX Odoo Runner needs its paths configured.",
    "Configure",
    "Cancel"
  );
  if (setup !== "Configure" || !(await configure())) return null;
  const updated = settings();
  if (!valid(updated)) {
    vscode.window.showErrorMessage("Odoo Runner paths are still invalid. Check the workspace settings.");
    return null;
  }
  return updated;
}

function stopRunTerminal() {
  terminalGeneration += 1;
  if (!runTerminal) return;
  try {
    runTerminal.sendText("\u0003", false);
  } catch {
    // The terminal may already have been disposed by VS Code.
  }
  runTerminal.dispose();
  runTerminal = undefined;
}

async function showTerminal(s, name, extra = [], buildCommand = commandLine) {
  stopRunTerminal();
  const command = buildCommand(s, extra);
  const terminalOptions = process.platform === "win32"
    ? {
        shellPath: process.env.ComSpec || "cmd.exe",
        shellArgs: ["/d", "/c", command],
      }
    : {
        // Start the command as the shell process itself. This prevents the
        // Python extension from injecting a second activation command into
        // the terminal while Odoo/Ruff is starting.
        shellPath: "/bin/bash",
        shellArgs: ["--noprofile", "--norc", "-i", "-c", command],
      };
  const terminal = vscode.window.createTerminal({
    name,
    cwd: s.cwd || rootPath(),
    ...terminalOptions,
  });
  runTerminal = terminal;
  terminal.show(true);
}

function showLegacyOdooRunTerminal(s) {
  if (!runTerminal || runTerminal.exitStatus) {
    runTerminal = vscode.window.createTerminal({ name: "Odoo: Run", cwd: s.cwd || rootPath() });
  }
  runTerminal.show(true);
  runTerminal.sendText(legacyOdooRunCommandLine(s), true);
}

async function askDatabase(s) {
  if (s.database) return s.database;
  return vscode.window.showInputBox({ prompt: "Database", placeHolder: "test-ttt", ignoreFocusOut: true });
}

async function askModules(label, s, kind) {
  if (kind !== "update") {
    return normalizeModules(await vscode.window.showInputBox({
      prompt: label,
      placeHolder: "sv_hr,sv_hr_contract",
      ignoreFocusOut: true,
    }));
  }

  const current = currentModule();
  const modules = discoverModules(s);
  const actions = [];
  if (current) {
    actions.push({
      label: "$(target) Current Module",
      description: `${current.name} — ${current.title}`,
      detail: current.path,
      action: "current",
    });
  }
  if (modules.length) {
    actions.push({
      label: "$(list-selection) Select Modules",
      description: `${modules.length} module(s) detected from addons_path`,
      action: "select",
    });
  }
  actions.push({
    label: "$(edit) Enter Manually",
    description: "Type one or more comma-separated module names",
    action: "manual",
  });

  const action = await vscode.window.showQuickPick(actions, {
    title: label,
    placeHolder: "Choose how to select modules",
    ignoreFocusOut: true,
  });
  if (!action) return undefined;
  if (action.action === "current") return current.name;
  if (action.action === "manual") {
    return normalizeModules(await vscode.window.showInputBox({
      prompt: label,
      placeHolder: "sv_hr,sv_hr_contract",
      ignoreFocusOut: true,
    }));
  }

  const selected = await vscode.window.showQuickPick(
    modules.map((module) => ({
      label: module.name,
      description: module.title,
      detail: module.path,
      moduleName: module.name,
    })),
    {
      title: "Select modules to update",
      placeHolder: "Select one or more modules",
      canPickMany: true,
      ignoreFocusOut: true,
    }
  );
  if (!selected?.length) return undefined;
  return selected.map((module) => module.moduleName).join(",");
}

async function run() {
  const s = await ensureSettings();
  if (s) showLegacyOdooRunTerminal(s);
}

function activeFilePath() {
  const uri = vscode.window.activeTextEditor?.document?.uri;
  if (!uri || (uri.scheme && uri.scheme !== "file")) return undefined;
  return uri.fsPath;
}

async function ruffCheck(scope) {
  const root = rootPath();
  if (!root) {
    vscode.window.showErrorMessage("Open an Odoo project folder first.");
    return;
  }
  let target;
  let label;
  if (scope === "file") {
    target = activeFilePath();
    label = "Current File";
    if (!target || !fs.existsSync(target)) {
      vscode.window.showErrorMessage("Open and save a Python file before running Ruff.");
      return;
    }
  } else {
    const module = currentModule();
    label = "Current Module";
    if (!module) {
      vscode.window.showErrorMessage("Open a file inside an Odoo module before running Ruff.");
      return;
    }
    target = module.path;
  }
  await showTerminal(ruffSettings(), `Ruff: Check ${label}`, [target], ruffCommandLine);
}

async function ruffCheckCurrentFile() {
  await ruffCheck("file");
}

async function ruffCheckCurrentModule() {
  await ruffCheck("module");
}

async function testCurrentModule() {
  const current = currentModule();
  if (!current) {
    vscode.window.showErrorMessage("Open a file inside an Odoo module before running its tests.");
    return;
  }
  await oneShot("test", current.name);
}

async function debug() {
  const s = await ensureSettings();
  if (!s) return;
  stopRunTerminal();
  const ok = await vscode.debug.startDebugging(workspaceFolder(), {
    type: "debugpy",
    request: "launch",
    name: "Odoo: Debug",
    program: s.odooBin,
    python: s.pythonPath,
    cwd: s.cwd || rootPath(),
    args: baseArgs(s),
    console: "integratedTerminal",
    justMyCode: false,
    env: { PYTHONUNBUFFERED: "1", PYTHONPATH: path.dirname(s.odooBin) },
  });
  if (!ok) vscode.window.showErrorMessage("Could not start debugpy. Ensure the Python Debugger extension is installed.");
}

async function oneShot(kind, selectedModules) {
  const s = await ensureSettings();
  if (!s) return;
  const database = await askDatabase(s);
  if (!database) return;
  const modules = normalizeModules(selectedModules) || await askModules(
    kind === "update" ? "Modules to update" : kind === "install" ? "Modules to install" : "Test module(s)",
    s,
    kind,
  );
  if (!modules) return;
  const extra = ["-d", database];
  if (kind === "update") extra.push("-u", modules);
  if (kind === "install") extra.push("-i", modules);
  if (kind === "test") extra.push("--test-enable", "--test-tags", modules);
  extra.push("--stop-after-init");
  // The one-shot command receives its database explicitly, so avoid adding
  // the configured default database a second time in baseArgs().
  await showTerminal(
    { ...s, database: "" },
    `Odoo: ${kind}`,
    extra,
    kind === "test" ? testCommandLine : commandLine,
  );
}

async function updateSelectedModule(moduleName) {
  if (moduleName) await oneShot("update", moduleName);
}

async function updateAddonsFolder() {
  const s = await ensureSettings();
  if (!s) return;
  const addonsPath = currentAddonsPath(s);
  if (!addonsPath) {
    vscode.window.showErrorMessage("Open a file inside an Odoo addon folder before updating it.");
    return;
  }
  const modules = discoverModulesInPath(addonsPath);
  if (!modules.length) {
    vscode.window.showErrorMessage(`No Odoo addons found in ${addonsPath}.`);
    return;
  }
  const answer = await vscode.window.showWarningMessage(
    `Update all ${modules.length} addons in ${path.basename(addonsPath)}?`,
    "Update Addons",
    "Cancel",
  );
  if (answer !== "Update Addons") return;
  await oneShot("update", modules.map((module) => module.name).join(","));
}

function refreshModules() {
  runnerProvider?.refresh();
}

async function generateConfigs(configuredSettings) {
  const folder = rootPath();
  if (!folder) return;
  const s = configuredSettings || await ensureSettings();
  if (!s) return;
  try {
    const vscodeDir = path.join(folder, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    const launchPath = path.join(vscodeDir, "launch.json");
    let existing = { version: "0.2.0", configurations: [] };
    if (fs.existsSync(launchPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(launchPath, "utf8"));
      } catch {
        vscode.window.showWarningMessage("Existing launch.json is not valid JSON; it was not modified.");
        return;
      }
    }
    const launch = {
      version: existing.version || "0.2.0",
      configurations: [
        ...(Array.isArray(existing.configurations) ? existing.configurations.filter((item) => !["Odoo: Run", "Odoo: Debug"].includes(item.name)) : []),
        { name: "Odoo: Run", type: "debugpy", request: "launch", program: s.odooBin, python: s.pythonPath, cwd: s.cwd, args: baseArgs(s), console: "integratedTerminal", justMyCode: false, env: { PYTHONUNBUFFERED: "1", PYTHONPATH: path.dirname(s.odooBin) } },
        { name: "Odoo: Debug", type: "debugpy", request: "launch", program: s.odooBin, python: s.pythonPath, cwd: s.cwd, args: baseArgs(s), console: "integratedTerminal", justMyCode: false, env: { PYTHONUNBUFFERED: "1", PYTHONPATH: path.dirname(s.odooBin) } },
      ],
    };
    fs.writeFileSync(launchPath, JSON.stringify(launch, null, 2) + "\n");
  } catch (error) {
    vscode.window.showErrorMessage(`Could not write VS Code launch configuration. ${error.message || error}`);
  }
}

class OdooRunnerProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element?.kind === "modules") {
      const modules = discoverModules(settings());
      if (!modules.length) {
        const empty = new vscode.TreeItem("No modules detected");
        empty.description = "Check workspace and addons_path";
        return [empty];
      }
      return modules.map((module) => {
        const item = new vscode.TreeItem(module.name, vscode.TreeItemCollapsibleState.None);
        item.description = module.title;
        item.tooltip = module.path;
        item.contextValue = "module";
        item.iconPath = new vscode.ThemeIcon("package");
        item.command = {
          command: "vdxOdooRunner.updateSelectedModule",
          title: "Update Module",
          arguments: [module.name],
        };
        return item;
      });
    }

    const actions = [
      ["Configure Runner", "vdxOdooRunner.setup", "settings-gear"],
      ["Run Odoo", "vdxOdooRunner.run", "play"],
      ["Debug Odoo", "vdxOdooRunner.debug", "debug-alt"],
      ["Update Module", "vdxOdooRunner.updateModule", "sync"],
      ["Update Addons Folder", "vdxOdooRunner.updateAddonsFolder", "package"],
      ["Install Module", "vdxOdooRunner.installModule", "add"],
      ["Test Module", "vdxOdooRunner.testModule", "beaker"],
      ["Test Current Module", "vdxOdooRunner.testCurrentModule", "beaker"],
      ["Configure Ruff", "vdxOdooRunner.configureRuff", "settings-gear"],
      ["Ruff: Check Current File", "vdxOdooRunner.ruffCheckCurrentFile", "check"],
      ["Ruff: Check Current Module", "vdxOdooRunner.ruffCheckCurrentModule", "folder-opened"],
      ["Ruff: Refresh", "vdxOdooRunner.refreshModules", "refresh"],
    ].map(([label, command, icon]) => {
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "action";
      item.iconPath = new vscode.ThemeIcon(icon);
      item.command = { command, title: label };
      return item;
    });

    const section = new vscode.TreeItem(
      `Detected Modules (${discoverModules(settings()).length})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    section.kind = "modules";
    section.contextValue = "modules";
    section.iconPath = new vscode.ThemeIcon("extensions");
    return [...actions, section];
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

function activate(context) {
  const commands = [
    ["vdxOdooRunner.setup", configure],
    ["vdxOdooRunner.run", run],
    ["vdxOdooRunner.debug", debug],
    ["vdxOdooRunner.updateModule", () => oneShot("update")],
    ["vdxOdooRunner.updateAddonsFolder", updateAddonsFolder],
    ["vdxOdooRunner.installModule", () => oneShot("install")],
    ["vdxOdooRunner.testModule", () => oneShot("test")],
    ["vdxOdooRunner.testCurrentModule", testCurrentModule],
    ["vdxOdooRunner.generateConfigs", generateConfigs],
    ["vdxOdooRunner.updateSelectedModule", updateSelectedModule],
    ["vdxOdooRunner.refreshModules", refreshModules],
    ["vdxOdooRunner.configureRuff", configureRuff],
    ["vdxOdooRunner.ruffCheckCurrentFile", ruffCheckCurrentFile],
    ["vdxOdooRunner.ruffCheckCurrentModule", ruffCheckCurrentModule],
  ];
  for (const [name, handler] of commands) context.subscriptions.push(vscode.commands.registerCommand(name, handler));
  runnerProvider = new OdooRunnerProvider();
  context.subscriptions.push(runnerProvider);
  context.subscriptions.push(vscode.window.createTreeView("vdxOdooRunner.panel", {
    treeDataProvider: runnerProvider,
    showCollapseAll: false,
  }));
  context.subscriptions.push({ dispose: stopRunTerminal });
}

function deactivate() {
  stopRunTerminal();
  runnerProvider?.dispose();
  runnerProvider = undefined;
}

module.exports = {
  activate,
  deactivate,
  __test: {
    addonPaths,
    baseArgs,
    currentModule,
    discoverModulesInPath,
    expand,
    legacyOdooRunCommandLine,
    normalizeModules,
    quoteUnix,
    quoteWindows,
    testCommandLine,
  },
};
