# MCP Server Setup for Chrome Internet Search

## Overview

This guide explains how to set up MCP (Model Context Protocol) servers for Chrome internet search functionality in the bCommGuard bot.

## What is MCP?

MCP (Model Context Protocol) is a standard for connecting AI assistants to external tools and data sources. In this case, we're using it to enable Chrome-based web searching capabilities.

## Available MCP Servers

### 1. Chrome Search (Puppeteer)
- **Purpose**: Enables browser automation and web scraping through Chrome
- **Features**: 
  - Navigate to websites
  - Take screenshots
  - Extract content from web pages
  - Perform searches
  - Interact with web elements

### 2. Web Search API
- **Purpose**: Direct API access to search engines
- **Features**:
  - Google search integration
  - Fast search results
  - No browser overhead

## Installation

### Step 1: Install Required Dependencies

```bash
# Install MCP CLI tools
npm install -g @modelcontextprotocol/cli

# Install Puppeteer server
npm install -g @modelcontextprotocol/server-puppeteer

# Install Web Search server (optional)
npm install -g @modelcontextprotocol/server-web-search
```

### Step 2: Configure Chrome/Chromium

For the Puppeteer server to work, you need Chrome or Chromium installed:

```bash
# On Ubuntu/Debian
sudo apt-get update
sudo apt-get install chromium-browser

# On macOS
brew install chromium

# Or download Chrome from https://www.google.com/chrome/
```

### Step 3: Set Up API Keys (for Web Search)

If using the web search API server:

1. Get a Google Custom Search API key:
   - Go to https://developers.google.com/custom-search/v1/introduction
   - Create a project and enable the Custom Search API
   - Generate an API key

2. Create a search engine:
   - Go to https://programmablesearchengine.google.com/
   - Create a new search engine
   - Get the Search Engine ID

3. Update the `mcp.json` file with your credentials:
   ```json
   "env": {
     "GOOGLE_SEARCH_API_KEY": "your-actual-api-key",
     "GOOGLE_SEARCH_ENGINE_ID": "your-actual-engine-id"
   }
   ```

## Usage in bCommGuard

### Adding Search Commands

You can add search functionality to the bot by creating new commands in `commandHandler.js`:

```javascript
// Example search command
async handleSearch(msg, args) {
    const query = args.join(' ');
    
    // Use MCP to search
    const searchResults = await this.mcpClient.search(query);
    
    // Process and send results
    await this.sock.sendMessage(msg.key.remoteJid, {
        text: `🔍 Search Results for "${query}":\n\n${searchResults}`
    });
}
```

### Integration Examples

1. **Link Verification**: Check if shared links are safe
2. **Information Lookup**: Answer questions using web search
3. **News Monitoring**: Track mentions of specific topics
4. **Content Validation**: Verify claims or information

## Running with MCP

To start the bot with MCP servers:

```bash
# Start MCP servers first
mcp start

# Then start the bot
npm start
```

Or create a combined startup script:

```bash
#!/bin/bash
# start-with-mcp.sh

echo "Starting MCP servers..."
mcp start &
MCP_PID=$!

echo "Waiting for MCP servers to initialize..."
sleep 5

echo "Starting bCommGuard bot..."
npm start

# Cleanup on exit
trap "kill $MCP_PID" EXIT
```

## Troubleshooting

### Common Issues

1. **Chrome not found**
   ```
   Error: Could not find Chrome installation
   ```
   Solution: Install Chrome or set the executable path:
   ```json
   "env": {
     "PUPPETEER_EXECUTABLE_PATH": "/usr/bin/chromium-browser"
   }
   ```

2. **Headless mode issues**
   - Set `PUPPETEER_HEADLESS: "false"` to see the browser
   - Useful for debugging

3. **Permission errors**
   - Run with appropriate permissions
   - Check firewall settings for Chrome

### Testing MCP Connection

Create a test script `test-mcp.js`:

```javascript
const { MCPClient } = require('@modelcontextprotocol/client');

async function testMCP() {
    const client = new MCPClient();
    
    try {
        await client.connect('chrome-search');
        console.log('✅ MCP Chrome Search connected');
        
        const result = await client.search('WhatsApp bot development');
        console.log('Search results:', result);
    } catch (error) {
        console.error('❌ MCP connection failed:', error);
    }
}

testMCP();
```

## Security Considerations

1. **API Keys**: Never commit API keys to git
2. **Browser Security**: Run Puppeteer with appropriate sandboxing
3. **Rate Limiting**: Implement rate limits for search commands
4. **Content Filtering**: Filter inappropriate search results

## Environment Variables

Create a `.env` file for sensitive data:

```env
# Google Search API
GOOGLE_SEARCH_API_KEY=your-key-here
GOOGLE_SEARCH_ENGINE_ID=your-id-here

# Google Translate API
GOOGLE_TRANSLATE_API_KEY=your-translate-key-here

# Puppeteer Options
PUPPETEER_HEADLESS=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# MCP Options
MCP_LOG_LEVEL=info
```

## Next Steps

1. Test the MCP connection
2. Implement search commands
3. Add rate limiting
4. Create search result formatting
5. Add search history/logging

# Google Translate API Setup

The bot includes translation features using Google Translate API.

## 1. Get Google Translate API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the "Cloud Translation API"
4. Go to "Credentials" and create an API key
5. Copy your API key

## 2. Configure Translation Service

Add your API key to the environment:

```bash
export GOOGLE_TRANSLATE_API_KEY="your-actual-api-key"
```

Or add it to your `.env` file:

```env
GOOGLE_TRANSLATE_API_KEY=your-actual-api-key
```

## 3. Available Translation Commands

- `#translate <text>` - Translate to English (auto-detect source)
- `#translate <lang> <text>` - Translate to specific language
- `#langs` - Show supported language codes
- **Auto-Translation** - Reply to non-Hebrew messages → Bot translates to Hebrew automatically

### Examples:
- `#translate שלום עולם` → "Hello world"
- `#translate he Good morning` → "בוקר טוב"
- `#translate fr Bonjour` → "Hello"

### Auto-Translation Example:
1. User A: "Hello everyone, how are you today?"
2. User B: [Replies to the above message]
3. Bot automatically responds: 
   ```
   🌐 תרגום לעברית:
   
   "שלום לכולם, איך אתם היום?"
   
   📝 מקור: English
   ```

## 4. Supported Languages

The service supports 20+ languages including:
- Hebrew (he), Arabic (ar), English (en)
- Spanish (es), French (fr), German (de)
- Russian (ru), Chinese (zh), Japanese (ja)
- And many more (use `#langs` command)

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/docs)
- [Puppeteer Documentation](https://pptr.dev/)
- [Google Custom Search API](https://developers.google.com/custom-search/v1/introduction)
- [Google Translate API](https://cloud.google.com/translate/docs)