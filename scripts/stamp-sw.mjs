import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';

const root=resolve(import.meta.dirname,'..'),path=join(root,'sw.js');
const source=await readFile(path,'utf8');
const shell=source.match(/const SHELL=(\[[\s\S]*?\]);/)?.[1];
if(!shell)throw new Error('No se encuentra el inventario del shell en sw.js.');
const files=[...new Set([...shell.matchAll(/'([^']+)'/g)].map(match=>match[1]==='./'?'index.html':match[1]))].sort();
const hash=createHash('sha256');
hash.update(source.replace(/const VERSION='[^']+';/,"const VERSION='<content-fingerprint>';"));
for(const file of [...files,'vendor/assets-manifest.json']){hash.update('\n'+file+'\n');hash.update(await readFile(join(root,file)));}
const version=`quecomemos-app-0.1.0-${hash.digest('hex').slice(0,16)}`;
const stamped=source.replace(/const VERSION='[^']+';/,`const VERSION='${version}';`);
if(stamped!==source)await writeFile(path,stamped);
console.log(version);
