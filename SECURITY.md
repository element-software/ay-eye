# Security

Do not expose this app publicly without authentication, TLS, and network-level protection.

Recommended deployment:

- localhost only
- private LAN only
- Tailscale or WireGuard for remote access
- reverse proxy with HTTPS and authentication if exposed

Avoid:

- exposing the dashboard directly to the internet
- committing `.env` files
- sharing screenshots containing provider IDs, project IDs, or usage metadata
