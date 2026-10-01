# Interface conventions

Use the existing compact workspace controls, system font stack, spacing and
light/dark color tokens. Settings should explain the outcome in user language.

## Boolean settings

Use a slide switch for persistent on/off preferences. The visual track is
28 × 16 px with a 12 px thumb; use the existing switch component in the workspace.
The manager's equivalent uses `role="switch"`, an accessible label, a visible
keyboard focus ring and reduced-motion support. A native checkbox may be the
underlying input, but must not appear as an unstyled square checkbox.

## State and confirmation

Show starting, running, stopping and failed states explicitly. Disable conflicting
actions while a request is pending. Port conflicts and write failures must show
the concrete cause without silently overwriting another configuration.

Stopping or restarting a server ends terminal programs. Explain this beside the
confirmation, preserve saved layouts, and keep credentials out of logs. Background
execution is opt-in and must leave an accessible tray control.

## Review

Check light and dark appearance, keyboard navigation, narrow windows, long paths,
errors and empty states. Windows filesystem paths must remain valid when selected,
joined, copied or converted into workspace-relative references.

The manager imports the canonical workspace tokens; packaged resources include the same CSS. Runtime interface text is English. Only documentation is translated at this stage. Browser regression checks exercise slide switches, a 700px manager window, both themes, keyboard resizing and Activity width restoration.
