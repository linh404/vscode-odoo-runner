const path = require("path");
const { quote } = require("./path-utils");

function baseArgs(settings) {
  const args = ["-c", settings.configPath];
  if (settings.database) args.push("-d", settings.database);
  if (settings.devMode) args.push("--dev", settings.devMode);
  return args;
}

function activationScript(settings, fs, platform) {
  if (platform === "win32") return undefined;
  const interpreter = settings.pythonPath || settings.ruffPath;
  if (!interpreter) return undefined;
  const candidate = path.join(path.dirname(interpreter), "activate");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function shellCommand(settings, executable, args, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const fs = dependencies.fs || require("fs");
  const command = [executable, ...args].map((value) => quote(value, platform)).join(" ");
  const activation = activationScript(settings, fs, platform);
  return activation ? `. ${quote(activation, platform)} && ${command}` : command;
}

function commandLine(settings, extra = [], dependencies) {
  return shellCommand(settings, settings.pythonPath, [settings.odooBin, ...baseArgs(settings), ...extra], dependencies);
}

function legacyOdooRunCommandLine(settings, extra = [], platform = process.platform) {
  return [settings.pythonPath, settings.odooBin, ...baseArgs(settings), ...extra]
    .map((value) => quote(value, platform))
    .join(" ");
}

function ruffCommandLine(settings, extra = [], dependencies) {
  const args = ["check"];
  if (settings.ruffConfigPath) args.push("--config", settings.ruffConfigPath);
  args.push(...extra);
  return shellCommand(settings, settings.ruffPath, args, dependencies);
}

module.exports = {
  baseArgs,
  commandLine,
  legacyOdooRunCommandLine,
  ruffCommandLine,
  shellCommand,
  testCommandLine: commandLine,
};
