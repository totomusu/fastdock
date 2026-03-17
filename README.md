<div align="center">
  <img src="assets/icon-text.png" alt="FastDock" width="320" />

  <h1>FastDock</h1>

  <p>A lightweight, web-based Docker container management UI for local and LAN environments.</p>

  [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
  [![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
  [![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker)](docker-compose.yml)
</div>

---

> **Security notice:** FastDock has **no user authentication**. It is designed for internal/LAN use only and must be deployed behind a VPN or in a trusted network. Mounting `/var/run/docker.sock` grants full control over the Docker host. See [Security](#security) and [SECURITY.md](SECURITY.md).

---

## Screenshots

<table>
  <tr>
    <td align="center">
      <img src="assets/screenshots/home-screenshot.png" alt="FastDock desktop interface" width="100%" />
      <sub>Desktop — container grid with status indicators</sub>
    </td>
    <td align="center">
      <img src="assets/screenshots/iphone-screenshot.png" alt="FastDock mobile interface" width="100%" />
      <sub>Mobile — responsive layout</sub>
    </td>
  </tr>
</table>

<div align="center">
  <img src="assets/screenshots/modal-screenshot.png" alt="Container edit modal" width="60%" />
  <br /><sub>Edit modal — rename containers and assign custom icons</sub>
</div>

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
  - [Docker Compose (recommended)](#docker-compose-recommended)
  - [Node.js / npm](#nodejs--npm)
  - [PM2 (production)](#pm2-production)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Security](#security)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Features

**Container Management**
- Start and stop containers with a single click
- Real-time status indicators (running / stopped)
- Search containers by name

**Multi-Server Support**
- Manage containers across multiple local and remote Docker hosts
- Add, edit, and delete server configurations
- Per-server container views with clear server labels

**Customization**
- Assign custom display names to containers
- Upload custom icons (PNG, JPG, GIF, WebP, SVG — max 2 MB)
- Search and download icons from the [selfh.st/icons](https://selfh.st/icons) library

**Interface**
- Responsive design — works on desktop, tablet, and mobile
- Configurable grid layout (1–3 columns)
- Sorting options (running first, alphabetical)
- Persistent preferences via `localStorage`

---

## Quick Start

```bash
git clone https://github.com/totovr46/fastdock.git
cd fastdock
docker compose up -d --build
```

Open `http://<your-server-ip>:3080` in a browser.

---

## Installation

### Docker Compose (recommended)

FastDock runs as a container but requires access to the host Docker daemon via the socket mount.

```bash
git clone https://github.com/totovr46/fastdock.git
cd fastdock
docker compose up -d --build
```

- Settings and uploaded icons persist in `./data` (mounted to `/app/data`).
- The default port is `3080`. Override it in `docker-compose.yml` or via the `PORT` environment variable.

> **macOS / Windows:** Docker Desktop mounts the socket into its Linux VM, so FastDock controls that VM's containers — not host OS processes.

### Node.js / npm

**Prerequisites:** Node.js ≥ 16.0.0, Docker daemon running locally.

```bash
git clone https://github.com/totovr46/fastdock.git
cd fastdock
npm install
npm start
```

For development with auto-reload:

```bash
npm run dev          # uses Node.js built-in --watch
npm run dev:nodemon  # uses nodemon
```

> Do not run `npm run dev server.js` — `server.js` is already the entrypoint; extra arguments are forwarded and will cause an error.

### PM2 (production)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-restart on system reboot
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3080` | Port the HTTP server listens on |

### Reverse Proxy

FastDock works behind Caddy, Nginx, or any standard reverse proxy. The server enables Express `trust proxy` so that rate limiting works correctly with `X-Forwarded-For` headers.

Example Caddy block:

```
fastdock.internal {
    reverse_proxy localhost:3080
}
```

### Docker Socket

Verify the socket is accessible before starting:

```bash
ls -la /var/run/docker.sock
```

---

## Usage

### Basic Operations

1. **Select a server** — use the dropdown to switch between local and remote Docker hosts.
2. **View containers** — all containers for the selected server are shown as cards.
3. **Start / Stop** — click the button on any container card.
4. **Edit** — click the pencil icon to open the edit modal.

### Container Customization

1. Click the pencil icon on any container card.
2. Set a custom display name.
3. Upload a custom icon **or** search for one by name (sourced from selfh.st/icons).
4. Click **Save**.

Supported upload formats: PNG, JPG, GIF, WebP, SVG. Maximum size: 2 MB.

### Server Management

1. Click **+** next to the server selector to add a remote server.
2. Enter a name, address (e.g. `http://192.168.1.5`), and port.
3. Use the pencil or trash icons next to existing servers to edit or remove them.

### Status Indicators

| Indicator | Meaning |
|---|---|
| Green dot | Container is running |
| Red dot | Container is stopped |

---

## API Reference

### Container Operations

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/containers` | List all containers |
| `POST` | `/api/containers/:id/start` | Start a container |
| `POST` | `/api/containers/:id/stop` | Stop a container |
| `GET` | `/api/containers/name/:name` | Find a container by name |
| `GET` | `/api/containers/settings` | Get all container customizations |
| `POST` | `/api/containers/settings/:id` | Update container name and/or icon (multipart/form-data) |

### Server Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/app-settings` | Get configured remote servers |
| `POST` | `/api/app-settings/servers` | Add a new server |
| `PUT` | `/api/app-settings/servers/:index` | Edit an existing server |
| `DELETE` | `/api/app-settings/servers/:index` | Remove a server |

### Icon Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search-icon/:name` | Search selfh.st/icons via jsdelivr CDN |
| `POST` | `/api/download-icon` | Download and store an icon (CDN whitelist enforced) |

---

## Security

FastDock implements the following mitigations:

| Measure | Detail |
|---|---|
| Security headers | Helmet sets `X-Frame-Options`, `X-Content-Type-Options`, `CSP`, and more |
| Rate limiting | 100 API requests/min per IP; 20 requests/min for icon downloads |
| Input validation | Container IDs, server addresses, ports, and filenames validated server-side |
| File upload validation | MIME type checked via HTTP header **and** magic bytes; 2 MB limit; filename sanitised |
| SSRF protection | Icon downloads whitelisted to `cdn.jsdelivr.net` only; redirects blocked |
| Path traversal protection | All file paths resolved and checked against the assets directory |
| Error message safety | Server errors logged server-side; clients receive generic messages for 5xx responses |
| Data isolation | `data/` is outside the web root and not accessible over HTTP |

Despite these measures, FastDock **has no authentication layer**. It must only be deployed in networks where all users are trusted. See [SECURITY.md](SECURITY.md) for the full security posture and responsible disclosure process.

---

## Limitations

- No user authentication — deploy in trusted networks only.
- No audit log of container start/stop operations.
- Single-instance only (no distributed state).

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

**Quick steps:**

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes with a clear message.
4. Push and open a Pull Request against `main`.

For bug reports and feature requests, open a [GitHub Issue](https://github.com/totovr46/fastdock/issues).

---

## License

Distributed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for the full text.

---

## Acknowledgements

- [Dockerode](https://github.com/apocas/dockerode) — Docker API client for Node.js
- [selfh.st/icons](https://selfh.st/icons) — icon library used for container icon search
- [Helmet](https://helmetjs.github.io/) — Express security headers
- [Multer](https://github.com/expressjs/multer) — multipart file upload handling
- [file-type](https://github.com/sindresorhus/file-type) — magic byte MIME validation
