const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
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
async function launchBrowser(fingerprint) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            `--no-sandbox`,
            `--disable-setuid-sandbox`,
            `--user-agent=${fingerprint.userAgent}`,
            `--window-size=${fingerprint.screen.width},${fingerprint.screen.height}`,
            `--disable-web-security`,
            `--disable-features=WebRtc`
        ]
    });
    const page = await browser.newPage();

    // Apply Fingerprint Settings
    await page.evaluateOnNewDocument((fp) => {
        // Timezone
        Object.defineProperty(Intl, 'DateTimeFormat', {
            value: () => ({ resolvedOptions: () => ({ timeZone: fp.timezone }) })
        });

        // Language
        Object.defineProperty(navigator, 'language', { value: fp.language, writable: false });
        Object.defineProperty(navigator, 'languages', { value: [fp.language], writable: false });

        // Hardware Concurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: fp.hardwareConcurrency });

        // WebGL
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return fp.webGL.vendor;
            if (parameter === 37446) return fp.webGL.renderer;
            return getParameter.apply(this, arguments);
        };

        // Canvas
        const getImageData = HTMLCanvasElement.prototype.getContext('2d').getImageData;
        HTMLCanvasElement.prototype.getContext('2d').getImageData = function() {
            const data = getImageData.apply(this, arguments);
            data.data[0] += fp.canvas.noise;
            return data;
        };

        // AudioContext
        const getChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function() {
            const data = getChannelData.apply(this, arguments);
            for (let i = 0; i < data.length; i++) data[i] += fp.audioContext.noise;
            return data;
        };

        // Fonts
        Object.defineProperty(document, 'fonts', {
            value: { check: () => fp.fonts.includes(arguments[0]) }
        });

        // WebRTC
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
    }, fingerprint);

    return { browser, page };
}

// API Endpoints
app.get('/', (req, res) => {
    res.send('Beast Antidetection Browser Backend');
});

app.get('/new-fingerprint', async (req, res) => {
    const fingerprint = generateFingerprint();
    const { browser, page } = await launchBrowser(fingerprint);
    await page.goto('https://api.ipify.org?format=json');
    const content = await page.content();
    await browser.close();
    res.json({ fingerprint, ip: JSON.parse(content).ip });
});

app.post('/custom-fingerprint', async (req, res) => {
    const fingerprint = req.body.fingerprint || generateFingerprint();
    const { browser, page } = await launchBrowser(fingerprint);
    await page.goto('https://api.ipify.org?format=json');
    const content = await page.content();
    await browser.close();
    res.json({ fingerprint, ip: JSON.parse(content).ip });
});

app.listen(process.env.PORT || 3001, () => {
    console.log('Server running on port ' + (process.env.PORT || 3001));
});
