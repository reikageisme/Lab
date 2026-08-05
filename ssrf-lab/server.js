const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head><title>SSRF Lab</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-100 p-8">
            <div class="max-w-xl mx-auto bg-white p-6 rounded shadow">
                <h1 class="text-2xl font-bold mb-4">SSRF Lab - URL Fetcher</h1>
                <p class="mb-4">Enter a URL to fetch its contents. Try to access the internal metadata endpoint at <code>http://169.254.169.254/latest/meta-data/</code></p>
                <form action="/fetch" method="GET" class="flex gap-2">
                    <input type="text" name="url" placeholder="http://example.com" class="flex-1 border p-2 rounded" />
                    <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded">Fetch</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.get('/fetch', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing URL');

    try {
        const response = await axios.get(targetUrl, { timeout: 3000 });
        res.send(`<pre>${response.data}</pre>`);
    } catch (err) {
        res.status(500).send(`Error fetching URL: ${err.message}`);
    }
});

// Mock Cloud Metadata Endpoint for SSRF practice
app.get('/latest/meta-data/', (req, res) => {
    // Only allow access if the request comes from the local network (simulate AWS IMDSv1)
    res.json({
        "ami-id": "ami-0123456789abcdef0",
        "hostname": "ip-10-0-0-5.ec2.internal",
        "iam": {
            "security-credentials": {
                "s3-access-role": {
                    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
                    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
                    "Token": "mock-session-token"
                }
            }
        }
    });
});

app.listen(port, () => {
    console.log(`SSRF Lab running on port ${port}`);
});
