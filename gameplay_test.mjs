import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const SCREENSHOT_DIR = '/Users/human/.gemini/antigravity/brain/36ff9dcd-164c-47f2-bd3a-455a0145abb5';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();

    const errors = [];
    const logs = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); else logs.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    console.log('Navigating to game...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await sleep(1000);

    // Screenshot 1: Menu
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'test_01_menu.png') });
    console.log('[SCREENSHOT] Menu captured.');

    // Click start button
    await page.click('#start-btn');
    await sleep(2000);

    // Click start button
    await page.click('#start-btn');
    await sleep(2000);

    // Take screenshot after clicking start
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'test_02_game_start.png') });
    console.log('[SCREENSHOT] Initial game state captured.');

    // The WebGL canvas is the last canvas on the page (minimap is first)
    // Lock pointer by clicking the renderer canvas
    // Use JS to click the body which triggers pointer lock
    await page.evaluate(() => document.body.click());
    await sleep(500);

    // Also try clicking center via keyboard shortcut approach
    await page.keyboard.press('Enter');
    await sleep(1000);

    // Screenshot after entering
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'test_03_maze_entered.png') });
    console.log('[SCREENSHOT] Maze entered - checking textures and lighting.');

    // Check FPS counter via DOM
    const initialFps = await page.$eval('#fps', el => el.textContent).catch(() => 'N/A');
    console.log(`[FPS] Initial FPS: ${initialFps}`);

    // Check HUD elements
    const hasLevel = await page.$eval('#level', el => el.textContent).catch(() => null);
    const hasKeys = await page.$eval('#keys', el => el.textContent).catch(() => null);
    const hasMonsterTimer = await page.$eval('#monster-timer', el => el.textContent).catch(() => null);
    console.log(`[HUD] Level: ${hasLevel}, Keys: ${hasKeys}, Monster Timer: ${hasMonsterTimer}`);

    // Try to simulate movement with WASD keyboard events
    for (let i = 0; i < 5; i++) {
        await page.keyboard.down('KeyW');
        await sleep(300);
        await page.keyboard.up('KeyW');
        await sleep(200);
    }

    // Screenshot: maze interior with walls and torches
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'test_04_maze_interior.png') });
    console.log('[SCREENSHOT] Maze interior captured (checking walls & torches).');

    // Wait for monster to spawn (5 seconds from start)
    console.log('[WAITING] Waiting for monster spawn...');
    const beforeSpawnFps = await page.$eval('#fps', el => el.textContent).catch(() => 'N/A');
    console.log(`[FPS] Pre-spawn FPS: ${beforeSpawnFps}`);

    // Record FPS samples around spawn time
    const fpsSamples = [];
    const monsterTimerText = await page.$eval('#monster-timer', el => el.textContent).catch(() => 'N/A');
    console.log(`[MONSTER] Monster timer: ${monsterTimerText}`);

    // Wait for monster timer to show "Active!"
    let monsterSpawned = false;
    for (let t = 0; t < 20; t++) {
        const timerText = await page.$eval('#monster-timer', el => el.textContent).catch(() => '');
        const fps = await page.$eval('#fps', el => el.textContent).catch(() => '0');
        fpsSamples.push(parseInt(fps) || 0);
        if (timerText.includes('Active')) {
            monsterSpawned = true;
            console.log(`[MONSTER] Monster spawned at t=${t}s! FPS at spawn: ${fps}`);
            break;
        }
        await sleep(1000);
    }

    // Screenshot 4: After monster spawn
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'test_04_monster_spawned.png') });
    console.log('[SCREENSHOT] Post-spawn snapshot captured.');

    const postSpawnFps = await page.$eval('#fps', el => el.textContent).catch(() => 'N/A');
    console.log(`[FPS] Post-spawn FPS: ${postSpawnFps}`);

    const minFps = Math.min(...fpsSamples.filter(f => f > 0));
    const avgFps = Math.round(fpsSamples.filter(f => f > 0).reduce((a, b) => a + b, 0) / fpsSamples.filter(f => f > 0).length);
    console.log(`[FPS ANALYSIS] Min: ${minFps}, Avg: ${avgFps}`);

    // Report
    const report = {
        wallTextures: 'See screenshot test_02_game_start.png',
        initialFps,
        preSpawnFps: beforeSpawnFps,
        postSpawnFps,
        minFps,
        avgFps,
        monsterSpawned,
        fpsSamples,
        consoleErrors: errors,
        consoleLogs: logs.slice(0, 20)
    };

    writeFileSync(join(SCREENSHOT_DIR, 'gameplay_report.json'), JSON.stringify(report, null, 2));
    console.log('\n=== GAMEPLAY TEST REPORT ===');
    console.log(JSON.stringify(report, null, 2));

    await sleep(2000);
    await browser.close();
    console.log('\nTest complete.');
})();
