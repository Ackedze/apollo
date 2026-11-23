export const deprecatedStyleSourceFiles = [
  'styles/010 _ Colors Indigo Light.json',
  'styles/011 _ Colors Indigo Dark.json',
  'styles/012 _ Colors Indigo Static.json',
  'styles/020 _ Colors BlueTint Light.json',
  'styles/022 _ Colors BlueTint Static.json',
] as const;

export const deprecatedStyleSourceFileSet = new Set<string>(
  deprecatedStyleSourceFiles,
);
