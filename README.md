# VDX Odoo Runner

VS Code tools for running, debugging, updating, installing, and testing local Odoo projects. The extension also provides Ruff integration and automatic discovery of Odoo modules from the workspace and configured `addons_path` entries.

## Features

- Run Odoo with a project-specific Python interpreter and configuration file.
- Start Odoo through the VS Code Python debugger.
- Update, install, and test one or more Odoo modules.
- Detect the module associated with the active editor.
- Update all modules directly inside the active addons directory.
- Generate `launch.json` configurations for Odoo Run and Debug profiles.
- Configure Ruff in the project virtual environment.
- Check the current file or current module with Ruff.
- Support multi-root workspaces by using the workspace of the active editor.
- Detect custom addons located outside the workspace root.
- Preserve existing VS Code launch configurations while replacing only the extension-managed profiles.

## Requirements

### Runtime

- Visual Studio Code `1.103.0` or later.
- Python environment compatible with the target Odoo version.
- An Odoo source checkout containing `odoo-bin`.
- An Odoo configuration file with a valid `addons_path` and PostgreSQL settings.
- A reachable PostgreSQL database for commands that use a database, install, update, or test options.
- A workspace opened in VS Code.

### Recommended VS Code extensions

The following dependencies are declared by the extension. VS Code can install them automatically:

- [`Python`](https://marketplace.visualstudio.com/items?itemName=ms-python.python) by Microsoft: Python environment and interpreter integration.
- [`Python Debugger`](https://marketplace.visualstudio.com/items?itemName=ms-python.debugpy) by Microsoft: required for Odoo debugging.
- [`Odoo IDE`](https://marketplace.visualstudio.com/items?itemName=trinhanhngoc.vscode-odoo): Odoo model and inheritance navigation.

The Odoo IDE extension is recommended but is not required to run Odoo. By default, VDX Odoo Runner disables the Python language server for the workspace to avoid duplicate indexing when the Odoo IDE extension is installed. Set `odooRunner.disablePylance` to `false` to keep the normal Python language server enabled.

## Installation

### From a VSIX package

Build or download a release package, then install it with the VS Code CLI:

```bash
code --install-extension vdx-odoo-runner-0.1.16.vsix
```

Use `Developer: Reload Window` after replacing an already-installed development build.

### From source

Clone the repository and package the extension locally:

```bash
git clone https://github.com/linh404/vscode-odoo-runner.git
cd vscode-odoo-runner
npm test
npx @vscode/vsce package --no-dependencies
code --install-extension vdx-odoo-runner-0.1.16.vsix
```

The generated VSIX file is ignored by Git and should be treated as a build artifact.

## Quick Start

1. Open the Odoo custom-addons or project directory in VS Code.
2. Open the **Odoo Runner** view from the Activity Bar.
3. Run **Odoo: Configure Runner**.
4. Select the Python interpreter, `odoo-bin`, and Odoo configuration file.
5. Enter an optional default database and select an Odoo development mode.
6. Run **Odoo: Run**, **Odoo: Debug**, or another command from the Command Palette or the Odoo Runner view.

The extension stores paths and run preferences in workspace settings. It does not bundle or manage Odoo source code, databases, credentials, filestores, or Python virtual environments.

## Commands

| Command | Description |
| --- | --- |
| **Odoo: Configure Runner** | Select the Python interpreter, `odoo-bin`, config file, default database, and development mode. |
| **Odoo: Run** | Start Odoo in the integrated terminal. |
| **Odoo: Debug** | Start Odoo with the VS Code Python debugger and `justMyCode: false`. |
| **Odoo: Update Module** | Update the current module, selected detected modules, or manually entered module names. |
| **Odoo: Update Addons Folder** | Update every detected module directly inside the addons directory containing the active file. |
| **Odoo: Install Module** | Install one or more modules with `-i` and `--stop-after-init`. |
| **Odoo: Test Module** | Run Odoo tests for manually entered module names. |
| **Odoo: Test Current Module** | Run Odoo tests for the module containing the active file. |
| **Odoo: Generate VS Code Configs** | Create or update Odoo Run and Debug profiles in `.vscode/launch.json`. |
| **Ruff: Configure** | Install Ruff in the configured virtual environment and select its configuration file. |
| **Ruff: Check Current File** | Run `ruff check` for the active file. |
| **Ruff: Check Current Module** | Run `ruff check` for the active Odoo module. |
| **Ruff: Refresh** | Refresh the detected module list in the Odoo Runner view. |

Odoo test commands use Odoo's process exit code as the result. They do not parse human-readable test summaries, so the result remains stable across Odoo versions and locales.

## Configuration

Settings are stored under the `odooRunner` configuration namespace. They can be edited in workspace or user settings, or selected through **Odoo: Configure Runner**.

| Setting | Default | Description |
| --- | --- | --- |
| `odooRunner.pythonPath` | `${workspaceFolder}/.venv/bin/python` | Python interpreter used to run Odoo. |
| `odooRunner.odooBin` | `${workspaceFolder}/../odoo/odoo-bin` | Path to Odoo's `odoo-bin`. |
| `odooRunner.configPath` | `${workspaceFolder}/../odoo/config/${workspaceFolderBasename}.conf` | Odoo configuration file. |
| `odooRunner.database` | Empty | Default database. An empty value prompts before database operations. |
| `odooRunner.devMode` | Empty | Odoo `--dev` mode: `all`, `reload`, `xml`, or `werkzeug`. |
| `odooRunner.cwd` | `${workspaceFolder}` | Working directory used to run Odoo. |
| `odooRunner.disablePylance` | `true` | Disable the Python language server for the workspace. |
| `odooRunner.ruffPath` | `${workspaceFolder}/.venv/bin/ruff` | Ruff executable. |
| `odooRunner.ruffConfigPath` | Empty | Optional explicit Ruff configuration file. Empty enables Ruff's automatic discovery. |

Relative paths are resolved from the active editor's workspace folder. On Windows, the extension also checks the `.venv/Scripts` layout.

## Module Discovery

The extension detects modules from:

- The active editor's workspace folder.
- Each directory listed in the configured Odoo `addons_path`.
- External addons directories outside the workspace root.

A directory is treated as an Odoo module when it contains either `__manifest__.py` or the legacy `__openerp__.py`. The module title is read from the manifest's `name` field when available.

## Architecture

The codebase is organized by responsibility:

```text
extension.js                  # Stable VS Code entrypoint
src/
├── core/                      # Pure path, command, and discovery logic
├── infrastructure/            # VS Code, settings, terminal, and file adapters
├── features/                  # Odoo and Ruff application services
└── ui/                        # Activity Bar tree provider
```

`src/extension.js` is the composition root. The root `extension.js` remains a stable adapter for the VS Code extension host. Core modules are designed to be tested without starting an Extension Development Host.

## Development

Run the test suite:

```bash
npm test
```

Check JavaScript syntax:

```bash
node --check extension.js
```

Package the extension:

```bash
npx @vscode/vsce package --no-dependencies
```

The test suite covers command construction, shell quoting, module discovery, launch configuration generation, and extension activation wiring.

## Troubleshooting

### Runner cannot find Python, Odoo, or the config file

Run **Odoo: Configure Runner** and select each path manually. Confirm that the selected files exist and that the configuration file is readable.

### No modules are detected

Confirm that the active file is inside a directory containing `__manifest__.py` or `__openerp__.py`. Also check that every configured `addons_path` exists and is separated correctly in the Odoo configuration file.

### Debugging does not start

Install the Microsoft Python Debugger extension and verify that the selected interpreter belongs to the Odoo environment. The Runner stops its managed Odoo terminal before starting a debug session.

### Ruff cannot be configured

Confirm that the configured Python environment has a working `pip` installation and network or package-index access. **Ruff: Configure** installs Ruff with `python -m pip install ruff`.

### Changes are not visible after installing a development VSIX

Run `Developer: Reload Window`, or uninstall the existing `VDX Odoo Runner` installation before installing the new package.

## License

This project is licensed under the [MIT License](LICENSE).

## Repository

Source code and issue tracking are available at [github.com/linh404/vscode-odoo-runner](https://github.com/linh404/vscode-odoo-runner).
