import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
  raw: string;
  confidence: number;
}

export interface RecipeSpecifications {
  weight?: number;
  weightUnit?: string;
  height?: number;
  heightUnit?: string;
  width?: number;
  widthUnit?: string;
  length?: number;
  lengthUnit?: string;
  diameter?: number;
  diameterUnit?: string;
  shape?: string;
  moldType?: string;
  packagingType?: string;
  temperature?: number;
  temperatureUnit?: string;
  bakingTimeMinutes?: number;
  finalAppearance?: string;
}

export interface ParsedRecipe {
  name: string;
  yieldUnits: number;
  ingredients: ParsedIngredient[];
  procedure: string[];
  notes: string[];
  specifications?: RecipeSpecifications;
  sourceFormat: 'txt' | 'docx' | 'pdf' | 'png' | 'jpg' | 'jpeg';
  warnings: string[];
  confidence: number;
}

const normalizeSpaces = (value: string) =>
  value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

function normalizeUnit(raw: string): string {
  const unit = raw.toLowerCase().trim();
  const units: Record<string, string> = {
    gr: 'g', g: 'g', gramos: 'g',
    kilogramo: 'kg', kilogramos: 'kg', kg: 'kg',
    ml: 'ml', mililitro: 'ml', mililitros: 'ml',
    l: 'l', litro: 'l', litros: 'l',
    cucharada: 'cda', cucharadas: 'cda', cda: 'cda',
    cucharadita: 'cdta', cucharaditas: 'cdta', cdta: 'cdta',
    taza: 'taza', tazas: 'taza',
    unidad: 'und', unidades: 'und', und: 'und',
    huevo: 'und', huevos: 'und', pizca: 'pizca'
  };
  return units[unit] || unit;
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(',', '.').trim();
  const mixed = cleaned.match(/^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (Number.isFinite(whole) && Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return whole + numerator / denominator;
    }
  }
  if (cleaned.includes('/')) {
    const [a, b] = cleaned.split('/').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
  }
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : 0;
}

function parseIngredientLine(line: string): ParsedIngredient | null {
  const clean = line.replace(/^[-•●◦▪·*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
  const normalizedRow = clean.replace(/[|\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const numberSource = '[\\d.,]+(?:\\s+[\\d.,]+\\s*\\/\\s*[\\d.,]+|\\s*\\/\\s*[\\d.,]+)?';
  const a = normalizedRow.match(new RegExp('^(' + numberSource + ')\\s*([A-Za-zÁÉÍÓÚÜÑñ]+)?\\s+(?:de\\s+)?(.+)$', 'i'));
  const b = normalizedRow.match(new RegExp('^(.+?)\\s*[:=]\\s*(' + numberSource + ')\\s*([A-Za-zÁÉÍÓÚÜÑñ]+)?$', 'i'));
  const c = normalizedRow.match(new RegExp('^(.+?)\\s+(' + numberSource + ')\\s*([A-Za-zÁÉÍÓÚÜÑñ]+)$', 'i'));

  let quantity = 0;
  let unit = 'und';
  let name = '';

  if (a) {
    quantity = parseNumber(a[1]);
    unit = normalizeUnit(a[2] || 'und');
    name = normalizeSpaces(a[3]);
  } else if (b) {
    name = normalizeSpaces(b[1]);
    quantity = parseNumber(b[2]);
    unit = normalizeUnit(b[3] || 'und');
  } else if (c) {
    name = normalizeSpaces(c[1]);
    quantity = parseNumber(c[2]);
    unit = normalizeUnit(c[3]);
  } else {
    return null;
  }

  if (!name || quantity <= 0) return null;
  return { name, quantity, unit, raw: clean, confidence: b ? 0.92 : 0.86 };
}

function looksLikeIngredient(line: string): boolean {
  if (!line || line.length > 160) return false;
  if (/^(ingredientes?|procedimiento|preparación|preparacion|elaboración|elaboracion|pasos?|instrucciones?|notas?|observaciones?|modo de uso|decoración|decoracion|rendimiento|porciones?)\b/i.test(line)) return false;
  const normalized = line.replace(/[|\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  return /^[-•●◦▪·*]\s*/.test(line)
    || /^\d+[.)]\s*/.test(line)
    || /[:=]\s*[\d.,]+/.test(line)
    || /^[\d.,]+(?:\s+[\d.,]+\s*\/\s*[\d.,]+|\s*\/\s*[\d.,]+)?\s+[A-Za-zÁÉÍÓÚÜÑñ]+\s+.+$/i.test(normalized)
    || /^.+\s+[\d.,]+(?:\s+[\d.,]+\s*\/\s*[\d.,]+|\s*\/\s*[\d.,]+)?\s+[A-Za-zÁÉÍÓÚÜÑñ]+$/i.test(normalized);
}

function sectionFromHeading(line: string): 'ingredients' | 'procedure' | 'notes' | 'other' {
  const s = normalizeSpaces(line).toLowerCase().replace(/[:\-]+$/, '');
  if (/^(ingredientes?|insumos|materia prima|ingredientes y cantidades)/.test(s)) return 'ingredients';
  if (/^(procedimiento|preparaci[oó]n|elaboraci[oó]n|pasos?|instrucciones?|m[eé]todo)/.test(s)) return 'procedure';
  if (/^(notas?|observaciones?|tips?|consejos?|comentarios?)/.test(s)) return 'notes';
  return 'other';
}

function detectName(lines: string[]): { name: string; index: number } {
  const title = lines.findIndex(line => /^(?:receta|producto|nombre)\s*:/i.test(line));
  if (title >= 0) {
    return {
      name: normalizeSpaces(lines[title].replace(/^(?:receta|producto|nombre)\s*:\s*/i, '')),
      index: title
    };
  }

  const firstUseful = lines.findIndex(line => {
    const s = normalizeSpaces(line);
    return s && s.length <= 100 && !looksLikeIngredient(s) && !/^(?:ingredientes?|procedimiento|preparaci[oó]n)/i.test(s);
  });

  return {
    name: firstUseful >= 0 ? normalizeSpaces(lines[firstUseful]) : 'Receta importada',
    index: firstUseful
  };
}

function detectYield(lines: string[]): number {
  for (const line of lines) {
    const match = line.match(/(?:rinde|rendimiento|porciones?|unidades?|produce|cantidad final)\D{0,20}(\d+(?:[.,]\d+)?)/i);
    if (match) {
      const value = parseNumber(match[1]);
      if (value > 0) return Math.round(value * 100) / 100;
    }
  }
  return 1;
}

export function parseRecipeText(text: string, format: ParsedRecipe['sourceFormat']): ParsedRecipe {
  const lines = text.replace(/\r/g, '').split(/\n+/).map(normalizeSpaces).filter(Boolean);
  const title = detectName(lines);
  const yieldUnits = detectYield(lines);
  const ingredients: ParsedIngredient[] = [];
  const procedure: string[] = [];
  const notes: string[] = [];
  let section: 'ingredients' | 'procedure' | 'notes' | 'other' = 'other';

  for (const line of lines) {
    const detectedSection = sectionFromHeading(line);
    if (detectedSection !== 'other') {
      section = detectedSection;
      continue;
    }

    if (section === 'ingredients' || (section === 'other' && looksLikeIngredient(line))) {
      const parsed = parseIngredientLine(line);
      if (parsed) ingredients.push(parsed);
      continue;
    }

    if (section === 'procedure') {
      const step = line.replace(/^\d+[.)]\s*/, '').replace(/^[-•●◦▪·*]\s*/, '').trim();
      if (step) procedure.push(step);
      continue;
    }

    if (section === 'notes') {
      notes.push(line.replace(/^[-•●◦▪·*]\s*/, '').trim());
    }
  }

  if (!procedure.length) {
    for (const line of lines) {
      if (/\b(precalienta|hornea|mezcla|bata|bate|incorpora|agrega|añade|añada|cocina|enfría|refrigera|estira|forma|coloca|deja|reposa|tamiza|decora|vierte)\b/i.test(line)) {
        procedure.push(line.replace(/^\d+[.)]\s*/, '').trim());
      }
    }
  }

  const uniqueIngredients = new Map<string, ParsedIngredient>();
  for (const ingredient of ingredients) {
    const key = ingredient.name.toLowerCase().trim();
    if (!uniqueIngredients.has(key)) uniqueIngredients.set(key, ingredient);
  }

  const warnings: string[] = [];
  if (!uniqueIngredients.size) warnings.push('No se detectaron ingredientes con cantidad; revisa el documento.');
  if (!procedure.length) warnings.push('No se detectó un procedimiento claro; puedes agregarlo manualmente.');
  if (yieldUnits === 1) warnings.push('No se encontró un rendimiento explícito; se usó 1 como valor provisional.');

  const confidence = Math.max(
    0.35,
    Math.min(
      0.98,
      0.45 +
        Math.min(0.25, uniqueIngredients.size * 0.025) +
        (procedure.length ? 0.15 : 0) +
        (yieldUnits !== 1 ? 0.1 : 0) +
        (title.name !== 'Receta importada' ? 0.05 : 0)
    )
  );

  return {
    name: title.name,
    yieldUnits,
    ingredients: [...uniqueIngredients.values()],
    procedure,
    notes,
    sourceFormat: format,
    warnings,
    confidence
  };
}

export async function extractRecipeText(buffer: Buffer, filename: string): Promise<{
  text: string;
  format: ParsedRecipe['sourceFormat'];
}> {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'txt') return { text: buffer.toString('utf8'), format: 'txt' };

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, format: 'docx' };
  }

  if (extension === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return { text: result.text, format: 'pdf' };
    } finally {
      await parser.destroy();
    }
  }

  if (extension === 'png') return { text: '', format: 'png' };
  if (extension === 'jpg') return { text: '', format: 'jpg' };
  if (extension === 'jpeg') return { text: '', format: 'jpeg' };

  throw new Error('Formato no soportado. Usa .docx, .pdf, .txt, .png, .jpg o .jpeg');
}
