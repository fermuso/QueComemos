/** Developer-only: produces local, pinned browser assets. Never downloads model weights. */
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const vendor = join(root, 'vendor');
const work = join(root, '.tools', 'vendor-build');
await mkdir(vendor, { recursive: true });
await mkdir(work, { recursive: true });
const sha = (data, alg='sha256') => createHash(alg).update(data).digest('hex');
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function npmPackage(name, version, folder) {
  const metadata = JSON.parse(await download(`https://registry.npmjs.org/${name}/${version}`));
  const data = await download(metadata.dist.tarball);
  const [algorithm, expected] = metadata.dist.integrity.split('-');
  if (createHash(algorithm).update(data).digest('base64') !== expected) throw new Error(`Integridad npm incorrecta: ${name}`);
  const destination = join(work, folder);
  await mkdir(destination, { recursive: true });
  const archive = join(destination, 'package.tgz');
  await writeFile(archive, data);
  execFileSync('tar', ['-xzf', archive, '-C', destination]);
  return { path: join(destination, 'package'), name, version, license:metadata.license, url: metadata.dist.tarball, integrity: metadata.dist.integrity };
}
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const item of await readdir(from, { withFileTypes: true })) {
    if (item.isDirectory()) await copyTree(join(from,item.name),join(to,item.name));
    else if (!item.name.endsWith('.map')) await copyFile(join(from,item.name),join(to,item.name));
  }
}
const webllm = await npmPackage('@mlc-ai/web-llm', '0.2.86', 'webllm');
const pdf = await npmPackage('pdfjs-dist', '6.4.299', 'pdfjs');
await copyFile(join(webllm.path,'lib','index.js'),join(vendor,'webllm.mjs'));
await copyFile(join(webllm.path,'LICENSE'),join(vendor,'LICENSE-WebLLM.txt'));
await mkdir(join(vendor,'pdfjs'),{recursive:true});
await copyFile(join(pdf.path,'build','pdf.mjs'),join(vendor,'pdfjs','pdf.mjs'));
await copyFile(join(pdf.path,'build','pdf.worker.mjs'),join(vendor,'pdfjs','pdf.worker.mjs'));
for (const folder of ['cmaps','standard_fonts','wasm']) await copyTree(join(pdf.path,folder),join(vendor,'pdfjs',folder));
await copyFile(join(pdf.path,'LICENSE'),join(vendor,'LICENSE-PDFjs.txt'));
// Preserve licenses of code bundled into the upstream standalone WebLLM module.
const bundledLicenses=[];
await mkdir(join(vendor,'licenses'),{recursive:true});
for(const [name,version]of [['loglevel','1.9.2'],['buffer','5.7.1'],['base64-js','1.5.1'],['ieee754','1.2.1'],['process','0.11.10'],['@mlc-ai/web-runtime','0.28.0-dev0'],['@mlc-ai/web-tokenizers','0.1.6'],['@mlc-ai/web-xgrammar','0.1.27']]){
  const directory=name.replaceAll('/','-').replace('@','');
  const pkg=await npmPackage(name,version,directory);
  const licenseFile=(await readdir(pkg.path)).find(file=>/^licen[cs]e([._-]|$)/i.test(file));
  if(!licenseFile)throw new Error(`Falta licencia ${name}`);
  await copyFile(join(pkg.path,licenseFile),join(vendor,'licenses',`${directory}.txt`));
  const {path,...metadata}=pkg;bundledLicenses.push(metadata);
}

const revision = '32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad';
const repository = 'mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const modelBaseURL = `https://huggingface.co/${repository}/resolve/${revision}/`;
const tree = JSON.parse(await download(`https://huggingface.co/api/models/${repository}/tree/${revision}?recursive=true`));
// Resolved from the upstream repository, then pinned for reproducible packaging.
const wasmRevision = '00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0';
const wasmPath = 'web-llm-models/v0_2_86/base/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm';
const wasmURL = `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${wasmRevision}/${wasmPath}`;
const wasm = await download(wasmURL);
if (wasm.subarray(0,4).toString('hex') !== '0061736d') throw new Error('No es WebAssembly');
await writeFile(join(vendor,'model.wasm'),wasm);
const config = JSON.parse(await download(`${modelBaseURL}mlc-chat-config.json`));
const names = ['mlc-chat-config.json','tensor-cache.json',...config.tokenizer_files,...tree.filter(x=>x.path.startsWith('params_shard_')).map(x=>x.path)];
const files = [];
for (const path of names) {
  const item = tree.find(x=>x.path===path);
  if (!item) throw new Error(`Falta artefacto ${path}`);
  // LFS object IDs are SHA-256 of actual bytes; small files are hashed directly.
  const digest = item.lfs?.oid || sha(await download(`${modelBaseURL}${path}`));
  files.push({ path, url: `${modelBaseURL}${path}`, bytes: item.size, sha256: digest, cache: path==='mlc-chat-config.json'?'webllm/config':'webllm/model' });
}
const manifest = {
  schemaVersion: '1.0.0', id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', repository, revision,
  modelBaseURL, webllmVersion:'0.2.86', license:'Apache-2.0',
  licenseURL:'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/blob/main/LICENSE',
  totalBytes: files.reduce((n,f)=>n+f.bytes,0), estimatedVRAMMB:945,
  wasm:{path:'vendor/model.wasm',url:wasmURL,revision:wasmRevision,bytes:wasm.byteLength,sha256:sha(wasm)},
  files,
};
await mkdir(join(root,'data'),{recursive:true});
await writeFile(join(root,'data','model-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(vendor,'THIRD-PARTY.json'),JSON.stringify({packages:[webllm,pdf].map(({path,...x})=>x),bundledLicenseTexts:bundledLicenses,wasm:manifest.wasm},null,2)+'\n');
const assets=[];
async function list(folder) {for(const item of await readdir(folder,{withFileTypes:true})){const path=join(folder,item.name);if(item.isDirectory())await list(path);else if(item.name!=='assets-manifest.json'){const bytes=await readFile(path);assets.push({path:path.slice(root.length+1).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}
await list(vendor);
await writeFile(join(vendor,'assets-manifest.json'),JSON.stringify({version:'0.1.0',assets},null,2)+'\n');
console.log(`Prepared ${assets.length} local assets; model weights excluded (${manifest.totalBytes} bytes downloaded only by explicit browser action).`);
