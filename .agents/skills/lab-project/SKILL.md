---
name: lab-project
description: >
  Architecture reference for the Personal Pentest & Load-Testing Lab project.
  Use this skill when working on any part of the Lab codebase to understand
  the project structure, tech stack, Docker label conventions, API endpoints,
  and port mappings.
---

# Lab Project Architecture Reference

## Project Overview

A Docker-based local pentest and load-testing lab with a centralized dashboard
managing 7+ vulnerable application containers, a monitoring stack (Prometheus + Grafana),
and k6 load-testing infrastructure.

## Directory Structure

```
d:\Lab\
├── dashboard/                # Central management dashboard
│   ├── Dockerfile            # Node 20 Alpine + Docker CLI
│   ├── package.json          # Express, Dockerode, JWT, PDFKit
│   ├── server.js             # Backend API (257 lines)
│   └── public/
│       └── index.html        # SPA frontend (469 lines, TailwindCSS CDN)
├── ssrf-lab/                 # Custom SSRF vulnerable app
│   ├── Dockerfile
│   ├── package.json          # Express, Axios
│   └── server.js             # URL fetcher + mock AWS metadata
├── target-app/               # Mock API for load testing
│   ├── Dockerfile
│   ├── package.json          # Express, prom-client, express-rate-limit
│   └── server.js             # /login, /search, /checkout + Prometheus metrics
├── monitoring/
│   ├── prometheus/
│   │   └── prometheus.yml    # Scrape config for target-app
│   └── grafana/
│       ├── provisioning/     # Datasource & dashboard provisioning
│       └── dashboards/       # Load testing dashboard JSON
├── load-tests/
│   ├── ramp-up.js            # k6: gradual increase to 1000 VUs
│   ├── spike.js              # k6: sudden burst to 2000 VUs
│   └── sustained.js          # k6: constant 200 VUs for 10 min
├── docker-compose.yml        # Main orchestration file (v3.8)
└── README.md
```

## Port Mapping

| Service          | Container Port | Host Port | URL                          |
|------------------|---------------|-----------|------------------------------|
| Dashboard        | 3000          | **3000**  | http://localhost:3000         |
| Grafana          | 3000          | **3001**  | http://localhost:3001         |
| Juice Shop       | 3000          | **3002**  | http://localhost:3002         |
| DVWA             | 80            | **3003**  | http://localhost:3003         |
| WebGoat          | 8080          | **3004**  | http://localhost:3004/WebGoat |
| VAmPI            | 5000          | **3005**  | http://localhost:3005         |
| Metasploitable2  | 80            | **3006**  | http://localhost:3006         |
| SSRF-Cloud       | 3000          | **3007**  | http://localhost:3007         |
| ModSecurity WAF  | 80            | **3008**  | http://localhost:3008         |
| Target-App       | 3000          | **4000**  | http://localhost:4000         |

## Docker Label Convention

All lab modules use these Docker labels for dashboard discovery:

```yaml
labels:
  - "lab-module=true"                  # REQUIRED: Marks as discoverable module
  - "lab.name=Display-Name"           # Display name in dashboard
  - "lab.category=Web|API|Network|Cloud|WAF"  # Category for filtering
  - "lab.difficulty=Easy|Medium|Hard"  # Difficulty badge
  - "lab.description=..."             # Short description text
  - "lab.url=http://localhost:PORT"    # Direct access URL
```

The dashboard discovers modules by filtering containers with `lab-module=true` label.

## Dashboard API Endpoints

All `/api/containers/*`, `/api/loadtest/*`, `/api/report` endpoints require JWT auth.

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | Login (rate-limited: 5/min). Body: `{username, password}` |
| POST | `/api/logout` | Logout (clears cookie) |
| GET | `/api/me` | Check auth status |

Default credentials: `admin` / `admin`

### Container Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/containers` | List all lab-module containers |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| POST | `/api/containers/:name/reset` | Reset container (docker compose recreate) |
| GET | `/api/containers/:id/logs` | Get last 100 lines of logs |
| GET | `/api/containers/:id/stats` | Get CPU/RAM/Network stats |

### Load Testing & Reports
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/loadtest/run-real` | Run k6 test. Body: `{scenario: "ramp-up"|"spike"|"sustained"}` |
| GET | `/api/history` | Get activity history |
| GET | `/api/report` | Download PDF report |

### Target App Admin
| Method | Path | Description |
|--------|------|-------------|
| POST | `http://localhost:4000/admin/rate-limit/toggle` | Toggle rate limiting |
| GET | `http://localhost:4000/admin/rate-limit/status` | Check rate limit status |

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Container API | Dockerode (Docker Engine API) |
| Auth | JWT (jsonwebtoken) + cookie-parser |
| Frontend | Single HTML file + TailwindCSS CDN |
| SSRF Lab | Express + Axios |
| Target App | Express + prom-client + express-rate-limit |
| Monitoring | Prometheus + Grafana |
| Load Testing | k6 (Docker-based) |
| Orchestration | Docker Compose v3.8 |
| PDF Export | PDFKit |

## Key Design Patterns

1. **Docker Socket Mounting**: Dashboard container mounts `/var/run/docker.sock` to manage other containers
2. **Docker CLI in Container**: Dashboard Dockerfile installs `docker-cli` + `docker-cli-compose` for reset operations
3. **Label-based Discovery**: No hardcoded container list; dashboard discovers modules via Docker labels
4. **Dynamic Rate Limiting**: Target-app rate limiting can be toggled at runtime via admin endpoint
5. **Activity Logging**: All actions logged to `history.json` file inside dashboard container
6. **Command Injection Protection**: Service name validation with regex + allowlist before exec()

## Adding a New Lab Module

1. Add service to `docker-compose.yml` with required labels
2. Assign next available port (next after 3008 = 3009, or 4001+)
3. Add service name to `allowedServices` array in `dashboard/server.js` line 135
4. Dashboard will auto-discover the new module
