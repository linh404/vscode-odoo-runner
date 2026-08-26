# Changelog

## 0.1.15

- Make workspace resolution follow the active editor in multi-root workspaces.
- Support external addon paths when detecting the current module.
- Use cross-platform command quoting and Windows virtual-environment paths.
- Use Odoo's exit code for test results instead of parsing localized log output.
- Stop the Run terminal before starting a debug session.
- Prevent launch configuration generation before valid runner settings exist.
- Remove stale duplicate 0.1.14 packages from the release output.

## Unreleased

- Add **Test Current Module** to run tests for the Odoo module containing the active file.

## 0.1.14

- Restore the pre-fix behavior for **Odoo: Run**: reuse the existing terminal and run the configured Python interpreter directly.

## 0.1.13

- Add **Update Addons Folder** to update all addon modules directly inside the `addons_path` containing the active file.

## 0.1.12

## 0.1.11

- Start Odoo and Ruff in an isolated shell command to avoid terminal activation races with the Python extension.

## 0.1.10

- Make **Configure Ruff** install Ruff into the configured project virtual environment automatically.
- Store the installed Ruff executable path after installation.

## 0.1.9

- Add Ruff configuration to workspace settings.
- Add sidebar actions for Ruff configuration, current-file checks, current-module checks and refresh.

## 0.1.8

- Wait for the integrated terminal shell before sending Run or Update commands.
- Prevent a replaced terminal from sending a stale command after Run is restarted.

## 0.1.7

- Add an `Odoo Runner` Activity Bar view with Run, Debug, Update, Install, Test and Refresh actions.
- List detected modules in the sidebar and update a selected module directly.

## 0.1.6

- Add module selection for **Odoo: Update Module**.
- Detect the current module, scan modules from the workspace and Odoo `addons_path`, or accept module names manually.

## 0.1.5

- Stop the existing Odoo run before starting it again.
- Activate the selected Python virtual environment before terminal runs.

## 0.1.4

- Document runtime, VS Code extension and machine prerequisites.

## 0.1.3

- Scan parent and grandparent directories for Odoo source checkouts.

## 0.1.2

- Replace path text boxes with detected-path pickers and manual file browsing.

## 0.1.1

- Auto-detect valid Python, Odoo and project config paths when workspace settings are stale.

## 0.1.0

- Initial local test release.
