# External HTTPS access

## Prepare

Use a public DNS hostname you control. Point its A/AAAA records to your computer or gateway. Public TCP ports 80 and 443 must reach the chosen local proxy ports. DNS, router forwarding and firewall changes are outside this manager's control.

The manager does not buy cloud servers, change DNS accounts, open firewall rules or register system services. It installs an application-local Caddy binary, writes a reviewed configuration, runs the proxy and lets Caddy obtain and renew certificates. Protected ports can require OS permission; use high local ports with gateway forwarding or your existing proxy when appropriate. A bind permission error is shown rather than requesting blanket elevation.

## Managed proxy

1. Open External access and enter your domain and local proxy ports.
2. Review the DNS lookup, network prerequisites and exact configuration changes.
3. Install the proxy. The pinned official release archive is checked against its release SHA-256 checksum before extraction.
4. Apply and restart. This ends managed terminal programs, backs up the previous TOML, writes the new configuration and starts server and proxy.
5. Verify public HTTPS. The response must identify this same running server. A running proxy alone is not proof of reachability or a valid certificate.

The generated configuration keeps the backend on `127.0.0.1`, enables cloud authentication policy, sets secure cookies and permits only the public origin and exact local management host. Only `127.0.0.1/32` is trusted to supply forwarded client addresses. The management control page is not proxied.

## Existing proxy

Select an existing proxy on the same computer. Forward HTTPS and WebSocket traffic to `127.0.0.1:<server-port>`, preserve Host, and pass the actual client address in X-Forwarded-For. The preview produces the corresponding server configuration but does not modify your proxy. Remote proxy topologies require manual configuration and are not claimed by this wizard.

## Stop or restore

Restore local access stops the owned proxy and restores the backed-up TOML, then restarts the server. If the file has changed since deployment, automatic restore refuses to overwrite those edits. Inspect `proxy/server.before.toml` and merge the intended values manually. Certificates and proxy data remain in the manager's data folder.

A failed deployment attempts to restore the prior configuration. Read the reported error if recovery also fails. Keep the management page open while troubleshooting; it remains local even when public access is broken.

## Reference

[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) describes certificate issuance and renewal. Existing gateway/subpath deployments remain separate from this root-origin wizard.
