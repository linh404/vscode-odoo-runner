# VDX Odoo Runner — User Guide

VDX Odoo Runner is a VS Code extension for running and debugging local Odoo projects, managing Odoo modules, discovering addons, and checking Python code with Ruff.

## 1. Prepare the project

A common project layout looks like this:

```text
workspace/
├── .venv/bin/python
├── custom-addons/
│   └── my_module/__manifest__.py
└── .vscode/
    └── settings.json
odoo/
├── odoo-bin
└── config/my-project.conf
```

1. Create a virtual environment compatible with your Odoo version.
2. Prepare PostgreSQL and a reachable development database.
3. Copy [`odoo.conf.template`](odoo.conf.template) to a real `.conf` file.
4. Replace the PostgreSQL settings, `addons_path`, and `logfile` with real absolute paths and values.

## 2. Configure through the GUI

Open the Activity Bar → **Odoo Runner** → **Configure Runner**. The configuration form includes:

- **Python interpreter**: the project Python executable, usually inside `.venv`.
- **Odoo odoo-bin**: the `odoo-bin` file from the Odoo source checkout.
- **Odoo config**: the `.conf` file prepared above.
- **Default database**: the default database; leave it empty to be prompted before each database command.
- **Development mode**: `all`, `reload`, `xml`, `werkzeug`, or `None`.
- **Working directory**: the directory from which Odoo runs, usually the workspace folder.
- **Disable Pylance**: enable this when using Odoo IDE to avoid duplicate indexing.
- **Ruff executable**: the Ruff executable, usually `.venv/bin/ruff`.
- **Ruff config**: leave empty to let Ruff discover `pyproject.toml`, `ruff.toml`, or `.ruff.toml` automatically.

Use **Browse…** to select files and folders, or enter paths directly. Click **Save Configuration** to store the values in workspace settings. The extension also updates Python extra paths and creates or updates `.vscode/launch.json`.

The **Configure Ruff** command installs Ruff with `python -m pip install ruff`, then opens this same GUI form.

## 3. Run Odoo commands

The following commands are available from the Command Palette and the Odoo Runner view:

| Command | Purpose |
| --- | --- |
| **Odoo: Run** | Start the Odoo server in the integrated terminal. |
| **Odoo: Debug** | Start Odoo through the Python Debugger (`debugpy`). |
| **Odoo: Update Module** | Choose the current module, detected modules, or enter module names manually to update. |
| **Odoo: Update Addons Folder** | Update every module directly inside the addons folder containing the active file. |
| **Odoo: Install Module** | Enter one or more module names to install. |
| **Odoo: Install Current Module** | Install the module containing the active file. |
| **Odoo: Test Module** | Run tests for manually entered module names. |
| **Odoo: Test Current Module** | Run tests for the module containing the active file. |

Install, update, and test commands require a database. If no default database is configured, the extension asks for one before running the command. Test commands use Odoo's process exit code and do not parse human-readable logs, so results remain stable across Odoo versions and locales.

## 4. Module discovery

The extension searches the active workspace folder and every directory listed in `addons_path`. A directory is treated as an Odoo module when it contains `__manifest__.py` or the legacy `__openerp__.py`.

To run a current-module command, open a file inside the target module before invoking the command.

## 5. Ruff

- **Ruff: Configure**: install Ruff and open the GUI configuration form.
- **Ruff: Check Current File**: run `ruff check` on the active file.
- **Ruff: Check Current Module**: run `ruff check` on the current module.
- When no explicit config is selected, Ruff automatically searches the file and module hierarchy for its configuration.

## 6. Multi-root workspaces

In a multi-root workspace, the extension uses the workspace folder of the active editor. Open a file from the intended project before configuring or running Odoo and Ruff commands.

## 7. Troubleshooting

- **Python, Odoo, or config file not found**: open Configure Runner and verify the three required paths.
- **No modules detected**: check `addons_path` and confirm that each module contains a manifest file.
- **Database connection failure**: verify PostgreSQL, `db_host`, `db_port`, `db_user`, `db_password`, and the database name.
- **Debugging does not start**: install Microsoft Python Debugger and select the correct Python interpreter.
- **Ruff installation fails**: check `pip`, the virtual environment, and access to the package index.
- **Changes are not visible after installing a VSIX**: run `Developer: Reload Window`.
