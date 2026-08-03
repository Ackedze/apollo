# Apollo Review Policy

## Цель

Ревью Apollo проверяет пользовательское поведение, корректность аудита и безопасность данных. Читаемость кода важна, но не заменяет доказательство того, что плагин сравнивает правильный actual context с правильным reference context.

## Уровни риска

| Уровень | Область | Требование |
| --- | --- | --- |
| R0 | Документация, шаблоны, комментарии без изменения runtime | 1 approval |
| R1 | Изолированный UI, стили, developer tooling без изменения audit semantics | 1 approval и Figma evidence для UI |
| R2 | Audit classification, snapshot/diff, assessment, filters, policies, reference loading, contracts, stats, Agent | 1 актуальный trusted approval от code owner |
| R3 | Manifest permissions/domains, network transport, dependencies, workflows, build/release и privacy boundary | 1 актуальный trusted approval от code owner и явная security-проверка |

Workflow `Review policy` вычисляет риск по изменённым путям. Approval считается актуальным, только если он относится к текущему head commit PR и оставлен участником с `write`, `maintain` или `admin` permission. Более строгая классификация имеет приоритет.

Сейчас Apollo работает в single-maintainer mode: для любого уровня риска требуется один актуальный trusted approval. После назначения второго независимого maintainer с `write`, `maintain` или `admin` требование для R2/R3 должно быть возвращено к двум approvals; до этого порог `2` делает policy технически невыполнимой и вынуждает использовать admin bypass.

## Проверка автором

- Проблема воспроизводится до изменения и исчезает после него.
- Regression-тест проверяет наблюдаемое поведение, а не детали реализации.
- Новый код не возвращает удалённые fallback-пути и не инициирует загрузку всех каталогов.
- Ошибка reference/index/contract не превращается в молчаливый успех.
- UI не вводит пользователя в заблуждение относительно actual, expected, violation и reset action.
- Статистика не содержит лишние тексты макета, токены или персональные данные.
- Изменение не добавляет секреты и не расширяет network permissions без обоснования.
- README и тестовая документация соответствуют новому поведению.

## Проверка ревьюером

### Корректность

- Определён source of truth для expected значения.
- Nested variants, slots и host-controlled overrides не сравниваются со standalone baseline без доказательства.
- Reset восстанавливает семантическое свойство или binding, а не имитирует результат визуальной перекраской.
- Новая suppression/allowlist-логика не скрывает независимую ручную кастомизацию.
- Поведение сохраняется при повторном запуске проверки и lazy loading каталогов.

### Архитектура

- Изменение находится в правильном модуле и не расширяет `src/code.ts` без необходимости.
- Типы и нормализация отделены от Figma runtime side effects.
- Правила, которые должны обновляться без сборки Apollo, остаются во внешнем декларативном слое.
- Новые cross-repo контракты версионированы и имеют migration/failure policy.

### Проверки

- `npm run validate` проходит локально и в GitHub Actions.
- Для UI приложено состояние до/после в Figma.
- Для audit logic приложен минимальный fixture или обезличенный отчёт.
- Для R3 описаны threat model, новые данные, endpoint и поведение при отказе.

## Решение по PR

- `Approve`: поведение доказано, риски покрыты.
- `Request changes`: есть ошибка, недоказанное поведение, нарушение privacy/security или отсутствует regression coverage.
- `Comment`: необязательное улучшение, не блокирующее корректность.

Maintainer может закрыть PR без merge, если scope не согласован, автор не может объяснить AI-generated изменение, PR раскрывает приватные данные или требует полной переписи вместо минимального исправления.
