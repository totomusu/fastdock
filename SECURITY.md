# Security Policy

## Supported Versions

FastDock is a personal/hobby project. Security fixes are applied to the latest version only (`main` branch). There are no long-term support branches.

---

## Known Security Limitations

FastDock is designed for **trusted, internal networks** (home lab, LAN, behind a VPN). The following are intentional design constraints, not bugs:

| Limitation | Impact |
|---|---|
| **No user authentication** | Any user who can reach the UI has full container management capabilities. |
| **Docker socket mount** | Mounting `/var/run/docker.sock` grants effective root access to the Docker host. A compromised FastDock instance can stop, start, or inspect any container on that host. |
| **No audit logging** | Container start/stop operations are not logged with user attribution. |
| **Single-instance, no RBAC** | There is no role-based access control; all operations are equally privileged. |

### Recommended Deployment Posture

- Run FastDock only on a network segment with trusted users.
- Place it behind a VPN (WireGuard, Tailscale, etc.) so it is not reachable from the public internet.
- Use a reverse proxy with TLS (Caddy, Nginx, Traefik) to encrypt traffic in transit, even on a LAN.
- If multiple users share the network, consider OS-level access controls (firewall rules) to restrict who can reach port `3080`.

---

## Security Measures in Place

The following protections are implemented in the codebase:

| Measure | Detail |
|---|---|
| Security headers | [Helmet](https://helmetjs.github.io/) sets `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, and related headers on every response. |
| Rate limiting | 100 API requests/minute per IP; 20 requests/minute for icon downloads. |
| Input validation | Container IDs, server addresses, port numbers, and filenames are validated server-side before use. |
| File upload validation | MIME type is checked via HTTP `Content-Type` header **and** magic bytes (using `file-type`); maximum size is 2 MB; filenames are sanitised. |
| SSRF protection | Icon downloads are whitelisted exclusively to `cdn.jsdelivr.net`; HTTP redirects are blocked. |
| Path traversal protection | Uploaded file paths are resolved with `path.resolve()` and verified to remain within the `data/assets/` directory. |
| Error message safety | 5xx errors return a generic message to the client; full details are logged server-side only. |
| Data isolation | `data/` (JSON settings, uploaded icons) is outside the web root and cannot be accessed via HTTP. |

---

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Instead, report it privately:

1. Open a [GitHub Security Advisory](https://github.com/totomusu/fastdock/security/advisories/new) (preferred — keeps details private until patched).
2. Or send an email to the maintainer (see the GitHub profile for contact details) with the subject line `[FastDock] Security Vulnerability`.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept (if applicable).
- Any suggested mitigations, if you have them.

You can expect an initial response within **7 days**. Given the scope of this project, there is no formal bug bounty.

---

## Scope

Reports are in scope for any behaviour in this repository that:

- Allows unauthenticated access to data or operations beyond what is documented.
- Bypasses the input validation, SSRF protection, or path traversal protections listed above.
- Leaks sensitive server-side information to the client.

Reports are **out of scope** if they describe:

- The absence of authentication (this is a known, documented design constraint).
- Attacks that require physical access to the server.
- Vulnerabilities in third-party dependencies where the fix belongs upstream.
