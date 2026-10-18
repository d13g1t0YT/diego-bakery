import { Router, Response } from 'express';
import multer from 'multer';
import { autenticar, AuthRequest } from '../middleware/auth.js';
import { extractRecipeText, parseRecipeText, type ParsedRecipe } from '../recipeParser.js';
import { hasOpenAIKey, requestOpenAI } from '../openaiClient.js';
import { rateLimit } from 'express-rate-limit';
import { clientIpKeyGenerator } from '../rateLimit.js';

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
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      mime === 'text/plain' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/pdf' ||
      mime === 'image/png' ||
      mime === 'image/jpeg';
    cb(null, allowed);
  }
});

type AIRecipe = {
  name: string;
  yieldUnits: number;
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  procedure: string[];
  notes: string[];
  specifications?: ParsedRecipe['specifications'];
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

  const rawSpecs = value.specifications && typeof value.specifications === 'object' ? value.specifications : undefined;
  const optionalNumber = (input: unknown): number | undefined => {
    if (input === null || input === undefined || (typeof input === 'string' && input.trim() === '')) {
      return undefined;
    }
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const specifications = rawSpecs ? {
    weight: optionalNumber(rawSpecs.weight),
    weightUnit: rawSpecs.weightUnit ? String(rawSpecs.weightUnit) : undefined,
    height: optionalNumber(rawSpecs.height),
    heightUnit: rawSpecs.heightUnit ? String(rawSpecs.heightUnit) : undefined,
    width: optionalNumber(rawSpecs.width),
    widthUnit: rawSpecs.widthUnit ? String(rawSpecs.widthUnit) : undefined,
    length: optionalNumber(rawSpecs.length),
    lengthUnit: rawSpecs.lengthUnit ? String(rawSpecs.lengthUnit) : undefined,
    diameter: optionalNumber(rawSpecs.diameter),
    diameterUnit: rawSpecs.diameterUnit ? String(rawSpecs.diameterUnit) : undefined,
    shape: rawSpecs.shape ? String(rawSpecs.shape) : undefined,
    moldType: rawSpecs.moldType ? String(rawSpecs.moldType) : undefined,
    packagingType: rawSpecs.packagingType ? String(rawSpecs.packagingType) : undefined,
    temperature: optionalNumber(rawSpecs.temperature),
    temperatureUnit: rawSpecs.temperatureUnit ? String(rawSpecs.temperatureUnit) : undefined,
    bakingTimeMinutes: optionalNumber(rawSpecs.bakingTimeMinutes),
    finalAppearance: rawSpecs.finalAppearance ? String(rawSpecs.finalAppearance) : undefined
  } : fallback.specifications;

  return {
    ...fallback,
    name,
    yieldUnits,
    ingredients: ingredients.length ? ingredients : fallback.ingredients,
    procedure: procedure.length ? procedure : fallback.procedure,
    notes: notes.length ? notes : fallback.notes,
    specifications,
    warnings,
    confidence: Math.min(0.99, Math.max(fallback.confidence, ingredients.length ? 0.9 : 0.55))
  };
}

async function enhanceWithAI(
  parsed: ParsedRecipe,
  originalText: string,
  fileBuffer: Buffer,
  fileMime: string,
  format: ParsedRecipe['sourceFormat']
): Promise<ParsedRecipe> {
  if (!hasOpenAIKey() || process.env.RECIPE_IMPORT_AI !== 'true') return parsed;

  const prompt = [
    'Analiza esta receta con máxima fidelidad.',
    'Detecta el nombre, rendimiento, ingredientes en el orden correcto, cantidad exacta, unidad de medida, procedimiento en orden y notas.',
    'También detecta, solo cuando aparezcan o puedan leerse claramente: peso final, altura, ancho, largo, diámetro, forma, tipo de molde, tipo de empaque, temperatura, tiempo de horneado y descripción de la apariencia final.',
    'No inventes datos. Cuando un dato no esté presente, usa null.',
    'Corrige errores obvios de OCR o columnas, pero conserva el significado original.',
    'Devuelve exclusivamente el JSON definido en el esquema.'
  ].join('\\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const content: any[] = [{ type: 'input_text', text: prompt }];
    if (format === 'png' || format === 'jpg' || format === 'jpeg') {
      content.push({
        type: 'input_image',
        image_url: `data:${fileMime};base64,${fileBuffer.toString('base64')}`,
        detail: 'auto'
      });
    } else if (format === 'pdf') {
      content.push({
        type: 'input_file',
        filename: 'receta.pdf',
        file_data: `data:application/pdf;base64,${fileBuffer.toString('base64')}`
      });
      if (originalText.trim()) content.push({ type: 'input_text', text: 'Texto extraído localmente:\\n' + originalText.slice(0, 70000) });
    } else {
      content.push({ type: 'input_text', text: originalText.slice(0, 70000) });
    }

    const response = await requestOpenAI({
        model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
        store: false,
        max_output_tokens: 2800,
        input: [{ role: 'user', content }],
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
                notes: { type: 'array', items: { type: 'string' } },
                specifications: {
                  type: ['object', 'null'],
                  additionalProperties: false,
                  properties: {
                    weight: { type: ['number', 'null'] },
                    weightUnit: { type: ['string', 'null'] },
                    height: { type: ['number', 'null'] },
                    heightUnit: { type: ['string', 'null'] },
                    width: { type: ['number', 'null'] },
                    widthUnit: { type: ['string', 'null'] },
                    length: { type: ['number', 'null'] },
                    lengthUnit: { type: ['string', 'null'] },
                    diameter: { type: ['number', 'null'] },
                    diameterUnit: { type: ['string', 'null'] },
                    shape: { type: ['string', 'null'] },
                    moldType: { type: ['string', 'null'] },
                    packagingType: { type: ['string', 'null'] },
                    temperature: { type: ['number', 'null'] },
                    temperatureUnit: { type: ['string', 'null'] },
                    bakingTimeMinutes: { type: ['number', 'null'] },
                    finalAppearance: { type: ['string', 'null'] }
                  },
                  required: ['weight','weightUnit','height','heightUnit','width','widthUnit','length','lengthUnit','diameter','diameterUnit','shape','moldType','packagingType','temperature','temperatureUnit','bakingTimeMinutes','finalAppearance']
                }
              },
              required: ['name', 'yieldUnits', 'ingredients', 'procedure', 'notes', 'specifications']
            }
          }
        }
      }, { signal: controller.signal });

    if (!response.ok) return parsed;
    const payload: any = await response.json();
    const raw = typeof payload?.output_text === 'string'
      ? payload.output_text
      : Array.isArray(payload?.output)
        ? payload.output.flatMap((item: any) => item?.content || [])
            .filter((part: any) => part?.type === 'output_text')
            .map((part: any) => part.text)
            .join('\\n')
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

router.post('/importar', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKeyGenerator
}), autenticar, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Selecciona un archivo .docx, .pdf, .txt, .png, .jpg o .jpeg.' });
      return;
    }

    const { text, format } = await extractRecipeText(req.file.buffer, req.file.originalname);
    const imageFormat = format === 'png' || format === 'jpg' || format === 'jpeg';
    const aiEnabled = Boolean(hasOpenAIKey() && process.env.RECIPE_IMPORT_AI === 'true');

    if (imageFormat && !aiEnabled) {
      res.status(503).json({
        error: 'La importación desde imágenes requiere activar la IA de recetas en el servidor.'
      });
      return;
    }

    if (!text.trim() && !imageFormat && !(format === 'pdf' && aiEnabled)) {
      res.status(422).json({
        error: 'No se pudo extraer texto de ese archivo. Activa la importación IA para analizar PDFs escaneados.'
      });
      return;
    }

    const parsed = await enhanceWithAI(
      parseRecipeText(text, format),
      text,
      req.file.buffer,
      req.file.mimetype,
      format
    );

    if (imageFormat && parsed.ingredients.length === 0) {
      res.status(422).json({
        error: 'No se reconocieron ingredientes en la imagen. Prueba con una foto más nítida o completa los datos manualmente.'
      });
      return;
    }

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
