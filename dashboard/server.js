const express = require('express');
const Docker = require('dockerode');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { exec } = require('child_process');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

app.use(express.json());
app.use(cookieParser());

// --- HISTORY LOGGING ---
const historyFile = path.join(__dirname, 'history.json');
if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify([]));
}

function logActivity(action, details) {
    const history = JSON.parse(fs.readFileSync(historyFile));
    history.push({
        timestamp: new Date().toISOString(),
        action,
        details
    });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// --- AUTHENTICATION MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized. Please login.' });
    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token.' });
    }
};

// --- AUTH ENDPOINTS ---
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,
    message: { error: 'Too many login attempts, please try again later.' }
});

app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 24*60*60*1000 });
        logActivity('LOGIN', `User ${username} logged in`);
        return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ success: true });
});

// Serve static files AFTER auth logic so we can check index.html but maybe we just protect the API?
// If we want to protect the UI, we should serve a login page if no token, else index.html.
// To keep it simple, we serve public folder. The frontend JS will check API and show login form if 401.
app.use(express.static(path.join(__dirname, 'public')));

// --- CONTAINER MANAGEMENT ENDPOINTS (PROTECTED) ---
app.use('/api/containers', requireAuth);
app.use('/api/loadtest', requireAuth);
app.use('/api/report', requireAuth);

app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true, filters: { label: ['lab-module=true'] } });
        const result = containers.map(c => ({
            id: c.Id,
            name: c.Names[0].replace('/', ''),
            state: c.State,
            status: c.Status,
            image: c.Image,
            ports: c.Ports,
            labels: c.Labels
        }));
        res.json(result);
    } catch (err) {
        console.error('Error fetching containers:', err);
        res.status(500).json({ error: 'Failed to fetch containers' });
    }
});

app.post('/api/containers/:id/start', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        await container.start();
        logActivity('START_LAB', `Started container ${req.params.id.substring(0, 8)}`);
        res.json({ message: 'Container started' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to start container' });
    }
});

app.post('/api/containers/:id/stop', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        await container.stop();
        logActivity('STOP_LAB', `Stopped container ${req.params.id.substring(0, 8)}`);
        res.json({ message: 'Container stopped' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to stop container' });
    }
});

app.post('/api/containers/:name/reset', async (req, res) => {
    const serviceName = req.params.name.replace('lab_', ''); // Docker compose service names
    
    // Command Injection Protection
    if (!/^[a-z0-9_-]+$/.test(serviceName)) {
        return res.status(400).json({ error: 'Invalid service name format' });
    }
    const allowedServices = ['dashboard', 'prometheus', 'grafana', 'target-app', 'waf', 'juice-shop', 'dvwa', 'webgoat', 'vampi', 'metasploitable2', 'ssrf-lab'];
    if (!allowedServices.includes(serviceName)) {
        return res.status(400).json({ error: 'Service not allowed' });
    }

    try {
        logActivity('RESET_LAB', `Resetting lab service ${serviceName}`);
        // Run docker-compose inside the container. Assuming working directory is /usr/src/app with docker-compose.yml
        exec(`docker compose up -d --force-recreate -V ${serviceName}`, (error, stdout, stderr) => {
            if (error) {
                console.error('Reset error:', error);
                return res.status(500).json({ error: 'Failed to reset container' });
            }
            res.json({ message: 'Container reset successfully' });
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset container' });
    }
});

app.get('/api/containers/:id/logs', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        const logs = await container.logs({ stdout: true, stderr: true, tail: 100 });
        res.send(logs.toString('utf8'));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

app.get('/api/containers/:id/stats', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        const stats = await container.stats({ stream: false });
        
        // Calculate CPU %
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        let cpuPercent = 0.0;
        if (systemDelta > 0 && cpuDelta > 0) {
            cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0;
        }

        // Calculate RAM MB
        const memUsage = stats.memory_stats.usage;
        const memLimit = stats.memory_stats.limit;
        const memPercent = (memUsage / memLimit) * 100.0;
        
        res.json({
            cpu: cpuPercent.toFixed(2),
            mem: (memUsage / 1024 / 1024).toFixed(2),
            memPercent: memPercent.toFixed(2),
            netRx: (stats.networks.eth0.rx_bytes / 1024).toFixed(2),
            netTx: (stats.networks.eth0.tx_bytes / 1024).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// --- LOAD TEST ENDPOINTS ---
app.post('/api/loadtest/run-real', (req, res) => {
    const { scenario } = req.body;
    
    // Command Injection Protection
    if (!['ramp-up', 'spike', 'sustained'].includes(scenario)) {
        return res.status(400).json({ error: 'Invalid scenario' });
    }

    logActivity('RUN_LOAD_TEST', `Running load test scenario: ${scenario}`);
    
    // We run k6 container mapping the script directly by reading it and piping it to `docker run -i`
    // Since we have docker cli installed, and we can read the file (if we mount it):
    exec(`cat /usr/src/app/load-tests/${scenario}.js | docker run --rm -i --network lab_lab-network grafana/k6 run -`, (error, stdout, stderr) => {
        if (error) {
            console.error('Load test error:', error);
            return res.status(500).json({ error: 'Load test failed', details: stderr });
        }
        
        // Parse basic k6 stdout to extract RPS and p95.
        const httpReqsMatch = stdout.match(/http_reqs\.*: ([\d.]+) \(([\d.]+\/s)\)/);
        const durationMatch = stdout.match(/http_req_duration\.*: avg=([\d.]+[ms|s|µs]+).*p\(95\)=([\d.]+[ms|s|µs]+)/);
        const rps = httpReqsMatch ? httpReqsMatch[2] : 'N/A';
        const p95 = durationMatch ? durationMatch[2] : 'N/A';
        
        logActivity('LOAD_TEST_RESULT', `RPS: ${rps}, p95: ${p95}`);
        res.json({ output: stdout, rps, p95 });
    });
});

app.get('/api/history', (req, res) => {
    const history = JSON.parse(fs.readFileSync(historyFile));
    res.json(history.reverse());
});

app.get('/api/report', (req, res) => {
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=lab-report.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Pentest & Load-Testing Lab Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(14).text(`Generated on: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(16).text('Activity History:');
    doc.moveDown(0.5);
    
    const history = JSON.parse(fs.readFileSync(historyFile));
    history.forEach(item => {
        doc.fontSize(10).text(`[${item.timestamp}] ${item.action}: ${item.details}`);
    });

    doc.end();
    logActivity('EXPORT_REPORT', 'Downloaded PDF report');
});

app.listen(port, () => {
    console.log(`Dashboard listening at http://localhost:${port}`);
});
