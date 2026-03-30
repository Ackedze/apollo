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
    id: 'changes',
    title: 'Кастомизации',
    emptyMessage: 'Кастомизации не найдены',
    requiresScan: true,
    ignoreComponentFilter: true,
  },
  {
    id: 'deprecated',
    title: 'Устаревшие',
    emptyMessage: 'Устаревшие компоненты не найдены',
  },
  {
    id: 'update',
    title: 'Пора обновить',
    emptyMessage: 'Все компоненты обновлены',
  },
  {
    id: 'themization',
    title: 'Темизация',
    emptyMessage: 'Проблем темизации не обнаружено',
  },
  {
    id: 'presets',
    title: 'Пресеты',
    emptyMessage: 'Пресетов не найдено',
  },
  {
    id: 'local',
    title: 'Локальные компоненты',
    emptyMessage: 'Все элементы связаны с библиотекой',
  },
  {
    id: 'customStyles',
    title: 'Кастомные стили',
    emptyMessage: 'Кастомных стилей не найдено',
    ignoreComponentFilter: true,
  },
];

type TabId =
  | 'current'
  | 'detached'
  | 'changes'
  | 'deprecated'
  | 'update'
  | 'themization'
  | 'presets'
  | 'local'
  | 'customStyles';

interface TabDefinition {
  id: TabId;
  title: string;
  emptyMessage: string;
  ignoreComponentFilter?: boolean;
  requiresScan?: boolean;
}
