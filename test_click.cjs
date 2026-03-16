const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

    await page.goto('http://localhost:5173');

    console.log("Page loaded. Waiting 2s for JS init...");
    await new Promise(r => setTimeout(r, 2000));

    console.log("Clicking button...");
    await page.click('#btn-start');

    console.log("Waiting 2s after click...");
    await new Promise(r => setTimeout(r, 2000));

    console.log("Checking overlay visibility...");
    const isHidden = await page.evaluate(() => {
        const el = document.getElementById('start-overlay');
        return el ? el.classList.contains('hidden') : null;
    });

    console.log("Is overlay hidden?", isHidden);

    await browser.close();
})();
