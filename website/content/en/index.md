# gtmux

gtmux keeps terminals, files and notes together on a spatial canvas. Sessions preserve a workspace layout; terminals are live processes managed by the server.

## Choose your way in

- [Install](install.html) a server archive or the desktop app.
- [Manage your server](manager.html), choose its port and open it in the app, browser, or both.
- [Prepare external HTTPS access](external-access.html) with a managed proxy.
- [Contribute](contributing.html) or explore the [architecture](architecture.html).

## What is included

Session-aware browser titles, configurable terminal activity indicators, persistent TOML settings, reconnect-safe attach ownership, a desktop server manager, and bilingual documentation.

Activity distinguishes observed output and reported agent state. Output becoming quiet does not reliably prove that an agent finished or needs input. Disable the indicators you do not use in Settings.

## Preview status

Linux local tests cover the server and manager. Windows builds use a native ConPTY server; WSL is not required. macOS and Windows installers are built by the release workflow and require platform testing before a production release. Download availability depends on the repository publishing a release. Unsigned packages can trigger OS trust prompts.
