# VDX Odoo Runner

Portable VS Code commands for local Odoo development.

## Dependencies and prerequisites

### Required

- **Visual Studio Code** `1.103.0` or newer.
- **Python** matching the Odoo project environment. The extension does not install Python or Python packages.
- **Odoo source checkout** containing `odoo-bin`.
- **An Odoo config file** (`.conf`/`.cfg`) with the correct `addons_path`, PostgreSQL connection and other runtime options.
- **A reachable PostgreSQL database** if the selected command uses `-d`, `-i`, `-u` or tests.
- **A workspace folder** opened at the custom-addons/project root.

### VS Code extensions

These dependencies are declared by the extension and VS Code will offer to install them:

- `ms-python.python` — Python environment and interpreter integration.
- `ms-python.debugpy` — required only for **Odoo: Debug** and `F5` debugging.
- `trinhanhngoc.vscode-odoo` — Odoo model/inheritance navigation and completion. It is recommended for Odoo development but is not needed to run the server.

If the Odoo IDE extension is installed, the Runner disables the Python language server for this workspace by default to avoid duplicate indexing and reduce RAM usage. Set `odooRunner.disablePylance` to `false` if you want normal Python diagnostics from Pylance.

### Not bundled by this extension

- Odoo Community or Enterprise source code.
- Python virtual environments or `pip` dependencies.
- PostgreSQL server, databases or database credentials.
- Odoo configuration files, addons or filestore data.

You must provide these separately on each machine. The first run uses **Odoo: Configure Runner** to select the Python interpreter, `odoo-bin`, config file, database and dev mode.

## Commands

- **Odoo: Configure Runner** — choose Python, `odoo-bin`, config, database and dev mode.
- **Odoo: Run** — start Odoo in the integrated terminal.
- **Odoo: Debug** — start Odoo with the Python debugger and `justMyCode: false`.
- **Odoo: Update Module** — choose the current module, select one or more detected modules, or enter module names manually; then run `-u module --stop-after-init`.
- **Odoo: Update Addons Folder** — detect the `addons_path` containing the active file, collect all addon manifests directly inside it, and run one update for the complete folder.
- **Odoo: Install Module** — run `-i module --stop-after-init`.
- **Odoo: Test Module** — run `--test-enable --test-tags module --stop-after-init`.
- **Odoo: Test Current Module** — detect the module containing the active file and run `--test-enable --test-tags module --stop-after-init` for it.
- **Odoo: Generate VS Code Configs** — write workspace `launch.json` profiles.

The **Odoo Runner** view is also available from the Activity Bar. It provides direct Run, Debug, Update, Install and Test actions, plus a detected-module list where clicking a module updates it directly.

The same view provides **Configure Ruff**, **Ruff: Check Current File**, **Ruff: Check Current Module** and **Ruff: Refresh**. **Configure Ruff** installs Ruff into the configured project virtual environment and stores its executable path. Ruff activates that environment before running and lets Ruff auto-detect `pyproject.toml`, `ruff.toml` or `.ruff.toml` unless an explicit config is selected.

The extension stores only paths and run preferences in workspace settings. It does not package Odoo source, databases, credentials or virtual environments.

When updating modules, detected modules come from the workspace folder and the configured Odoo `addons_path`. The current module is inferred from the active editor when its parent folder contains `__manifest__.py` or `__openerp__.py`.

The default configuration disables the Python language server for the workspace to avoid duplicate indexing when the Odoo IDE extension is installed. Change `odooRunner.disablePylance` to `false` if normal Python diagnostics are preferred.

Commands use the active editor's workspace folder in multi-root workspaces. Module detection also follows configured external `addons_path` entries, so current-module actions work when custom addons are outside the workspace root.

Odoo test commands use Odoo's process exit code as the result and do not parse human-readable log summaries. This keeps pass/fail behavior stable across Odoo versions and locales.

## Local package

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension vdx-odoo-runner-0.1.15.vsix
```

Build the current release with `npx @vscode/vsce package`; the generated file is `vdx-odoo-runner-0.1.15.vsix`.
