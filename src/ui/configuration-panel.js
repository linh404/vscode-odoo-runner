const path = require("path");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function field(value) {
  return escapeHtml(value || "");
}

function configurationHtml(webview, settings) {
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Odoo Runner Configuration</title>
  <style>
    :root { color-scheme: light dark; }
    body { padding: 20px; max-width: 900px; margin: 0 auto; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    h1 { font-size: 1.35rem; margin-top: 0; }
    .hint { color: var(--vscode-descriptionForeground); margin: 0 0 18px; }
    form { display: grid; gap: 14px; }
    .row { display: grid; grid-template-columns: 170px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
    label { font-weight: 600; }
    input, select { width: 100%; box-sizing: border-box; padding: 7px 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    input[type="checkbox"] { width: auto; }
    button { padding: 7px 14px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    @media (max-width: 650px) { .row { grid-template-columns: 1fr; } .row button { justify-self: start; } }
  </style>
</head>
<body>
  <h1>Odoo Runner Configuration</h1>
  <p class="hint">Choose the project paths and defaults used by Odoo Runner and Ruff. Paths can be absolute or relative to the workspace.</p>
  <form id="config-form">
    <div class="row"><label for="pythonPath">Python interpreter</label><input id="pythonPath" required value="${field(settings.pythonPath)}" placeholder="${escapeHtml(path.join(".venv", "bin", "python"))}"><button type="button" data-browse="pythonPath">Browse…</button></div>
    <div class="row"><label for="odooBin">Odoo odoo-bin</label><input id="odooBin" required value="${field(settings.odooBin)}" placeholder="${escapeHtml(path.join("..", "odoo", "odoo-bin"))}"><button type="button" data-browse="odooBin">Browse…</button></div>
    <div class="row"><label for="configPath">Odoo config</label><input id="configPath" required value="${field(settings.configPath)}" placeholder="${escapeHtml(path.join("..", "odoo", "config", "project.conf"))}"><button type="button" data-browse="configPath">Browse…</button></div>
    <div class="row"><label for="database">Default database</label><input id="database" value="${field(settings.database)}" placeholder="Leave empty to ask before database commands"></div>
    <div class="row"><label for="devMode">Development mode</label><select id="devMode"><option value="">None</option><option value="all">all</option><option value="reload">reload</option><option value="xml">xml</option><option value="werkzeug">werkzeug</option></select></div>
    <div class="row"><label for="cwd">Working directory</label><input id="cwd" value="${field(settings.cwd)}" placeholder="Workspace folder"><button type="button" data-browse="cwd">Browse…</button></div>
    <div class="row"><label for="disablePylance">Disable Pylance</label><input id="disablePylance" type="checkbox" ${settings.disablePylance ? "checked" : ""}></div>
    <h2>Ruff</h2>
    <div class="row"><label for="ruffPath">Ruff executable</label><input id="ruffPath" value="${field(settings.ruffPath)}" placeholder="ruff or .venv/bin/ruff"><button type="button" data-browse="ruffPath">Browse…</button></div>
    <div class="row"><label for="ruffConfigPath">Ruff config (optional)</label><input id="ruffConfigPath" value="${field(settings.ruffConfigPath)}" placeholder="Auto-detect pyproject.toml, ruff.toml or .ruff.toml"><button type="button" data-browse="ruffConfigPath">Browse…</button></div>
    <div class="actions"><button type="button" class="secondary" id="cancel">Cancel</button><button type="submit">Save Configuration</button></div>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const devMode = document.getElementById('devMode');
    devMode.value = ${JSON.stringify(settings.devMode || "")};
    document.querySelectorAll('[data-browse]').forEach((button) => button.addEventListener('click', () => {
      vscode.postMessage({ type: 'browse', field: button.dataset.browse });
    }));
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('config-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {};
      ['pythonPath', 'odooBin', 'configPath', 'database', 'devMode', 'cwd', 'ruffPath', 'ruffConfigPath'].forEach((id) => { values[id] = document.getElementById(id).value.trim(); });
      values.disablePylance = document.getElementById('disablePylance').checked;
      vscode.postMessage({ type: 'save', values });
    });
    window.addEventListener('message', (event) => {
      if (event.data.type === 'setValue') document.getElementById(event.data.field).value = event.data.value || '';
    });
  </script>
</body>
</html>`;
}

function createConfigurationPanel(vscode, settings, handlers) {
  const panel = vscode.window.createWebviewPanel(
    "vdxOdooRunner.configuration",
    "Odoo Runner Configuration",
    vscode.ViewColumn?.One || 1,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = configurationHtml(panel.webview, settings);
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === "cancel") return handlers.onCancel?.();
    if (message.type === "save") return handlers.onSave?.(message.values);
    if (message.type !== "browse") return;
    const isFolder = message.field === "cwd";
    const selected = await vscode.window.showOpenDialog({
      title: `Select ${message.field}`,
      canSelectFiles: !isFolder,
      canSelectFolders: isFolder,
      canSelectMany: false,
      filters: isFolder ? undefined : { Files: ["py", "conf", "cfg", "exe", "*"] },
    });
    if (selected?.[0]) panel.webview.postMessage({ type: "setValue", field: message.field, value: selected[0].fsPath });
  });
  panel.onDidDispose(() => handlers.onCancel?.());
  return panel;
}

module.exports = { createConfigurationPanel, configurationHtml };
