# Тестирование Apollo

## Обязательная локальная проверка

```bash
npm ci
npm run validate
```

`validate` последовательно выполняет TypeScript type-check, production build, проверку совместимости с Figma runtime и все `scripts/test-*.js` regression-тесты.

После любого изменения Apollo должен быть пересобран. Перед публикацией используется чистая установка зависимостей через `npm ci`.

## Требования по типу изменения

| Изменение | Автоматическая проверка | Ручная проверка |
| --- | --- | --- |
| Bug fix | Regression fixture, воспроизводящий ошибку | Исходный Figma-кейс |
| UI | Тест bridge/state, если меняется логика | Скриншот или видео до/после, expanded/collapsed states |
| Audit/diff | Positive и negative fixture | Проверка standalone и nested/slot context |
| Reference/index | Manifest/index failure и lazy-loading tests | Console evidence: загружены только необходимые каталоги |
| Reset | Тест remediation payload | Повторная проверка после reset не показывает нарушение |
| Stats | Schema/serialization test | Обезличенный локальный отчёт без лишних данных |
| Agent | Request isolation и response-state tests | Отчёт и диалог проверены раздельно |
| Manifest/network | Runtime check | Endpoint failure, permission и privacy scenarios |

## Минимальная матрица Figma

Для изменения audit semantics проверьте:

1. Standalone instance без кастомизации.
2. Standalone instance с ручным изменением.
3. Nested instance с expected host override.
4. Nested instance с ручным изменением поверх expected override.
5. Slot или variant switch внутри component family.
6. Reset и повторную проверку.
7. Повторный аудит того же selection без изменения результата.

Если сценарий неприменим, укажите причину в PR.

## P0 rollout acceptance

После публикации нового bootstrap/config выполните один полевой прогон в Figma:

1. `Status / 🔩 Label / Label` с `Uppercase=True` отсутствует в `Кастомные стили и токены`, а самостоятельный raw `Label` остаётся finding.
2. Один локальный компонент, проверенный как instance и как detached content, даёт одинаковые `8` update-findings и `24` current components.
3. Каждая карточка `Пора обновить` фокусирует реальный source node без ошибки страницы.
4. Native library update сохраняет component properties и пользовательские overrides.
5. Update внутри local owner применяется к source dependency и исчезает после повторного аудита.
6. Action из старой карточки отклоняется после ручного изменения target node и не перезаписывает новое значение.

Результат считается принятым только после повторного аудита без дубликатов между `Пора обновить` и `Актуальные компоненты`.

## Test fixtures

- Используйте минимальный JSON, достаточный для воспроизведения.
- Удаляйте имена пользователей, file keys, node URLs, тексты продукта и другие приватные данные.
- Не копируйте полные production-каталоги в `scripts/fixtures`.
- Закрепляйте ожидаемую семантику, а не случайный порядок полей или внутренние логи.

## Evidence в PR

PR должен содержать команды и результат автоматических проверок. Для UI и runtime приложите скриншот/видео. Для найденной в отчёте ошибки приложите только минимальный обезличенный fragment с actual, expected, component key и library, если эти данные допустимы к публикации.
