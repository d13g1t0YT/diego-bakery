import { parseRecipeText } from '../src/recipeParser';

const assert=(condition:boolean,message:string)=>{
  if(!condition) throw new Error('FAIL: '+message);
};

const sample = `
Queque de Naranja

Rendimiento: 12 porciones

INGREDIENTES
250 g harina
150 g azúcar
3 huevos
120 ml leche
2 cucharadas aceite
1 naranja: 1 unidad

PROCEDIMIENTO
1. Precalienta el horno a 180 °C.
2. Bate los huevos con el azúcar.
3. Incorpora la leche y el aceite.
4. Agrega la harina tamizada.
5. Hornea durante 40 minutos.

NOTAS
Dejar enfriar antes de decorar.
`;

const parsed = parseRecipeText(sample, 'txt');
assert(parsed.name === 'Queque de Naranja', 'detects recipe name');
assert(parsed.yieldUnits === 12, 'detects yield');
assert(parsed.ingredients.length === 6, 'detects all ingredients');
assert(parsed.ingredients.find(x => x.name.toLowerCase().includes('harina'))?.quantity === 250, 'detects flour quantity');
assert(parsed.ingredients.find(x => x.name.toLowerCase().includes('harina'))?.unit === 'g', 'detects flour unit');
assert(parsed.procedure.length === 5, 'detects procedure steps');
assert(parsed.procedure[0].toLowerCase().includes('precalienta'), 'keeps procedure text');
assert(parsed.notes.length === 1, 'detects notes');

const tableLike = `
RECETA: Alfajores
Rinde 24 unidades
Ingredientes
Harina | 300 g
Azúcar | 100 g
Margarina: 150 g

Preparación
Mezcla la harina con la margarina.
Forma las piezas.
`;
const parsedTable = parseRecipeText(tableLike, 'docx');
assert(parsedTable.name === 'Alfajores', 'detects recipe label in alternate format');
assert(parsedTable.yieldUnits === 24, 'detects alternate yield wording');
assert(parsedTable.ingredients.length >= 2, 'parses ingredient lines from alternate layout');
assert(parsedTable.procedure.length >= 2, 'detects alternate procedure lines');


const nameFirst = `
Torta de chocolate
Ingredientes
Harina 250 g
Azúcar 180 g
Cocoa | 40 g
Leche 200 ml

Procedimiento
Mezcla todo.
Hornea 35 minutos.
`;
const parsedNameFirst = parseRecipeText(nameFirst, 'pdf');
assert(parsedNameFirst.ingredients.length === 4, 'parses name-first and pipe-separated ingredient rows');
assert(parsedNameFirst.ingredients.find(x => x.name.toLowerCase().includes('harina'))?.quantity === 250, 'parses name-first quantity');
assert(parsedNameFirst.ingredients.find(x => x.name.toLowerCase().includes('cocoa'))?.unit === 'g', 'parses table separator and unit');
assert(parsedNameFirst.procedure.length === 2, 'keeps short procedure without explicit numbering');

console.log('PASS: recipe parser detects name, yield, ingredients, quantities, units, procedure and notes');
