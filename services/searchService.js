const { getTimestamp } = require('../utils/logger');

/**
 * Search Service - Web search functionality using MCP
 */

class SearchService {
    constructor() {
        this.mcpClient = null;
        this.isConnected = false;
        this.searchHistory = new Map(); // Cache recent searches
        this.rateLimiter = new Map(); // Rate limiting per user
    }

    /**
     * Initialize MCP connection
     */
    async initialize() {
        try {
            // In a real implementation, you would import and use the actual MCP client
            // const { MCPClient } = require('@modelcontextprotocol/client');
            // this.mcpClient = new MCPClient();
            // await this.mcpClient.connect('chrome-search');
            
            this.isConnected = true;
            console.log(`[${getTimestamp()}] ✅ Search service initialized`);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to initialize search service:`, error.message);
            this.isConnected = false;
        }
    }

    /**
     * Check rate limit for user
     */
    checkRateLimit(userId) {
        const now = Date.now();
        const userLimit = this.rateLimiter.get(userId) || { count: 0, resetTime: now + 60000 };
        
        if (now > userLimit.resetTime) {
            // Reset the counter
            userLimit.count = 0;
            userLimit.resetTime = now + 60000; // 1 minute window
        }
        
        if (userLimit.count >= 5) { // Max 5 searches per minute
            const remainingTime = Math.ceil((userLimit.resetTime - now) / 1000);
            return { allowed: false, remainingTime };
        }
        
        userLimit.count++;
        this.rateLimiter.set(userId, userLimit);
        return { allowed: true };
    }

    /**
     * Perform web search
     */
    async search(query, options = {}) {
        if (!this.isConnected) {
            throw new Error('Search service not connected');
        }

        // Check cache first
        const cacheKey = `${query}_${JSON.stringify(options)}`;
        const cached = this.searchHistory.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
            console.log(`[${getTimestamp()}] 📋 Returning cached search results for: ${query}`);
            return cached.results;
        }

        try {
            console.log(`[${getTimestamp()}] 🔍 Searching for: ${query}`);
            
            // In a real implementation, this would use the MCP client
            // const results = await this.mcpClient.search(query, options);
            
            // For now, return mock results
            const results = {
                query: query,
                resultCount: 5,
                items: [
                    {
                        title: `Result 1 for ${query}`,
                        snippet: 'This is a sample search result snippet...',
                        link: 'https://example.com/1'
                    },
                    {
                        title: `Result 2 for ${query}`,
                        snippet: 'Another search result snippet...',
                        link: 'https://example.com/2'
                    }
                ]
            };

            // Cache the results
            this.searchHistory.set(cacheKey, {
                results: results,
                timestamp: Date.now()
            });

            // Clean old cache entries
            if (this.searchHistory.size > 100) {
                const oldestKey = this.searchHistory.keys().next().value;
                this.searchHistory.delete(oldestKey);
            }

            return results;
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Search failed:`, error.message);
            throw error;
        }
    }

    /**
     * Search for WhatsApp invite links on the web
     */
    async searchForInviteLinks(groupName) {
        const query = `"${groupName}" site:chat.whatsapp.com OR site:whatsapp.com/chat`;
        return await this.search(query, { 
            type: 'invite_link_search',
            maxResults: 10 
        });
    }

    /**
     * Verify if a link is safe
     */
    async verifyLink(url) {
        try {
            console.log(`[${getTimestamp()}] 🔒 Verifying link safety: ${url}`);
            
            // In a real implementation, this would check the link
            // Could use Google Safe Browsing API or similar
            
            return {
                safe: true,
                category: 'unknown',
                threats: []
            };
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Link verification failed:`, error.message);
            return {
                safe: false,
                category: 'error',
                threats: ['verification_failed']
            };
        }
    }

    /**
     * Format search results for WhatsApp message
     */
    formatSearchResults(results, maxResults = 3) {
        if (!results || !results.items || results.items.length === 0) {
            return '❌ No search results found';
        }

        let message = `🔍 Search Results for "${results.query}":\n\n`;
        
        const itemsToShow = results.items.slice(0, maxResults);
        itemsToShow.forEach((item, index) => {
            message += `${index + 1}. *${item.title}*\n`;
            message += `   ${item.snippet}\n`;
            message += `   🔗 ${item.link}\n\n`;
        });

        if (results.items.length > maxResults) {
            message += `\n📊 Showing ${maxResults} of ${results.items.length} results`;
        }

        return message;
    }

    /**
     * Get search statistics
     */
    getStats() {
        return {
            connected: this.isConnected,
            cachedSearches: this.searchHistory.size,
            rateLimitedUsers: this.rateLimiter.size
        };
    }
}

// Export singleton instance
const searchService = new SearchService();
module.exports = searchService;