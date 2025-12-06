const fs = require('fs');
const { chromium } = require('playwright');
const path = require('path');

class BookmakerService {
    constructor() {
        // Multiple user agents for rotation
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/116.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 OPR/101.0.0.0',
        ];
        
        // Common betting API patterns
        this.apiPatterns = [
            // Odds and markets endpoints
            /\/(odds|markets|betting|prices|quotes)/i,
            /\/(sports|events|matches|fixtures)/i,
            /\/(live|in-play|streaming)/i,
            
            // Common betting operations
            /\/(bet|stake|wager|place-bet)/i,
            /\/(balance|account|wallet)/i,
            
            // Real-time data
            /\/(feed|stream|updates|changes)/i,
            
            // Common path patterns
            /\/api\/v\d+\/(sports|betting|odds)/i,
            /\/(prematch|pre-match|live|upcoming)/i
        ];

        // Betting-specific content types
        this.apiContentTypes = new Set([
            'application/json',
            'application/x-ndjson',  // For streaming updates
            'text/event-stream'      // For SSE
        ]);

        // Categories for betting APIs
        this.categories = {
            ODDS: ['odds', 'prices', 'markets', 'quotes'],
            EVENTS: ['events', 'matches', 'fixtures', 'schedule'],
            LIVE: ['live', 'in-play', 'streaming', 'real-time'],
            BETTING: ['bet', 'stake', 'wager', 'place'],
            ACCOUNT: ['balance', 'account', 'wallet', 'user']
        };
    }

    isBettingApi(request, response) {
        try {
            const url = new URL(request.url());
            const contentType = response?.headers()['content-type'] || '';
            const method = request.method();

            // Skip static assets
            if (url.pathname.match(/\.(jpg|jpeg|png|gif|css|js|woff|woff2|ttf|svg)$/i)) {
                return false;
            }

            // Check API patterns
            const isApiPattern = this.apiPatterns.some(pattern => pattern.test(url.pathname));
            
            // Check for real-time feeds
            const isStream = url.pathname.includes('stream') || 
                           url.pathname.includes('feed') ||
                           contentType.includes('event-stream');

            // Check content type
            const isApiContent = this.apiContentTypes.has(contentType.split(';')[0].toLowerCase());

            // Check for betting-specific query parameters
            const hasOddsParams = url.searchParams.has('odds') ||
                                url.searchParams.has('markets') ||
                                url.searchParams.has('eventId');

            return isApiPattern || isStream || isApiContent || hasOddsParams;
        } catch (e) {
            console.error('Error checking betting API:', e);
            return false;
        }
    }

    categorizeEndpoint(url) {
        const categories = [];
        const urlLower = url.toLowerCase();

        for (const [category, keywords] of Object.entries(this.categories)) {
            if (keywords.some(keyword => urlLower.includes(keyword))) {
                categories.push(category);
            }
        }

        return categories;
    }

    async discoverApis(targetUrl, options = {}) {
        const {
            timeout = 60000,        // Increased timeout
            waitTime = 15000,       // Increased wait time
            headless = true,
            maxRetries = 3
        } = options;

        let browser;
        const discoveredApis = [];
        let retryCount = 0;

        const stealth = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 1,
            hasTouch: false,
            locale: 'en-US',
            timezoneId: 'Europe/London'
        };

        try {
            console.log(`Starting API discovery for ${targetUrl}`);
            
            // Enhanced browser launch with proxy support
            const launchOptions = {
                headless,
                args: [
                    '--disable-web-security',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-infobars',
                    '--window-position=0,0',
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            };

            // Add proxy if available
            if (this.proxies && this.proxies.length > 0) {
                const proxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
                launchOptions.proxy = {
                    server: `http://${proxy}`
                };
                console.log('Using proxy:', proxy);
            }

            browser = await chromium.launch(launchOptions);

            const context = await browser.newContext({
                ...stealth,
                ignoreHTTPSErrors: true,
                javaScriptEnabled: true,
                bypassCSP: true,
                extraHTTPHeaders: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            const page = await context.newPage();

            // Track WebSocket connections
            page.on('websocket', ws => {
                console.log('WebSocket detected:', ws.url());
                discoveredApis.push({
                    url: ws.url(),
                    type: 'WEBSOCKET',
                    categories: ['LIVE'],
                    timestamp: new Date().toISOString()
                });
            });

            // Intercept network requests
            await page.route('**/*', async route => {
                const request = route.request();
                
                try {
                    // Skip image and font requests to reduce load
                    if (request.resourceType() === 'image' || request.resourceType() === 'font') {
                        await route.abort();
                        return;
                    }

                    let response;
                    try {
                        response = await route.fetch({
                            timeout: 30000,
                            maxRedirects: 5
                        });
                    } catch (fetchError) {
                        console.log('Fetch error:', fetchError.message);
                        await route.continue();
                        return;
                    }

                    if (this.isBettingApi(request, response)) {
                        const apiInfo = {
                            url: request.url(),
                            method: request.method(),
                            type: 'REST',
                            categories: this.categorizeEndpoint(request.url()),
                            headers: request.headers(),
                            contentType: response?.headers()['content-type'],
                            status: response?.status(),
                            timestamp: new Date().toISOString()
                        };

                        console.log('Discovered betting API:', apiInfo.url);
                        discoveredApis.push(apiInfo);
                    }

                    await route.fulfill({ response });
                } catch (error) {
                    console.error('Route handling error:', error.message);
                    await route.continue();
                }
            });

            // Mask WebDriver
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                window.navigator.chrome = { runtime: {} };
            });

            // Enhanced navigation with progressive fallback
            let navigationSuccess = false;
            while (retryCount < maxRetries && !navigationSuccess) {
                try {
                    console.log(`Attempting to navigate to ${targetUrl} (Attempt ${retryCount + 1}/${maxRetries})`);
                    
                    // First try with networkidle
                    try {
                        await page.goto(targetUrl, { 
                            waitUntil: 'networkidle',
                            timeout: timeout / 2
                        });
                        navigationSuccess = true;
                    } catch (e) {
                        console.log('networkidle failed, trying domcontentloaded...');
                        // If networkidle fails, try with domcontentloaded
                        await page.goto(targetUrl, { 
                            waitUntil: 'domcontentloaded',
                            timeout: timeout / 2
                        });
                        navigationSuccess = true;
                    }

                    // Wait for any initial dynamic content
                    await page.waitForTimeout(waitTime);

                    // Check if we got a bot detection page
                    const pageContent = await page.content();
                    if (pageContent.toLowerCase().includes('bot') || 
                        pageContent.toLowerCase().includes('captcha') ||
                        pageContent.toLowerCase().includes('security check')) {
                        throw new Error('Bot detection encountered');
                    }

                    // Additional checks for successful load
                    const title = await page.title();
                    if (title && title.toLowerCase().includes('error')) {
                        throw new Error('Error page detected');
                    }

                } catch (error) {
                    console.log(`Navigation attempt ${retryCount + 1} failed:`, error.message);
                    retryCount++;
                    
                    if (retryCount === maxRetries) {
                        console.log('Maximum retry attempts reached. Attempting basic load...');
                        try {
                            // Final attempt with basic load
                            await page.goto(targetUrl, { 
                                waitUntil: 'load',
                                timeout: 30000
                            });
                        } catch (finalError) {
                            console.log('Basic load also failed:', finalError.message);
                        }
                    }
                    
                    await page.waitForTimeout(5000); // Wait before retry
                }
            }

            // Scroll to trigger lazy-loaded content
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(2000);

            // Click on any "Live" or "In-Play" sections
            const liveButtons = await page.$$('button, a, div', {
                hasText: /(Live|In-Play|Sports|Odds)/i
            });

            for (const button of liveButtons) {
                try {
                    await button.click();
                    await page.waitForTimeout(2000);
                } catch (e) {
                    // Ignore click errors
                }
            }

            // Process and group results
            const results = this.processResults(discoveredApis);
            
            // Save results
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `apis-${timestamp}.json`;
            const resultsPath = path.join(__dirname, '..', 'results', filename);
            
            fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
            fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

            return results;

        } catch (error) {
            console.error('Error during API discovery:', error);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    processResults(apis) {
        // Group APIs by category
        const groupedApis = apis.reduce((acc, api) => {
            api.categories.forEach(category => {
                acc[category] = acc[category] || [];
                acc[category].push(api);
            });
            return acc;
        }, {});

        // Calculate statistics
        const stats = {
            total: apis.length,
            byCategory: Object.fromEntries(
                Object.entries(groupedApis).map(([cat, items]) => [cat, items.length])
            ),
            byMethod: apis.reduce((acc, api) => {
                if (api.method) {
                    acc[api.method] = (acc[api.method] || 0) + 1;
                }
                return acc;
            }, {})
        };

        return {
            stats,
            apis: groupedApis,
            timestamp: new Date().toISOString(),
            summary: {
                totalApis: apis.length,
                categories: Object.keys(groupedApis),
                hasLiveData: groupedApis['LIVE']?.length > 0
            }
        };
    }
}

module.exports = BookmakerService;
