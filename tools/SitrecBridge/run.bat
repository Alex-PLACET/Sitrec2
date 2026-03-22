@echo off
REM Launcher for SitrecBridge MCP server (Windows).
REM Node.js is usually on PATH via the official installer.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: node not found. Install Node.js 18+ from https://nodejs.org/ >&2
    exit /b 1
)

node "%~dp0mcp-server.mjs" %*
