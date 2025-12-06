class ApiController {
    async discover(req, res) {
        try {
            const { url, options = {} } = req.body;

            if (!url) {
                return res.status(400).json({ 
                    message: 'Missing target URL',
                    status: 'error' 
                });
            }

            // Validate URL
            try {
                new URL(url);
            } catch (e) {
                return res.status(400).json({ 
                    message: 'Invalid URL format',
                    status: 'error'
                });
            }

            const DiscoveryService = require('../services/DiscoveryService');
            const service = new DiscoveryService();
            
            console.log(`Starting API discovery for ${url}`);
            const results = await service.discover(url, options);

            res.status(200).json({
                message: 'Discovery completed',
                status: 'success',
                data: results,
            });

        } catch (error) {
            console.error('Discovery error:', error);
            res.status(500).json({
                message: 'Error during discovery',
                status: 'error',
                error: error.message
            });
        }
    }
}

module.exports = ApiController;