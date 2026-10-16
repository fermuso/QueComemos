import { parseBundle } from './domain.js';

const LIMIT=25*1024*1024;
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');

/** Preserve the section and page for every excerpt. Documents never become selectable recipes. */
export function fragmentText(text,{sourceId,page=null,section='Texto',prefix=''}={}){
  const normalized=String(text).replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').trim();
  if(!normalized)return [];
  const result=[];let heading=section;
  for(const block of normalized.split(/\n(?=#{1,6}\s)/)){
    const title=block.match(/^#{1,6}\s+([^\n]+)/)?.[1];if(title)heading=title.trim();
    let offset=0;
    while(offset<block.length){
      let end=Math.min(offset+1300,block.length);
      if(end<block.length){const split=block.lastIndexOf(' ',end);if(split>offset+800)end=split;}
      const excerpt=block.slice(offset,end).trim();
      if(excerpt)result.push({id:`${sourceId}-${prefix}${page?`p${page}-`:''}c${result.length+1}`,sourceId,text:excerpt,page,section:heading});
      if(end===block.length)break;
      offset=Math.max(offset+1,end-180);
    }
  }
  return result;
}

async function ingestBytes(bytes,{name,url,contentType=''}){
  if(bytes.byteLength>LIMIT)throw new Error(`${name}: el archivo supera el límite de 25 MB por importación.`);
  const extension=name.split('.').at(-1).toLowerCase();
  if(extension==='json'||contentType.includes('application/json')){
    const bundle=parseBundle(new TextDecoder().decode(bytes));
    return {sources:bundle.sources,chunks:bundle.chunks,recipes:bundle.recipes};
  }
  const sourceId=`user-${(await hash(bytes)).slice(0,24)}`;
  const source={id:sourceId,title:name,organization:'Documento aportado por el usuario',url:url||`local:${encodeURIComponent(name)}`,license:'Uso privado; verifica los derechos del documento original.',updated:null,accessed:date(),kind:'user',attribution:`Documento importado voluntariamente: ${name}. No se redistribuye fuera de este navegador.`};
  let chunks=[];
  if(extension==='pdf'||contentType.includes('application/pdf')){
    const pdfjs=await import('../vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
    const loading=pdfjs.getDocument({data:bytes,cMapUrl:new URL('../vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false,disableFontFace:true});
    try{
      const document=await loading.promise;
      if(document.numPages>600)throw new Error('El PDF supera las 600 páginas. Divide el documento antes de importarlo.');
      for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
        const page=await document.getPage(pageNumber),content=await page.getTextContent();
        const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');
        chunks.push(...fragmentText(text,{sourceId,page:pageNumber,section:`${name} · página ${pageNumber}`}));
        page.cleanup();
      }
    }catch(error){throw new Error(`${name}: no se pudo leer el PDF. ${error.message}`);}
    finally{await loading.destroy();}
    if(!chunks.length)throw new Error(`${name}: PDF sin texto extraíble. Necesita OCR previo; importa un TXT o Markdown con su transcripción.`);
  }else if(['txt','md','markdown'].includes(extension)||/^text\/(plain|markdown)/.test(contentType)){
    chunks=fragmentText(new TextDecoder().decode(bytes),{sourceId,section:name});
  }else if(contentType.includes('text/html')&&url){
    const document=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'text/html');
    for(const node of document.querySelectorAll('script,style,nav,footer,header,noscript,iframe'))node.remove();
    source.title=document.title?.trim()||name;
    const main=document.querySelector('main,article')||document.body;
    chunks=fragmentText(main.textContent,{sourceId,section:source.title});
  }else throw new Error(`${name}: formato no admitido. Selecciona PDF, TXT, Markdown o un JSON estructurado validado.`);
  if(!chunks.length)throw new Error(`${name}: el documento está vacío.`);
  return {sources:[source],chunks,recipes:[]};
}

export async function ingestFiles(files){
  const result={sources:[],chunks:[],recipes:[]},items=[...files];
  if(!items.length)throw new Error('No se ha seleccionado ningún archivo.');
  // Do not write anything here: all files must succeed before the caller persists a batch.
  for(const file of items){
    if(file.size>LIMIT)throw new Error(`${file.name}: supera los 25 MB.`);
    const bundle=await ingestBytes(new Uint8Array(await file.arrayBuffer()),{name:file.name,url:null,contentType:file.type});
    for(const key of Object.keys(result))result[key].push(...bundle[key]);
  }
  for(const key of Object.keys(result))result[key]=[...new Map(result[key].map(item=>[item.id,item])).values()];
  return result;
}

export async function ingestURL(value){
  let url;try{url=new URL(value);}catch{throw new Error('Introduce una URL completa https://…');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('La URL debe usar HTTP o HTTPS y no incluir credenciales.');
  let response;
  try{response=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});}catch{throw new Error('No se pudo importar la URL. El servidor puede bloquear CORS o no hay conexión. Descarga el documento y usa «Seleccionar archivos».');}
  if(!response.ok)throw new Error(`El servidor respondió ${response.status}. Descarga el documento manualmente y selecciónalo desde tu equipo.`);
  if(Number(response.headers.get('Content-Length'))>LIMIT)throw new Error('El documento supera los 25 MB.');
  const reader=response.body?.getReader();let total=0,parts=[];
  if(reader){while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>LIMIT){await reader.cancel();throw new Error('El documento supera los 25 MB.');}parts.push(value);}}
  else{const buffer=new Uint8Array(await response.arrayBuffer());parts=[buffer];total=buffer.length;}
  const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const finalURL=new URL(response.url||url.href),name=decodeURIComponent(finalURL.pathname.split('/').pop()||finalURL.hostname);
  return ingestBytes(bytes,{name,url:finalURL.href,contentType:response.headers.get('Content-Type')||''});
}
