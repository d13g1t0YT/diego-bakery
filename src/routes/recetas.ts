import { Router, Response } from 'express';
import multer from 'multer';
import { autenticar, AuthRequest } from '../middleware/auth.js';
import { extractRecipeText, parseRecipeText, type ParsedRecipe } from '../recipeParser.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const allowed =
      name.endsWith('.txt') ||
      name.endsWith('.docx') ||
      name.endsWith('.pdf') ||
      mime === 'text/plain' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/pdf';
    cb(null, allowed);
  }
});

type AIRecipe = {
  name: string;
  yieldUnits: number;
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  procedure: string[];
  notes: string[];
};

function safeAiRecipe(value: any, fallback: ParsedRecipe): ParsedRecipe {
  if (!value || typeof value !== 'object') return fallback;

  const ingredients = Array.isArray(value.ingredients)
    ? value.ingredients
        .filter((item: any) =>
          item &&
          typeof item.name === 'string' &&
          Number(item.quantity) > 0 &&
          typeof item.unit === 'string'
        )
        .map((item: any) => ({
          name: item.name.trim(),
          quantity: Number(item.quantity),
          unit: String(item.unit).trim(),
          raw: String(item.name).trim(),
          confidence: 0.95
        }))
    : [];

  const procedure = Array.isArray(value.procedure)
    ? value.procedure.filter((step: any) => typeof step === 'string' && step.trim()).map((step: string) => step.trim())
    : [];

  const notes = Array.isArray(value.notes)
    ? value.notes.filter((note: any) => typeof note === 'string' && note.trim()).map((note: string) => note.trim())
    : [];

  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : fallback.name;

  const yieldUnits = Number(value.yieldUnits) > 0 ? Number(value.yieldUnits) : fallback.yieldUnits;

  const warnings = [...fallback.warnings];
  if (!ingredients.length && fallback.ingredients.length) warnings.push('La IA no pudo mejorar los ingredientes; se conservaron los detectados automáticamente.');
  if (!procedure.length && fallback.procedure.length) warnings.push('La IA no pudo mejorar el procedimiento; se conservó la extracción automática.');

  return {
    ...fallback,
    name,
    yieldUnits,
    ingredients: ingredients.length ? ingredients : fallback.ingredients,
    procedure: procedure.length ? procedure : fallback.procedure,
    notes: notes.length ? notes : fallback.notes,
    warnings,
    confidence: Math.min(0.99, Math.max(fallback.confidence, ingredients.length ? 0.9 : 0.55))
  };
}

async function enhanceWithAI(parsed: ParsedRecipe, originalText: string): Promise<ParsedRecipe> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.RECIPE_IMPORT_AI !== 'true') return parsed;

  const source = originalText.slice(0, 70000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
        store: false,
        max_output_tokens: 2200,
        instructions: [
          'Extrae una receta de cocina de un documento.',
          'Debes distinguir nombre de receta, rendimiento, ingredientes con cantidad y unidad, procedimiento paso a paso y notas.',
          'No inventes cantidades. Si una cantidad no aparece, omite ese ingrediente.',
          'Devuelve exclusivamente el objeto JSON solicitado por el esquema.',
          'Corrige errores obvios de separación de columnas, OCR o formato, pero conserva el significado original.'
        ].join('\n'),
        input: source,
        text: {
          format: {
            type: 'json_schema',
            name: 'recipe_import',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                yieldUnits: { type: 'number' },
                ingredients: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      quantity: { type: 'number' },
                      unit: { type: 'string' }
                    },
                    required: ['name', 'quantity', 'unit']
                  }
                },
                procedure: { type: 'array', items: { type: 'string' } },
                notes: { type: 'array', items: { type: 'string' } }
              },
              required: ['name', 'yieldUnits', 'ingredients', 'procedure', 'notes']
            }
          }
        }
      })
    });

    if (!response.ok) return parsed;
    const payload = await response.json();
    const raw = typeof payload?.output_text === 'string'
      ? payload.output_text
      : Array.isArray(payload?.output)
        ? payload.output.flatMap((item: any) => item?.content || [])
            .filter((part: any) => part?.type === 'output_text')
            .map((part: any) => part.text)
            .join('\n')
        : '';

    if (!raw) return parsed;
    const structured: AIRecipe = JSON.parse(raw);
    return safeAiRecipe(structured, parsed);
  } catch {
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

router.post('/importar', autenticar, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Selecciona un archivo .docx, .pdf o .txt.' });
      return;
    }

    const { text, format } = await extractRecipeText(req.file.buffer, req.file.originalname);
    if (!text.trim()) {
      res.status(422).json({
        error: 'No se pudo extraer texto de ese archivo. Si es un PDF escaneado como imagen, necesitará OCR antes de importarlo.'
      });
      return;
    }

    const parsed = await enhanceWithAI(parseRecipeText(text, format), text);

    res.json({
      filename: req.file.originalname,
      format,
      extractedCharacters: text.length,
      recipe: parsed
    });
  } catch (error) {
    console.error('Error importando receta:', error);
    res.status(422).json({
      error: error instanceof Error ? error.message : 'No se pudo importar la receta.'
    });
  }
});

export default router;
