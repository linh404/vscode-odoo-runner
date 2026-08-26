class TerminalManager {
  constructor(vscode, context) {
    this.vscode = vscode;
    this.context = context;
    this.terminal = undefined;
  }

  stop() {
    if (!this.terminal) return;
    try {
      this.terminal.sendText("\u0003", false);
    } catch {
      // The terminal may already have been disposed by VS Code.
    }
    this.terminal.dispose();
    this.terminal = undefined;
  }

  showShell(settings, name, command) {
    this.stop();
    const terminalOptions = process.platform === "win32"
      ? { shellPath: process.env.ComSpec || "cmd.exe", shellArgs: ["/d", "/c", command] }
      : { shellPath: "/bin/bash", shellArgs: ["--noprofile", "--norc", "-i", "-c", command] };
    this.terminal = this.vscode.window.createTerminal({
      name,
      cwd: settings.cwd || this.context.root(),
      ...terminalOptions,
    });
    this.terminal.show(true);
  }

  showOdooRun(settings, command) {
    if (!this.terminal || this.terminal.exitStatus) {
      this.terminal = this.vscode.window.createTerminal({ name: "Odoo: Run", cwd: settings.cwd || this.context.root() });
    }
    this.terminal.show(true);
    this.terminal.sendText(command, true);
  }

  dispose() {
    this.stop();
  }
}

module.exports = { TerminalManager };
