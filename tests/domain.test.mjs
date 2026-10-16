import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBundle,parseBundle,scaleIngredients,buildShoppingList,recipeCompatibility,eligibleRecipes,familyPortions,mondayOf,weekDates,frequencySummary} from '../js/domain.js';
import {defaults} from '../js/storage.js';
const demo = JSON.parse(readFileSync(new URL('../data/QueComemos-DatosDemo-1.0.0.json',import.meta.url),'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
const family = allergy => ({members:[{id:'a',name:'A',age:35,portion:1,allergies:allergy?[allergy]:[],intolerances:[],preferences:[],availableMinutes:30}],outsideMeals:[]});
const ingredient = (quantity=200,unit='g',state='seco') => ({ingredientId:'arroz',name:'Arroz',quantity,unit,state,allergens:[],allergenStatus:'known'});
const recipe = (id='test',quantity=200) => ({id,title:'Arroz',servings:2,ingredients:[ingredient(quantity)],steps:['Hervir.'],minutes:20,allergens:[],allergenStatus:'known',groups:['cereales']});
const entry = (recipeId='test') => ({date:'2026-11-02',meal:'comida',recipeId});

test('catálogo y demo válidos; demo 30 fechas, 60 slots y recetas resueltas',()=>{
 assert.deepEqual(validateBundle(catalog),[]); assert.deepEqual(validateBundle(demo),[]);
 const entries=demo.menus.flatMap(menu=>menu.entries);
 assert.equal(entries.length,60); assert.equal(new Set(entries.map(entry=>entry.date)).size,30);
 assert.equal(new Set(entries.map(entry=>`${entry.date}|${entry.meal}`)).size,60);
 assert.equal(catalog.recipes.length,15);
 assert.ok(entries.every(entry=>catalog.recipes.some(recipe=>recipe.id===entry.recipeId)));
 assert.equal(demo.family.members.filter(member=>member.age>=18).length,2);
 assert.deepEqual(demo.family.members.filter(member=>member.age<18).map(member=>member.age),[6,10]);
});
test('JSON corrupto y esquema ajeno rechazados antes de escribir',()=>{
 assert.throws(()=>parseBundle('{oops'),/JSON corrupto/);
 assert.throws(()=>parseBundle('{"schemaVersion":"99"}'),/rechazada/);
 assert.equal(parseBundle(JSON.stringify(demo)).kind,'demo');
 assert.deepEqual(validateBundle(defaults()),[]);
});
test('shapes malformadas devuelven errores sin TypeError',()=>{
 for(const mutate of [b=>b.family.members={},b=>b.family.outsideMeals={},b=>b.recipes[0].ingredients={},b=>b.recipes[0].evidenceChunkIds={},b=>b.menus[0].entries={},b=>b.menus[0].entries[0].evidenceChunkIds={},b=>b.sources=[null],b=>b.recipes[0].ingredients=[null],b=>b.family.members=[null],b=>b.settings={packages:{}},b=>b.settings={packages:[null]}]){
  const changed=structuredClone(demo); mutate(changed); assert.ok(validateBundle(changed).length);
 }
});
test('rechaza fecha imposible, ID duplicado, referencia rota y cita ajena',()=>{
 for(const mutate of [b=>b.menus[0].entries[0].date='2026-02-30',b=>b.recipes[1].id=b.recipes[0].id,b=>b.menus[0].entries[0].recipeId='inexistente',b=>b.recipes[0].evidenceChunkIds=['ev-huevos-guisantes'],b=>b.chunks[0].sourceId='faltante']){
  const changed=structuredClone(demo); mutate(changed); assert.ok(validateBundle(changed).length);
 }
});
test('escalado 200 g para dos raciones a 400 g para cuatro; sin inventar cantidades',()=>{
 assert.equal(scaleIngredients(recipe(),4)[0].quantity,400);
 const changed=recipe();changed.ingredients[0].quantity=null;
 assert.equal(scaleIngredients(changed,4)[0].quantity,null);
 assert.throws(()=>scaleIngredients(recipe(),0),/porciones/);
});
test('compra agrega 400 g y 250 g a 650 g',()=>{
 const first=recipe('uno',400); first.servings=4;
 const second=recipe('dos',250); second.servings=4;
 const list=buildShoppingList([entry('uno'),entry('dos')],[first,second],4);
 assert.equal(list.length,1);assert.equal(list[0].quantity,650);assert.equal(list[0].needed,650);assert.equal(list[0].toBuy,650);
});
test('estados y unidades incompatibles no se mezclan; kg exige conversión explícita',()=>{
 const value=recipe();value.ingredients=[ingredient(200,'g','seco'),ingredient(200,'g','cocido'),ingredient(100,'ml','seco'),ingredient(2,'unidad','seco')];
 assert.equal(buildShoppingList([entry()],[value],2).length,4);
 const invalid=structuredClone(catalog);invalid.recipes[0].ingredients[0].unit='kg';assert.ok(validateBundle(invalid).some(error=>error.includes('unidad')));
});
test('despensa y formato de paquete respetan la misma unidad y estado',()=>{
 const value=recipe();const stock=[{...ingredient(50),quantity:50}];const packages=[{...ingredient(),size:500}];
 const list=buildShoppingList([entry()],[value],2,stock,packages);
 assert.equal(list[0].quantity,200);assert.equal(list[0].needed,150);assert.equal(list[0].toBuy,500);assert.equal(list[0].packageCount,1);
 const cooked=[ingredient(100,'g','cocido')];assert.equal(buildShoppingList([entry()],[value],2,cooked)[0].needed,200);
});
test('cantidad sin especificar no se oculta al agregarse con cantidad numérica',()=>{
 const value=recipe();value.ingredients.push({...ingredient(null),originalQuantityText:'Al gusto'});
 const list=buildShoppingList([entry()],[value],2);
 assert.equal(list[0].quantity,200);assert.equal(list[0].unquantified,true);
});
test('huevo y derivados conocidos quedan excluidos aunque el JSON omita declararlos',()=>{
 for(const name of ['Huevo','Clara de huevo','Yema','Mayonesa','Albúmina','Ovoalbúmina','Ovomucoide','Lisozima','E-1105','Merengue']){
  const value=recipe();value.ingredients[0].name=name;
  assert.equal(recipeCompatibility(value,family('huevo')).allowed,false,name);
 }
 assert.equal(recipeCompatibility(recipe(),family('huevo')).allowed,true);
});
test('alérgenos desconocidos no confirman compatibilidad; restricción sin vocabulario se abstiene',()=>{
 const value=recipe();value.allergenStatus='unknown';
 assert.equal(recipeCompatibility(value,family('huevo')).allowed,false);
 assert.equal(recipeCompatibility(value,family()).allowed,true);
 assert.equal(recipeCompatibility(recipe(),family('piña')).allowed,false);
});
test('edad y porciones: cambiar edad no aplica factores ocultos; porción nula no se infiere',()=>{
 const household=family();household.members[0].age=6;
 assert.equal(familyPortions(household),1);household.members[0].age=10;assert.equal(familyPortions(household),1);
 household.members[0].portion=0.6;assert.equal(familyPortions(household),0.6);
 household.members[0].portion=null;assert.equal(familyPortions(household),null);
});
test('corpus vacío e incompatibilidades no relajan restricciones; tiempo desconocido no cumple límite',()=>{
 assert.deepEqual(eligibleRecipes([],family()),[]);
 const value=recipe();value.ingredients[0].name='Huevo';assert.deepEqual(eligibleRecipes([value],family('huevo')),[]);
 const noTime=recipe();noTime.minutes=null;assert.equal(eligibleRecipes([noTime],family(),{maxMinutes:30}).length,0);
});
test('preferencias vegetariana y vegana reconocen grupos y carnes/pescados',()=>{
 for(const name of ['Merluza','Conejo','Sardinas','Anchoas','Pechuga de pollo']){
  const value=recipe();value.ingredients[0].name=name;const household=family();household.members[0].preferences=['vegetariana'];
  assert.equal(recipeCompatibility(value,household).allowed,false,name);
 }
 const value=recipe();value.ingredients[0].name='Leche';const household=family();household.members[0].preferences=['vegana'];assert.equal(recipeCompatibility(value,household).allowed,false);
});
test('fechas civiles sin desfase por horario de verano y semanas de lunes a domingo',()=>{
 assert.equal(mondayOf('2026-11-01'),'2026-10-26');assert.equal(mondayOf('2026-11-02'),'2026-11-02');
 assert.deepEqual(weekDates('2026-11-04'),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
 assert.throws(()=>mondayOf('2026-02-30'),/Fecha/);
});
test('comida fuera sustituye conteo del miembro y se informa si no hay grupos',()=>{
 const household=family();household.outsideMeals=[{id:'fuera',date:'2026-11-02',meal:'comida',memberIds:['a'],groups:['pescado'],description:'Comedor'}];
 const summary=frequencySummary([entry()],[recipe()],household,catalog.sources);
 assert.equal(summary.byMember.a.pescado,1);assert.equal(summary.byMember.a.cereales,undefined);assert.ok(summary.warnings.some(value=>value.includes('incompleta')));
 assert.equal(summary.counts.pescado,1);assert.equal(summary.counts.cereales,undefined);
 household.outsideMeals[0].date='2026-11-03';assert.equal(frequencySummary([entry()],[recipe()],household).byMember.a.pescado,1);
 household.outsideMeals[0].groups=[];assert.ok(frequencySummary([entry()],[recipe()],household).warnings.some(value=>value.includes('comida fuera')));
});
test('referencias de frecuencia separan adultos/escolares y conservan fuente/población',()=>{
 const summary=frequencySummary(demo.menus[1].entries,catalog.recipes,demo.family,catalog.sources);
 assert.ok(summary.references.some(rule=>rule.population==='adultos'));
 assert.ok(summary.references.some(rule=>rule.population==='etapa escolar'));
 assert.ok(summary.references.every(rule=>rule.sourceId&&rule.evidenceChunkId&&rule.comparison==='reference-only'));
});
test('esquemas publicados son JSON parseable y declaran versiones correctas',()=>{
 for(const name of ['bundle','demo','recipes','backup']){const schema=JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`,import.meta.url),'utf8'));assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');}
});
