// Domain contracts and arithmetic are independent of the language model.
export const SCHEMA_VERSION = '1.0.0';
export const APP_VERSION = '0.1.0';
export const UNITS = ['g', 'ml', 'unidad', 'cucharada', 'cucharadita'];
export const STATES = ['seco', 'cocido', 'fresco'];
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const number = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => number(value) && value > 0;
const strings = value => Array.isArray(value) && value.every(nonempty);
const round = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(value, days) {
  if (!validDate(value)) throw new Error('Fecha civil inválida.');
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function mondayOf(value) {
  if (!validDate(value)) throw new Error('Fecha civil inválida.');
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return addDays(value, -(day + 6) % 7);
}
export const weekDates = value => Array.from({length: 7}, (_, index) => addDays(mondayOf(value), index));

export function validateBundle(bundle) {
  const errors = [];
  const fail = (ok, message) => { if (!ok) errors.push(message); };
  if (!isObject(bundle)) return ['El archivo debe contener un objeto JSON.'];
  fail(bundle.schemaVersion === SCHEMA_VERSION, 'schemaVersion debe ser 1.0.0.');
  fail(bundle.appVersion === APP_VERSION, 'appVersion debe ser 0.1.0.');
  fail(['demo', 'backup', 'recipes'].includes(bundle.kind), 'kind debe ser demo, backup o recipes.');
  fail(typeof bundle.synthetic === 'boolean', 'synthetic debe ser booleano.');
  for (const key of ['recipes', 'sources', 'chunks', 'menus', 'pantry', 'shopping']) fail(Array.isArray(bundle[key]), `${key} debe ser una lista.`);
  if (errors.length) return errors;
  fail(isObject(bundle.family) && Array.isArray(bundle.family.members) && Array.isArray(bundle.family.outsideMeals), 'family requiere members y outsideMeals.');
  if (errors.length) return errors;
  for (const key of ['recipes', 'sources', 'chunks', 'menus', 'pantry', 'shopping']) fail(bundle[key].every(isObject), `${key} contiene un elemento que no es objeto.`);
  fail(bundle.family.members.every(isObject) && bundle.family.outsideMeals.every(isObject), 'Miembros y comidas fuera deben ser objetos.');
  if (errors.length) return errors;
  for (const recipe of bundle.recipes) {
    for (const key of ['ingredients', 'steps', 'allergens', 'groups', 'evidenceChunkIds']) fail(Array.isArray(recipe[key]), `${recipe.id}: ${key} debe ser una lista.`);
  }
  for (const menu of bundle.menus) {
    fail(Array.isArray(menu.entries), `${menu.id}: entries debe ser lista.`);
    if (Array.isArray(menu.entries)) for (const entry of menu.entries) if (isObject(entry)) fail(Array.isArray(entry.evidenceChunkIds), `${menu.id}: evidenceChunkIds debe ser lista.`);
  }
  if (bundle.settings !== undefined) {
    fail(isObject(bundle.settings), 'settings debe ser objeto.');
    if (isObject(bundle.settings) && bundle.settings.packages !== undefined) {
      fail(Array.isArray(bundle.settings.packages), 'settings.packages debe ser lista.');
      if (Array.isArray(bundle.settings.packages)) for (const pack of bundle.settings.packages) fail(isObject(pack) && nonempty(pack.ingredientId) && UNITS.includes(pack.unit) && STATES.includes(pack.state) && positive(pack.size ?? pack.quantity), 'Formato de compra inválido.');
    }
  }
  if (errors.length) return errors;
  const families = bundle.family?.members ?? [];
  const idsOf = (list, label) => {
    const ids = new Set();
    list.forEach((item, index) => {
      fail(isObject(item), `${label}[${index}] debe ser objeto.`);
      fail(nonempty(item?.id), `${label}[${index}] requiere id.`);
      fail(!ids.has(item?.id), `ID duplicado en ${label}: ${item?.id}.`);
      ids.add(item?.id);
    });
    return ids;
  };
  const memberIds = idsOf(families, 'members');
  idsOf(bundle.family.outsideMeals, 'outsideMeals');
  for (const member of families) {
    if (!isObject(member)) continue;
    fail(nonempty(member.name), 'Cada miembro requiere nombre.');
    fail(Number.isInteger(member.age) && member.age >= 0 && member.age <= 130, `Edad inválida de ${member.id}.`);
    fail(member.portion === null || positive(member.portion), `Porción inválida de ${member.id}.`);
    for (const key of ['allergies', 'intolerances', 'preferences']) fail(strings(member[key]), `${member.id}: ${key} debe ser una lista de textos.`);
    fail(member.availableMinutes === null || positive(member.availableMinutes), `${member.id}: tiempo disponible inválido.`);
  }
  const recipeIds = idsOf(bundle.recipes, 'recipes');
  const sourceIds = idsOf(bundle.sources, 'sources');
  const chunkIds = idsOf(bundle.chunks, 'chunks');
  idsOf(bundle.menus, 'menus');
  const sourceMap = new Map(bundle.sources.filter(isObject).map(source => [source.id, source]));
  const chunks = new Map(bundle.chunks.filter(isObject).map(chunk => [chunk.id, chunk]));
  for (const source of bundle.sources) {
    if (!isObject(source)) continue;
    for (const key of ['title', 'organization', 'url', 'license', 'attribution']) fail(nonempty(source[key]), `${source.id}: falta ${key}.`);
    fail(typeof source.url === 'string' && /^(https?:\/\/|local:)/.test(source.url), `${source.id}: URL inválida.`);
    fail(['recipe', 'guidance', 'user'].includes(source.kind), `${source.id}: tipo de fuente inválido.`);
    fail(source.updated === null || validDate(source.updated), `${source.id}: fecha de actualización inválida.`);
    fail(validDate(source.accessed), `${source.id}: fecha de consulta inválida.`);
  }
  for (const chunk of bundle.chunks) {
    if (!isObject(chunk)) continue;
    fail(sourceIds.has(chunk.sourceId), `${chunk.id}: fuente inexistente.`);
    fail(nonempty(chunk.text) && nonempty(chunk.section), `${chunk.id}: falta texto o sección.`);
    fail(chunk.page === null || Number.isInteger(chunk.page) && chunk.page > 0, `${chunk.id}: página inválida.`);
    if (chunk.recipeId !== undefined) fail(recipeIds.has(chunk.recipeId), `${chunk.id}: receta inexistente.`);
  }
  for (const recipe of bundle.recipes) {
    if (!isObject(recipe)) continue;
    fail(nonempty(recipe.title) && positive(recipe.servings), `${recipe.id}: título o raciones inválidos.`);
    fail(recipe.minutes === null || positive(recipe.minutes), `${recipe.id}: tiempo inválido.`);
    fail(sourceIds.has(recipe.sourceId), `${recipe.id}: fuente inexistente.`);
    fail(sourceMap.get(recipe.sourceId)?.kind !== 'guidance', `${recipe.id}: una guía no es una receta.`);
    fail(Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0, `${recipe.id}: faltan ingredientes.`);
    fail(strings(recipe.steps) && recipe.steps.length > 0, `${recipe.id}: faltan pasos.`);
    fail(strings(recipe.allergens) && ['known', 'unknown'].includes(recipe.allergenStatus), `${recipe.id}: estado de alérgenos inválido.`);
    fail(strings(recipe.groups), `${recipe.id}: grupos inválidos.`);
    fail(strings(recipe.evidenceChunkIds) && recipe.evidenceChunkIds.length > 0, `${recipe.id}: faltan evidencias.`);
    for (const id of recipe.evidenceChunkIds ?? []) fail(chunkIds.has(id) && chunks.get(id)?.sourceId === recipe.sourceId && chunks.get(id)?.recipeId === recipe.id, `${recipe.id}: evidencia ajena o inexistente: ${id}.`);
    for (const ingredient of recipe.ingredients ?? []) {
      if (!isObject(ingredient)) { errors.push(`${recipe.id}: ingrediente inválido.`); continue; }
      fail(nonempty(ingredient.name) && nonempty(ingredient.ingredientId), `${recipe.id}: ingrediente sin identidad.`);
      fail(ingredient.quantity === null || positive(ingredient.quantity), `${recipe.id}: cantidad inválida.`);
      fail(UNITS.includes(ingredient.unit) && STATES.includes(ingredient.state), `${recipe.id}: unidad o estado inválido.`);
      fail(strings(ingredient.allergens) && ['known', 'unknown'].includes(ingredient.allergenStatus), `${recipe.id}: alérgenos de ingrediente inválidos.`);
    }
  }
  const slots = new Set();
  for (const menu of bundle.menus) {
    if (!isObject(menu)) continue;
    fail(validDate(menu.weekStart) && mondayOf(menu.weekStart) === menu.weekStart, `${menu.id}: weekStart debe ser lunes.`);
    fail(Array.isArray(menu.entries), `${menu.id}: entries debe ser lista.`);
    for (const entry of menu.entries ?? []) {
      if (!isObject(entry)) { errors.push(`${menu.id}: entrada inválida.`); continue; }
      fail(validDate(entry.date), `${menu.id}: fecha inválida.`);
      fail(['comida', 'cena'].includes(entry.meal), `${menu.id}: comida inválida.`);
      fail(recipeIds.has(entry.recipeId), `${menu.id}: receta no resuelta.`);
      fail(typeof entry.locked === 'boolean', `${menu.id}: locked debe ser booleano.`);
      fail(['demo', 'rag', 'manual'].includes(entry.mode), `${menu.id}: modo inválido.`);
      fail(typeof entry.rationale === 'string', `${menu.id}: falta rationale.`);
      fail(strings(entry.evidenceChunkIds) && entry.evidenceChunkIds.length > 0, `${menu.id}: faltan evidencias en entrada.`);
      for (const id of entry.evidenceChunkIds ?? []) fail(chunkIds.has(id) && (chunks.get(id)?.recipeId === entry.recipeId || sourceMap.get(chunks.get(id)?.sourceId)?.kind === 'guidance'), `${menu.id}: cita inexistente o ajena a la receta.`);
      fail(validDate(entry.date) && mondayOf(entry.date) === menu.weekStart, `${menu.id}: fecha fuera de la semana.`);
      const slot = `${entry.date}|${entry.meal}`;
      fail(!slots.has(slot), `Entrada duplicada: ${slot}.`); slots.add(slot);
    }
  }
  for (const outside of bundle.family?.outsideMeals ?? []) {
    fail(isObject(outside) && nonempty(outside.id) && validDate(outside.date) && ['comida', 'cena'].includes(outside.meal) && strings(outside.memberIds) && outside.memberIds.length > 0 && outside.memberIds.every(id => memberIds.has(id)) && strings(outside.groups) && typeof outside.description === 'string', 'Comida fuera inválida.');
  }
  for (const item of bundle.pantry) fail(isObject(item) && nonempty(item.ingredientId) && UNITS.includes(item.unit) && STATES.includes(item.state) && number(item.quantity) && item.quantity >= 0, 'Cantidad de despensa inválida.');
  for (const item of bundle.shopping) fail(isObject(item) && nonempty(item.key) && typeof item.checked === 'boolean', 'Marca de compra inválida.');
  if (bundle.kind === 'demo') {
    fail(bundle.synthetic === true, 'La demostración debe declararse ficticia.');
    fail(families.length === 4 && families.filter(member => member.age >= 18).length === 2 && families.some(member => member.age === 6) && families.some(member => member.age === 10), 'La familia demo requiere dos adultos y niños de 6 y 10 años.');
    fail(slots.size === 60 && [...slots].every(slot => /^2026-11-(0[1-9]|[12]\d|30)\|(comida|cena)$/.test(slot)), 'La demo requiere exactamente 60 entradas de noviembre de 2026.');
  }
  return errors;
}
export function parseBundle(text) {
  let bundle;
  try { bundle = JSON.parse(text); } catch { throw new Error('JSON corrupto: no se ha modificado ningún dato.'); }
  const errors = validateBundle(bundle);
  if (errors.length) throw new Error(`Importación rechazada: ${errors.slice(0, 8).join(' ')}`);
  return bundle;
}

const ALLERGEN_PATTERNS = {
  huevo: /\b(huevo\w*|clara\w*|yema\w*|albumina|ovoalbumina|ovomucoide|lisozima|e[ -]?1105|mayonesa|mahonesa|merengue)\b/,
  leche: /\b(leche|lactosa|caseina\w*|lactosuero|suero de leche|queso\w*|yogur\w*|iogur\w*|mantequilla|nata)\b/,
  gluten: /\b(trigo|cebada|centeno|espelta|kamut|pan\w*|pasta|cuscus|bulgur|seitan)\b/,
  soja: /\b(soja|soya|tofu|tempeh|miso)\b/,
  pescado: /\b(pescado|bacalao|lubina|dorada|salmon|atun|sardina|anchoa|bonito)\b/,
  'frutos secos': /\b(nuez|nueces|almendra\w*|avellana\w*|anacardo\w*|pistacho\w*)\b/,
  sesamo: /\b(sesamo|tahini|tahin)\b/,
  mostaza: /\b(mostaza|dijon)\b/,
  apio: /\bapio\b/,
  sulfitos: /\b(sulfito\w*|vino)\b/,
  crustaceos: /\b(gamba\w*|langostino\w*|cangrejo\w*)\b/,
  moluscos: /\b(almeja\w*|mejillon\w*|sepia|calamar\w*)\b/,
  cacahuete: /\b(cacahuete\w*|mani)\b/,
  altramuz: /\b(altramuz|altramuces)\b/
};
const canonicalAllergen = value => {
  const text = normalize(value);
  if (['lactosa', 'lacteos', 'proteina de leche', 'proteina leche'].includes(text)) return 'leche';
  if (['frutos de cascara', 'frutos secos', 'nueces', 'almendras'].includes(text)) return 'frutos secos';
  if (['huevos', 'huevo y derivados'].includes(text)) return 'huevo';
  if (text === 'celiaquia') return 'gluten';
  return text;
};
export function inferredAllergens(recipe) {
  const declared = new Set((recipe.allergens ?? []).map(canonicalAllergen));
  for (const ingredient of recipe.ingredients ?? []) {
    for (const allergen of ingredient.allergens ?? []) declared.add(canonicalAllergen(allergen));
    const text = normalize(`${ingredient.name} ${ingredient.ingredientId}`);
    for (const [allergen, pattern] of Object.entries(ALLERGEN_PATTERNS)) if (pattern.test(text)) declared.add(allergen);
  }
  return [...declared];
}
export function recipeCompatibility(recipe, family) {
  const reasons = [];
  const restrictions = (family?.members ?? []).flatMap(member => [...(member.allergies ?? []), ...(member.intolerances ?? [])]);
  const unknown = recipe.allergenStatus !== 'known' || (recipe.ingredients ?? []).some(ingredient => ingredient.allergenStatus !== 'known');
  if (restrictions.length && unknown) reasons.push('Compatibilidad no confirmada: hay alérgenos desconocidos.');
  const allergens = new Set(inferredAllergens(recipe));
  const ingredientText = normalize((recipe.ingredients ?? []).map(ingredient => `${ingredient.name} ${ingredient.ingredientId}`).join(' '));
  for (const restriction of restrictions) {
    const key = canonicalAllergen(restriction);
    if (allergens.has(key) || ingredientText.includes(normalize(restriction))) reasons.push(`Incompatible con ${restriction}.`);
    else if (!(key in ALLERGEN_PATTERNS)) reasons.push(`Restricción sin clasificación verificable: ${restriction}.`);
  }
  const preferences = (family?.members ?? []).flatMap(member => member.preferences ?? []).map(normalize);
  const animalGroups = ['carne', 'carne blanca', 'carne roja', 'pescado', 'marisco'];
  const animal = (recipe.groups ?? []).some(group => animalGroups.includes(normalize(group))) || /\b(carne|pollo|pavo|ternera|cerdo|cordero|conejo|pato|jamon|bacon|panceta|pescado|bacalao|lubina|dorada|salmon|atun|merluza|sardina\w*|anchoa\w*|bonito|boqueron\w*|trucha|caballa|lenguado|sepia|gamba\w*|langostino\w*|mejillon\w*|almeja\w*|calamar\w*)\b/.test(ingredientText);
  if (preferences.some(item => ['vegetariana', 'vegetariano', 'vegana', 'vegano'].includes(item)) && animal) reasons.push('No cumple la preferencia vegetariana.');
  if (preferences.some(item => ['vegana', 'vegano'].includes(item)) && ['huevo', 'leche'].some(item => allergens.has(item))) reasons.push('No cumple la preferencia vegana.');
  return {allowed: reasons.length === 0, reasons: [...new Set(reasons)]};
}
export function eligibleRecipes(recipes, family, options = {}) {
  return recipes.filter(recipe => recipeCompatibility(recipe, family).allowed && (options.maxMinutes == null || recipe.minutes !== null && recipe.minutes <= options.maxMinutes));
}
export function familyPortions(family) {
  const members = family?.members ?? [];
  return members.length && members.every(member => positive(member.portion)) ? round(members.reduce((total, member) => total + member.portion, 0)) : null;
}
export function scaleIngredients(recipe, portions) {
  if (!positive(portions) || !positive(recipe.servings)) throw new Error('Configura porciones positivas; no se deducen de la edad.');
  return recipe.ingredients.map(ingredient => ({...ingredient, quantity: ingredient.quantity === null ? null : round(ingredient.quantity * portions / recipe.servings)}));
}
export const shoppingKey = item => `${normalize(item.ingredientId)}|${item.unit}|${item.state}`;
export function buildShoppingList(entries, recipes, portions, pantry = [], packages = []) {
  const list = new Map();
  for (const entry of entries) {
    const recipe = recipes.find(item => item.id === entry.recipeId);
    if (!recipe) throw new Error(`Receta inexistente: ${entry.recipeId}.`);
    for (const ingredient of scaleIngredients(recipe, portions)) {
      const key = shoppingKey(ingredient);
      const existing = list.get(key);
      if (!existing) list.set(key, {key, ingredientId: ingredient.ingredientId, name: ingredient.name, state: ingredient.state, unit: ingredient.unit, quantity: ingredient.quantity, needed: ingredient.quantity, toBuy: ingredient.quantity, checked: false, unquantified: ingredient.quantity === null, originalQuantityText: ingredient.originalQuantityText ?? null});
      else {
        existing.unquantified ||= ingredient.quantity === null;
        if (ingredient.quantity !== null) existing.quantity = round((existing.quantity ?? 0) + ingredient.quantity);
        existing.needed = existing.quantity;
      }
    }
  }
  for (const item of list.values()) {
    const stock = pantry.filter(value => shoppingKey(value) === item.key).reduce((sum, value) => sum + (number(value.quantity) && value.quantity >= 0 ? value.quantity : 0), 0);
    item.needed = item.quantity === null ? null : round(Math.max(0, item.quantity - stock));
    const pack = packages.find(value => shoppingKey(value) === item.key && positive(value.size ?? value.quantity));
    const packSize = pack?.size ?? pack?.quantity;
    item.toBuy = item.needed === null ? null : pack ? round(Math.ceil(item.needed / packSize) * packSize) : item.needed;
    if (pack) item.packageCount = Math.ceil(item.needed / packSize);
  }
  return [...list.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function frequencySummary(entries, recipes, family, sources = []) {
  const counts = {};
  const warnings = [];
  const notes = ['Recuento colectivo de platos domésticos y comidas fuera con cada grupo; un plato doméstico no se cuenta si todos comen fuera. Consulta byMember para cada persona. No equivale a raciones nutricionales.', 'Comidas y cenas no permiten certificar suficiencia nutricional.'];
  const members = family?.members ?? [];
  const byMember = Object.fromEntries(members.map(member => [member.id, {}]));
  const dates = new Set(entries.map(entry => entry.date));
  const weeks = new Set([...dates].filter(validDate).map(mondayOf));
  const outsideMeals = (family?.outsideMeals ?? []).filter(meal => validDate(meal.date) && weeks.has(mondayOf(meal.date)));
  const increment = (target, groups) => [...new Set(groups)].forEach(group => { Object.defineProperty(target,group,{value:(Object.hasOwn(target,group)?target[group]:0)+1,enumerable:true,writable:true,configurable:true}); });
  for (const entry of entries) {
    const groups = recipes.find(recipe => recipe.id === entry.recipeId)?.groups;
    if (!groups) { warnings.push(`Información incompleta: receta no resuelta el ${entry.date}.`); continue; }
    const atHome = members.filter(member => !outsideMeals.some(meal => meal.date === entry.date && meal.meal === entry.meal && meal.memberIds.includes(member.id)));
    if (!members.length || atHome.length) increment(counts, groups);
    for (const member of atHome) increment(byMember[member.id], groups);
  }
  for (const meal of outsideMeals) {
    if (!meal.groups.length) warnings.push(`Información incompleta: comida fuera del ${meal.date} (${meal.meal}).`);
    increment(counts, meal.groups);
    for (const id of meal.memberIds) if (byMember[id]) increment(byMember[id], meal.groups);
  }
  if (!members.length) warnings.push('Añade miembros para contextualizar los recuentos.');
  if (dates.size < 7) warnings.push('Semana incompleta: no evaluar frecuencias semanales.');
  if (members.some(member => member.age < 18)) notes.push('Los recuentos infantiles se muestran sin extrapolar objetivos de adultos ni deducir porciones de la edad.');
  const adultSource = sources.find(source => source.id === 'aesan-recomendaciones');
  if (adultSource) notes.push(`Referencia para población adulta: ${adultSource.title}. Las recomendaciones de raciones no se comparan con simples apariciones de ingredientes.`);
  const applicableRules = sources.flatMap(source => (Array.isArray(source.rules) ? source.rules : []).filter(rule => rule && ['adultos','etapa escolar'].includes(rule.population) && members.some(member => rule.population === 'adultos' ? member.age >= 18 : member.age < 18)).map(rule => ({...rule,sourceId:source.id})));
  for (const rule of applicableRules) notes.push(`${rule.population}, ${rule.edition}: ${rule.group}, ${rule.min}${rule.max === null ? ' o más' : '–' + rule.max} ${rule.unit}. Fuente: ${sources.find(source => source.id === rule.sourceId)?.organization}, p. ${rule.page}. Referencia orientativa; no certifica el cumplimiento del menú.`);
  const uniqueRecipes = new Set(entries.map(entry => entry.recipeId)).size;
  if (entries.length >= 4 && uniqueRecipes <= 2) warnings.push('Poca variedad de preparaciones: revisa las alternativas compatibles documentadas. Criterio funcional de QuéComemos, sin equivalencia nutricional.');
  return {counts, byMember, warnings: [...new Set(warnings)], notes, references: applicableRules};
}
