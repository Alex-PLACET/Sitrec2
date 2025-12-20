#!/usr/bin/env node

import {exec, spawn} from 'child_process';
import express from 'express';
import {WebSocketServer} from 'ws';
import {fileURLToPath} from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3456;
const exitAfterTests = process.argv.includes('--exit') || process.env.TEST_VIEWER_EXIT === 'true';

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Sitrec Test Viewer</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        #container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 {
            color: #4ec9b0;
            margin-bottom: 20px;
        }
        #output {
            background: #252526;
            border: 1px solid #3e3e42;
            border-radius: 4px;
            padding: 15px;
            height: calc(100vh - 150px);
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 13px;
            line-height: 1.5;
        }
        .status {
            margin-bottom: 15px;
            padding: 10px;
            background: #2d2d30;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .status.running { border-left: 4px solid #4ec9b0; }
        .status.complete { border-left: 4px solid #6a9955; }
        .status.error { border-left: 4px solid #f48771; }
        .passed { color: #6a9955; }
        .failed { color: #f48771; }
        .test-line { color: #4ec9b0; }
        button {
            background: #0e639c;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover { background: #1177bb; }
        button:disabled {
            background: #3e3e42;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div id="container">
        <h1>🧪 Sitrec Test Viewer</h1>
        <div id="status" class="status running">
            <span id="statusText">Connecting...</span>
            <button id="clearBtn" onclick="clearOutput()">Clear</button>
        </div>
        <div id="output"></div>
    </div>
    <script>
        const output = document.getElementById('output');
        const status = document.getElementById('status');
        const statusText = document.getElementById('statusText');
        let autoScroll = true;

        output.addEventListener('scroll', () => {
            const atBottom = output.scrollHeight - output.scrollTop <= output.clientHeight + 50;
            autoScroll = atBottom;
        });

        const ws = new WebSocket('ws://localhost:${port}');
        
        ws.onopen = () => {
            statusText.textContent = 'Running tests...';
            status.className = 'status running';
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'output') {
                let line = data.text;
                
                // Add syntax highlighting
                if (line.includes('✓')) {
                    line = '<span class="passed">' + line + '</span>';
                } else if (line.includes('✗') || line.includes('failed')) {
                    line = '<span class="failed">' + line + '</span>';
                } else if (line.includes('›')) {
                    line = '<span class="test-line">' + line + '</span>';
                }
                
                output.innerHTML += line + '\\n';
                
                if (autoScroll) {
                    output.scrollTop = output.scrollHeight;
                }
            } else if (data.type === 'status') {
                if (data.total > 0) {
                    const progress = data.current + '/' + data.total;
                    if (data.testName) {
                        statusText.textContent = '🧪 Running test ' + progress + ': ' + data.testName;
                    } else {
                        statusText.textContent = '🧪 Running ' + data.total + ' tests...';
                    }
                }
            } else if (data.type === 'complete') {
                const hasFailures = data.code !== 0;
                status.className = hasFailures ? 'status error' : 'status complete';
                statusText.textContent = hasFailures 
                    ? '❌ Tests completed with failures' 
                    : '✅ All tests passed!';
            } else if (data.type === 'redirect') {
                statusText.textContent = '✅ Tests passed! Redirecting to deployed site...';
                setTimeout(() => {
                    window.location.href = data.url;
                }, 2000);
            } else if (data.type === 'error') {
                status.className = 'status error';
                statusText.textContent = '❌ Error running tests';
                output.innerHTML += '<span class="failed">ERROR: ' + data.message + '</span>\\n';
            }
        };
        
        ws.onerror = () => {
            status.className = 'status error';
            statusText.textContent = '❌ Connection error';
        };
        
        ws.onclose = () => {
            if (status.className === 'status running') {
                status.className = 'status error';
                statusText.textContent = '❌ Connection closed';
            }
        };

        function clearOutput() {
            output.innerHTML = '';
        }
    </script>
</body>
</html>
    `);
});

const server = app.listen(port, () => {
    console.log(`\n🧪 Test Viewer running at http://localhost:${port}\n`);
    console.log(`Opening browser...\n`);
    
    // Auto-open browser
    const open = (url) => {
        const cmd = process.platform === 'darwin' ? 'open' : 
                    process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${cmd} ${url}`);
    };
    
    setTimeout(() => open(`http://localhost:${port}`), 500);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${port} is already in use.`);
        console.error('Killing existing test-viewer process...\n');
        
        // Kill existing test-viewer processes
        exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, (killErr) => {
            if (killErr) {
                console.error('Could not kill existing process. Please run:');
                console.error(`  pkill -f "node test-viewer.js"`);
                console.error(`or:`);
                console.error(`  lsof -ti:${port} | xargs kill -9`);
                process.exit(1);
            } else {
                console.log('Existing process killed. Please run the command again.');
                process.exit(1);
            }
        });
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Client connected\n');
    
    let totalTests = 0;
    let currentTest = 0;
    
    // Clean quarantine attributes from snapshots before running tests
    exec('find tests_regression -name "*.png" -exec xattr -d com.apple.quarantine {} \\; 2>/dev/null', { cwd: __dirname }, (err) => {
        // Ignore errors - quarantine may not exist on all files
    });
    
    // Run tests
    const testProcess = spawn('npx', ['playwright', 'test'], {
        cwd: __dirname,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' }
    });

    testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);
        ws.send(JSON.stringify({ type: 'output', text }));
        
        // Parse test count: "Running 14 tests using 1 worker"
        const countMatch = text.match(/Running (\d+) tests? using/);
        if (countMatch) {
            totalTests = parseInt(countMatch[1]);
            ws.send(JSON.stringify({ 
                type: 'status', 
                current: 0, 
                total: totalTests,
                testName: null
            }));
        }
        
        // Parse test progress: "  ✓  1 [chromium] › ... › test name (time)"
        const testMatch = text.match(/[✓✗]\s+(\d+)\s+\[chromium\]\s+›.*?›\s+([^›]+?)(?:\s+\([^)]+\))?$/m);
        if (testMatch) {
            currentTest = parseInt(testMatch[1]);
            const testName = testMatch[2].trim();
            ws.send(JSON.stringify({ 
                type: 'status', 
                current: currentTest, 
                total: totalTests,
                testName: testName
            }));
        }
    });

    testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(text);
        ws.send(JSON.stringify({ type: 'output', text }));
    });

    testProcess.on('close', (code) => {
        console.log(`\nTests completed with code ${code}\n`);
        ws.send(JSON.stringify({ type: 'complete', code }));
        
        if (exitAfterTests) {
            // In deploy mode: redirect to deployed site if tests passed, then exit
            if (code === 0) {
                console.log('Tests passed! Redirecting browser to deployed site...\n');
                setTimeout(() => {
                    ws.send(JSON.stringify({ 
                        type: 'redirect', 
                        url: 'https://www.metabunk.org/sitrec' 
                    }));
                }, 500);
                
                setTimeout(() => {
                    console.log('Closing test viewer...\n');
                    process.exit(0);
                }, 4000);
            } else {
                console.log(`Tests failed with code ${code}. Not redirecting.\n`);
                setTimeout(() => {
                    process.exit(code);
                }, 2000);
            }
        } else {
            // In interactive mode: keep server open
            setTimeout(() => {
                console.log('Keeping server open. Press Ctrl+C to exit.\n');
            }, 1000);
        }
    });

    testProcess.on('error', (err) => {
        console.error('Failed to start test process:', err);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
    });
});

console.log('Starting Sitrec Test Viewer...');
