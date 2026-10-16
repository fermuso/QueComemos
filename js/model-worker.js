// Dedicated inference worker. It never acts as the application's Service Worker.
import { CreateMLCEngine } from '../vendor/webllm.mjs';

let engine;
const originalFetch=globalThis.fetch.bind(globalThis);
async function complete(request){
  for(let attempt=0;attempt<2;attempt++){
    try{
      // Each meal is an independent request; do not carry a partial KV/grammar state forward.
      await engine.resetChat();
      return await engine.chat.completions.create({...request,seed:0});
    }catch(error){
      if(attempt||!String(error.message).includes('Grammar matcher rejected'))throw error;
      postMessage({type:'progress',progress:.98,text:'Reiniciando la gramática tras un fallo de generación de la GPU…'});
    }
  }
}
globalThis.onmessage=async({data})=>{
  const {id,type}=data;
  try{
    if(type==='load'){
      const {manifest,wasmURL,offlineOnly}=data;
      if(offlineOnly){
        // No network request is allowed during a cold cache-only initialization.
        globalThis.fetch=async(input,init)=>{
          const request=new Request(input,init),cached=await caches.match(request);
          if(cached)return cached;
          throw new Error(`Recurso ausente en caché offline: ${request.url}`);
        };
      }else globalThis.fetch=originalFetch;
      const sri=hex=>'sha256-'+btoa(String.fromCharCode(...hex.match(/../g).map(x=>parseInt(x,16))));
      const file=path=>manifest.files.find(f=>f.path===path);
      const appConfig={cacheBackend:'cache',model_list:[{
        model:manifest.modelBaseURL,model_id:manifest.id,model_lib:wasmURL,
        overrides:{context_window_size:4096,prefill_chunk_size:512},
        integrity:{config:sri(file('mlc-chat-config.json').sha256),model_lib:sri(manifest.wasm.sha256),tokenizer:{'tokenizer.json':sri(file('tokenizer.json').sha256)},onFailure:'error'},
      }]};
      engine=await CreateMLCEngine(manifest.id,{appConfig,logLevel:'WARN',initProgressCallback:report=>postMessage({type:'progress',...report})});
      // Exercise actual constrained inference, not merely adapter availability.
      const response=await complete({messages:[{role:'user',content:'Return {"status":"ready"}.'}],temperature:0,max_tokens:32,response_format:{type:'json_object',schema:JSON.stringify({type:'object',properties:{status:{type:'string',enum:['ready']}},required:['status'],additionalProperties:false})}});
      const answer=JSON.parse(response.choices[0].message.content);
      if(answer.status!=='ready')throw new Error('La generación de comprobación no devolvió el resultado esperado.');
      postMessage({id,result:{ready:true,offlineModelVerified:true,usage:response.usage}});
    }else if(type==='generate'){
      if(!engine)throw new Error('Modelo no cargado.');
      const response=await complete({messages:data.messages,temperature:0,max_tokens:230,response_format:{type:'json_object',schema:JSON.stringify(data.schema)}});
      postMessage({id,result:response.choices[0].message.content});
    }else throw new Error('Operación de Worker desconocida.');
  }catch(error){postMessage({id,error:error.message||String(error)});}
};
