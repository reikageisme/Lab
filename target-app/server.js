const express = require('express');
const rateLimit = require('express-rate-limit');
const promClient = require('prom-client');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// --- Prometheus Metrics Setup ---
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: promClient.register }); // CPU/RAM metrics

const httpRequestDurationMicroseconds = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.3, 0.5, 0.7, 1, 2, 5]
});

const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

// Middleware to record metrics
app.use((req, res, next) => {
    // We don't want to log /metrics
    if (req.path === '/metrics' || req.path.startsWith('/admin')) {
        return next();
    }
    
    const end = httpRequestDurationMicroseconds.startTimer();
    res.on('finish', () => {
        const route = req.route ? req.route.path : req.path;
        httpRequestsTotal.inc({
            method: req.method,
            route: route,
            status_code: res.statusCode
        });
        end({
            method: req.method,
            route: route,
            status_code: res.statusCode
        });
    });
    next();
});

// --- Rate Limiting Setup ---
let isRateLimitEnabled = process.env.RATE_LIMIT_ENABLED === 'true';

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // Limit each IP to 50 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

// Dynamic middleware for rate limiting
app.use((req, res, next) => {
    if (isRateLimitEnabled && req.path !== '/metrics' && !req.path.startsWith('/admin')) {
        return limiter(req, res, next);
    }
    next();
});

// --- Admin Endpoints ---
app.post('/admin/rate-limit/toggle', (req, res) => {
    isRateLimitEnabled = !isRateLimitEnabled;
    res.json({ message: 'Rate limit toggled', enabled: isRateLimitEnabled });
});

app.get('/admin/rate-limit/status', (req, res) => {
    res.json({ enabled: isRateLimitEnabled });
});

// --- Expose Metrics ---
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
});

// --- Mock Application Endpoints ---

const simulateDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/login', async (req, res) => {
    // Artificial delay to simulate DB check (e.g. bcrypt hash)
    await simulateDelay(150 + Math.random() * 100); 
    
    if (Math.random() < 0.1) {
        // 10% chance of random server error to see error spikes
        return res.status(500).json({ error: 'Internal server error during login' });
    }
    
    if (!req.body.username || !req.body.password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    
    res.json({ token: 'mock-jwt-token', message: 'Logged in successfully' });
});

app.get('/search', async (req, res) => {
    // Search is generally faster
    await simulateDelay(50 + Math.random() * 50);
    const query = req.query.q || '';
    res.json({ results: [`item1 for ${query}`, `item2 for ${query}`] });
});

app.post('/checkout', async (req, res) => {
    // Checkout is a heavy operation (transaction, payment gateway)
    await simulateDelay(300 + Math.random() * 200);
    
    if (Math.random() < 0.05) {
        // 5% chance of payment failure (402 Payment Required)
        return res.status(402).json({ error: 'Payment declined' });
    }
    
    res.json({ message: 'Checkout successful', orderId: Math.floor(Math.random() * 1000000) });
});

// Fallback for non-existent routes
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
    console.log(`Target app listening at http://localhost:${port}`);
    console.log(`Rate limit is currently: ${isRateLimitEnabled ? 'ENABLED' : 'DISABLED'}`);
});
