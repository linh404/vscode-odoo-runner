const fs = require("fs");
const path = require("path");

function existing(candidates, fileSystem = fs) {
  return candidates.find((candidate) => candidate && fileSystem.existsSync(candidate));
}

function getSettings(vscode, context, fileSystem = fs) {
  const cfg = vscode.workspace.getConfiguration("odooRunner", context.resource());
  const root = context.root();
  const pythonPath = existing([
    context.expand(cfg.get("pythonPath")),
    root && path.join(root, ".venv", "bin", "python"),
    root && path.join(root, ".venv", "Scripts", "python.exe"),
    root && path.join(root, "venv", "Scripts", "python.exe"),
  ], fileSystem);
  const odooBin = existing([
    context.expand(cfg.get("odooBin")),
    root && path.join(root, "..", "odoo", "odoo-bin"),
    root && path.join(root, "odoo-bin"),
  ], fileSystem);
  const odooRoot = odooBin ? path.dirname(odooBin) : undefined;
  const configPath = existing([
    context.expand(cfg.get("configPath")),
    odooRoot && path.join(odooRoot, "config", `${root ? path.basename(root) : "odoo"}.conf`),
    odooRoot && path.join(odooRoot, "config", "odoo.conf"),
  ], fileSystem);
  const configuredCwd = context.expand(cfg.get("cwd"));
  return {
    pythonPath,
    odooBin,
    configPath,
    database: cfg.get("database", ""),
    devMode: cfg.get("devMode", ""),
    cwd: configuredCwd && fileSystem.existsSync(configuredCwd) ? configuredCwd : root,
    disablePylance: cfg.get("disablePylance", true),
  };
}

function getRuffSettings(vscode, context, fileSystem = fs) {
  const cfg = vscode.workspace.getConfiguration("odooRunner", context.resource());
  const root = context.root();
  const configured = String(cfg.get("ruffPath", "") || "").trim();
  const ruffPath = existing([
    context.expand(configured),
    root && path.join(root, ".venv", "bin", "ruff"),
    root && path.join(root, "venv", "bin", "ruff"),
    root && path.join(root, ".venv", "Scripts", "ruff.exe"),
    root && path.join(root, "venv", "Scripts", "ruff.exe"),
  ], fileSystem) || (configured && !configured.includes("${") ? configured : "ruff");
  const configuredConfig = context.expand(cfg.get("ruffConfigPath", ""));
  return {
    ...getSettings(vscode, context, fileSystem),
    ruffPath,
    ruffConfigPath: configuredConfig && fileSystem.existsSync(configuredConfig) ? configuredConfig : "",
  };
}

function isValid(settings, fileSystem = fs) {
  return Boolean(settings.pythonPath && settings.odooBin && settings.configPath &&
    fileSystem.existsSync(settings.pythonPath) &&
    fileSystem.existsSync(settings.odooBin) &&
    fileSystem.existsSync(settings.configPath));
}

async function applyWorkspaceSettings(vscode, context, values) {
  const cfg = vscode.workspace.getConfiguration(undefined, context.resource());
  const target = vscode.ConfigurationTarget.Workspace;
  if (values.pythonPath) await cfg.update("python.defaultInterpreterPath", values.pythonPath, target);
  const extra = cfg.get("python.analysis.extraPaths", []);
  const paths = [...new Set([...(Array.isArray(extra) ? extra : []), "${workspaceFolder}", path.dirname(values.odooBin || "")])];
  await cfg.update("python.analysis.extraPaths", paths.filter(Boolean), target);
  if (values.disablePylance) await cfg.update("python.languageServer", "None", target);
  else await cfg.update("python.languageServer", undefined, target);
}

module.exports = { applyWorkspaceSettings, getRuffSettings, getSettings, isValid };
