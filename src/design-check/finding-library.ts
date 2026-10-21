export function knownLibrary(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  const name = value.trim();
  return name && name !== 'Unknown library' ? name : null;
}

export function componentLibrary(audit: any, scopeId: string): string | null {
  const matches = (audit?.components || []).filter((component: any) => component.scopeId === scopeId);
  return matches.length === 1 ? knownLibrary(matches[0].library) : null;
}

export function documentFindingLibrary(audit: any, finding: { componentKey?: string | null; occurrences: string[] }): string | null {
  // Match captured identities; a layer name or proposed binding proves no component origin.
  const matches = (audit?.components || []).filter((component: any) => finding.componentKey
    ? component.snapshot?.source?.componentKey === finding.componentKey
    : finding.occurrences.includes(component.scopeId));
  const libraries = matches.map((component: any) => knownLibrary(component.library));
  return libraries.length && libraries.every(Boolean) && new Set(libraries).size === 1 ? libraries[0] : null;
}
