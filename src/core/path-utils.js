const path = require("path");

function expandPath(value, root, environment = process.env) {
  if (!value) return value;
  const workspaceRoot = root || process.cwd();
  const expanded = String(value)
    .replace(/\$\{workspaceFolder\}/g, workspaceRoot)
    .replace(/\$\{workspaceFolderBasename\}/g, path.basename(workspaceRoot))
    .replace(/^~(?=$|[\\/])/, environment.HOME || environment.USERPROFILE || "")
    .trim();
  return path.isAbsolute(expanded) ? expanded : path.resolve(workspaceRoot, expanded);
}

function quoteUnix(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quoteWindows(value) {
  return `"${String(value).replace(/(["^])/g, "^$1").replace(/%/g, "%%")}"`;
}

function quote(value, platform = process.platform) {
  return platform === "win32" ? quoteWindows(value) : quoteUnix(value);
}

module.exports = { expandPath, quote, quoteUnix, quoteWindows };
