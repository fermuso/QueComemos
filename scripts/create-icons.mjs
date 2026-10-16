import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  for(const [input, size, output] of [['icon.svg', 192, 'icon-192.png'], ['icon.svg', 512, 'icon-512.png'], ['icon-maskable.svg', 512, 'icon-maskable-512.png']]) {
    const page = await browser.newPage({viewport: {width: size, height: size}, deviceScaleFactor: 1});
    const svg = await readFile(`assets/${input}`, 'utf8');
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({path: `assets/${output}`, omitBackground: true});
    await page.close();
  }
} finally {await browser.close();}
