import {
  apolloReferenceCatalogListUrl,
  buildReferenceCatalogSources,
  type RemoteReferenceCatalogList,
  type ReferenceCatalogSource,
} from './referenceList';
import { fetchDirect } from '../utils/networkFetch';
import fallbackCatalogList from './referenceSources.json';
import type {
  AthenaCatalog,
  AthenaComponent,
  ComponentPlatform,
  ComponentRole,
  LibraryCatalog,
  LibraryComponent,
  LibraryStatus,
  NormalizedElement,
  NormalizedJsonCatalog,
  NormalizedJsonComponent,
  StyleCatalog,
  TokenCatalog,
} from './libraryTypes';
import type {
  DSStructureNode,
  DSVariantStructurePatch,
} from '../types/structures';

let catalogs: AthenaCatalog[] = [];
const tokenCatalogs: TokenCatalog[] = [];
const styleCatalogs: StyleCatalog[] = [];
const partHostMap = new Map<string, Set<string>>();
const corporateNameIndex = new Map<string, LibraryComponent>();
let catalogSources: ReferenceCatalogSource[] | null = null;

const catalogLoadState: {
  ready: boolean;
  promise: Promise<void> | null;
} = {
  ready: false,
  promise: null,
};

const missingReferenceLog = new Set<string>();

export function areReferenceCatalogsReady(): boolean {
  return catalogLoadState.ready;
}

export async function ensureReferenceCatalogsLoaded(): Promise<void> {
  if (catalogLoadState.ready) {
    return;
  }

  if (!catalogLoadState.promise) {
    catalogLoadState.promise = loadAllCatalogs().finally(() => {
      catalogLoadState.promise = null;
    });
  }
  return catalogLoadState.promise;
}

async function loadAllCatalogs(): Promise<void> {
  const sources = await ensureCatalogSourceList();

  const componentSources = sources.filter(
    (source) => !isTokenCatalogSource(source) && !isStyleCatalogSource(source),
  );

  const modules = await Promise.all(componentSources.map(fetchCatalogModule));

  hydrateCatalogs(modules);

  await loadTokenCatalogs(sources.filter(isTokenCatalogSource));
  await loadStyleCatalogs(sources.filter(isStyleCatalogSource));

  catalogLoadState.ready = true;
}

async function ensureCatalogSourceList(): Promise<ReferenceCatalogSource[]> {
  if (catalogSources) {
    return catalogSources;
  }

  try {
    const response = await requestCatalogSource(apolloReferenceCatalogListUrl);
    const payload = JSON.parse(response);

    console.log('[Apollo] reference sources list loaded', {
      url: apolloReferenceCatalogListUrl,
      baseUrl: payload?.baseUrl ?? '',
      count: payload?.catalogs?.length ?? 0,
    });

    catalogSources = buildReferenceCatalogSources(payload);
    return catalogSources;
  } catch (error) {
    console.warn('[Apollo] failed to load reference sources list', {
      url: apolloReferenceCatalogListUrl,
      error:
        error && typeof error === 'object' && 'message' in error
          ? String((error as {message?: string}).message)
          : String(error ?? 'Unknown error'),
    });
  }

  console.error('Failed to load reference catalog list from Apollo Pages');

  const fallback = fallbackCatalogList as RemoteReferenceCatalogList;

  catalogSources = buildReferenceCatalogSources(fallback);

  return catalogSources;
}

async function fetchCatalogModule(
  source: ReferenceCatalogSource,
): Promise<AthenaCatalog> {
  try {
    const response = await requestCatalogSource(source.url);

    console.log('[Apollo] catalog fetched', {
      fileName: source.fileName,
      url: source.url,
      bytes: response.length,
    });

    reportCatalogLoaded(source.fileName, response.length);

    return parseCatalogPayload(response, source.fileName);

  } catch (error) {
    console.error(`Failed to load catalog ${source.fileName}`, error);

    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as any).message)
        : String(error ?? 'Unknown error');

    logCatalogEvent(source, `failed: ${message}`);

    throw error;
  }
}

function isTokenCatalogSource(source: ReferenceCatalogSource): boolean {
  return /\/tokens\//i.test(source.url);
}

function isStyleCatalogSource(source: ReferenceCatalogSource): boolean {
  return /\/styles\//i.test(source.url);
}

function parseCatalogPayload(raw: string, fileName: string): AthenaCatalog {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('Empty catalog payload');
  }

  try {
    const parsed = JSON.parse(trimmed);
    
    if (isNormalizedJsonCatalog(parsed)) {
      return parseNormalizedJsonCatalog(parsed, fileName);
    }

    if (isAthenaCatalog(parsed)) {
      return parsed as AthenaCatalog;
    }

  } catch (error) {
    if (!trimmed.startsWith('DS_CONTEXT:')) {
      throw error;
    }
  }

  const parsed = parseNormalizedCatalog(trimmed, fileName);

  if (!parsed) {
    throw new Error('Unsupported normalized catalog format');
  }
  return parsed;
}

async function loadTokenCatalogs(
  sources: ReferenceCatalogSource[],
): Promise<void> {
  tokenCatalogs.length = 0;

  for (const source of sources) {
    try {
      const raw = await requestCatalogSource(source.url);

      console.log('[Apollo] token catalog fetched', {
        fileName: source.fileName,
        url: source.url,
        bytes: raw.length,
      });

      reportCatalogLoaded(source.fileName, raw.length);

      const data = JSON.parse(raw);

      tokenCatalogs.push({
        meta: data.meta,
        collections: Array.isArray(data.collections) ? data.collections : [],
      });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : String(error ?? 'Unknown error');

      logCatalogEvent(source, `failed: ${message}`);
    }
  }
}

async function loadStyleCatalogs(
  sources: ReferenceCatalogSource[],
): Promise<void> {
  styleCatalogs.length = 0;

  for (const source of sources) {
    try {
      const raw = await requestCatalogSource(source.url);

      console.log('[Apollo] style catalog fetched', {
        fileName: source.fileName,
        url: source.url,
        bytes: raw.length,
      });

      reportCatalogLoaded(source.fileName, raw.length);

      const data = JSON.parse(raw);

      styleCatalogs.push({
        meta: data.meta,
        styles: Array.isArray(data.styles) ? data.styles : [],
      });

    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as any).message)
          : String(error ?? 'Unknown error');

      logCatalogEvent(source, `failed: ${message}`);
    }
  }
}

export function getTokenCatalogs(): TokenCatalog[] {
  return tokenCatalogs.slice();
}

export function getStyleCatalogs(): StyleCatalog[] {
  return styleCatalogs.slice();
}

function isAthenaCatalog(payload: unknown): payload is AthenaCatalog {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as AthenaCatalog).components),
  );
}

function isNormalizedJsonCatalog(
  payload: unknown,
): payload is NormalizedJsonCatalog {
  if (!payload || typeof payload !== 'object') return false;

  const catalog = payload as NormalizedJsonCatalog;

  return catalog.kind === 'catalog' && Array.isArray(catalog.elements);
}

function parseNormalizedCatalog(
  raw: string,
  fileName: string,
): AthenaCatalog | null {
  const elements = parseNormalizedElements(raw);

  if (!elements.length) {
    return null;
  }
  return parseNormalizedCatalogFromElements(elements, fileName);
}

function parseNormalizedJsonCatalog(
  payload: NormalizedJsonCatalog,
  fileName: string,
): AthenaCatalog {
  const elements = Array.isArray(payload.elements) ? payload.elements : [];

  const catalog = parseNormalizedCatalogFromElements(elements, fileName);

  if (payload.source?.library) {
    catalog.meta.library = payload.source.library;
  }

  if (Array.isArray(payload.components) && payload.components.length) {
    mergeNormalizedComponents(catalog, payload.components);
  }

  return catalog;
}

function parseNormalizedCatalogFromElements(
  elements: NormalizedElement[],
  fileName: string,
): AthenaCatalog {
  if (!elements.length) {
    return { meta: { fileName }, components: [] };
  }

  const rootComponents = elements.filter((el) => el.type === 'COMPONENT');

  const grouped: AthenaComponent[] = [];

  const fallbackKey = elements.find((el) => el.componentKey)?.componentKey ?? '';

  if (!rootComponents.length) {
    grouped.push(
      buildComponentFromElements(
        fileName,
        elements[0]?.path?.split(' / ')[0] ?? fileName,
        fallbackKey,
        elements,
      ),
    );
  } else {
    for (const root of rootComponents) {
      const rootPath = root.path;

      const group = elements.filter(
        (el) => el.path === rootPath || el.path.startsWith(`${rootPath} / `),
      );

      grouped.push(
        buildComponentFromElements(
          fileName,
          rootPath.split(' / ')[0] ?? rootPath,
          root.componentKey ?? fallbackKey,
          group,
        ),
      );
    }
  }

  return {
    meta: { fileName },
    components: grouped,
  };
}

function mergeNormalizedComponents(
  catalog: AthenaCatalog,
  components: NormalizedJsonComponent[],
) {
  const byKey = new Map<string, NormalizedJsonComponent>();
  const byName = new Map<string, NormalizedJsonComponent>();

  for (const component of components) {
    if (component.key) {
      byKey.set(component.key, component);
    }
    if (component.name) {
      byName.set(component.name, component);
    }
  }

  for (const component of catalog.components) {
    const match =
      (component.key && byKey.get(component.key)) ||
      (component.name && byName.get(component.name));
      
    if (!match) continue;
    if (!component.key && match.key) {
      component.key = match.key;
    }
    if (match.name && component.name !== match.name) {
      component.name = match.name;
    }

    if (
      Array.isArray((match as any).structure) &&
      (match as any).structure.length > 0
    ) {
      component.structure = (match as any).structure as DSStructureNode[];
    }

    if (match.variants && match.variants.length) {
      component.variants = match.variants
        .filter((variant) => variant && variant.key && variant.name)
        .map((variant) => ({
          id: variant.id ?? '',
          key: variant.key ?? '',
          name: variant.name ?? '',
        }));
    }
    if (match.variantStructures && !component.variantStructures) {
      component.variantStructures = match.variantStructures;
    }
    if (match.status && !component.status) {
      component.status = match.status;
    }
    if (match.role && !component.role) {
      component.role = match.role;
    }
    if (match.platform && !component.platform) {
      component.platform = match.platform;
    }
    if (match.description && !component.description) {
      component.description = match.description;
    }
    component.meta = component.meta || { pageName: '', category: null };
    if (match.category && !component.meta.category) {
      component.meta.category = match.category;
    }
  }
}

function buildComponentFromElements(
  fileName: string,
  name: string,
  key: string,
  elements: NormalizedElement[],
): AthenaComponent {
  return {
    key,
    name,
    meta: {
      pageName: fileName,
      category: null,
    },
    structure: buildStructure(elements),
  };
}

function buildStructure(elements: NormalizedElement[]): DSStructureNode[] {
  const nodes: DSStructureNode[] = [];
  const idByPath = new Map<string, number>();
  let nextId = 1;

  for (const element of elements) {
    const id =
      typeof element.id === 'number' && Number.isFinite(element.id)
        ? element.id
        : nextId++;
    if (id >= nextId) {
      nextId = id + 1;
    }
    const path = element.path;
    const parentPath = getParentPath(path);
    const name = getLastSegment(path);
    const parentId = parentPath ? (idByPath.get(parentPath) ?? null) : null;

    const node: DSStructureNode = {
      id,
      parentId,
      path,
      type: element.type ?? 'FRAME',
      name,
      visible: element.visible !== false,
      radius: null
    };

    const layout = buildNodeLayout(element.layout);
    if (layout) {
      node.layout = layout;
    }

    if (typeof element.opacity === 'number') {
      node.opacity = element.opacity;
    }
    if (element.opacityToken) {
      node.opacityToken = element.opacityToken;
    }

    if (element.fill) {
      node.fill = {
        color: element.fill.color ?? null,
        token: element.fill.token ?? null,
      };
    }

    if (element.stroke) {
      node.stroke = {
        color: element.stroke.color ?? null,
        token: element.stroke.token ?? null,
        weight:
          typeof element.stroke.weight === 'number'
            ? element.stroke.weight
            : null,
        align: element.stroke.align ?? null,
      };
    }

    if (element.layout?.radius !== undefined) {
      node.radius = mapRadius(element.layout.radius);
    }
    if (element.radiusToken) {
      node.radiusToken = element.radiusToken;
    }

    if (element.type === 'TEXT' && element.text?.value) {
      node.text = { characters: element.text.value };
    }
    if (element.typography?.styleKey) {
      node.styles = node.styles ?? {};
      node.styles.text = { styleKey: element.typography.styleKey };
    }

    nodes.push(node);
    idByPath.set(path, id);
  }

  return nodes;
}

function buildNodeLayout(
  layout?: NormalizedElement['layout'],
): DSStructureNode['layout'] | null {
  if (!layout) return null;

  const out: DSStructureNode['layout'] = {};

  if (Array.isArray(layout.padding) && layout.padding.length === 4) {

    out.padding = {
      top: layout.padding[0] ?? null,
      right: layout.padding[1] ?? null,
      bottom: layout.padding[2] ?? null,
      left: layout.padding[3] ?? null,
    };
  }

  if (typeof layout.gap === 'number') {
    out.itemSpacing = layout.gap;
  }

  if (layout.paddingTokens) {
    
    out.paddingTokens = {
      top: layout.paddingTokens.top ?? null,
      right: layout.paddingTokens.right ?? null,
      bottom: layout.paddingTokens.bottom ?? null,
      left: layout.paddingTokens.left ?? null,
    };
  }

  if (layout.gapToken) {
    out.itemSpacingToken = layout.gapToken;
  }
  
  return Object.keys(out).length ? out : null;
}

function mapRadius(
  radius: number | number[] | undefined,
): DSStructureNode['radius'] | null {
  if (radius === undefined) return null;

  if (typeof radius === 'number') return radius;

  if (Array.isArray(radius) && radius.length === 4) {
    return {
      topLeft: radius[0],
      topRight: radius[1],
      bottomRight: radius[2],
      bottomLeft: radius[3],
    };
  }

  return null;
}

function getParentPath(path: string): string | null {
  const parts = path.split(' / ');
  if (parts.length <= 1) return null;
  parts.pop();
  return parts.join(' / ');
}

function getLastSegment(path: string): string {
  const parts = path.split(' / ');
  return parts[parts.length - 1] ?? path;
}

function parseNormalizedElements(raw: string): NormalizedElement[] {
  const elements: NormalizedElement[] = [];
  let current: NormalizedElement | null = null;
  let section: string | null = null;

  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith('- path:')) {
      if (current) elements.push(current);

      current = { path: extractValue(trimmed) };

      section = null;

      continue;
    }
    if (!current) continue;

    if (
      trimmed === 'layout:' ||
      trimmed === 'stroke:' ||
      trimmed === 'fill:' ||
      trimmed === 'text:' ||
      trimmed === 'typography:'
    ) {
      section = trimmed.replace(':', '');

      if (section === 'layout') {
        current.layout = {};
      }

      if (section === 'text') {
        current.text = {};
      }

      continue;
    }

    if (trimmed.startsWith('type:')) {
      current.type = trimmed.slice(5).trim();
      continue;
    }

    if (trimmed.startsWith('id:')) {
      const parsedId = parseInt(trimmed.slice(3).trim(), 10);

      if (!Number.isNaN(parsedId)) {
        current.id = parsedId;
      }

      continue;
    }

    if (trimmed.startsWith('componentKey:')) {
      current.componentKey = stripQuotes(trimmed.slice(13).trim());

      continue;
    }

    if (trimmed.startsWith('visible:')) {
      current.visible = trimmed.slice(8).trim() === 'true';

      continue;
    }

    if (section === 'layout' && current.layout) {
      
      if (trimmed.startsWith('padding:')) {
        current.layout.padding = parseNumberArray(trimmed);
      } else if (trimmed.startsWith('gap:')) {
        current.layout.gap = parseFloat(trimmed.slice(4).trim());
      } else if (trimmed.startsWith('radius:')) {
        current.layout.radius = parseNumberOrArray(trimmed.slice(7).trim());
      }

      continue;
    }

    if (section === 'text' && current.text) {
      if (trimmed.startsWith('value:')) {
        current.text.value = stripQuotes(trimmed.slice(6).trim());
      }

      continue;
    }
  }

  if (current) elements.push(current);
  return elements;
}

function extractValue(line: string): string {
  const idx = line.indexOf(':');

  if (idx === -1) return line.trim();

  return stripQuotes(line.slice(idx + 1).trim());
}

function stripQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function parseNumberArray(line: string): number[] {
  const match = line.match(/\[(.*)\]/);

  if (!match) return [];

  return match[1]
    .split(',')
    .map((item) => parseFloat(item.trim()))
    .filter((num) => !Number.isNaN(num));
}

function parseNumberOrArray(value: string): number | number[] | undefined {
  if (!value) return undefined;

  if (value.startsWith('[')) {
    const arr = value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((item) => parseFloat(item.trim()))
      .filter((num) => !Number.isNaN(num));
    return arr;
  }
  const num = parseFloat(value);

  return Number.isNaN(num) ? undefined : num;
}

// Normalize Athena-like paint fields to the runtime shape used by diff.
function normalizeComponentPaints(component: AthenaComponent) {
  if (!component) return;
  if (Array.isArray(component.structure)) {
    for (const node of component.structure) {
      normalizePaintFields(node);
    }
  }
  if (component.variantStructures) {
    for (const patches of Object.values(component.variantStructures)) {
      if (!Array.isArray(patches)) continue;
      for (const patch of patches) {
        if (!patch) continue;
        if (patch.op === 'update') {
          normalizePaintFields(patch.value);
        } else if (patch.op === 'add') {
          normalizePaintFields(patch.node);
        }
      }
    }
  }
}

function normalizePaintFields(target: any) {
  if (!target || typeof target !== 'object') return;

  const fillToken = target.fillToken ?? extractTokenFromPaints(target.fills);
  const fillColor = extractColorFromPaints(target.fills);

  if (fillToken || fillColor) {
    target.fill = target.fill ?? {};
    if (!target.fill.token && fillToken) {
      target.fill.token = fillToken;
    }
    if (!target.fill.color && fillColor) {
      target.fill.color = fillColor;
    }
  }

  const strokeToken =
    target.strokeToken ?? extractTokenFromPaints(target.strokes);
  const strokeColor = extractColorFromPaints(target.strokes);

  if (strokeToken || strokeColor || typeof target.strokeWeight === 'number') {
    target.stroke = target.stroke ?? {};
    if (!target.stroke.token && strokeToken) {
      target.stroke.token = strokeToken;
    }
    if (!target.stroke.color && strokeColor) {
      target.stroke.color = strokeColor;
    }
    if (
      target.stroke.weight == null &&
      typeof target.strokeWeight === 'number'
    ) {
      target.stroke.weight = target.strokeWeight;
    }
    if (!target.stroke.align && target.strokeAlign) {
      target.stroke.align = target.strokeAlign;
    }
  }
}

function extractTokenFromPaints(paints: any): string | null {
  if (!Array.isArray(paints)) return null;
  for (const paint of paints) {
    if (!paint || typeof paint !== 'object') continue;
    const tokenKey =
      paint.tokenKey ||
      paint.token ||
      paint?.boundVariables?.color?.id ||
      paint?.boundVariables?.color?.variableId ||
      paint?.boundVariables?.color?.variable?.id ||
      paint?.boundVariables?.color?.variable?.key;
    if (tokenKey) return String(tokenKey);
  }
  return null;
}

function extractColorFromPaints(paints: any): string | null {
  if (!Array.isArray(paints)) return null;
  for (const paint of paints) {
    if (!paint || typeof paint !== 'object') continue;
    if (paint.visible === false) continue;
    if (paint.type && paint.type !== 'SOLID') continue;
    const color = paint.color;
    if (typeof color === 'string') {
      return color;
    }
    if (color && typeof color === 'object') {
      return formatRgba(color);
    }
  }
  return null;
}

function formatRgba(color: { r: number; g: number; b: number; a?: number }) {
  const max = Math.max(color.r, color.g, color.b);
  const scale = max <= 1 ? 255 : 1;
  const r = Math.round(color.r * scale);
  const g = Math.round(color.g * scale);
  const b = Math.round(color.b * scale);
  const alpha =
    typeof color.a === 'number' ? Math.round(color.a * 100) / 100 : 1;
  return `rgba(${r},${g},${b},${alpha})`;
}

function hydrateCatalogs(modules: AthenaCatalog[]) {
  catalogs = modules;

  partHostMap.clear();

  corporateNameIndex.clear();

  missingReferenceLog.clear();

  let totalComponents = 0;

  const uniqueKeys = new Set<string>();

  const validationWarnings: string[] = [];

  for (const module of catalogs) {
  console.log('[Apollo] catalog loaded summary', {
      fileName: module.meta?.fileName ?? 'unknown',
      componentCount: module.components?.length ?? 0,
    });

    for (const component of module.components ?? []) {
      totalComponents += 1;

      if (component.key) {
        uniqueKeys.add(component.key);
      }

      if (component.variants) {
        for (const variant of component.variants) {
          if (variant?.key) {
            uniqueKeys.add(variant.key);
          }
        }
      }

      prepareComponent(component, module);

      registerPartUsage(component as unknown as LibraryComponent);

      validationWarnings.push(
        ...validateCatalogComponent(
          component,
          module.meta?.fileName ?? 'unknown',
        ),
      );
    }
  }
  console.log('[Apollo] catalog merge summary', {
    catalogCount: catalogs.length,
    componentCount: totalComponents,
    uniqueKeys: uniqueKeys.size,
  });

  if (validationWarnings.length) {
    for (const warning of validationWarnings.slice(0, 50)) {
      console.warn(`[Apollo::catalog] ${warning}`);
    }

    if (validationWarnings.length > 50) {
      console.warn(
        `[Apollo::catalog] Дополнительно ${validationWarnings.length - 50} предупреждений`,
      );
    }
  }
}

function validateCatalogComponent(
  component: AthenaComponent,
  fileName: string,
): string[] {
  const warnings: string[] = [];
  const hasVariants =
    Array.isArray(component.variants) && component.variants.length > 0;

  if (!hasVariants) {
    return warnings;
  }
  
  if (!component.variantStructures) {
    warnings.push(
      `Нет variantStructures для «${component.name}» (${fileName})`,
    );
    return warnings;
  }

  const missingVariantKeys = component.variants
    ?.filter((variant) => variant?.key && !component.variantStructures?.[variant.key])
    .map((variant) => variant?.name ?? variant?.key ?? 'unknown');

  if (missingVariantKeys?.length) {
    warnings.push(
      `variantStructures неполные для «${component.name}» (${fileName}): ${missingVariantKeys.join(', ')}`,
    );
  }

  return warnings;
}

function logCatalogEvent(source: ReferenceCatalogSource, message: string) {
  console.warn('[Apollo] catalog event', {
    fileName: source.fileName,
    url: source.url,
    message,
  });
}

export function reportMissingReference(name: string, key: string | null) {
  const signature = `${key}::${name}`;

  if (missingReferenceLog.has(signature)) {
    return;
  }

  if (missingReferenceLog.size >= 20) {
    return;
  }

  missingReferenceLog.add(signature);

  const message = `Не найден компонент с ключом ${key} (${name})`;

  console.warn(`[Apollo::catalog] ${message}`);

  try {
    figma.ui.postMessage({
      type: 'catalog-miss-debug',
      payload: { key, name },
    });
  } catch (error) {
    console.warn('Failed to report missing reference', error);
  }
}

function reportCatalogLoaded(fileName: string, size: number) {
  try {
    figma.ui?.postMessage({
      type: 'catalog-file-loaded',
      payload: { name: fileName, bytes: size },
    });
  } catch (error) {
    // ignore UI failures
  }
}

async function requestCatalogSource(url: string): Promise<string> {
  return fetchDirect(url);
}

export const primaryCatalog: LibraryCatalog = {
  id: 'apollo-catalog',
  name: 'Apollo Catalog',
  components: [],
};

function* iterateCatalogComponents(): IterableIterator<LibraryComponent> {
  for (const module of catalogs) {
    for (const component of module.components ?? []) {
      yield component as unknown as LibraryComponent;
    }
  }
}

export function findComponent(
  key: string,
): LibraryComponent | null {
  const direct = findCatalogComponentByKey(key);
    
  return direct ?? null;
}

function findCatalogComponentByKey(
  key: string,
): LibraryComponent | null {
  for (const component of iterateCatalogComponents()) {
    if (component.key === key) {
      return component;
    }

    if (component.variants?.some((variant) => variant.key === key)) {
      return component;
    }

  }

  return null;
}

export function resolveStructure(
  component: LibraryComponent | null | undefined,
  variantKey?: string | null,
): DSStructureNode[] | null {
  if (!component) return null;

  if (
    variantKey &&
    component.variantStructures &&
    component.variantStructures[variantKey]
  ) {
    return buildStructureFromPatches(
      component.structure ?? [],
      component.variantStructures[variantKey],
    );
  }

  if (component.structure && component.structure.length > 0) {
    return cloneStructure(component.structure);
  }

  return null;
}

function prepareComponent(component: AthenaComponent, module: AthenaCatalog) {
  normalizeComponentPaints(component);
  const role = mapRole(component.role);

  const parentName =
    component.parentComponent?.name ||
    component.meta?.pageName ||
    component.meta?.category ||
    component.name;

  const libraryComponent = component as unknown as LibraryComponent;
  libraryComponent.names = collectNames(component);
  libraryComponent.status = mapStatus(component);
  libraryComponent.platform = detectPlatform(component);
  libraryComponent.role = role;
  libraryComponent.source =
    module.meta?.library ?? module.meta?.fileName ?? 'Неизвестная библиотека';
  libraryComponent.displayName = component.name;
  libraryComponent.variantOf = role === 'Part' ? parentName : undefined;
  libraryComponent.notes = component.description?.trim() || undefined;

  const canonicalName = normalizeCorporateName(component.name);
  if (canonicalName) {
    const key = component.name.includes('[Corporate]')
      ? `${canonicalName}::corp-variant`
      : `${canonicalName}::base-variant`;

    corporateNameIndex.set(key, libraryComponent);

    if (!(component as any).variants) {
      corporateNameIndex.set(
        `${canonicalName}::${component.name.includes('[Corporate]') ? 'corp' : 'base'}`,
        libraryComponent,
      );
    }
  }
}

function collectNames(component: AthenaComponent): string[] {
  const aliases = new Set(buildNameAliases(component));
  for (const variant of component.variants ?? []) {
    for (const alias of buildNameAliases(component, variant.name)) {
      aliases.add(alias);
    }
  }
  return Array.from(aliases);
}

function buildNameAliases(
  component: AthenaComponent,
  variantName?: string,
): string[] {
  const aliases = new Set<string>();
  if (variantName) {
    aliases.add(variantName);
    aliases.add(`${component.name} / ${variantName}`);
  } else {
    aliases.add(component.name);
  }

  if (component.meta?.category) {
    aliases.add(component.meta.category);
  }

  if (component.meta?.pageName) {
    if (variantName) {
      aliases.add(
        `${component.meta.pageName} / ${component.name} / ${variantName}`,
      );
    } else {
      aliases.add(`${component.meta.pageName} / ${component.name}`);
    }
  }

  return Array.from(aliases).map(normalizeName).filter(Boolean);
}

function mapStatus(component: AthenaComponent): LibraryStatus {
  const description = component.description?.toLowerCase() ?? '';
  if (description.includes('изменен') || description.includes('changed')) {
    return 'changed';
  }

  switch (component.status) {
    case 'deprecated':
      return 'deprecated';
    case 'scheduled':
    case 'scheduled-removal':
      return 'update';
    default:
      return 'current';
  }
}

function detectPlatform(component: AthenaComponent): ComponentPlatform {
  const sources = [
    component.name,
    component.meta?.pageName ?? '',
    component.meta?.category ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (sources.includes('[d]')) return 'Desktop';
  if (sources.includes('[m]')) return 'Mobile Web';

  return 'Universal';
}

function mapRole(value: string | undefined): ComponentRole {
  if (value && value.toLowerCase() === 'part') {
    return 'Part';
  }
  return 'Main';
}

function normalizeName(value: string): string {
  return value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ')
    .trim()
    .toLowerCase();
}

function buildStructureFromPatches(
  base: DSStructureNode[] | undefined,
  patches: DSVariantStructurePatch[] | undefined,
): DSStructureNode[] {
  const nodes = cloneStructure(base ?? []);

  const nodeMap = new Map<number, DSStructureNode>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  if (!patches || patches.length === 0) {
    return nodes;
  }

  for (const patch of patches) {
    switch (patch.op) {
      case 'update': {
        const target = nodeMap.get(patch.id);
        if (target) {
          Object.assign(target, patch.value);
        }
        break;
      }
      case 'remove': {
        nodeMap.delete(patch.id);
        const index = nodes.findIndex((node) => node.id === patch.id);
        if (index !== -1) {
          nodes.splice(index, 1);
        }
        break;
      }
      case 'add': {
        const copy = cloneNode(patch.node);
        nodes.push(copy);
        nodeMap.set(copy.id, copy);
        break;
      }
    }
  }

  return nodes;
}

function cloneStructure(nodes: DSStructureNode[]): DSStructureNode[] {
  return nodes.map(cloneNode);
}

function cloneNode(node: DSStructureNode): DSStructureNode {
  return JSON.parse(JSON.stringify(node));
}

function registerPartUsage(component: LibraryComponent) {
  const registerFromNodes = (nodes?: DSStructureNode[] | null) => {
    if (!nodes) return;

    for (const node of nodes) {
      const partKey = node.componentInstance?.componentKey;

      if (!partKey) continue;

      if (!partHostMap.has(partKey)) {
        partHostMap.set(partKey, new Set());
      }

      const bucket = partHostMap.get(partKey)!;

      if (component.key) {
        bucket.add(component.key);
      } else if (component.displayName) {
        bucket.add(component.displayName);
      }
    }
  };

  registerFromNodes(component.structure);

  if ((component as any).variantStructures) {
    for (const variantKey of Object.keys(component.variantStructures ?? {})) {
      registerFromNodes(resolveStructure(component, variantKey));

      const variantEntry = Object.assign({}, component, { name: variantKey }) as LibraryComponent;
      
      const canonicalName = normalizeCorporateName(component.name);

      if (canonicalName) {
        corporateNameIndex.set(
          `${canonicalName}::${component.name.includes('[Corporate]') ? 'corp' : 'base'}-variant-${variantKey}`,
          variantEntry,
        );
      }
    }
  }
}

function normalizeCorporateName(
  name: string | null | undefined,
): string | null {
  if (!name) return null;

  return name.replace(/\[(.+?)\]\s*/g, '').trim();
}

export function getCorporateCounterpart(componentName: string): {
  base?: LibraryComponent | null;
  corporate?: LibraryComponent | null;
} | null {
  const canonical = normalizeCorporateName(componentName);

  if (!canonical) return null;

  const base =
    corporateNameIndex.get(`${canonical}::base`) ??
    corporateNameIndex.get(`${canonical}::base-variant`) ??
    null;

  const corporate =
    corporateNameIndex.get(`${canonical}::corp`) ??
    corporateNameIndex.get(`${canonical}::corp-variant`) ??
    null;
    
  return { base, corporate };
}
