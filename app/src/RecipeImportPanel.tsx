import { useMemo, useState } from 'react';
import type { BusinessState, Ingredient, RecipeLine } from './types';
import { calculateRecipeCost, uid } from './types';
import { importRecipeFile, type RecipeImportResponse } from './api';

type DraftIngredient = RecipeImportResponse['recipe']['ingredients'][number] & {
  matchedId?: string;
  unitCost?: number;
  createIfMissing: boolean;
};

export function RecipeImportPanel({
  state,
  onChange,
  onImported
}: {
  state: BusinessState;
  onChange: (mutator: (current: BusinessState) => BusinessState) => void;
  onImported?: (productId: string, recipeId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<RecipeImportResponse | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftYield, setDraftYield] = useState(1);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [procedure, setProcedure] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [targetProductId, setTargetProductId] = useState('__new__');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const normalized = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  const productMatches = useMemo(() => {
    const key = normalized(draftName);
    return state.products.filter(product => normalized(product.name) === key);
  }, [draftName, state.products]);

  async function analyze() {
    if (!file) {
      setMessage('Selecciona un archivo .docx, .pdf, .txt, .png, .jpg o .jpeg.');
      return;
    }
    const token = state.admin?.token;
    if (!token) {
      setMessage('Necesitas iniciar sesión como administrador para importar recetas.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const response = await importRecipeFile(token, file);
      setResult(response);
      setDraftName(response.recipe.name);
      setDraftYield(Math.max(1, Number(response.recipe.yieldUnits) || 1));
      setProcedure([...response.recipe.procedure]);
      setNotes([...response.recipe.notes]);
      setIngredients(response.recipe.ingredients.map(item => {
        const found = state.ingredients.find(existing => normalized(existing.name) === normalized(item.name));
        return {
          ...item,
          matchedId: found?.id,
          unitCost: found?.unitCost ?? 0,
          createIfMissing: !found
        };
      }));
      const exactProduct = state.products.find(product => normalized(product.name) === normalized(response.recipe.name));
      setTargetProductId(exactProduct?.id || '__new__');
      setMessage(
        response.recipe.warnings.length
          ? response.recipe.warnings.join(' ')
          : 'Receta analizada. Revisa los datos antes de importarla.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo analizar el archivo.');
    } finally {
      setLoading(false);
    }
  }

  function updateIngredient(index: number, patch: Partial<DraftIngredient>) {
    setIngredients(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function addProcedureStep() {
    setProcedure(current => [...current, 'Nuevo paso']);
  }

  function removeProcedureStep(index: number) {
    setProcedure(current => current.filter((_, i) => i !== index));
  }

  function importIntoBusiness() {
    if (!draftName.trim()) {
      setMessage('La receta necesita un nombre.');
      return;
    }
    if (!ingredients.length) {
      setMessage('La receta necesita al menos un ingrediente.');
      return;
    }

    const localIngredients = [...state.ingredients];
    const ingredientIdByIndex = new Map<number, string>();

    for (let i = 0; i < ingredients.length; i += 1) {
      const item = ingredients[i];
      const existing = item.matchedId
        ? localIngredients.find(ingredient => ingredient.id === item.matchedId)
        : localIngredients.find(ingredient => normalized(ingredient.name) === normalized(item.name));

      if (existing) {
        ingredientIdByIndex.set(i, existing.id);
        continue;
      }

      if (!item.createIfMissing) continue;

      const newIngredient: Ingredient = {
        id: uid('ing'),
        name: item.name.trim(),
        unit: item.unit.trim() || 'und',
        unitCost: Math.max(0, Number(item.unitCost) || 0),
        stock: 0,
        minStock: 0,
        supplier: ''
      };
      localIngredients.push(newIngredient);
      ingredientIdByIndex.set(i, newIngredient.id);
    }

    const recipeLines: RecipeLine[] = ingredients
      .map((item, index) => ({
        ingredientId: ingredientIdByIndex.get(index) || item.matchedId || '',
        quantity: Math.max(0, Number(item.quantity) || 0),
        unit: item.unit.trim() || 'und'
      }))
      .filter(line => line.ingredientId && line.quantity > 0);

    if (!recipeLines.length) {
      setMessage('No hay ingredientes válidos después de revisar las relaciones.');
      return;
    }

    const productId = targetProductId === '__new__'
      ? uid('prd')
      : targetProductId;
    const recipeId = uid('rec');

    onChange(current => {
      const hasProduct = current.products.some(product => product.id === productId);
      const product = hasProduct
        ? current.products.find(p => p.id === productId)!
        : {
            id: productId,
            name: draftName.trim(),
            description: 'Importado desde ' + (result?.filename || 'archivo'),
            category: 'Importados',
            categories: ['Importados'],
            price: 0,
            cost: 0,
            manualCost: 0,
            stock: 0,
            active: true,
            seasonal: false,
            tags: ['importado'],
            flavors: [],
            sizes: [],
            presentation: 'Por definir',
            customizable: false,
            specifications: result?.recipe.specifications
          };

      const recipe = calculateRecipeCost({
        id: recipeId,
        productId,
        name: draftName.trim(),
        yieldUnits: Math.max(1, Number(draftYield) || 1),
        ingredients: recipeLines,
        procedure: procedure.filter(step => step.trim()),
        notes: notes.filter(note => note.trim()),
        sourceFile: result?.filename,
        serviceLines: [],
        useDefaultPackagingCost: true,
        useDefaultUtilityCost: true,
        useDefaultLaborRate: true,
        packagingCost: 0,
        utilityCost: 0,
        serviceCost: 0,
        laborHours: 0,
        laborRate: 0,
        otherCost: 0,
        totalCost: 0,
        salePrice: Number(product.price) || 0,
        margin: 0,
        specifications: result?.recipe.specifications
      }, localIngredients, current.services, current.settings);

      const nextProducts = hasProduct
        ? current.products.map(item => item.id === productId
            ? { ...item, name: draftName.trim(), specifications: result?.recipe.specifications || item.specifications }
            : item)
        : [product, ...current.products];

      const nextRecipes = [
        ...current.recipes.filter(item => item.productId !== productId || item.id === recipeId),
        recipe
      ];

      return {
        ...current,
        products: nextProducts,
        ingredients: localIngredients,
        recipes: nextRecipes
      };
    });

    setMessage('Receta importada y conectada al negocio. Ahora puedes editar costos, precio, rendimiento y procedimiento desde el editor profundo.');
    onImported?.(productId, recipeId);
    setResult(null);
    setFile(null);
  }

  return (
    <section className="panel recipe-import-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">IMPORTACIÓN INTELIGENTE</p>
          <h3>Importar receta desde archivo</h3>
        </div>
        <span className="status">DOCX · PDF · TXT · PNG · JPG</span>
      </div>

      <p className="muted">
        La aplicación detecta nombre, rendimiento, orden de ingredientes, cantidades, unidades, procedimiento, notas, especificaciones y apariencia final cuando aparecen en el archivo.
        Después puedes revisar y editar todo antes de incorporarlo al negocio.
      </p>

      <div className="form-grid">
        <label>
          Archivo
          <input
            type="file"
            accept=".docx,.pdf,.txt,.png,.jpg,.jpeg,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
            onChange={event => setFile(event.target.files?.[0] || null)}
          />
        </label>
        <label>
          Archivo seleccionado
          <input value={file?.name || 'Ninguno'} readOnly />
        </label>
      </div>

      <div className="button-row">
        <button className="primary" onClick={() => void analyze()} disabled={loading || !file}>
          {loading ? 'Analizando texto/imagen…' : 'Analizar receta automáticamente'}
        </button>
      </div>

      {message ? <div className="info-box">{message}</div> : null}

      {result ? (
        <div className="recipe-import-preview">
          <div className="form-grid">
            <label>Nombre<input value={draftName} onChange={e => setDraftName(e.target.value)} /></label>
            <label>Rendimiento<input type="number" min="1" step="0.01" value={draftYield} onChange={e => setDraftYield(Number(e.target.value) || 1)} /></label>
            <label>
              Producto destino
              <select value={targetProductId} onChange={e => setTargetProductId(e.target.value)}>
                <option value="__new__">＋ Crear producto nuevo</option>
                {productMatches.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                {state.products.filter(product => !productMatches.includes(product)).slice(0, 50).map(product => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="deep-section">
            <h4>Ingredientes detectados</h4>
            <div className="deep-array">
              {ingredients.map((item, index) => (
                <div className="deep-item" key={index}>
                  <div className="form-grid">
                    <label>Ingrediente<input value={item.name} onChange={e => updateIngredient(index, { name: e.target.value })} /></label>
                    <label>Cantidad<input type="number" step="any" value={item.quantity} onChange={e => updateIngredient(index, { quantity: Number(e.target.value) || 0 })} /></label>
                    <label>Unidad<input value={item.unit} onChange={e => updateIngredient(index, { unit: e.target.value })} /></label>
                    <label>Costo unitario<input type="number" step="any" value={item.unitCost ?? 0} onChange={e => updateIngredient(index, { unitCost: Number(e.target.value) || 0 })} /></label>
                    <label>
                      Relación
                      <select
                        value={item.createIfMissing ? '__new__' : (item.matchedId || '__new__')}
                        onChange={e => {
                          if (e.target.value === '__new__') {
                            updateIngredient(index, { matchedId: undefined, createIfMissing: true });
                          } else {
                            const found = state.ingredients.find(existing => existing.id === e.target.value);
                            updateIngredient(index, { matchedId: found?.id, createIfMissing: false, unitCost: found?.unitCost ?? item.unitCost });
                          }
                        }}
                      >
                        <option value="__new__">Crear ingrediente nuevo</option>
                        {state.ingredients.map(existing => (
                          <option key={existing.id} value={existing.id}>{existing.name} · {existing.unit}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="deep-section">
            <h4>Procedimiento detectado</h4>
            <div className="deep-array">
              {procedure.map((step, index) => (
                <div className="deep-item" key={index}>
                  <div className="deep-item-head"><b>Paso {index + 1}</b><button className="danger-button small" onClick={() => removeProcedureStep(index)}>Eliminar</button></div>
                  <textarea value={step} onChange={e => setProcedure(current => current.map((item, i) => i === index ? e.target.value : item))} />
                </div>
              ))}
              <button className="secondary small" onClick={addProcedureStep}>＋ Agregar paso</button>
            </div>
          </div>

          {result.recipe.specifications ? (
            <div className="deep-section">
              <h4>Especificaciones detectadas</h4>
              <div className="form-grid">
                <label>Peso<input type="number" step="any" value={result.recipe.specifications.weight ?? 0} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, weight: Number(e.target.value) || 0}}}) : current)} /></label>
                <label>Unidad de peso<input value={result.recipe.specifications.weightUnit ?? 'g'} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, weightUnit: e.target.value}}}) : current)} /></label>
                <label>Altura<input type="number" step="any" value={result.recipe.specifications.height ?? 0} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, height: Number(e.target.value) || 0}}}) : current)} /></label>
                <label>Unidad altura<input value={result.recipe.specifications.heightUnit ?? 'cm'} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, heightUnit: e.target.value}}}) : current)} /></label>
                <label>Diámetro<input type="number" step="any" value={result.recipe.specifications.diameter ?? 0} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, diameter: Number(e.target.value) || 0}}}) : current)} /></label>
                <label>Unidad diámetro<input value={result.recipe.specifications.diameterUnit ?? 'cm'} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, diameterUnit: e.target.value}}}) : current)} /></label>
                <label>Forma<input value={result.recipe.specifications.shape ?? ''} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, shape: e.target.value}}}) : current)} /></label>
                <label>Tipo de molde<input value={result.recipe.specifications.moldType ?? ''} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, moldType: e.target.value}}}) : current)} /></label>
                <label>Tipo de empaque<input value={result.recipe.specifications.packagingType ?? ''} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, packagingType: e.target.value}}}) : current)} /></label>
                <label>Temperatura<input type="number" step="1" value={result.recipe.specifications.temperature ?? 0} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, temperature: Number(e.target.value) || 0}}}) : current)} /></label>
                <label>Unidad temperatura<input value={result.recipe.specifications.temperatureUnit ?? '°C'} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, temperatureUnit: e.target.value}}}) : current)} /></label>
                <label>Tiempo de horneado (min)<input type="number" step="1" value={result.recipe.specifications.bakingTimeMinutes ?? 0} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, bakingTimeMinutes: Number(e.target.value) || 0}}}) : current)} /></label>
                <label className="form-grid-full">Apariencia final<textarea value={result.recipe.specifications.finalAppearance ?? ''} onChange={e => setResult(current => current ? ({...current, recipe: {...current.recipe, specifications: {...current.recipe.specifications!, finalAppearance: e.target.value}}}) : current)} /></label>
              </div>
            </div>
          ) : null}

          {notes.length ? (
            <div className="deep-section">
              <h4>Notas</h4>
              <div className="deep-array">
                {notes.map((note, index) => (
                  <div className="deep-item" key={index}>
                    <textarea value={note} onChange={e => setNotes(current => current.map((item, i) => i === index ? e.target.value : item))} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="button-row">
            <button className="primary" onClick={importIntoBusiness}>Importar al negocio y recalcular</button>
          </div>

          <p className="muted small">
            Confianza de detección: {(Number(result.recipe.confidence || 0) * 100).toFixed(0)}%.
            Siempre revisa cantidades y unidades antes de usar la receta para producción.
          </p>
        </div>
      ) : null}
    </section>
  );
}
