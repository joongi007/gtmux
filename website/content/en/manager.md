# Server management

## First run

The manager listens on a random loopback port and prints a private bootstrap URL in CLI mode. This control endpoint is separate from the terminal server and is never routed through the public proxy. It requires its own session cookie and same-origin JSON requests.

Choose an absolute workspace folder, port from 1024 to 65535, presentation mode, and background preference. A port conflict fails without stopping whoever already owns the port. Save setup, start, then open the workspace.

## Configuration

The first setup writes the manager-owned TOML. Later startup changes belong in workspace Settings → Server. Common fields and the advanced editor retain drafts across navigation. Saving requires the current token/password, detects external edits, and reports write failures. Behavior applies after a successful save; other startup settings load after restart. Appearance preferences stay browser-local.

The manager reads the saved TOML again on start. Existing configurations are not replaced when switching presentation mode or background preference.

## Stop and restart

Stop and restart require confirmation that all terminal programs in this managed server will end. Saved layouts remain. Supply the current server password if you configured one. A rejected credential does not trigger a forced kill.

The server drains HTTP and WebSocket connections, blocks late terminal spawns, reaps its terminal children and releases its attach guards. The manager owns only the child process it launched. It never uses a broad process-name kill or a WSL shutdown command.

## Recovery

The manager shows the configuration and log paths. Tokens are redacted from managed server logs. If startup fails, inspect the error before retrying. A shutdown timeout is reported; the manager does not silently force termination. For stale attach ownership, the server keeps the lock inode stable and cleans only its own disconnected owners; never delete a live `.lock` file to force entry.

## Restore hidden activity indicators

In the workspace, open Settings → Appearance → Terminal activity. Enable Activity list to restore the sidebar tab. Unread in browser tab is off by default; turn it on together with Unread output and Browser tab indicators to include unread counts in the title. Hiding indicators retains formats and saved sidebar widths.

## Port recovery and appearance

When the server is stopped, expand **Change startup port or recover from a conflict**, reload the saved port and save a free port. The manager checks the file revision, preserves unrelated TOML and refuses unsupported expressions instead of overwriting them. For external edits, reload the saved file explicitly; restart to apply startup changes. Multiline loopback allowlists must be updated together with the port in TOML.

The manager uses the workspace design tokens and offers System, Light and Dark themes. Save setup to persist the theme. In the workspace, the resize handle also accepts arrow keys (10 px), Shift+arrow (50 px), Home and End. Activity-visible and hidden panel widths are stored separately and survive reload and toggles.

In the desktop first-run screen, enter **Workspace folder** directly or use **Browse…** to open the operating system folder picker. Cancel keeps the typed path. Selecting a folder only updates the form; choose **Save setup** to apply it. The web-only manager accepts the server path as text because a browser cannot provide the server’s absolute filesystem path through a client-side folder upload picker.

Setup buttons use a subtle hover tint; primary actions and the selected navigation item retain their accent color. Reduced-motion preferences disable button transitions.
