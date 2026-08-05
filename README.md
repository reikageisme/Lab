# Personal Pentest & Load-Testing Lab

Welcome to the Personal Pentest and Load-Testing Lab. This environment is designed entirely to run locally on your machine for learning and practicing penetration testing, load testing, and resilience patterns.

> [!CAUTION]
> **WARNING**: The applications included in this lab (Juice Shop, DVWA, WebGoat) are intentionally designed to be highly vulnerable. **DO NOT** expose these services to the public internet. Ensure they are only running on your local machine (`localhost`). This lab is purely for educational purposes and authorized testing. Do not use these tools to attack systems you do not own or have explicit permission to test.

## Features

- **Centralized Dashboard**: A web-based gateway to start, stop, and view logs of all your lab modules from one place.
- **Vulnerable Web Apps**:
  - **OWASP Juice Shop**: Learn modern web vulnerabilities (XSS, SQLi, Broken Auth) on a modern JavaScript stack.
  - **DVWA (Damn Vulnerable Web App)**: A classic PHP/MySQL vulnerable application.
  - **WebGoat**: An educational application by OWASP to learn complex Java-based vulnerabilities.
- **Target App**: A mock Node.js/Express API designed for load testing and observing resilience (e.g., rate-limiting behavior).
- **Monitoring Stack**: Prometheus and Grafana pre-configured to monitor the Target App.
- **Load Testing Toolkit**: Built-in `k6` scripts for ramp-up, spike, and sustained load testing.

## Prerequisites

- Docker and Docker Compose installed (e.g., Docker Desktop).
- Node.js (Optional, if you want to run `k6` outside of Docker, but `k6` Docker instructions are provided below).

## Getting Started

1. **Start the entire lab environment:**
   ```bash
   docker-compose up -d --build
   ```

2. **Access the Central Dashboard:**
   Open your browser and navigate to: http://localhost:3000

3. **Access Grafana Monitoring:**
   Open your browser and navigate to: http://localhost:3001
   - **Username:** `admin`
   - **Password:** `admin`
   - View the "Load Testing Dashboard" under the General folder.

## Running Load Tests

To run the load tests against the Target App using a temporary `k6` container, use the following commands:

**1. Ramp-up Test:** (Gradually increases load to 1000 users)
```bash
docker run --rm -i --network lab_lab-network grafana/k6 run - < load-tests/ramp-up.js
```

**2. Spike Test:** (Sudden burst to 2000 users)
```bash
docker run --rm -i --network lab_lab-network grafana/k6 run - < load-tests/spike.js
```

**3. Sustained Test:** (Constant load of 200 users for 10 minutes)
```bash
docker run --rm -i --network lab_lab-network grafana/k6 run - < load-tests/sustained.js
```

> [!TIP]
> **Toggle Rate Limiting:**
> The Target App has rate-limiting built-in (50 req/min/IP). You can dynamically toggle this to see the effect on the load tests.
> - **Turn ON/OFF:** `curl -X POST http://localhost:4000/admin/rate-limit/toggle`
> - **Check Status:** `curl http://localhost:4000/admin/rate-limit/status`
> 
> Try running a load test with Rate Limiting disabled, and then run it again with it enabled. Observe the RPS and Error Rates in the Grafana dashboard!

## Managing Lab Modules

You can use the Central Dashboard at `http://localhost:3000` to Start or Stop any of the vulnerable apps. This saves resources on your local machine by only running the apps you are actively testing. You can also view the latest container logs directly from the UI.
