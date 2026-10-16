import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('test-results', {recursive: true});
const baseURL = process.env.QC_BASE_URL || 'http://127.0.0.1:8080';
const report = {started: new Date().toISOString(), origin: baseURL, sessions: []};
const profile = '.tools/model-test-profile';

async function session(offline) {
  const context = await chromium.launchPersistentContext(profile, {channel: 'chrome', headless: true, viewport: {width: 1440, height: 1000}});
  const page = context.pages()[0] || await context.newPage();
  const logs = [], requests = [];
  let lastProgress = -1;
  page.on('console', message => {if(message.type() === 'error') logs.push(message.text());});
  page.on('pageerror', error => logs.push(error.message));
  page.on('request', request => {if(!request.url().startsWith(baseURL)) requests.push(request.url());});
  await page.exposeFunction('reportProgress', value => {
    const step = Math.floor(value.progress * 20);
    if(step > lastProgress) {lastProgress = step; console.log(`${offline ? 'OFFLINE' : 'ONLINE'} ${Math.round(value.progress * 100)}% ${value.text}`);}
  });
  try {
    if(offline) await context.setOffline(true);
    await page.goto(baseURL, {timeout: 60000});
    if(!offline) {
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('./sw.js');
        await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('El Service Worker no está preparado tras 45 segundos.')), 45000))]);
      });
      await page.reload();
    }
    const result = await page.evaluate(async () => {
      const {model, generateSelection} = await import('./js/rag.js');
      const catalog = await (await fetch('./data/catalog.json')).json();
      const family = {members: [{id: 'qa', name: 'Prueba', age: 35, portion: 1, allergies: [], intolerances: [], preferences: [], availableMinutes: null}], outsideMeals: []};
      const start = performance.now();
      await model.load(progress => window.reportProgress(progress));
      const entry = await generateSelection({date: '2026-11-02', meal: 'comida', entries: [], ...catalog, family});
      return {entry, elapsedMs: Math.round(performance.now() - start), cache: await model.cacheStatus(), detection: await model.detect()};
    });
    report.sessions.push({offline, success: true, ...result, externalRequests: requests, errors: logs});
    console.log(JSON.stringify({offline, success: true, ...result}, null, 2));
  } catch(error) {
    report.sessions.push({offline, success: false, error: error.message, externalRequests: requests, errors: logs});
    console.error(`${offline ? 'OFFLINE' : 'ONLINE'} FAILED: ${error.message}`);
  } finally {
    await context.close();
    await writeFile('test-results/model-results.json', JSON.stringify(report, null, 2));
  }
}
await session(false);
await session(true);
if(!report.sessions.every(result => result.success) || report.sessions.length !== 2) process.exitCode = 1;
