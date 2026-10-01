# Application updates

Open **Updates** in the desktop manager. **Check for updates** finds a newer stable release; **Download update** downloads and verifies it. **Automatic checks and downloads** is off by default. When enabled, the app checks at startup and every six hours. Installing is always explicit: **Install and restart** asks for confirmation and the current server password when required. Running terminal programs end; saved layouts remain. A rejected shutdown leaves the update ready without installing.

The packaged app uses electron-updater and verifies the SHA512 from release metadata. Hash verification does not replace trusted release hosting or platform code signing. The application never silently installs on ordinary exit or downgrades to an older version.

## Release preparation

Build with `GTMUX_RELEASE_REPOSITORY=owner/repo` to include the GitHub update feed. The artifact workflow supplies the current repository, derives the application version from a `vMAJOR.MINOR.PATCH` tag, and builds installer files plus update YAML and blockmaps. It only uploads workflow artifacts: it does not publish a GitHub release or deploy anything. A maintainer must review/sign packages and publish the corresponding files and metadata to the configured release feed. Keep architecture-specific metadata correct when combining matrix outputs; do not overwrite one architecture's latest YAML with another without merging its files.

Windows NSIS, macOS applications and Linux AppImage are the update targets. macOS distribution requires appropriate signing/notarization for reliable installation and updates. Unpacked builds, web-only managers, Linux archives and local packages without a configured feed show why automatic updates are unavailable. Stop an archive installation's server before replacing its binary and frontend together. Do not delete its configuration or Store.

A loopback feed test exercises the actual updater SDK's metadata lookup, download and SHA512 rejection. Tests do not install an update, and no public release has been published as part of this work. macOS/ARM runner results and end-to-end signed release updates remain release acceptance checks.
