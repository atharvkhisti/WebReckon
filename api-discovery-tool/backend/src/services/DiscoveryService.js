const { chromium } = require('playwright');
const path = require('path');

class DiscoveryService {
    constructor() {
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/116.0',
        ];

        this.ignoredExtensions = new Set([
            '.css', '.jpg', '.jpeg', '.png', '.gif', '.svg',
            '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map'
        ]);

        this.apiContentTypes = new Set([
            'application/json',
            'application/xml',
            'text/xml',
            'application/graphql',
        ]);

        // Keyword buckets for lightweight endpoint tagging
        this.purposeKeywords = {
            auth: ['auth', 'login', 'logout', 'signin', 'signup', 'token', 'oauth'],
            search: ['search', 'query', 'filter', 'suggest'],
            user: ['user', 'profile', 'account', 'me'],
            data: ['data', 'items', 'list', 'feed', 'records'],
            admin: ['admin', 'manage', 'settings', 'config'],
            payments: ['payment', 'checkout', 'billing', 'invoice'],
        };
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    isApiLike(request, response) {
        try {
            const urlObj = new URL(request.url());
            const ext = path.extname(urlObj.pathname).toLowerCase();
            const resourceType = request.resourceType();
            const headers = response?.headers() || {};
            const contentType = headers['content-type'] || '';

            if (this.ignoredExtensions.has(ext)) return false;
            if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) return false;

            if (resourceType === 'xhr' || resourceType === 'fetch') return true;

            if (urlObj.pathname.match(/\/(api|graphql|gql|rest)\b/i)) return true;

            if (this.apiContentTypes.has(contentType.split(';')[0].toLowerCase())) return true;

            return false;
        } catch {
            return false;
        }
    }

    classifyType(request, response) {
        const urlObj = new URL(request.url());
        const headers = response?.headers() || {};
        const contentType = headers['content-type'] || '';

        if (urlObj.pathname.includes('graphql') || contentType.includes('application/graphql')) {
            return 'GraphQL';
        }
        if (request.headers()['upgrade'] === 'websocket' || urlObj.protocol.startsWith('ws')) {
            return 'WebSocket';
        }
        return 'REST';
    }

    guessPurpose(path) {
        const lower = path.toLowerCase();
        for (const [purpose, keywords] of Object.entries(this.purposeKeywords)) {
            if (keywords.some(k => lower.includes(k))) {
                return purpose;
            }
        }
        return 'other';
    }

    buildSummary(endpoints) {
        const byMethod = {};
        const byType = {};
        const byHost = {};
        const byPurpose = {};

        for (const ep of endpoints) {
            byMethod[ep.method] = (byMethod[ep.method] || 0) + 1;
            byType[ep.type] = (byType[ep.type] || 0) + 1;
            byHost[ep.host] = (byHost[ep.host] || 0) + 1;
            const purpose = ep.guessPurpose || 'other';
            byPurpose[purpose] = (byPurpose[purpose] || 0) + 1;
        }

        return {
            totalEndpoints: endpoints.length,
            byMethod,
            byType,
            byHost,
            byPurpose,
        };
    }

    async discover(targetUrl, options = {}) {
        const {
            timeout = 30000,
            waitAfterLoad = 8000,
            headless = true,
        } = options;

        const browser = await chromium.launch({ headless });
        const context = await browser.newContext({
            userAgent: this.getRandomUserAgent(),
            ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();

        const endpoints = [];
        const seenKey = new Set();

        await page.route('**/*', async route => {
            const request = route.request();
            let response;
            try {
                response = await route.fetch();
            } catch {
                await route.continue();
                return;
            }

            if (this.isApiLike(request, response)) {
                const urlObj = new URL(request.url());
                const key = `${request.method()} ${urlObj.origin}${urlObj.pathname}`;
                if (!seenKey.has(key)) {
                    seenKey.add(key);
                    const purpose = this.guessPurpose(urlObj.pathname);
                    const isThirdParty = urlObj.hostname !== new URL(targetUrl).hostname;
                    const maybeSensitive = ['auth', 'user', 'payments'].includes(purpose);
                    const status = response.status();
                    const isSuspicious = status >= 400 || status === 0;
                    endpoints.push({
                        url: urlObj.toString(),
                        method: request.method(),
                        status,
                        type: this.classifyType(request, response),
                        contentType: response.headers()['content-type'],
                        host: urlObj.host,
                        path: urlObj.pathname,
                        guessPurpose: purpose,
                        isThirdParty,
                        maybeSensitive,
                        isSuspicious,
                        firstSeenAt: new Date().toISOString(),
                    });
                }
            }

            await route.fulfill({ response });
        });

        await page.goto(targetUrl, { waitUntil: 'load', timeout });
        await page.waitForTimeout(waitAfterLoad);

        await browser.close();

        return {
            summary: this.buildSummary(endpoints),
            endpoints,
        };
    }
}

module.exports = DiscoveryService;
