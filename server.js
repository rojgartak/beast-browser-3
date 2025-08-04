const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

// Apply Stealth Plugin
puppeteer.use(StealthPlugin());

// Fingerprint Generator
function generateFingerprint() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    const screenResolutions = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
    ];
    const timezones = ['Asia/Kolkata', 'America/New_York', 'Europe/London'];
    const languages = ['en-US', 'en-GB', 'hi-IN'];
    const hardwareConcurrency = [2, 4, 8];
    const fonts = [['Arial', 'Helvetica'], ['Times New Roman', 'Georgia']];

    return {
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        screen: screenResolutions[Math.floor(Math.random() * screenResolutions.length)],
        timezone: timezones[Math.floor(Math.random() * timezones.length)],
        language: languages[Math.floor(Math.random() * languages.length)],
        hardwareConcurrency: hardwareConcurrency[Math.floor(Math.random() * hardwareConcurrency.length)],
        fonts: fonts[Math.floor(Math.random() * fonts.length)],
        webGL: { vendor: 'WebKit', renderer: 'WebKit WebGL' },
        canvas: { noise: Math.random() * 0.0001 },
        webRTC: { enabled: false },
        audioContext: { noise: Math.random() * 0.0001 }
    };
}

// Launch Browser with Fingerprint
async function launchBrowser(fingerprint, extensions = [], profileId = 'default', proxy = null) {
    const userDataDir = path.join(__dirname, 'profiles', profileId);
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }
    const args = [
        `--no-sandbox`,
        `--disable-setuid-sandbox`,
        `--user-agent=${fingerprint.userAgent}`,
        `--window-size=${fingerprint.screen.width},${fingerprint.screen.height}`,
        `--disable-web-security`,
        `--disable-features=WebRtc,Telemetry,SitePerProcess`
    ];
    if (proxy) {
        args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
    }
    if (extensions.length > 0) {
        args.push(`--load-extension=${extensions.join(',')}`);
    }
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
        userDataDir: '/opt/render/.cache/puppeteer',
        args
    });
    const page = await browser.newPage();
    if (proxy && proxy.username && proxy.password) {
        await page.authenticate({ username: proxy.username, password: proxy.password });
    }
    await page.evaluateOnNewDocument((fp) => {
        Object.defineProperty(Intl, 'DateTimeFormat', {
            value: () => ({ resolvedOptions: () => ({ timeZone: fp.timezone }) })
        });
        Object.defineProperty(navigator, 'language', { value: fp.language, writable: false });
        Object.defineProperty(navigator, 'languages', { value: [fp.language], writable: false });
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: fp.hardwareConcurrency });
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return fp.webGL.vendor;
            if (parameter === 37446) return fp.webGL.renderer;
            return getParameter.apply(this, arguments);
        };
        const getImageData = HTMLCanvasElement.prototype.getContext('2d').getImageData;
        HTMLCanvasElement.prototype.getContext('2d').getImageData = function() {
            const data = getImageData.apply(this, arguments);
            data.data[0] += fp.canvas.noise;
            return data;
        };
        const getChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function() {
            const data = getChannelData.apply(this, arguments);
            for (let i = 0; i < data.length; i++) data[i] += fp.audioContext.noise;
            return data;
        };
        Object.defineProperty(document, 'fonts', {
            value: { check: () => fp.fonts.includes(arguments[0]) }
        });
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
    }, fingerprint);
    return { browser, page };
}

// API Endpoints
app.get('/', (req, res) => {
    res.send('Beast Antidetection Browser Backend');
});

app.get('/ui', (req, res) => {
    res.send(`
        <html>
            <head><title>Beast Browser</title></head>
            <body>
                <h1>Beast Antidetection Browser</h1>
                <button onclick="fetchFingerprint()">New Fingerprint</button>
                <pre id="output"></pre>
                <script>
                    async function fetchFingerprint() {
                        const res = await fetch('/new-fingerprint');
                        const data = await res.json();
                        document.getElementById('output').innerText = JSON.stringify(data, null, 2);
                    }
                </script>
            </body>
        </html>
    `);
});

app.get('/new-fingerprint', async (req, res) => {
    try {
        const fingerprint = generateFingerprint();
        const { browser, page } = await launchBrowser(fingerprint);
        await page.goto('https://api.ipify.org?format=json');
        const ip = await page.evaluate(() => document.body.innerText).then(text => JSON.parse(text).ip);
        await browser.close();
        res.json({ fingerprint, ip });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate fingerprint: ' + error.message });
    }
});

app.post('/custom-fingerprint', async (req, res) => {
    try {
        const fingerprint = req.body.fingerprint || generateFingerprint();
        const { browser, page } = await launchBrowser(fingerprint);
        await page.goto('https://api.ipify.org?format=json');
        const ip = await page.evaluate(() => document.body.innerText).then(text => JSON.parse(text).ip);
        await browser.close();
        res.json({ fingerprint, ip });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process custom fingerprint: ' + error.message });
    }
});

app.post('/launch-profile', async (req, res) => {
    try {
        const fingerprint = req.body.fingerprint || generateFingerprint();
        const profileId = req.body.profileId || 'default';
        const extensions = req.body.extensions || [];
        const { browser, page } = await launchBrowser(fingerprint, extensions, profileId);
        await page.goto('https://browserleaks.com/cookies');
        const cookies = await page.cookies();
        const screenshot = await page.screenshot({ encoding: 'base64' });
        await browser.close();
        res.json({ fingerprint, profileId, cookies, screenshot });
    } catch (error) {
        res.status(500).json({ error: 'Failed to launch profile: ' + error.message });
    }
});

app.post('/launch-with-extensions', async (req, res) => {
    try {
        const fingerprint = req.body.fingerprint || generateFingerprint();
        const extensions = req.body.extensions || [];
        const { browser, page } = await launchBrowser(fingerprint, extensions);
        await page.goto('chrome://extensions/');
        const screenshot = await page.screenshot({ encoding: 'base64' });
        await browser.close();
        res.json({ fingerprint, screenshot });
    } catch (error) {
        res.status(500).json({ error: 'Failed to launch with extensions: ' + error.message });
    }
});

app.post('/bulk-launch', async (req, res) => {
    try {
        const profiles = req.body.profiles || [];
        const results = [];
        for (const profile of profiles) {
            const fingerprint = profile.fingerprint || generateFingerprint();
            const profileId = profile.profileId || `profile-${Math.random().toString(36).substring(2)}`;
            const extensions = profile.extensions || [];
            const proxy = profile.proxy || null;
            const { browser, page } = await launchBrowser(fingerprint, extensions, profileId, proxy);
            await page.goto('https://api.ipify.org?format=json');
            const ip = await page.evaluate(() => document.body.innerText).then(text => JSON.parse(text).ip);
            await browser.close();
            results.push({ profileId, fingerprint, ip });
        }
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Failed to bulk launch: ' + error.message });
    }
});

app.get('/test-fingerprint', async (req, res) => {
    try {
        const fingerprint = generateFingerprint();
        const { browser, page } = await launchBrowser(fingerprint);
        await page.goto('https://pixelscan.net');
        const screenshot = await page.screenshot({ encoding: 'base64' });
        await browser.close();
        res.json({ fingerprint, screenshot });
    } catch (error) {
        res.status(500).json({ error: 'Failed to test fingerprint: ' + error.message });
    }
});

app.listen(process.env.PORT || 3001, () => {
    console.log('Server running on port ' + (process.env.PORT || 3001));
});
