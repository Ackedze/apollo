# Apollo: агентская сборка фронта

Вход — immutable ScreenVersion с исходным запросом и уточнениями, актуальные manual-контракты и target-specific mappings. Это engineering-test; Draft и UNKNOWN не означают Ready.

1. Прочитай закреплённые контракты и public API используемых реализаций, включая зависимости. Сохрани список прочитанных источников. Правила компонентов бери из manual, не из старого скилла.
2. Выбери композицию по ScreenSpec. Сохрани logical node/action IDs и порядок. Page background — семантика экрана; не выдумывай prop компонента ради фона страницы.
3. Собери React-файлы в назначенном output workspace обычными средствами IDE. Переиспользуй существующий public DS, toolchain и зависимости. Не изменяй DS, Proxy, чужой проект или source contracts. Не вызывай fixed renderer целого экрана.
4. Для behavior:none не создавай onClick/no-op/eventId, не выставляй disabled без требования. Внутреннее поведение overflow остаётся библиотечным. Все действия, включая скрытые, сохраняются.
5. Выполни реальные build/type checks и browser readback на viewport из spec. Сверь состав, подписи, порядок, размеры, интервалы, фон, overflow, клавиатуру и focus. Build PASS не равен соблюдению всех контрактов.
6. При фактическом расхождении исправь собственные файлы и повтори затронутые проверки. Не меняй spec ради PASS. Недоступные факты и нормы оставь UNKNOWN с точной причиной.
7. Верни files/artifact pins, реальные tool observations, check status и gaps. Отдельно пометь agent-report, synthetic и фактически полученные результаты. CLI exit0 не доказывает готовый экран.

Для проверяемой provenance передай logical row ID через библиотечный dataTestId, action.id в elements[].id и dataTestId. Переиспользуй source/API helper src/bindings.ts, если он подготовлен рабочей средой: это маппинг данных, не генератор экрана. Свой App.tsx собирай самостоятельно; он экспортирует App, main.tsx уже подготовлен. Публичные React code props бери из targetMapping, semantic типы — из manual. Для указанного default56 binding сохраняет семь IDs и library overflow; фон задаётся task-owned страницей, без protected baseline override CC.
