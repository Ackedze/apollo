# Переход на основной Apollo

Реализация Apollo v4 перенесена из Apollo-v3/apps/apollo-v4 прямо в projects/Apollo. Вложенной apps-папки нет. Прежний Apollo сохранён в Git; исходный checkout и локальная резервная копия остаются историческими материалами. ID публикации 1616850453760090547 сохранён.

Proxy использует dist/runtime.cjs, scripts/, src/ и packages/ относительно APOLLO_PROJECT_ROOT. Текущие серверные модули — src/contracts и src/generation-agent. Новые запросы не содержат /v4; прежние /v4/* обслуживаются теми же handlers через совместимый middleware. APOLLO_V4_* остаются fallback для прежних конфигураций.

Схемы данных, error codes, targetProduct принятого Code Connect registry, build documentType и storage keys сохранены как технические идентификаторы совместимости. Это не название продукта. Native source packets сохраняют историческое происхождение и exact hashes. Нормы, версии Core/Editor и Ready-статусы не изменяются.

Figma clientStorage разделяется по plugin ID. Локальные чаты отдельного пилота с другим ID автоматически прочитать нельзя; прежние storage keys не удаляются. История серверных запусков Proxy сохраняется в прежних host roots.

Публикация Figma и push не выполнялись. Новый запуск проверяется после импорта корневого manifest. Ранее переданный дизайнеру standalone Proxy ZIP сохраняется неизменным.
