const fs = require("fs");
const path = require("path");

function debugConfiguration(settings, name) {
  return {
    name,
    type: "debugpy",
    request: "launch",
    program: settings.odooBin,
    python: settings.pythonPath,
    cwd: settings.cwd,
    args: ["-c", settings.configPath, ...(settings.database ? ["-d", settings.database] : []), ...(settings.devMode ? ["--dev", settings.devMode] : [])],
    console: "integratedTerminal",
    justMyCode: false,
    env: { PYTHONUNBUFFERED: "1", PYTHONPATH: path.dirname(settings.odooBin) },
  };
}

function writeLaunchConfigs(root, settings, fileSystem = fs) {
  const vscodeDir = path.join(root, ".vscode");
  fileSystem.mkdirSync(vscodeDir, { recursive: true });
  const launchPath = path.join(vscodeDir, "launch.json");
  let existing = { version: "0.2.0", configurations: [] };
  if (fileSystem.existsSync(launchPath)) {
    try {
      existing = JSON.parse(fileSystem.readFileSync(launchPath, "utf8"));
    } catch {
      return { written: false, reason: "invalid-json", path: launchPath };
    }
  }
  const configurations = Array.isArray(existing.configurations)
    ? existing.configurations.filter((item) => !["Odoo: Run", "Odoo: Debug"].includes(item.name))
    : [];
  configurations.push(debugConfiguration(settings, "Odoo: Run"));
  configurations.push(debugConfiguration(settings, "Odoo: Debug"));
  fileSystem.writeFileSync(launchPath, JSON.stringify({
    version: existing.version || "0.2.0",
    configurations,
  }, null, 2) + "\n");
  return { written: true, path: launchPath };
}

module.exports = { debugConfiguration, writeLaunchConfigs };
