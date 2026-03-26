# Apollo Migration

## Статус
- Плагин локально переименован в `Apollo`.
- `manifest.id` сохранён без изменений.
- Локальный `origin` переведён на `https://github.com/Ackedze/apollo.git`.
- GitHub Pages для Apollo доступен по `https://ackedze.github.io/apollo/`.
- Runtime использует финальный URL `https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json`.
- Legacy fallback на `nemesis-mvp` из runtime и служебных скриптов удалён.

## Финальная схема данных
- Публичный reference-список: `https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json`
- Локальный каталог данных в репозитории: [`JSON`](./JSON)
- Локальный cache для fallback: [`src/reference/referenceSources.json`](./src/reference/referenceSources.json)

## Что уже завершено
- Обновлено отображаемое имя плагина в [`manifest.json`](./manifest.json).
- Обновлён runtime URL в [`src/reference/referenceList.ts`](./src/reference/referenceList.ts).
- Упрощена загрузка справочников в [`src/reference/library.ts`](./src/reference/library.ts): теперь Apollo Pages → local cache.
- Обновлён служебный скрипт [`scripts/prepareReferences.js`](./scripts/prepareReferences.js).
- Локальные reference-артефакты переведены в [`JSON`](./JSON).

## Что ещё можно сделать при желании
1. Переименовать локальную папку проекта `Nemesis-mvp` в `Apollo` или `apollo`.
2. Удалить старую папку `JSONS-MVP`, если она больше не нужна как архив.
3. Обновить `AUDIT.md`, если нужен полностью актуальный технический отчёт уже без переходного контекста.

## Проверка
```bash
npm run build
curl -I -L --max-time 20 https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json
```

Ожидаемый результат:
- сборка завершается успешно;
- URL справочника отвечает `HTTP 200`.

## Что по-прежнему нельзя делать
- Нельзя менять `manifest.id`, если вы хотите сохранить обновление того же Figma-плагина.
