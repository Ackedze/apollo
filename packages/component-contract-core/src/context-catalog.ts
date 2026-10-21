export type ScopeChoice = { value: string; label: string; description: string };

// Product IDs already offered by the Editor, matching the ds-ai-hub product manifests.
export const PRODUCT_SCOPE_CATALOG: ScopeChoice[] = [
  { value: 'ab', label: 'Альфа-Бизнес', description: 'Product manifest: products/ab' },
  { value: 'abm', label: 'Альфа-Бизнес Мобайл', description: 'Product id: abm' },
  { value: 'am', label: 'Альфа-Мобайл', description: 'Product id: am' },
  { value: 'ao', label: 'Альфа-Онлайн', description: 'Product id: ao' },
  { value: 'site', label: 'Сайт', description: 'Product id: site' },
];
