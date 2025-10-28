// Simple test to check for syntax errors in fits.html
const fs = require('fs');
const path = require('path');

const fitsHtmlPath = path.join(__dirname, 'fits.html');
const content = fs.readFileSync(fitsHtmlPath, 'utf-8');

// Extract all script content
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scriptContent = '';

while ((match = scriptRegex.exec(content)) !== null) {
    scriptContent += match[1] + '\n';
}

// Try to parse it to check for syntax errors
try {
    // Create a function to check syntax
    new Function(scriptContent);
    console.log('✅ No JavaScript syntax errors found in fits.html');
} catch (error) {
    console.error('❌ JavaScript syntax error found:');
    console.error(error.message);
    // Try to find the line
    const lines = scriptContent.split('\n');
    const errorLine = error.stack.match(/<anonymous>:(\d+):(\d+)/);
    if (errorLine) {
        const lineNum = parseInt(errorLine[1]) - 1;
        console.error(`\nError near line ${lineNum}:`);
        for (let i = Math.max(0, lineNum - 2); i <= Math.min(lines.length - 1, lineNum + 2); i++) {
            console.error(`${i === lineNum ? '>>> ' : '    '}${i + 1}: ${lines[i]}`);
        }
    }
    process.exit(1);
}