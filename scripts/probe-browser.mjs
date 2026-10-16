import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('test-results', {recursive: true});
const results = [];
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({channel, headless: true});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.QC_BASE_URL || 'http://127.0.0.1:8080');
  const capabilities = await page.evaluate(async () => {
    if (!navigator.gpu) return {webgpu: false, reason: 'navigator.gpu ausente'};
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return {webgpu: true, adapter: false};
      const device = await adapter.requestDevice();
      const info = adapter.info || await adapter.requestAdapterInfo?.();
      const result = {webgpu: true, adapter: true, info: info ? {vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter} : null, features: [...adapter.features], maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize};
      device.destroy();
      return result;
    } catch(error) {return {webgpu: true, error: error.message};}
  });
  results.push({channel, version: browser.version(), capabilities, errors});
  await browser.close();
}
await writeFile('test-results/gpu-probe.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
