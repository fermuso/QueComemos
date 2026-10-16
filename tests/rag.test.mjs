import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tokenize,buildIndex,searchIndex,validateSelection,generateMenu,generateSelection,selectionRationale } from '../js/rag.js';
import { fragmentText,ingestFiles } from '../js/ingest.js';

const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const index=buildIndex(catalog.chunks);
const queries=[
 ['lentejas rojas zanahoria cilantro','crema-lentejas-rojas'],
 ['paté lentejas nueces','pate-lentejas-nueces'],
 ['alubias calabaza romero','crema-alubias-calabaza'],
 ['garbanzos curry calabaza','garbanzos-curry'],
 ['estofado tofu','estofado-tofu'],
 ['sopa lentejas mostaza','sopa-lentejas-mostaza'],
 ['hamburguesas alubias','hamburguesas-alubias'],
 ['huevos guisantes','huevos-guisantes'],
 ['lubina hinojo','lubina-hinojo'],
 ['pollo samfaina','pollo-samfaina'],
];
for(const [query,recipeId]of queries){
 test(`BM25 recuperación esperada: ${query}`,()=>{
   const hits=searchIndex(index,query,3);assert.ok(hits.some(h=>h.chunk.id===`ev-${recipeId}`));
 });
 test(`Cita sustentada en receta: ${recipeId}`,()=>{
   const result=validateSelection({recipeId,evidenceChunkIds:[`ev-${recipeId}`],rationale:selectionRationale(catalog.recipes.find(r=>r.id===recipeId))},{recipes:catalog.recipes,chunks:catalog.chunks,family:catalog.family,retrievedIds:[`ev-${recipeId}`]});
   assert.equal(result.recipeId,recipeId);
 });
}
test('Normaliza tildes y no recupera evidencia sin coincidencias',()=>{
 assert.deepEqual(tokenize('¡HUEVO, brócoli y arroz!'),['huevo','brocoli','arroz']);
 assert.deepEqual(searchIndex(index,'zzxxqq inexistente'),[]);
 assert.deepEqual(searchIndex(buildIndex([]),'huevo'),[]);
 assert.deepEqual(searchIndex(index,'el de la'),[]);
});
test('Índice persiste como JSON sin perder resultados',()=>{
 assert.deepEqual(searchIndex(JSON.parse(JSON.stringify(index)),'lubina hinojo',2),searchIndex(index,'lubina hinojo',2));
});
test('Abstención ante receta inventada y evidencia cruzada o no recuperada',()=>{
 const options={recipes:catalog.recipes,chunks:catalog.chunks,family:catalog.family,retrievedIds:['ev-lubina-hinojo']};
 assert.throws(()=>validateSelection({recipeId:'inventada',evidenceChunkIds:['ev-lubina-hinojo'],rationale:'x'},options));
 const rationale=selectionRationale(catalog.recipes.find(r=>r.id==='pollo-samfaina'));
 assert.throws(()=>validateSelection({recipeId:'pollo-samfaina',evidenceChunkIds:['ev-lubina-hinojo'],rationale},options),/cita/);
 assert.throws(()=>validateSelection({recipeId:'pollo-samfaina',evidenceChunkIds:['ev-pollo-samfaina'],rationale},options),/cita/);
 assert.throws(()=>validateSelection({recipeId:'lubina-hinojo',evidenceChunkIds:['ev-lubina-hinojo'],rationale:'x',quantity:400},options));
});
test('Abstención posterior ante alergia y compatibilidad desconocida',()=>{
 const family={members:[{id:'m',allergies:['huevo'],intolerances:[],preferences:[]}],outsideMeals:[]};
 for(const recipeId of ['huevos-guisantes','garbanzos-curry'])assert.throws(()=>validateSelection({recipeId,evidenceChunkIds:[`ev-${recipeId}`],rationale:'x'},{recipes:catalog.recipes,chunks:catalog.chunks,family,retrievedIds:[`ev-${recipeId}`]}));
});
function fakeController(){return {status:'ready',async generate(messages,schema){
 const candidate=JSON.parse(messages[1].content).candidates[0];assert.ok(schema.properties.recipeId.enum.includes(candidate.recipeId));
 return JSON.stringify({recipeId:candidate.recipeId,evidenceChunkIds:[candidate.evidence[0].id],rationale:selectionRationale({title:candidate.title})});
},cancel(){this.status='idle';}};}
test('Generación usa IDs validados y conserva el plato fijado',async()=>{
 const fixed={id:'fixed',date:'2026-11-01',meal:'comida',recipeId:'pollo-samfaina',locked:true,evidenceChunkIds:['ev-pollo-samfaina'],mode:'manual',rationale:'Elegido'};
 const entries=await generateMenu({...catalog,dates:['2026-11-01'],entries:[fixed],controller:fakeController()});
 assert.deepEqual(entries[0],fixed);assert.equal(entries.length,2);assert.equal(entries[1].mode,'rag');assert.ok(entries[1].evidenceChunkIds.length);
});
test('Regeneración individual no modifica bloqueos de entradas originales',async()=>{
 const other={id:'other',date:'2026-11-01',meal:'cena',recipeId:'pollo-samfaina',locked:false};
 const selected=await generateSelection({...catalog,date:'2026-11-01',meal:'comida',entries:[other],controller:fakeController()});
 assert.equal(other.locked,false);assert.equal(selected.meal,'comida');
});
test('Plato fijado incompatible bloquea la generación sin relajar restricciones',async()=>{
 const family={members:[{id:'m',allergies:['huevo'],intolerances:[],preferences:[]}],outsideMeals:[]};
 await assert.rejects(()=>generateMenu({...catalog,family,dates:['2026-11-01'],entries:[{date:'2026-11-01',meal:'comida',recipeId:'huevos-guisantes',locked:true}],controller:fakeController()}),/plato fijado/);
});
test('Tiempo desconocido se advierte y tiempo documentado que excede el límite se excluye',async()=>{
 const family={members:[{id:'m',allergies:[],intolerances:[],preferences:[],availableMinutes:30}],outsideMeals:[]};
 const entries=await generateMenu({...catalog,family,dates:['2026-11-01'],controller:fakeController()});
 assert.match(entries[0].rationale,/Tiempo no documentado; no se puede comprobar el límite de 30 min/);
 await assert.rejects(()=>generateMenu({...catalog,family,recipes:catalog.recipes.map(r=>({...r,minutes:45})),dates:['2026-11-01'],controller:fakeController()}),/compatibles/);
});
test('Abstención antes de inferencia por corpus vacío, incompatibilidad o IA ausente',async()=>{
 await assert.rejects(()=>generateMenu({...catalog,chunks:[],dates:['2026-11-01'],controller:fakeController()}),/fragmentos/);
 await assert.rejects(()=>generateMenu({...catalog,recipes:[],dates:['2026-11-01'],controller:fakeController()}),/compatibles/);
 await assert.rejects(()=>generateMenu({...catalog,dates:['2026-11-01'],controller:{status:'idle'}}),/preparada/);
});
test('Documentos aportados recuperados cambian el contexto enviado a inferencia',async()=>{
 const source={id:'user-context',kind:'user',title:'Preferencias privadas',url:'local:test'};
 const family={members:[{id:'m',allergies:[],intolerances:[],preferences:['romero']}],outsideMeals:[]};
 const prompts=[];
 const controller=fakeController(),original=controller.generate;
 controller.generate=async function(messages,schema){prompts.push(JSON.parse(messages[1].content));return original.call(this,messages,schema);};
 for(const text of ['Menú familiar con romero y verduras.','Menú familiar con romero y legumbres.']){
   await generateMenu({...catalog,sources:[...catalog.sources,source],chunks:[...catalog.chunks,{id:'user-context-c1',sourceId:source.id,text,page:2,section:'Preferencias'}],family,dates:['2026-11-01'],controller});
 }
 assert.ok(prompts[0].documents.some(d=>d.id==='user-context-c1'&&d.page===2&&d.source.kind==='user'));
 assert.notDeepEqual(prompts[0].documents,prompts[2].documents);
});
test('Citas generales requieren además evidencia propia y prosa neutra comprobable',()=>{
 const recipe=catalog.recipes[0],own=catalog.chunks.find(c=>c.id===recipe.evidenceChunkIds[0]);
 const general={id:'general',sourceId:'user-context',text:'Verduras y variedad.',page:null,section:'Guía'};
 const opts={recipes:[recipe],chunks:[own,general],sources:[{id:'user-context',kind:'user'}],family:catalog.family,retrievedIds:[own.id,general.id]};
 const base={recipeId:recipe.id,evidenceChunkIds:[own.id,general.id],rationale:selectionRationale(recipe)};
 assert.equal(validateSelection(base,opts).evidenceChunkIds.length,2);
 assert.throws(()=>validateSelection({...base,evidenceChunkIds:[general.id]},opts));
 assert.throws(()=>validateSelection({...base,rationale:'Esta receta cura la diabetes.'},opts));
 assert.throws(()=>validateSelection(base,{...opts,sources:[]}));
});
test('Fragmentación conserva página, sección e IDs estables',()=>{
 const text='# Preparación\n'+('Verduras y legumbres documentadas. '.repeat(120));
 const chunks=fragmentText(text,{sourceId:'user-test',page:4});
 assert.ok(chunks.length>1);assert.equal(new Set(chunks.map(c=>c.id)).size,chunks.length);
 assert.ok(chunks.every(c=>c.page===4&&c.section==='Preparación'&&c.text.length<=1300));
 assert.deepEqual(chunks,fragmentText(text,{sourceId:'user-test',page:4}));
});
test('TXT no se transforma en recetas; JSON corrupto falla sin escrituras',async()=>{
 const document=await ingestFiles([new File(['Texto privado con lentejas.'],'guia.txt',{type:'text/plain'})]);
 assert.equal(document.recipes.length,0);assert.equal(document.sources[0].kind,'user');assert.equal(document.chunks.length,1);
 await assert.rejects(()=>ingestFiles([new File(['{broken'],'recipes.json',{type:'application/json'})]));
});
