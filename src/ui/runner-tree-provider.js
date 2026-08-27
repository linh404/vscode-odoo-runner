class RunnerTreeProvider {
  constructor(vscode, odoo, ruff) {
    this.vscode = vscode;
    this.odoo = odoo;
    this.ruff = ruff;
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
      const modules = this.odoo.modules();
      if (!modules.length) {
        const empty = new this.vscode.TreeItem("No modules detected");
        empty.description = "Check workspace and addons_path";
        return [empty];
      }
      return modules.map((module) => {
        const item = new this.vscode.TreeItem(module.name, this.vscode.TreeItemCollapsibleState.None);
        item.description = module.title;
        item.tooltip = module.path;
        item.contextValue = "module";
        item.iconPath = new this.vscode.ThemeIcon("package");
        item.command = { command: "vdxOdooRunner.updateSelectedModule", title: "Update Module", arguments: [module.name] };
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
      ["Install Current Module", "vdxOdooRunner.installCurrentModule", "add"],
      ["Test Module", "vdxOdooRunner.testModule", "beaker"],
      ["Test Current Module", "vdxOdooRunner.testCurrentModule", "beaker"],
      ["Configure Ruff", "vdxOdooRunner.configureRuff", "settings-gear"],
      ["Ruff: Check Current File", "vdxOdooRunner.ruffCheckCurrentFile", "check"],
      ["Ruff: Check Current Module", "vdxOdooRunner.ruffCheckCurrentModule", "folder-opened"],
      ["Ruff: Refresh", "vdxOdooRunner.refreshModules", "refresh"],
    ].map(([label, command, icon]) => {
      const item = new this.vscode.TreeItem(label, this.vscode.TreeItemCollapsibleState.None);
      item.contextValue = "action";
      item.iconPath = new this.vscode.ThemeIcon(icon);
      item.command = { command, title: label };
      return item;
    });
    const section = new this.vscode.TreeItem(`Detected Modules (${this.odoo.modules().length})`, this.vscode.TreeItemCollapsibleState.Expanded);
    section.kind = "modules";
    section.contextValue = "modules";
    section.iconPath = new this.vscode.ThemeIcon("extensions");
    return [...actions, section];
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

module.exports = { RunnerTreeProvider };
