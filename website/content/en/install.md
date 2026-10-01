# Installation and updates

## Server archive

Extract the archive matching your OS and CPU. Keep the `frontend` directory beside the `gtmux` executable. No Rust or npm installation is needed for a published server archive.

```sh
./gtmux start --name local --port 9001 --workspace /absolute/project/folder
```

Open the bootstrap URL printed by the server. The token is a credential; do not publish it. For a persistent configuration use `--config /absolute/path/server.toml`. Existing command-line and environment overrides still take precedence.

## Desktop application

Install the package for your platform, open gtmux, select a workspace and an unused port, save setup, then start the server. The app owns a separate configuration and Store; it does not adopt or stop unrelated servers.

Choose Web, App, or Web + app. Background mode keeps the manager in the system tray while its window is hidden. This does not install a system service or automatically enable login startup. Quitting the app stops its server and running terminal programs.


## Updating

Download the newer installer/archive from the same repository's Releases page. Stop the managed server before replacing application files. Keep your data directory and configuration. Terminal programs are not checkpointed by an update. Retain the previous package for rollback; do not assume a newer Store schema can be opened by an older server.

## Local source preview

See [Contributing](contributing.html) for build and manager commands. Release workflows create downloadable artifacts; they do not make an unpublished build available retroactively.

## Native Windows build

The integration branch now targets native Windows through ConPTY: no WSL or
Python environment is required. Windows 10 version 1809 or newer is required by
ConPTY. The default shell is `COMSPEC` (`cmd.exe`); explicit pane commands can
select PowerShell. Credentials use a private Windows DACL, and server shutdown
uses the owned server API or a per-process Windows event. Native Windows and
macOS runtime results must pass the platform CI before a release is declared
supported. Unsigned installers may require OS confirmation.

On Windows, start the extracted server from PowerShell with `./gtmux.exe start --name local --port 9001 --workspace C:/Projects`. Native Windows backend tests and the packaged application startup/stop/exit check have passed locally. macOS runtime checks, signed distribution and public DNS/ACME validation remain release validation steps.

Release-configured desktop packages also provide [automatic checks and downloads](updates.html), with explicit confirmation before installation. Local packages without a published feed remain manually replaceable.
