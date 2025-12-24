import {expect, test} from '@playwright/test';

async function waitForFrames(page, count = 10) {
    await page.evaluate(({ frameCount }) => {
        return new Promise((resolve) => {
            let frames = 0;
            function wait() {
                frames++;
                if (frames < frameCount) {
                    requestAnimationFrame(wait);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(wait);
        });
    }, { frameCount: count });
}

async function openChat(page) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    
    const chatVisible = await page.evaluate(() => {
        const chatView = document.querySelector('.cnodeview-chatlog');
        return chatView && chatView.offsetParent !== null;
    });
    
    if (!chatVisible) {
        throw new Error('Chat view did not open');
    }
}

async function getBotMessageCount(page) {
    return page.evaluate(() => {
        const chatLog = document.querySelector('.cnodeview-chatlog');
        if (!chatLog) return 0;
        return Array.from(chatLog.querySelectorAll('div'))
            .filter(div => div.textContent.startsWith('Bot:')).length;
    });
}

async function sendChatMessage(page, message) {
    const initialCount = await getBotMessageCount(page);
    const input = page.locator('.cnodeview-input');
    await input.fill(message);
    await input.press('Enter');
    return initialCount;
}

async function waitForBotResponse(page, initialCount, timeoutMs = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
        const messages = await page.evaluate(() => {
            const chatLog = document.querySelector('.cnodeview-chatlog');
            if (!chatLog) return [];
            return Array.from(chatLog.querySelectorAll('div'))
                .map(div => div.textContent)
                .filter(text => text.startsWith('Bot:'));
        });
        
        if (messages.length > initialCount) {
            await page.waitForTimeout(1000);
            
            const finalMessages = await page.evaluate(() => {
                const chatLog = document.querySelector('.cnodeview-chatlog');
                if (!chatLog) return [];
                return Array.from(chatLog.querySelectorAll('div'))
                    .map(div => div.textContent)
                    .filter(text => text.startsWith('Bot:'));
            });
            
            if (finalMessages.length === messages.length) {
                return finalMessages[finalMessages.length - 1].replace(/^Bot:\s*/, '');
            }
        }
        await page.waitForTimeout(200);
    }
    
    throw new Error(`Timed out waiting for bot response after ${timeoutMs}ms`);
}

async function getChatMessages(page) {
    return page.evaluate(() => {
        const chatLog = document.querySelector('.cnodeview-chatlog');
        if (!chatLog) return [];
        return Array.from(chatLog.querySelectorAll('div'))
            .map(div => div.textContent);
    });
}

async function getMenuValue(page, menuName, controlPath) {
    return page.evaluate(({ menu, path }) => {
        if (typeof sitrecAPI !== 'undefined') {
            const result = sitrecAPI.call('getMenuValue', { menu, path });
            return result?.result?.value ?? result?.result;
        }
        return null;
    }, { menu: menuName, path: controlPath });
}

test.describe.serial('Chatbot Tests', () => {
    let sharedPage;
    let workerIndex;

    test.beforeAll(async ({ browser }, testInfo) => {
        workerIndex = testInfo.workerIndex;
        sharedPage = await browser.newPage();
        
        sharedPage.on('console', msg => {
            console.log(`[WORKER-${workerIndex}] PAGE CONSOLE [${msg.type()}]: ${msg.text()}`);
        });
        
        await sharedPage.goto('https://local.metabunk.org/sitrec?ignoreunload=1&regression=1&mapType=Local&elevationType=Local');
        
        await sharedPage.waitForFunction(() => {
            return document.querySelector('.lil-gui') !== null;
        }, { timeout: 30000 });
        
        await sharedPage.evaluate(() => {
            window.__consoleLogs = [];
            const originalLog = console.log;
            console.log = function(...args) {
                window.__consoleLogs.push(args.join(' '));
                originalLog.apply(console, args);
            };
        });
        
        await sharedPage.waitForFunction(() => {
            return window.__consoleLogs?.some(log => log.includes('No pending actions'));
        }, { timeout: 30000 }).catch(() => {
            console.log('Warning: Did not detect "No pending actions" message');
        });
        
        await sharedPage.waitForTimeout(3000);
    });

    test.afterAll(async () => {
        await sharedPage.close();
    });

    test('should open chat with Tab key', async () => {
        test.setTimeout(30000);
        await openChat(sharedPage);
        
        const chatVisible = await sharedPage.evaluate(() => {
            const chatView = document.querySelector('.cnodeview-chatlog');
            return chatView && chatView.offsetParent !== null;
        });
        
        expect(chatVisible).toBe(true);
    });

    test('should respond to simple math question', async () => {
        test.setTimeout(60000);
        
        const initialCount = await sendChatMessage(sharedPage, 'what is 2+2?');
        const response = await waitForBotResponse(sharedPage, initialCount);
        
        console.log('Bot response:', response);
        expect(response.toLowerCase()).toContain('4');
    });

    test('should set camera object to helicopter model', async () => {
        test.setTimeout(60000);
        
        const initialCount = await sendChatMessage(sharedPage, 'set camera object to helicopter');
        const response = await waitForBotResponse(sharedPage, initialCount);
        
        console.log('Bot response:', response);
        
        await waitForFrames(sharedPage, 30);
        
        expect(response.toLowerCase()).toContain('bell');
    });

    test('should change lighting to ambient only', async () => {
        test.setTimeout(60000);
        
        const initialCount = await sendChatMessage(sharedPage, 'ambient only');
        const response = await waitForBotResponse(sharedPage, initialCount);
        
        console.log('Bot response:', response);
        
        expect(response.toLowerCase()).toContain('ambient');
    });
});
