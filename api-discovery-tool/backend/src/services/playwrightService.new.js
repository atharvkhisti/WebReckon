const fs = require('fs');
const { chromium, firefox, webkit } = require('playwright');
const path = require('path');
const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');
const proxyList = require('../config/proxies');

class PlaywrightService {
    constructor() {
        this.currentProxyIndex = 0;
        this.maxRetries = 3;
        
        // List of fallback user agents
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15'
        ];
        
        // Load proxy list
        this.proxies = proxyList;

        // Common headers
        this.defaultHeaders = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'DNT': '1'
        };

        // File extensions to ignore
        this.ignoredExtensions = new Set([
            '.css', '.jpg', '.jpeg', '.png', '.gif', '.svg', 
            '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map'
        ]);
        
        // API-related content types
        this.apiContentTypes = new Set([
            'application/json',
            'application/xml',
            'text/xml',
            'application/graphql',
            'application/x-www-form-urlencoded',
            'application/soap+xml',
            'application/grpc'
        ]);
    }

    getNextProxy() {
        const proxy = this.proxies[this.currentProxyIndex];
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
        return proxy;
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    isApiRequest(request, response) {
        try {
            const url = new URL(request.url());
            const extension = path.extname(url.pathname).toLowerCase();
            const contentType = response?.headers()['content-type'] || '';
            const method = request.method();
            const requestHeaders = request.headers();

            // Skip static assets
            if (this.ignoredExtensions.has(extension)) return false;

            // Check for WebSocket upgrade
            if (requestHeaders['upgrade'] === 'websocket') {
                console.log('WebSocket detected:', url.toString());
                return true;
            }

            // API-specific headers
            const isApiHeader = requestHeaders['accept']?.includes('application/json') ||
                              requestHeaders['content-type']?.includes('application/json') ||
                              requestHeaders['authorization'] ||
                              requestHeaders['x-api-key'];

            // Common API URL patterns
            const apiPatterns = [
                // REST patterns
                /\/(api|rest|service|gateway)\b/i,
                /\/v[0-9]+(\.[0-9]+)?/i,
                
                // GraphQL
                /\/(graphql|gql|query)\b/i,
                
                // Common endpoints
                /\/(auth|login|register|user|data|search)\b/i,
                
                // Data formats
                /\.(json|xml|graphql)$/i,
                
                // Service endpoints
                /\/(ws|rpc|soap|webhook)\b/i,
                
                // Common methods
                /\/(get|post|put|delete|patch)\b/i
            ];

            // Check response characteristics
            const isApiResponse = (
                this.apiContentTypes.has(contentType.split(';')[0].toLowerCase()) ||
                (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') ||
                response?.headers()['access-control-allow-origin'] ||
                response?.headers()['api-version']
            );

            const matchesApiPattern = apiPatterns.some(pattern => pattern.test(url.pathname));
            const isApi = isApiHeader || isApiResponse || matchesApiPattern;

            if (isApi) {
                const type = this.determineApiType(request, response);
                console.log('API detected:', {
                    type,
                    url: url.toString(),
                    method,
                    contentType
                });
            }

            return isApi;
        } catch (e) {
            console.error('Error checking request:', e);
            return false;
        }
    }

    determineApiType(request, response) {
        const headers = request.headers();
        const url = new URL(request.url());
        const contentType = response?.headers()['content-type'] || '';
        const postData = request.postData();

        if (headers['upgrade'] === 'websocket') {
            return 'WebSocket';
        } else if (url.pathname.includes('graphql') || (postData && (postData.includes('query') || postData.includes('mutation')))) {
            return 'GraphQL';
        } else if (contentType.includes('application/soap+xml')) {
            return 'SOAP';
        } else if (contentType.includes('application/grpc')) {
            return 'gRPC';
        } else {
            return 'REST';
        }
    }

    async startDiscovery(targetUrl, options = {}) {
        const {
            timeout = 30000,
            maxDepth = 2,
            headless = true,
            throttle = true,
            browser = 'chromium'
        } = options;

        let browserInstance;
        let context;
        const apiCalls = new Map();
        let retryCount = 0;

        while (retryCount < this.maxRetries) {
            try {
                const proxy = this.getNextProxy();
                const userAgent = this.getRandomUserAgent();

                console.log(`Attempt ${retryCount + 1}/${this.maxRetries} using proxy: ${proxy}`);

                const browserEngine = { chromium, firefox, webkit }[browser] || chromium;
                browserInstance = await browserEngine.launch({
                    headless,
                    args: [
                        '--disable-web-security',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--ignore-certificate-errors'
                    ],
                    proxy: proxy ? { server: proxy } : undefined
                });

                context = await browserInstance.newContext({
                    userAgent,
                    ignoreHTTPSErrors: true,
                    extraHTTPHeaders: this.defaultHeaders
                });

                const page = await context.newPage();

                // Track WebSocket connections
                const wsEndpoints = new Set();
                page.on('websocket', ws => {
                    console.log('WebSocket connected:', ws.url());
                    wsEndpoints.add({
                        url: ws.url(),
                        type: 'WebSocket'
                    });
                });

                // Monitor network events for potential WebSocket handshakes
                await page.route('**/*', async route => {
                    const request = route.request();
                    const headers = request.headers();
                    
                    // Check for WebSocket upgrade requests
                    if (headers['upgrade'] === 'websocket' || headers['connection']?.toLowerCase().includes('upgrade')) {
                        console.log('Potential WebSocket handshake detected:', request.url());
                    }
                    
                    await route.continue();
                });

                // Set up request interception
                await page.route('**/*', async route => {
                    try {
                        const request = route.request();
                        console.log(`Checking request: ${request.method()} ${request.url()}`);
                        
                        const response = await route.fetch();
                        
                        if (this.isApiRequest(request, response)) {
                            const key = `${request.method()}-${request.url()}`;
                            try {
                                const responseBody = await response.text();
                                apiCalls.set(key, {
                                    url: request.url(),
                                    method: request.method(),
                                    headers: request.headers(),
                                    contentType: response.headers()['content-type'],
                                    status: response.status(),
                                    type: this.determineApiType(request, response),
                                    responseBody: responseBody.length > 2048 ? 
                                        responseBody.slice(0, 2048) + '...[truncated]' : 
                                        responseBody
                                });
                            } catch (e) {
                                console.error('Error processing response:', e);
                            }
                        }
                        
                        await route.fulfill({ response });
                    } catch (e) {
                        console.error('Error in route handler:', e);
                        await route.continue();
                    }
                });

                // Navigate to the target URL
                console.log('Navigating to:', targetUrl);
                await page.goto(targetUrl, { 
                    waitUntil: 'networkidle',
                    timeout 
                });

                // Extract potential endpoints from source
                const sourceApis = await this.analyzePageSource(page);
                sourceApis.forEach(api => {
                    const key = `GET-${api}`;
                    if (!apiCalls.has(key)) {
                        apiCalls.set(key, {
                            url: api,
                            method: 'GET',
                            type: 'Static',
                            source: 'source-analysis'
                        });
                    }
                });

                // Interactive exploration
                console.log('Starting interactive exploration...');
                await this.autoScroll(page);
                await this.interactWithPage(page);
                await this.submitForms(page);
                await this.triggerDynamicContent(page);

                // Add WebSocket endpoints to results
                wsEndpoints.forEach(ws => {
                    const key = `WS-${ws.url}`;
                    apiCalls.set(key, {
                        ...ws,
                        method: 'WS'
                    });
                });

                // Save and format results
                const result = await this.saveResults(apiCalls);
                await browserInstance.close();
                return result;

            } catch (error) {
                console.error(`Error during discovery (attempt ${retryCount + 1}):`, error);
                if (browserInstance) {
                    try {
                        await browserInstance.close();
                    } catch (e) {
                        console.error('Error closing browser:', e);
                    }
                }
                retryCount++;
                if (retryCount >= this.maxRetries) {
                    throw new Error(`Failed after ${this.maxRetries} attempts: ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    async analyzePageSource(page) {
        console.log('Analyzing page source for API endpoints...');
        const apis = new Set();

        try {
            // Extract JavaScript source and inline scripts
            const scripts = await page.evaluate(() => {
                return Array.from(document.getElementsByTagName('script'))
                    .map(script => script.src || script.innerHTML)
                    .join('\n');
            });

            // Extract data attributes that might contain API endpoints
            const dataAttributes = await page.evaluate(() => {
                const elements = document.querySelectorAll('[data-url], [data-api], [data-endpoint]');
                return Array.from(elements).map(el => ({
                    url: el.dataset.url || el.dataset.api || el.dataset.endpoint,
                    element: el.tagName.toLowerCase()
                }));
            });

            // Common patterns for API endpoints
            const patterns = [
                // API URLs
                /['"`](\/[^'"`]*api[^'"`]*?)['"`]/gi,
                /['"`](https?:\/\/[^'"`]*api[^'"`]*?)['"`]/gi,
                
                // Common configurations
                /endpoint:\s*['"`](.*?)['"`]/gi,
                /baseUrl:\s*['"`](.*?)['"`]/gi,
                /apiUrl:\s*['"`](.*?)['"`]/gi,
                
                // Network requests
                /fetch\(['"`](.*?)['"`]\)/gi,
                /\.post\(['"`](.*?)['"`]\)/gi,
                /\.get\(['"`](.*?)['"`]\)/gi,
                /\.put\(['"`](.*?)['"`]\)/gi,
                /\.delete\(['"`](.*?)['"`]\)/gi,
                /\$\.ajax\(\{[^}]*url:\s*['"`](.*?)['"`]/gi,
                
                // WebSocket
                /new WebSocket\(['"`](.*?)['"`]\)/gi,
                
                // GraphQL
                /graphqlEndpoint:\s*['"`](.*?)['"`]/gi,
                /apolloClient.*uri:\s*['"`](.*?)['"`]/gi
            ];

            // Process script patterns
            patterns.forEach(pattern => {
                const matches = scripts.matchAll(pattern);
                for (const match of matches) {
                    if (match[1] && !match[1].includes('{{') && !match[1].includes('${')) {
                        try {
                            const url = match[1].startsWith('http') ? match[1] : new URL(match[1], page.url()).toString();
                            apis.add(url);
                        } catch (e) {
                            // Invalid URL, skip
                        }
                    }
                }
            });

            // Add data attribute URLs
            dataAttributes.forEach(({url}) => {
                if (url && !url.includes('{{') && !url.includes('${')) {
                    try {
                        const fullUrl = url.startsWith('http') ? url : new URL(url, page.url()).toString();
                        apis.add(fullUrl);
                    } catch (e) {
                        // Invalid URL, skip
                    }
                }
            });

            console.log(`Found ${apis.size} potential endpoints in source`);
            return Array.from(apis);
        } catch (e) {
            console.error('Error analyzing page source:', e);
            return [];
        }
    }

    async triggerDynamicContent(page) {
        console.log('Triggering dynamic content...');
        try {
            // Trigger mouseover events
            await page.evaluate(() => {
                document.querySelectorAll('*').forEach(element => {
                    const event = new MouseEvent('mouseover', {
                        bubbles: true,
                        cancelable: true
                    });
                    element.dispatchEvent(event);
                });
            });

            // Click dynamic load elements
            const dynamicSelectors = [
                '[data-loading]',
                '[data-src]',
                '[data-url]',
                '[data-api]',
                '.load-more',
                '.infinite-scroll',
                '[id*="load"]',
                '[class*="load"]'
            ];

            for (const selector of dynamicSelectors) {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    await element.click().catch(() => {});
                    await page.waitForTimeout(500);
                }
            }

            // Simulate infinite scroll
            await page.evaluate(async () => {
                for (let i = 0; i < 3; i++) {
                    window.scrollTo(0, document.body.scrollHeight);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            });

            // Trigger lazy loading
            await page.evaluate(() => {
                window.dispatchEvent(new Event('scroll'));
                window.dispatchEvent(new Event('resize'));
                window.dispatchEvent(new Event('load'));
            });

        } catch (e) {
            console.error('Error triggering dynamic content:', e);
        }
    }

    async autoScroll(page) {
        try {
            await page.evaluate(() => {
                return new Promise(resolve => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        
                        if (totalHeight >= document.body.scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });
        } catch (e) {
            console.error('Error during auto-scroll:', e);
        }
    }

    async interactWithPage(page) {
        console.log('Starting page interaction...');
        const selectors = [
            'button:visible',
            'a:visible',
            '[role="button"]:visible',
            '[type="submit"]:visible',
            '[onclick]:visible',
            '[data-testid*="button"]:visible'
        ];

        for (const selector of selectors) {
            try {
                const elements = await page.$$(selector);
                console.log(`Found ${elements.length} elements for selector ${selector}`);
                
                for (const element of elements) {
                    try {
                        const isVisible = await element.isVisible();
                        const isEnabled = await element.evaluate(el => {
                            const style = window.getComputedStyle(el);
                            return !el.disabled && style.display !== 'none';
                        });

                        if (!isVisible || !isEnabled) continue;
                        
                        const elementText = await element.textContent();
                        console.log(`Clicking element: ${elementText?.trim() || 'unnamed element'}`);

                        await Promise.race([
                            element.click(),
                            new Promise(resolve => setTimeout(resolve, 1000))
                        ]);

                        await page.waitForTimeout(500);
                    } catch (e) {
                        continue;
                    }
                }
            } catch (e) {
                console.log(`Error with selector ${selector}:`, e);
            }
        }
    }

    async submitForms(page) {
        console.log('Submitting forms...');
        const testData = {
            text: 'test',
            email: 'test@example.com',
            password: 'Test123!',
            search: 'test search',
            tel: '1234567890',
            number: '42',
            url: 'https://example.com'
        };

        try {
            const forms = await page.$$('form');
            console.log(`Found ${forms.length} forms`);

            for (const form of forms) {
                try {
                    // Fill inputs
                    const inputs = await form.$$('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
                    for (const input of inputs) {
                        const type = await input.getAttribute('type') || 'text';
                        const name = await input.getAttribute('name') || '';
                        const id = await input.getAttribute('id') || '';
                        
                        let value = testData[type] || testData.text;
                        
                        if (name.includes('email') || id.includes('email')) {
                            value = testData.email;
                        } else if (name.includes('pass') || id.includes('pass')) {
                            value = testData.password;
                        }

                        await input.type(value);
                    }

                    // Handle select elements
                    const selects = await form.$$('select');
                    for (const select of selects) {
                        const options = await select.$$('option');
                        if (options.length > 0) {
                            const randomIndex = Math.floor(Math.random() * options.length);
                            await options[randomIndex].click();
                        }
                    }

                    // Submit form
                    const submitButton = await form.$('[type="submit"]') || 
                                      await form.$('button:not([type="button"])');
                    if (submitButton) {
                        await Promise.race([
                            submitButton.click(),
                            new Promise(resolve => setTimeout(resolve, 1000))
                        ]);
                        await page.waitForTimeout(1000);
                    }
                } catch (e) {
                    console.log('Error submitting form:', e);
                    continue;
                }
            }
        } catch (e) {
            console.log('Error finding forms:', e);
        }
    }

    async saveResults(apiCalls) {
        const resultsDir = path.join(process.cwd(), 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(resultsDir, `apis-${timestamp}.json`);

        const formattedApiCalls = Array.from(apiCalls.values()).map(call => ({
            ...call,
            timestamp: new Date().toISOString(),
            responseBody: call.responseBody?.length > 2048 
                ? call.responseBody.slice(0, 2048) + '...[truncated]' 
                : call.responseBody
        }));

        // Group APIs by type
        const groupedApis = formattedApiCalls.reduce((acc, api) => {
            const type = api.type || 'unknown';
            acc[type] = acc[type] || [];
            acc[type].push(api);
            return acc;
        }, {});

        const output = {
            timestamp: new Date().toISOString(),
            summary: {
                total: formattedApiCalls.length,
                byType: Object.entries(groupedApis).reduce((acc, [type, apis]) => {
                    acc[type] = apis.length;
                    return acc;
                }, {})
            },
            apis: groupedApis
        };

        fs.writeFileSync(filename, JSON.stringify(output, null, 2));
        console.log('\nResults summary:');
        console.log('Total APIs found:', output.summary.total);
        console.log('APIs by type:', output.summary.byType);
        return filename;
    }
}

module.exports = PlaywrightService;
