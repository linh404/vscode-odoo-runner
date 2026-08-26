const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const vscode = {
  window: {},
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => undefined }),
  },
};

const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return vscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { __test } = require("../extension");
Module._load = originalLoad;

assert.deepStrictEqual(__test.normalizeModules(" a, b, ,a "), "a,b,a");
assert.strictEqual(__test.normalizeModules("  ,  "), undefined);
assert.deepStrictEqual(__test.baseArgs({ configPath: "/tmp/odoo.conf", database: "demo", devMode: "reload" }), [
  "-c", "/tmp/odoo.conf", "-d", "demo", "--dev", "reload",
]);
assert.strictEqual(__test.quoteUnix("/tmp/a file"), "'/tmp/a file'");
assert.strictEqual(__test.quoteWindows("C:\\Odoo Project\\odoo-bin"), '"C:\\Odoo Project\\odoo-bin"');
assert.ok(__test.testCommandLine({
  pythonPath: "/tmp/python",
  odooBin: "/tmp/odoo-bin",
  configPath: "/tmp/odoo.conf",
  database: "",
  devMode: "",
}).includes("/tmp/odoo-bin"));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vdx-odoo-runner-test-"));
const modulePath = path.join(tempRoot, "my_module");
fs.mkdirSync(modulePath);
fs.writeFileSync(path.join(modulePath, "__manifest__.py"), "{\"name\": \"My Module\"}\n");
const modules = __test.discoverModulesInPath(tempRoot);
assert.deepStrictEqual(modules, [{ name: "my_module", title: "My Module", path: modulePath }]);
fs.rmSync(tempRoot, { recursive: true, force: true });

console.log("extension tests passed");
