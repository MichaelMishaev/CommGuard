#!/bin/bash

# Start script for bCommGuard with MCP Chrome Search

echo "╔════════════════════════════════════════════╗"
echo "║     bCommGuard with MCP Chrome Search      ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Check if MCP is installed
if ! command -v mcp &> /dev/null; then
    echo "❌ MCP CLI not found. Installing..."
    npm install -g @modelcontextprotocol/cli
fi

# Check if Chrome/Chromium is available
if command -v google-chrome &> /dev/null; then
    export PUPPETEER_EXECUTABLE_PATH=$(which google-chrome)
    echo "✅ Using Chrome: $PUPPETEER_EXECUTABLE_PATH"
elif command -v chromium-browser &> /dev/null; then
    export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser)
    echo "✅ Using Chromium: $PUPPETEER_EXECUTABLE_PATH"
elif command -v chromium &> /dev/null; then
    export PUPPETEER_EXECUTABLE_PATH=$(which chromium)
    echo "✅ Using Chromium: $PUPPETEER_EXECUTABLE_PATH"
else
    echo "⚠️ Chrome/Chromium not found. MCP Chrome features may not work."
    echo "Install with: sudo apt-get install chromium-browser (Linux)"
    echo "           : brew install chromium (macOS)"
fi

echo ""
echo "🚀 Starting MCP servers..."

# Start MCP servers in background
if [ -f "mcp.json" ]; then
    echo "📋 Found MCP configuration"
    
    # Start Chrome search server
    echo "🌐 Starting Chrome search server..."
    npx -y @modelcontextprotocol/server-puppeteer &
    MCP_CHROME_PID=$!
    
    # Give servers time to initialize
    echo "⏳ Waiting for MCP servers to initialize..."
    sleep 5
    
    echo "✅ MCP servers started (PID: $MCP_CHROME_PID)"
else
    echo "⚠️ No mcp.json found - MCP features disabled"
fi

echo ""
echo "🤖 Starting bCommGuard bot..."
echo ""

# Start the bot
npm start

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    
    if [ ! -z "$MCP_CHROME_PID" ]; then
        echo "Stopping MCP Chrome server..."
        kill $MCP_CHROME_PID 2>/dev/null
    fi
    
    echo "✅ Cleanup complete"
    exit 0
}

# Set up cleanup on exit
trap cleanup EXIT INT TERM

# Wait for bot process
wait