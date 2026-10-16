import {test, expect} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';

const demoPath = new URL('../data/QueComemos-DatosDemo-1.0.0.json', import.meta.url);
async function start(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1})).toContainText('comemos');
}
async function demo(page) {
  await start(page);
  await page.getByTestId('import-demo').click();
  await page.getByRole('button', {name: 'Importar demostración', exact: true}).click();
  await expect(page.locator('.demo-banner')).toContainText('ficticia');
  await expect(page.locator('.meal-card h3')).toHaveCount(14);
}
const state = page => page.evaluate(async () => (await import('./js/storage.js')).loadState());
const nav = (page, name) => page.getByRole('navigation', {name: 'Secciones'}).getByRole('button', {name, exact: true}).click();

test('Inicio accesible sin importar una familia automáticamente', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  expect((await state(page)).family.members).toHaveLength(0);
  expect((await state(page)).recipes).toHaveLength(15);
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', {name: 'Saltar al contenido'})).toBeFocused();
});

test('Demo voluntaria: 60 entradas, persistencia y semana recuperable', async ({page}) => {
  await demo(page);
  let saved = await state(page);
  expect(saved.menus.flatMap(menu => menu.entries)).toHaveLength(60);
  expect(new Set(saved.menus.flatMap(menu => menu.entries).map(entry => entry.date)).size).toBe(30);
  await page.reload();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.getByTestId('week-input').fill('2026-11-02');
  await expect(page.locator('.meal-card h3')).toHaveCount(14);
  saved = await state(page);
  expect(saved.family.members.map(member => member.age).sort((a,b) => a-b).slice(0,2)).toEqual([6,10]);
});

test('Crear y editar persona conserva porciones manuales al cambiar edad', async ({page}) => {
  await start(page);
  await nav(page, 'Mi familia');
  await page.getByRole('button', {name: 'Añadir persona', exact: true}).click();
  await page.getByLabel('Nombre', {exact: true}).fill('Persona de prueba');
  await page.getByLabel('Edad en años', {exact: true}).fill('6');
  await page.getByRole('button', {name: 'Guardar persona', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Persona de prueba', exact: true})).toBeVisible();
  expect((await state(page)).family.members[0].portion).toBeNull();
  await page.getByRole('button', {name: 'Editar perfil', exact: true}).click();
  await page.getByLabel('Edad en años', {exact: true}).fill('10');
  await page.getByRole('button', {name: 'Guardar persona', exact: true}).click();
  const member = (await state(page)).family.members[0];
  expect(member.age).toBe(10);
  expect(member.portion).toBeNull();
});

test('Receta muestra procedencia, cantidades escaladas y cierre con teclado', async ({page}) => {
  await demo(page);
  await nav(page, 'Recetas');
  await page.getByTestId('recipe-search').fill('Crema de lentejas rojas');
  await page.getByRole('button', {name: /^Ver receta/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Escalar para raciones culinarias').fill('8');
  await expect(page.locator('#scaled-ingredients')).toContainText('300 g');
  await expect(page.getByRole('link', {name: 'Abrir fuente original ↗'})).toHaveAttribute('href', /canalsalut\.gencat\.cat/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('Fijar plato, guardar y marcar compra persiste', async ({page}) => {
  await demo(page);
  const lock = page.getByRole('button', {name: /^Fijar /}).first();
  await lock.click();
  await expect(page.getByRole('button', {name: /^Desfijar /})).toHaveCount(1);
  await nav(page, 'La compra');
  const checkbox = page.locator('.shopping-item input[type=checkbox]').first();
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect.poll(async () => (await state(page)).shopping.length).toBe(1);
  expect((await state(page)).menus.find(menu => menu.weekStart === '2026-11-02').entries.some(entry => entry.locked)).toBe(true);
});

test('TXT y Markdown aportan fuentes sin crear recetas ni ejecutar instrucciones', async ({page}) => {
  await start(page);
  await nav(page, 'Fuentes e IA');
  await page.locator('#source-files').setInputFiles([
    {name: 'prueba.txt', mimeType: 'text/plain', buffer: Buffer.from('Documento sintético de prueba: lentejas y verduras. <script>window.injection=true</script>')},
    {name: 'secciones.md', mimeType: 'text/markdown', buffer: Buffer.from('# Sección de prueba\nTexto sintético sobre arroz para verificar metadatos.')}
  ]);
  await expect.poll(async () => (await state(page)).sources.filter(source => source.kind === 'user').length).toBe(2);
  expect((await state(page)).recipes).toHaveLength(15);
  expect(await page.evaluate(() => window.injection)).toBeUndefined();
});

test('JSON corrupto se rechaza sin modificar el estado', async ({page}) => {
  await demo(page);
  const before = await state(page);
  await page.locator('#backup-file').setInputFiles({name: 'corrupto.json', mimeType: 'application/json', buffer: Buffer.from('{broken')});
  await expect(page.locator('#toast')).toContainText('JSON corrupto');
  expect(await state(page)).toEqual(before);
});

test('Exportar y restaurar copia requiere archivo válido y conserva los datos', async ({page}) => {
  await demo(page);
  await nav(page, 'Ajustes');
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('backup-export').click();
  const download = await downloadEvent;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.kind).toBe('backup');
  expect(backup.family.members).toHaveLength(4);
  await page.locator('#backup-file').setInputFiles({name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))});
  await page.getByRole('button', {name: 'Restaurar copia', exact: true}).last().click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await state(page)).menus.flatMap(menu => menu.entries)).toHaveLength(60);
});

test('PDF con texto se extrae por página y PDF sin texto pide OCR', async ({page, context}) => {
  const fixturePage = await context.newPage();
  await fixturePage.setContent('<h1>Documento sintético de prueba</h1><p>Legumbres y arroz para verificar la extracción de texto, sin recomendaciones.</p>');
  const textPDF = await fixturePage.pdf();
  await fixturePage.setContent('<div style="width:300px;height:300px;background:#8077cc"></div>');
  const scannedPDF = await fixturePage.pdf();
  await fixturePage.close();
  await start(page);
  await nav(page, 'Fuentes e IA');
  await page.locator('#source-files').setInputFiles({name: 'texto-prueba.pdf', mimeType: 'application/pdf', buffer: textPDF});
  await expect.poll(async () => (await state(page)).sources.filter(source => source.kind === 'user').length).toBe(1);
  expect((await state(page)).chunks.some(chunk => chunk.page === 1 && chunk.text.includes('sintético'))).toBe(true);
  const before = await state(page);
  await page.locator('#source-files').setInputFiles({name: 'sin-texto.pdf', mimeType: 'application/pdf', buffer: scannedPDF});
  await expect(page.locator('#toast')).toContainText('OCR');
  expect(await state(page)).toEqual(before);
});

test('CORS bloqueado ofrece descarga manual y no altera documentos', async ({page}) => {
  await start(page);
  const before = await state(page);
  const message = await page.evaluate(async () => {
    try {await (await import('./js/ingest.js')).ingestURL('http://127.0.0.1:8081/data/catalog.json'); return '';}
    catch(error) {return error.message;}
  });
  expect(message).toMatch(/CORS|manualmente/);
  expect(await state(page)).toEqual(before);
});

test('Sin WebGPU mantiene recetas y comunica indisponibilidad', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', {get: () => undefined, configurable: true}));
  await start(page);
  const capability = await page.evaluate(async () => (await import('./js/rag.js')).model.detect());
  expect(capability.supported).toBe(false);
  await nav(page, 'Recetas');
  await expect(page.locator('.recipe-card')).toHaveCount(15);
  await nav(page, 'Fuentes e IA');
  await expect(page.locator('#main')).toContainText(/IA local no disponible|WebGPU/);
});

test('PWA arranca sin red y conserva la demo; captura real', async ({page, context}, testInfo) => {
  await demo(page);
  await page.evaluate(async () => {
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker pendiente')), 15000))]);
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('week-input').fill('2026-11-02');
  await expect(page.locator('.meal-card h3')).toHaveCount(14);
  await expect(page.locator('#connection-status')).toContainText('Sin conexión');
  expect((await state(page)).family.members).toHaveLength(4);
  await mkdir('docs/screenshots', {recursive: true});
  await page.screenshot({path: `docs/screenshots/${testInfo.project.name}.png`, fullPage: true});
});
