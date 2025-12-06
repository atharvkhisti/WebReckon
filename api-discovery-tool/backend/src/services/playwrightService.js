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
        
        // List of modern user agents
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/116.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5.2 Safari/605.1.15'
        ];
        
        // Load proxy list
        this.proxies = proxyList;

        // Enhanced headers for better API detection
        this.defaultHeaders = {
            'Accept': 'application/json, text/plain, application/xml, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
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
            'application/grpc',
            'application/ld+json',
            'application/hal+json',
            'application/vnd.api+json',
            'application/problem+json'
        ]);

        // API endpoint categories for tagging
        this.endpointCategories = {
            AUTH: ['auth', 'login', 'register', 'token', 'oauth'],
            DATA: ['data', 'feed', 'stream', 'events', 'list'],
            USER: ['user', 'profile', 'account', 'settings'],
            TRANSACTION: ['order', 'payment', 'transaction', 'cart'],
            SEARCH: ['search', 'query', 'filter', 'find'],
            ADMIN: ['admin', 'manage', 'control', 'dashboard'],
            REALTIME: ['stream', 'websocket', 'events', 'notifications']
        };

        // Initialize storage for discovered APIs
        this.discoveredApis = new Map();
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
            const responseHeaders = response?.headers() || {};

            // Skip static assets and tracking pixels
            if (this.ignoredExtensions.has(extension)) return false;
            if (url.pathname.match(/\/(analytics|pixel|tracker|tracking|beacon)\b/i)) return false;

            // Request type check
            const requestType = request.resourceType();
            if (['stylesheet', 'image', 'font', 'media'].includes(requestType)) return false;

            // Check for WebSocket upgrade
            if (requestHeaders['upgrade'] === 'websocket' || url.protocol === 'ws:' || url.protocol === 'wss:') {
                console.log('WebSocket detected:', url.toString());
                return true;
            }

            // Enhanced API header detection
            const isApiHeader = 
                requestHeaders['accept']?.includes('application/json') ||
                requestHeaders['content-type']?.includes('application/json') ||
                requestHeaders['authorization'] ||
                requestHeaders['x-api-key'] ||
                requestHeaders['x-requested-with'] === 'XMLHttpRequest' ||
                responseHeaders['access-control-allow-origin'] ||
                responseHeaders['api-version'] ||
                responseHeaders['x-ratelimit-limit'];

            // Enhanced API URL patterns
            const apiPatterns = [
                // REST patterns
                /\/(api|rest|service|gateway|endpoint)\b/i,
                /\/v[0-9]+(\.[0-9]+)?/i,
                /\/(public|private)api\b/i,
                
                // GraphQL
                /\/(graphql|gql|query|mutations)\b/i,
                
                // Common endpoints
                /\/(auth|login|register|user|data|search|account)\b/i,
                /\/(profile|settings|config|preferences)\b/i,
                
                // Data formats and operations
                /\.(json|xml|graphql|yaml)$/i,
                /\/(fetch|get|list|create|update|delete)\b/i,
                
                // Service endpoints
                /\/(ws|rpc|soap|webhook|callback)\b/i,
                /\/(stream|events|notifications)\b/i,
                
                // API versioning patterns
                /\/api\/v\d+/i,
                /\/rest\/v\d+/i,
                
                // Common HTTP methods in URLs
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
        const responseHeaders = response?.headers() || {};

        // Enhanced API type detection
        if (headers['upgrade'] === 'websocket' || url.protocol === 'ws:' || url.protocol === 'wss:') {
            return 'WebSocket';
        } else if (
            url.pathname.includes('graphql') || 
            contentType.includes('application/graphql') ||
            (postData && (postData.includes('query') || postData.includes('mutation')))
        ) {
            return 'GraphQL';
        } else if (contentType.includes('application/soap+xml')) {
            return 'SOAP';
        } else if (contentType.includes('application/grpc')) {
            return 'gRPC';
        } else if (responseHeaders['content-type']?.includes('event-stream')) {
            return 'ServerSentEvents';
        } else if (contentType.includes('application/vnd.api+json')) {
            return 'JsonAPI';
        } else if (contentType.includes('application/hal+json')) {
            return 'HAL';
        } else {
            return 'REST';
        }
    }

    categorizeEndpoint(url, method, headers, postData) {
        const categories = [];
        const urlLower = url.toLowerCase();
        const postDataStr = postData ? postData.toLowerCase() : '';

        // Check each category's keywords
        for (const [category, keywords] of Object.entries(this.endpointCategories)) {
            if (keywords.some(keyword => 
                urlLower.includes(keyword) || 
                postDataStr.includes(keyword) ||
                Object.keys(headers).some(h => h.toLowerCase().includes(keyword))
            )) {
                categories.push(category);
            }
        }

        // Add authentication tag if auth headers present
        if (headers['authorization'] || 
            headers['x-api-key'] || 
            url.searchParams.has('token') || 
            url.searchParams.has('apikey')) {
            categories.push('REQUIRES_AUTH');
        }

        return categories;
    }

    analyzeApiStructure(request, response) {
        const url = new URL(request.url());
        const method = request.method();
        const requestHeaders = request.headers();
        const responseHeaders = response?.headers() || {};
        const postData = request.postData();

        return {
            url: url.toString(),
            method: method,
            type: this.determineApiType(request, response),
            categories: this.categorizeEndpoint(url.toString(), method, requestHeaders, postData),
            authentication: {
                required: !!requestHeaders['authorization'] || !!requestHeaders['x-api-key'],
                type: this.detectAuthType(requestHeaders, url)
            },
            requestFormat: this.detectRequestFormat(requestHeaders, postData),
            responseFormat: this.detectResponseFormat(responseHeaders),
            rateLimit: this.extractRateLimitInfo(responseHeaders),
            caching: this.extractCacheInfo(responseHeaders),
            cors: this.analyzeCorsPolicy(responseHeaders)
        };
    }

    detectAuthType(headers, url) {
        if (headers['authorization']) {
            if (headers['authorization'].startsWith('Bearer ')) return 'JWT/Bearer';
            if (headers['authorization'].startsWith('Basic ')) return 'Basic';
            if (headers['authorization'].startsWith('Digest ')) return 'Digest';
        }
        if (headers['x-api-key']) return 'API Key';
        if (url.searchParams.has('token')) return 'URL Token';
        return 'None';
    }

    detectRequestFormat(headers, postData) {
        const contentType = headers['content-type'] || '';
        if (contentType.includes('application/json')) return 'JSON';
        if (contentType.includes('application/xml')) return 'XML';
        if (contentType.includes('application/x-www-form-urlencoded')) return 'Form Data';
        if (contentType.includes('multipart/form-data')) return 'Multipart';
        if (postData && postData.startsWith('{')) return 'JSON';
        return 'Unknown';
    }

    detectResponseFormat(headers) {
        const contentType = headers['content-type'] || '';
        if (contentType.includes('application/json')) return 'JSON';
        if (contentType.includes('application/xml')) return 'XML';
        if (contentType.includes('text/html')) return 'HTML';
        if (contentType.includes('text/plain')) return 'Text';
        return 'Unknown';
    }

    extractRateLimitInfo(headers) {
        return {
            limit: headers['x-ratelimit-limit'] || headers['ratelimit-limit'],
            remaining: headers['x-ratelimit-remaining'] || headers['ratelimit-remaining'],
            reset: headers['x-ratelimit-reset'] || headers['ratelimit-reset']
        };
    }

    extractCacheInfo(headers) {
        return {
            cacheControl: headers['cache-control'],
            etag: headers['etag'],
            lastModified: headers['last-modified']
        };
    }

    analyzeCorsPolicy(headers) {
        return {
            enabled: !!headers['access-control-allow-origin'],
            allowOrigin: headers['access-control-allow-origin'],
            allowMethods: headers['access-control-allow-methods'],
            allowHeaders: headers['access-control-allow-headers']
        };
    }

    async startDiscovery(targetUrl, options = {}) {
        const {
            timeout = 45000,         // Increased timeout
            maxDepth = 3,           // Increased depth
            headless = true,
            throttle = true,
            browser = 'chromium',
            waitTime = 10000,       // Time to wait for dynamic content
            interactionDelay = 2000, // Delay between interactions
            maxScrolls = 5          // Maximum number of page scrolls
        } = options;

        let browserInstance;
        let context;
        const apiCalls = [];
        const visitedUrls = new Set();
        const pendingUrls = [targetUrl];
        let retryCount = 0;

        const recordApiCall = async (request, response) => {
            const url = request.url();
            if (visitedUrls.has(url)) return;
            
            if (this.isApiRequest(request, response)) {
                visitedUrls.add(url);
                const apiInfo = this.analyzeApiStructure(request, response);
                apiCalls.push(apiInfo);
                console.log(`Discovered API: ${url}`);
            }
        };

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

                // Enhanced request tracking
                const wsEndpoints = new Set();
                const seenUrls = new Set();

                // Track WebSocket connections
                page.on('websocket', ws => {
                    console.log('WebSocket connected:', ws.url());
                    wsEndpoints.add({
                        url: ws.url(),
                        type: 'WebSocket',
                        timestamp: new Date().toISOString()
                    });
                });

                // Track network requests
                await page.route('**/*', async (route) => {
                    const request = route.request();
                    const url = request.url();
                    
                    // Skip if we've seen this exact URL before
                    if (seenUrls.has(url)) {
                        await route.continue();
                        return;
                    }
                    
                    try {
                        const response = await route.fetch();
                        const apiInfo = this.analyzeApiStructure(request, response);
                        
                        if (this.isApiRequest(request, response)) {
                            seenUrls.add(url);
                            apiCalls.push(apiInfo);
                        }
                        
                        await route.fulfill({ response });
                    } catch (error) {
                        console.error(`Error handling request ${url}:`, error);
                        await route.continue();
                    }
                });

                // Set up request interception
                await page.route('**/*', async route => {
                    const request = route.request();
                    const url = request.url();
                    const method = request.method();
                    
                    // Skip image and font requests to reduce noise
                    if (request.resourceType() === 'image' || 
                        request.resourceType() === 'font' || 
                        url.endsWith('.svg')) {
                        return route.continue();
                    }

                    try {
                        console.log(`Checking request: ${method} ${url}`);
                        
                        // Check for WebSocket upgrades
                        if (request.headers()['upgrade'] === 'websocket') {
                            console.log('WebSocket connection detected:', url);
                            apiCalls.push({
                                url: url,
                                method: 'WEBSOCKET',
                                type: 'WebSocket',
                                headers: request.headers(),
                                timestamp: new Date().toISOString()
                            });
                            return route.continue();
                        }

                        // Handle the request
                        const response = await route.fetch();
                        
                        if (this.isApiRequest(request, response)) {
                            try {
                                const responseBody = await response.text();
                                const contentType = response.headers()['content-type'] || '';
                                
                                // Enhanced API information
                                apiCalls.push({
                                    url: url,
                                    method: method,
                                    headers: request.headers(),
                                    requestData: request.postData(),
                                    contentType: contentType,
                                    status: response.status(),
                                    type: this.determineApiType(request, response),
                                    responseBody: responseBody.length > 2048 ? 
                                        responseBody.slice(0, 2048) + '...[truncated]' : 
                                        responseBody,
                                    timestamp: new Date().toISOString(),
                                    resourceType: request.resourceType(),
                                    isXHR: request.resourceType() === 'xhr',
                                    hasAuthHeader: !!request.headers()['authorization']
                                });

                                console.log(`Found API endpoint: ${method} ${url}`);
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

                // Wait for the page to be fully loaded
                console.log('Waiting for page to load...');
                await page.waitForLoadState('domcontentloaded');
                await page.waitForLoadState('networkidle');
                
                // Wait for any dynamic content
                await page.waitForTimeout(2000);

                // Check if page was blocked or if we hit a captcha
                const pageContent = await page.content();
                if (pageContent.toLowerCase().includes('captcha') || 
                    pageContent.toLowerCase().includes('blocked') ||
                    pageContent.toLowerCase().includes('access denied')) {
                    console.log('Detected potential blocking/captcha, retrying with different proxy...');
                    throw new Error('Access blocked or captcha detected');
                }

                // Extract potential endpoints from source
                const sourceApis = await this.analyzePageSource(page);
                sourceApis.forEach(api => {
                    // Check if this API is already in the collection
                    if (!apiCalls.some(call => call.url === api)) {
                        apiCalls.push({
                            url: api,
                            method: 'GET',
                            type: 'Static',
                            source: 'source-analysis',
                            timestamp: new Date().toISOString()
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
                    apiCalls.push({
                        ...ws,
                        method: 'WS',
                        timestamp: new Date().toISOString()
                    });
                });

                // Process and save results
                // Filter out duplicate APIs
                const uniqueApis = Array.from(new Set(apiCalls.map(api => JSON.stringify(api))))
                    .map(str => JSON.parse(str))
                    .filter(api => {
                        // Additional validation for real APIs
                        const url = new URL(api.url);
                        const isAsset = this.ignoredExtensions.has(path.extname(url.pathname).toLowerCase());
                        const isAnalytics = url.hostname.includes('analytics') || 
                                          url.hostname.includes('tracking') ||
                                          url.hostname.includes('metrics');
                        const isAd = url.hostname.includes('ads') || 
                                   url.hostname.includes('advertising');
                        
                        return !isAsset && !isAnalytics && !isAd;
                    });

                console.log(`Found ${uniqueApis.length} unique APIs after filtering`);
                
                // Save results to file
                const savedFilename = await this.saveResults(uniqueApis);
                await browserInstance.close();
                
                return uniqueApis;

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
        
        // First evaluate if page has content
        const hasContent = await page.evaluate(() => {
            const body = document.body;
            return {
                elementCount: document.getElementsByTagName('*').length,
                hasButtons: !!document.getElementsByTagName('button').length,
                hasLinks: !!document.getElementsByTagName('a').length,
                bodyText: body.innerText.length
            };
        });
        
        console.log('Page content check:', hasContent);
        
        if (hasContent.elementCount < 5) {
            console.log('Page seems empty or blocked. Might need to handle authentication or blocking.');
            return;
        }

        const selectors = [
            'button',
            'a',
            '[role="button"]',
            '[type="submit"]',
            '[onclick]',
            '[data-testid*="button"]',
            // Additional common selectors
            'input[type="submit"]',
            'input[type="button"]',
            '.btn',
            '.button',
            // Common menu triggers
            '.menu-trigger',
            '.nav-item',
            // Interactive elements
            '[tabindex]:not([tabindex="-1"])',
            '[data-action]',
            '[data-toggle]'
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

        // Ensure apiCalls is an array and filter out any invalid entries
        const apiCallsArray = (Array.isArray(apiCalls) ? apiCalls : [])
            .filter(call => {
                return call && 
                       call.url && 
                       call.method && 
                       !call.url.endsWith('.js') &&  // Filter out .js files
                       !call.url.endsWith('.css') && // Filter out .css files
                       !call.url.endsWith('.png') && // Filter out images
                       !call.url.endsWith('.jpg') &&
                       !call.url.endsWith('.gif') &&
                       !call.url.endsWith('.svg');
            });

        const formattedApiCalls = apiCallsArray.map(call => ({
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
