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

app.use('/test-results', express.static(__dirname + '/test-results'));
app.use('/tests_regression', express.static(__dirname + '/tests_regression'));

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Sitrec Test Viewer</title>
    <style>
        body {
            margin: 0;
            padding: 10px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        #container {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        h1 {
            color: #4ec9b0;
            margin: 0 0 10px 0;
            font-size: 20px;
        }
        .status {
            margin-bottom: 10px;
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
        #workers {
            display: flex;
            gap: 8px;
            flex: 1;
            overflow: hidden;
        }
        .worker-column {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #252526;
            border: 1px solid #3e3e42;
            border-radius: 4px;
            overflow: hidden;
        }
        .worker-header {
            background: #2d2d30;
            padding: 8px;
            font-weight: bold;
            font-size: 12px;
            border-bottom: 1px solid #3e3e42;
            color: #4ec9b0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .worker-timer {
            color: #9cdcfe;
            font-weight: normal;
            font-size: 11px;
            white-space: nowrap;
        }
        .worker-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
            margin-right: 8px;
        }
        .worker-output {
            flex: 1;
            padding: 10px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 11px;
            line-height: 1.4;
        }
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
        <h1>🧪 Sitrec Test Viewer (4 Workers)</h1>
        <div id="status" class="status running">
            <span id="statusText">Connecting...</span>
            <span id="elapsedTime" style="margin-left: 20px; color: #9cdcfe;"></span>
            <div>
                <button id="abortBtn" onclick="abortTests()" style="background: #f48771; margin-right: 8px;">Abort</button>
                <button id="clearBtn" onclick="clearOutput()">Clear</button>
            </div>
        </div>
        <div id="workers">
            <div class="worker-column">
                <div class="worker-header"><span class="worker-name" id="name-0">Waiting...</span><span class="worker-timer" id="timer-0"></span></div>
                <div class="worker-output" id="worker-1"></div>
            </div>
            <div class="worker-column">
                <div class="worker-header"><span class="worker-name" id="name-1">Waiting...</span><span class="worker-timer" id="timer-1"></span></div>
                <div class="worker-output" id="worker-2"></div>
            </div>
            <div class="worker-column">
                <div class="worker-header"><span class="worker-name" id="name-2">Waiting...</span><span class="worker-timer" id="timer-2"></span></div>
                <div class="worker-output" id="worker-3"></div>
            </div>
            <div class="worker-column">
                <div class="worker-header"><span class="worker-name" id="name-3">Waiting...</span><span class="worker-timer" id="timer-3"></span></div>
                <div class="worker-output" id="worker-4"></div>
            </div>
        </div>
    </div>
    <script>
        const status = document.getElementById('status');
        const statusText = document.getElementById('statusText');
        const elapsedTimeEl = document.getElementById('elapsedTime');
        const abortBtn = document.getElementById('abortBtn');
        const workers = [
            document.getElementById('worker-1'),
            document.getElementById('worker-2'),
            document.getElementById('worker-3'),
            document.getElementById('worker-4')
        ];
        
        const workerHeaders = [
            document.querySelector('.worker-column:nth-child(1) .worker-header'),
            document.querySelector('.worker-column:nth-child(2) .worker-header'),
            document.querySelector('.worker-column:nth-child(3) .worker-header'),
            document.querySelector('.worker-column:nth-child(4) .worker-header')
        ];
        
        const workerTimers = [
            document.getElementById('timer-0'),
            document.getElementById('timer-1'),
            document.getElementById('timer-2'),
            document.getElementById('timer-3')
        ];
        
        const workerNames = [
            document.getElementById('name-0'),
            document.getElementById('name-1'),
            document.getElementById('name-2'),
            document.getElementById('name-3')
        ];
        
        const workerAutoScroll = [true, true, true, true];
        const workerStartTimes = [null, null, null, null];
        let globalStartTime = null;
        let timerInterval = null;
        
        function formatTime(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return minutes > 0 ? minutes + 'm ' + secs + 's' : secs + 's';
        }
        
        function updateTimers() {
            const now = Date.now();
            if (globalStartTime) {
                elapsedTimeEl.textContent = 'Total: ' + formatTime(now - globalStartTime);
            }
            for (let i = 0; i < 4; i++) {
                if (workerStartTimes[i]) {
                    workerTimers[i].textContent = formatTime(now - workerStartTimes[i]);
                }
            }
        }
        
        workers.forEach((worker, idx) => {
            worker.addEventListener('scroll', () => {
                const atBottom = worker.scrollHeight - worker.scrollTop <= worker.clientHeight + 50;
                workerAutoScroll[idx] = atBottom;
            });
        });

        const ws = new WebSocket('ws://localhost:${port}');
        
        ws.onopen = () => {
            statusText.textContent = 'Running tests...';
            status.className = 'status running';
            globalStartTime = Date.now();
            timerInterval = setInterval(updateTimers, 1000);
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'workerName') {
                const workerIdx = data.worker;
                const testName = data.name;
                workerNames[workerIdx].textContent = testName;
                workerStartTimes[workerIdx] = Date.now();
                workerTimers[workerIdx].textContent = '0s';
            } else if (data.type === 'output') {
                let line = data.text;
                const workerIdx = data.worker || 0;
                
                // Add syntax highlighting
                if (line.includes('✓')) {
                    line = '<span class="passed">' + line + '</span>';
                } else if (line.includes('✗') || line.includes('failed')) {
                    line = '<span class="failed">' + line + '</span>';
                } else if (line.includes('›')) {
                    line = '<span class="test-line">' + line + '</span>';
                }
                
                workers[workerIdx].innerHTML += line + '\\n';
                
                if (workerAutoScroll[workerIdx]) {
                    workers[workerIdx].scrollTop = workers[workerIdx].scrollHeight;
                }
            } else if (data.type === 'status') {
                if (data.total > 0) {
                    const progress = data.current + '/' + data.total;
                    statusText.textContent = '🧪 Running ' + progress + ' tests on 4 workers...';
                }
            } else if (data.type === 'complete') {
                const hasFailures = data.code !== 0;
                status.className = hasFailures ? 'status error' : 'status complete';
                const totalTime = globalStartTime ? ' (' + formatTime(Date.now() - globalStartTime) + ')' : '';
                statusText.textContent = hasFailures 
                    ? '❌ Tests completed with failures' + totalTime
                    : '✅ All tests passed!' + totalTime;
                abortBtn.disabled = true;
                if (timerInterval) clearInterval(timerInterval);
            } else if (data.type === 'aborted') {
                status.className = 'status error';
                statusText.textContent = '🛑 Tests aborted by user';
                abortBtn.disabled = true;
                if (timerInterval) clearInterval(timerInterval);
            } else if (data.type === 'redirect') {
                statusText.textContent = '✅ Tests passed! Redirecting to deployed site...';
                setTimeout(() => {
                    window.location.href = data.url;
                }, 2000);
            } else if (data.type === 'error') {
                status.className = 'status error';
                statusText.textContent = '❌ Error running tests';
                workers[0].innerHTML += '<span class="failed">ERROR: ' + data.message + '</span>\\n';
            } else if (data.type === 'imageDiff') {
                window.open(data.expected, '_blank');
                window.open(data.actual, '_blank');
                window.open(data.diff, '_blank');
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
            workers.forEach(worker => worker.innerHTML = '');
        }

        function abortTests() {
            if (confirm('Are you sure you want to abort the tests?')) {
                ws.send(JSON.stringify({ type: 'abort' }));
                statusText.textContent = '⏳ Aborting tests...';
                abortBtn.disabled = true;
            }
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
    let testProcess = null;
    let isAborting = false;
    const testToWorkerMap = new Map();
    const workerTestNames = new Map();
    const pendingTests = new Map(); // testNum -> testName (tests waiting for worker assignment)
    let lastTestName = null; // Last test name seen (for worker assignment)
    let lastSeenWorker = 0;
    
    // Handle incoming messages from client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'abort' && testProcess && !isAborting) {
                console.log('\n🛑 Abort requested by user\n');
                isAborting = true;
                testProcess.kill('SIGTERM');
                ws.send(JSON.stringify({ type: 'aborted' }));
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });
    
    // Clean quarantine attributes from snapshots before running tests
    exec('find tests_regression -name "*.png" -exec xattr -d com.apple.quarantine {} \\; 2>/dev/null', { cwd: __dirname }, (err) => {
        // Ignore errors - quarantine may not exist on all files
    });
    
    // Run tests with line reporter for progress tracking
    testProcess = spawn('npx', ['playwright', 'test', '--reporter=line'], {
        cwd: __dirname,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' }
    });

    testProcess.stdout.on('data', (data) => {
        const text = data.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        process.stdout.write(text);
        
        // Check for bare test line (starts with [chromium], not [N/M] [chromium])
        // This indicates test is about to run on a worker
        const bareTestMatch = text.match(/^\[chromium\]\s+›.*?›\s+([^›]+?)\s*$/m);
        if (bareTestMatch) {
            lastTestName = bareTestMatch[1].trim();
        }
        
        // Check for worker ID prefix: [WORKER-0], [WORKER-1], etc.
        const workerMatch = text.match(/\[WORKER-(\d+)\]/);
        let targetWorker = lastSeenWorker;
        
        if (workerMatch) {
            targetWorker = parseInt(workerMatch[1]);
            lastSeenWorker = targetWorker;
            
            // If we have a pending test name, assign it to this worker
            if (lastTestName) {
                workerTestNames.set(targetWorker, lastTestName);
                ws.send(JSON.stringify({ 
                    type: 'workerName', 
                    worker: targetWorker,
                    name: lastTestName
                }));
                lastTestName = null;
            }
        }
        
        // Parse test count: "Running 14 tests using 4 workers"
        const countMatch = text.match(/Running (\d+) tests? using/);
        if (countMatch) {
            totalTests = parseInt(countMatch[1]);
            ws.send(JSON.stringify({ 
                type: 'status', 
                current: 0, 
                total: totalTests
            }));
            // Send this to all workers
            for (let i = 0; i < 4; i++) {
                ws.send(JSON.stringify({ type: 'output', text, worker: i }));
            }
            return;
        }
        
        // Parse test START: "[1/10] [chromium] › file.test.js:10:5 › Test Suite › test name"
        // This happens BEFORE we know which worker runs it
        const startMatch = text.match(/\[(\d+)\/(\d+)\]\s+\[chromium\].*?›\s+([^›]+?)\s*$/m);
        if (startMatch) {
            const testNum = parseInt(startMatch[1]);
            const total = parseInt(startMatch[2]);
            const testName = startMatch[3].trim();
            
            if (total > totalTests) totalTests = total;
            
            // Store pending test - worker will be assigned when we see WORKER-X output
            pendingTests.set(testNum, testName);
            
            ws.send(JSON.stringify({ 
                type: 'status', 
                current: testNum - 1, 
                total: totalTests
            }));
            
            // Send to all workers initially (we don't know which one yet)
            for (let i = 0; i < 4; i++) {
                ws.send(JSON.stringify({ type: 'output', text, worker: i }));
            }
            return;
        }
        
        // Parse test COMPLETION: "  ✓  1 [chromium] › ... › test name (time)"
        // Try to match "for X" pattern first
        let testMatch = text.match(/[✓✗]\s+(\d+)\s+\[chromium\].*?for\s+(.+?)(?:\s+\(|$)/);
        if (!testMatch) {
            // Fallback: match last part after last ›
            testMatch = text.match(/[✓✗]\s+(\d+)\s+\[chromium\].*?›\s+([^›]+?)(?:\s+\(|$)/);
        }
        
        if (testMatch) {
            const testNum = parseInt(testMatch[1]);
            currentTest = testNum;
            
            // Get the worker this test was assigned to
            if (testToWorkerMap.has(testNum)) {
                targetWorker = testToWorkerMap.get(testNum);
                lastSeenWorker = targetWorker;
            }
            
            ws.send(JSON.stringify({ 
                type: 'status', 
                current: currentTest, 
                total: totalTests
            }));
            
            ws.send(JSON.stringify({ type: 'output', text, worker: targetWorker }));
            return;
        }
        
        // For summary lines (X passed, X failed), send to all workers
        if (text.match(/\d+\s+(passed|failed)/)) {
            for (let i = 0; i < 4; i++) {
                ws.send(JSON.stringify({ type: 'output', text, worker: i }));
            }
            return;
        }
        
        // Detect screenshot mismatch and extract image paths
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Parse Playwright output format:
            // Expected: tests_regression/.../snapshot.png
            // Received: test-results/.../actual.png
            // Diff:     test-results/.../diff.png
            if (line.startsWith('Expected:') && i + 2 < lines.length) {
                const expectedPath = line.replace('Expected:', '').trim();
                const receivedLine = lines[i + 1].trim();
                const diffLine = lines[i + 2].trim();
                
                if (receivedLine.startsWith('Received:') && diffLine.startsWith('Diff:')) {
                    const actualPath = receivedLine.replace('Received:', '').trim();
                    const diffPath = diffLine.replace('Diff:', '').trim();
                    
                    ws.send(JSON.stringify({
                        type: 'imageDiff',
                        expected: `http://localhost:${port}/${expectedPath}`,
                        actual: `http://localhost:${port}/${actualPath}`,
                        diff: `http://localhost:${port}/${diffPath}`
                    }));
                    console.log(`\n📸 Opening image comparison tabs:\n  Expected: ${expectedPath}\n  Actual: ${actualPath}\n  Diff: ${diffPath}\n`);
                }
            }
        }
        
        // For other output, send to the detected worker
        ws.send(JSON.stringify({ type: 'output', text, worker: targetWorker }));
    });

    testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(text);
        ws.send(JSON.stringify({ type: 'output', text }));
    });

    testProcess.on('close', (code) => {
        if (isAborting) {
            console.log(`\nTests aborted by user\n`);
            if (exitAfterTests) {
                setTimeout(() => {
                    console.log('Closing test viewer...\n');
                    process.exit(1);
                }, 2000);
            }
            return;
        }
        
        console.log(`\nTests completed with code ${code}\n`);
        ws.send(JSON.stringify({ type: 'complete', code }));
        
        if (exitAfterTests) {
            // In deploy mode: exit after tests complete
            // Note: redirect to deployed site is handled by deploy.sh after upload succeeds
            if (code === 0) {
                console.log('Tests passed!\n');
                
                setTimeout(() => {
                    console.log('Closing test viewer...\n');
                    process.exit(0);
                }, 2000);
            } else {
                console.log(`Tests failed with code ${code}. Not redirecting.\n`);
                setTimeout(() => {
                    console.log('Closing test viewer...\n');
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
