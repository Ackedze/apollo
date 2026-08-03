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

## Test fixtures

- Используйте минимальный JSON, достаточный для воспроизведения.
- Удаляйте имена пользователей, file keys, node URLs, тексты продукта и другие приватные данные.
- Не копируйте полные production-каталоги в `scripts/fixtures`.
- Закрепляйте ожидаемую семантику, а не случайный порядок полей или внутренние логи.

## Evidence в PR

PR должен содержать команды и результат автоматических проверок. Для UI и runtime приложите скриншот/видео. Для найденной в отчёте ошибки приложите только минимальный обезличенный fragment с actual, expected, component key и library, если эти данные допустимы к публикации.
