export const tabDefinitions: TabDefinition[] = [
  {
    id: 'current',
    title: 'Актуальные компоненты',
    emptyMessage: 'Актуальных компонентов не найдено',
    builder: 'audit',
  },
  {
    id: 'detached',
    title: 'Детач',
    emptyMessage: 'Детачей не найдено',
    builder: 'detached',
    ignoreComponentFilter: true,
  },
  {
    id: 'changes',
    title: 'Кастомизация',
    emptyMessage: 'Кастомизации не найдены',
    builder: 'changes',
    requiresScan: true,
    ignoreComponentFilter: true,
  },
  {
    id: 'deprecated',
    title: 'Устаревшие',
    emptyMessage: 'Устаревшие компоненты не найдены',
    builder: 'audit',
  },
  {
    id: 'update',
    title: 'Пора обновить',
    emptyMessage: 'Все компоненты обновлены',
    builder: 'audit',
  },
  {
    id: 'themeError',
    title: 'Ошибки темизации',
    emptyMessage: 'Ошибок темизации не обнаружено',
    builder: 'audit',
  },
  {
    id: 'presets',
    title: 'Пресеты',
    emptyMessage: 'Пресетов не найдено',
    builder: 'preset',
  },
  {
    id: 'local',
    title: 'Локальные',
    emptyMessage: 'Все элементы связаны с библиотекой',
    builder: 'audit',
  },
  {
    id: 'customStyles',
    title: 'Кастомные стили',
    emptyMessage: 'Кастомных стилей не найдено',
    builder: 'customStyles',
    ignoreComponentFilter: true,
  },
];

type TabId =
  | 'current'
  | 'detached'
  | 'changes'
  | 'deprecated'
  | 'update'
  | 'themeError'
  | 'presets'
  | 'local'
  | 'customStyles';

type TabBuilderKey =
  | 'audit'
  | 'changes'
  | 'customStyles'
  | 'textEntry'
  | 'detached'
  | 'preset';

interface TabDefinition {
  id: TabId;
  title: string;
  emptyMessage: string;
  builder: TabBuilderKey;
  ignoreComponentFilter?: boolean;
  requiresScan?: boolean;
}
