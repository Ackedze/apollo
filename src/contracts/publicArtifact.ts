const OWNERSHIP_SCHEMA = 'apollo.artifact-ownership.v2';

export type PublicArtifactDiagnostics = {
  documentType: string | null;
  storageSchema: 'legacy' | 'ownership-v2';
  publicSchemaVersion: 1;
};

export function compilePublicArtifact(payload: any): any {
  const document = objectValue(payload);
  if (!document) return payload;

  const isV2 =
    document.schemaVersion === 2 &&
    objectValue(document.metadata)?.ownershipSchema === OWNERSHIP_SCHEMA;
  if (!isV2) {
    return compileLegacyHybrid(document);
  }

  const metadata = objectValue(document.metadata) ?? {};
  const generated = objectValue(document.generated) ?? {};
  const manual = objectValue(document.manual) ?? {};
  const runtime = objectValue(document.runtime) ?? {};
  const base = compactObject({
    schemaVersion: 1,
    documentType: document.documentType,
    componentKey: metadata.componentKey,
    status: metadata.status,
    applicability: metadata.applicability,
  });

  switch (document.documentType) {
    case 'component-rules':
      return Object.assign(
        {},
        base,
        omit(manual, ['rules']),
        omit(runtime, ['rules']),
        {
          rules: mergeById(
            generated.rules,
            manual.rules,
            runtime.rules,
            'ruleId',
          ),
        },
      );
    case 'component-examples':
      return Object.assign(
        {},
        base,
        omit(manual, ['examples']),
        omit(runtime, ['examples']),
        {
          examples: mergeById(
            generated.examples,
            manual.examples,
            runtime.examples,
            'exampleId',
          ),
        },
      );
    case 'composition-contract':
      return compileComposition(base, generated, manual, runtime);
    case 'component-contract-overrides':
      return compileOverrides(base, generated, manual, runtime);
    case 'component-agent-context':
      return compileAgentContext(base, generated, manual, runtime);
    case 'component-audit-mapping':
      return compileAuditMapping(base, generated, manual, runtime);
    default:
      return Object.assign({}, base, generated, manual, runtime);
  }
}

export function getPublicArtifactDiagnostics(
  payload: any,
): PublicArtifactDiagnostics {
  const document = objectValue(payload);
  const metadata = objectValue(document?.metadata);
  return {
    documentType:
      typeof document?.documentType === 'string' ? document.documentType : null,
    storageSchema:
      document?.schemaVersion === 2 &&
      metadata?.ownershipSchema === OWNERSHIP_SCHEMA
        ? 'ownership-v2'
        : 'legacy',
    publicSchemaVersion: 1,
  };
}

function compileLegacyHybrid(document: Record<string, any>): Record<string, any> {
  const generated = objectValue(document.generated);
  const manual = objectValue(document.manual);
  if (!generated && !manual) {
    return document;
  }

  const base = compactObject({
    schemaVersion: 1,
    documentType: document.documentType,
    componentKey: document.componentKey,
    status: document.status,
    applicability: document.applicability,
  });
  const looksLikeAgentContext =
    document.documentType === 'component-agent-context' ||
    generated?.components !== undefined ||
    generated?.auditInterpretation !== undefined ||
    manual?.summary !== undefined ||
    manual?.agentInstructions !== undefined;
  if (looksLikeAgentContext) {
    const generatedContext = Object.assign({}, generated ?? {});
    if (generatedContext.sourceFiles === undefined) {
      generatedContext.sourceFiles = document.sourceFiles;
    }
    if (generatedContext.source === undefined) {
      generatedContext.source = document.source;
    }
    if (generatedContext.components === undefined) {
      generatedContext.components =
        document.components ?? document.includedComponents;
    }
    if (generatedContext.auditInterpretation === undefined) {
      generatedContext.auditInterpretation = document.auditInterpretation;
    }
    const manualContext = Object.assign(
      {},
      omit(document, [
        'schemaVersion',
        'documentType',
        'componentKey',
        'status',
        'applicability',
        'generated',
        'manual',
        'sourceFiles',
        'source',
        'components',
        'includedComponents',
      ]),
      manual ?? {},
    );
    return compileAgentContext(base, generatedContext, manualContext, {});
  }
  const looksLikeAuditMapping =
    document.documentType === 'component-audit-mapping' ||
    generated?.classification !== undefined ||
    generated?.categories !== undefined;
  if (looksLikeAuditMapping) {
    const generatedMapping = Object.assign({}, generated ?? {});
    for (const field of [
      'classification',
      'categories',
      'groupingOrder',
      'evidencePolicy',
    ]) {
      if (generatedMapping[field] === undefined) {
        generatedMapping[field] = document[field];
      }
    }
    return compileAuditMapping(base, generatedMapping, manual ?? {}, {});
  }
  return document;
}

function compileComposition(
  base: Record<string, any>,
  generated: Record<string, any>,
  manual: Record<string, any>,
  runtime: Record<string, any>,
): Record<string, any> {
  return compactObject(
    Object.assign(
      {},
      base,
      omit(manual, [
        'component',
        'wraps',
        'allowedOverrides',
        'standaloneBaselines',
      ]),
      omit(runtime, [
        'component',
        'wraps',
        'allowedOverrides',
        'standaloneBaselines',
      ]),
      {
        component: runtime.component ?? manual.component ?? generated.component,
        wraps: mergeOverlayArray(
          generated.wraps,
          manual.wraps,
          runtime.wraps,
          wrapKey,
        ),
        allowedOverrides: mergeOverlayArray(
          generated.allowedOverrides,
          manual.allowedOverrides,
          runtime.allowedOverrides,
          compositionEntryKey,
        ),
        standaloneBaselines: mergeOverlayArray(
          generated.standaloneBaselines,
          manual.standaloneBaselines,
          runtime.standaloneBaselines,
          compositionEntryKey,
        ),
      },
    ),
  );
}

function compileOverrides(
  base: Record<string, any>,
  generated: Record<string, any>,
  manual: Record<string, any>,
  runtime: Record<string, any>,
): Record<string, any> {
  return compactObject(
    Object.assign(
      {},
      base,
      omit(manual, ['note', 'semanticComponents']),
      omit(runtime, ['note', 'semanticComponents']),
      {
        note: runtime.note ?? manual.note ?? generated.note,
        semanticComponents: mergeByKey(
          generated.semanticComponents,
          manual.semanticComponents,
          runtime.semanticComponents,
          semanticComponentKey,
        ),
      },
    ),
  );
}

function compileAgentContext(
  base: Record<string, any>,
  generated: Record<string, any>,
  manual: Record<string, any>,
  runtime: Record<string, any>,
): Record<string, any> {
  const generatedSummary = objectValue(generated.summary);
  return compactObject(
    Object.assign({}, base, manual, runtime, {
      sourceFiles: generated.sourceFiles,
      source: generated.source,
      summary:
        runtime.summary ??
        manual.summary ??
        generatedSummary?.purpose ??
        generated.summary,
      components: generated.components,
      includedComponents: generated.components,
      auditInterpretation: mergeRecords(
        generated.auditInterpretation,
        manual.auditInterpretation,
        runtime.auditInterpretation,
        ['componentProperties', 'layerProperties'],
      ),
    }),
  );
}

function compileAuditMapping(
  base: Record<string, any>,
  generated: Record<string, any>,
  manual: Record<string, any>,
  runtime: Record<string, any>,
): Record<string, any> {
  return compactObject(
    Object.assign(
      {},
      base,
      omit(manual, [
        'classification',
        'categories',
        'groupingOrder',
        'evidencePolicy',
      ]),
      omit(runtime, [
        'classification',
        'categories',
        'groupingOrder',
        'evidencePolicy',
      ]),
      {
        classification: mergeByKey(
          generated.classification,
          manual.classification,
          runtime.classification,
          auditMatchKey,
        ),
        categories: mergeByKey(
          generated.categories,
          manual.categories,
          runtime.categories,
          auditCategoryKey,
        ),
        groupingOrder:
          runtime.groupingOrder ??
          manual.groupingOrder ??
          generated.groupingOrder,
        evidencePolicy: Object.assign(
          {},
          objectValue(generated.evidencePolicy),
          objectValue(manual.evidencePolicy),
          objectValue(runtime.evidencePolicy),
        ),
      },
    ),
  );
}

function mergeById(
  generated: unknown,
  manual: unknown,
  runtime: unknown,
  idField: string,
): any[] {
  return mergeByKey(
    generated,
    manual,
    runtime,
    (entry) => String(objectValue(entry)?.[idField] ?? JSON.stringify(entry)),
  );
}

function mergeByKey(
  generated: unknown,
  manual: unknown,
  runtime: unknown,
  key: (entry: unknown) => string,
): any[] {
  const merged = new Map<string, any>();
  for (const entry of [
    ...arrayValue(generated),
    ...arrayValue(manual),
    ...arrayValue(runtime),
  ]) {
    merged.set(key(entry), entry);
  }
  return Array.from(merged.values());
}

function mergeOverlayArray(
  generated: unknown,
  manual: unknown,
  runtime: unknown,
  key: (entry: unknown) => string,
): any[] {
  const result = [...arrayValue(generated)];
  for (const overlay of [
    ...arrayValue(manual),
    ...arrayValue(runtime),
  ]) {
    const overlayKey = key(overlay);
    const index = result.findIndex((entry) => key(entry) === overlayKey);
    if (index >= 0) {
      result[index] = overlay;
    } else {
      result.push(overlay);
    }
  }
  return result;
}

function mergeRecords(
  generated: unknown,
  manual: unknown,
  runtime: unknown,
  arrayFields: string[],
): Record<string, any> {
  const generatedRecord = objectValue(generated) ?? {};
  const manualRecord = objectValue(manual) ?? {};
  const runtimeRecord = objectValue(runtime) ?? {};
  const result = Object.assign(
    {},
    generatedRecord,
    manualRecord,
    runtimeRecord,
  );
  for (const field of arrayFields) {
    const values = [
      ...arrayValue(generatedRecord[field]),
      ...arrayValue(manualRecord[field]),
      ...arrayValue(runtimeRecord[field]),
    ].map(String);
    if (values.length) {
      result[field] = Array.from(new Set(values));
    }
  }
  return result;
}

function omit(
  value: Record<string, any>,
  keys: string[],
): Record<string, any> {
  const excluded = new Set(keys);
  const result: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!excluded.has(key)) {
      result[key] = entry;
    }
  }
  return result;
}

function compactObject(value: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = entry;
    }
  }
  return result;
}

function wrapKey(value: unknown): string {
  const entry = objectValue(value) ?? {};
  return JSON.stringify([
    entry.hostComponentName ?? '',
    entry.path ?? '',
    entry.componentName ?? '',
  ]);
}

function semanticComponentKey(value: unknown): string {
  const entry = objectValue(value) ?? {};
  return String(entry.key ?? entry.name ?? JSON.stringify(value));
}

function compositionEntryKey(value: unknown): string {
  return JSON.stringify(value);
}

function auditMatchKey(value: unknown): string {
  const entry = objectValue(value);
  return JSON.stringify(entry?.match ?? value);
}

function auditCategoryKey(value: unknown): string {
  const entry = objectValue(value);
  return JSON.stringify(entry?.when ?? value);
}

function arrayValue(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}
