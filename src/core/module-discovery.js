const path = require("path");

function manifestPath(modulePath, fs) {
  for (const filename of ["__manifest__.py", "__openerp__.py"]) {
    const candidate = path.join(modulePath, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function moduleInfo(modulePath, fs) {
  const manifest = manifestPath(modulePath, fs);
  if (!manifest) return undefined;
  let title = path.basename(modulePath);
  try {
    const source = fs.readFileSync(manifest, "utf8");
    const match = source.match(/["']name["']\s*:\s*(['"])(.*?)\1/s);
    if (match?.[2]) title = match[2];
  } catch {
    // Keep the directory name when the manifest cannot be read.
  }
  return { name: path.basename(modulePath), title, path: modulePath };
}

function discoverModulesInPath(addonsPath, fs) {
  const modules = new Map();
  const direct = moduleInfo(addonsPath, fs);
  if (direct) modules.set(direct.name, direct);
  let entries;
  try {
    entries = fs.readdirSync(addonsPath, { withFileTypes: true });
  } catch {
    return [...modules.values()];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const info = moduleInfo(path.join(addonsPath, entry.name), fs);
    if (info && !modules.has(info.name)) modules.set(info.name, info);
  }
  return [...modules.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function readAddonPaths(settings, root, expand, fs) {
  const paths = [root];
  if (settings.configPath) {
    try {
      const source = fs.readFileSync(settings.configPath, "utf8");
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
  }
  return [...new Set(paths.filter((candidate) => candidate && fs.existsSync(candidate)))];
}

function discoverModules(settings, root, expand, fs) {
  const modules = new Map();
  for (const addonsPath of readAddonPaths(settings, root, expand, fs)) {
    for (const info of discoverModulesInPath(addonsPath, fs)) {
      if (!modules.has(info.name)) modules.set(info.name, info);
    }
  }
  return [...modules.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function findCurrentModule(activePath, fs) {
  if (!activePath) return undefined;
  let current = activePath;
  try {
    if (!fs.statSync(current).isDirectory()) current = path.dirname(current);
  } catch {
    current = path.dirname(current);
  }
  while (current && current !== path.dirname(current)) {
    const info = moduleInfo(current, fs);
    if (info) return info;
    current = path.dirname(current);
  }
  return undefined;
}

function findCurrentAddonsPath(settings, current, root, expand, fs) {
  if (!current) return undefined;
  return readAddonPaths(settings, root, expand, fs)
    .filter((addonsPath) => {
      const relative = path.relative(addonsPath, current.path);
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    })
    .sort((left, right) => right.length - left.length)[0];
}

function discoverRuffConfigs(root, modulePath, fs) {
  const starts = [root, modulePath].filter(Boolean);
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

module.exports = {
  discoverModules,
  discoverModulesInPath,
  discoverRuffConfigs,
  findCurrentAddonsPath,
  findCurrentModule,
  manifestPath,
  moduleInfo,
  readAddonPaths,
};
