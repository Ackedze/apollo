export type TabId =
  | 'current'
  | 'detached'
  | 'changesWip'
  | 'changes'
  | 'technical'
  | 'deprecated'
  | 'update'
  | 'themization'
  | 'wrongChannel'
  | 'presets'
  | 'local'
  | 'customStyles'
  | 'deprecatedStyles';

export type LeftSectionOrderItem =
  | TabId
  | '__divider_after_customStyles__'
  | '__divider_after_detached__';

export const tabDefinitions: TabDefinition[] = [
  {
    id: 'current',
    title: 'Актуальные компоненты',
    emptyMessage: 'Актуальных компонентов не найдено',
  },
  {
    id: 'detached',
    title: 'Детач',
    emptyMessage: 'Детачей не найдено',
    ignoreComponentFilter: true,
  },
  {
    id: 'update',
    title: 'Пора обновить',
    emptyMessage: 'Все компоненты обновлены',
  },
  {
    id: 'changesWip',
    title: 'Кастомизации [WIP]',
    emptyMessage: 'Отклонений от baseline не найдено',
    requiresScan: true,
    ignoreComponentFilter: true,
  },
  {
    id: 'changes',
    title: 'Кастомизации',
    emptyMessage: 'Кастомизации не найдены',
    requiresScan: true,
    ignoreComponentFilter: true,
  },
  {
    id: 'themization',
    title: 'Темизация',
    emptyMessage: 'Проблем темизации не обнаружено',
  },
  {
    id: 'wrongChannel',
    title: 'Не тот канал',
    emptyMessage: 'Компонентов не того канала не найдено',
  },
  {
    id: 'deprecated',
    title: 'Устаревшие',
    emptyMessage: 'Устаревшие компоненты не найдены',
  },
  {
    id: 'presets',
    title: 'Пресеты',
    emptyMessage: 'Пресетов не найдено',
  },
  {
    id: 'technical',
    title: 'Технические',
    emptyMessage: 'Технических компонентов не найдено',
  },
  {
    id: 'local',
    title: 'Локальные компоненты',
    emptyMessage: 'Все элементы связаны с библиотекой',
  },
  {
    id: 'deprecatedStyles',
    title: 'Устаревшие стили',
    emptyMessage: 'Устаревших стилей не найдено',
    ignoreComponentFilter: true,
  },
  {
    id: 'customStyles',
    title: 'Кастомные стили и токены',
    emptyMessage: 'Кастомных стилей и токенов не найдено',
    ignoreComponentFilter: true,
  },
];

export const LEFT_SECTION_ORDER: LeftSectionOrderItem[] = [
  'themization',
  'wrongChannel',
  'deprecated',
  'deprecatedStyles',
  'customStyles',
  '__divider_after_customStyles__',
  'update',
  'changesWip',
  'changes',
  'local',
  'detached',
  '__divider_after_detached__',
  'presets',
  'technical',
  'current',
];

interface TabDefinition {
  id: TabId;
  title: string;
  emptyMessage: string;
  ignoreComponentFilter?: boolean;
  requiresScan?: boolean;
}
