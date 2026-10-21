# Apollo: агентская работа с Figma

Вход — тот же ScreenVersion, pinned current manual и Figma mapping, конкретная laboratory destination, фактически разрешённые capabilities. Первый interface v1 readonly: только read_document_context/read_owned_scope. acceptedWriteOperations=[] и Ready=false.

1. Прочитай контракты, mappings, применимые нормы и существующие source receipts. Сохрани список источников; preferredValues и локальный node ID не превращай в закрытые нормы/canonical identity.
2. Запроси разрешённый read через Apollo broker с runId/envelopeHash/callId/sequence. Не читай весь документ, не импортируй definition и не создавай instance за readonly handshake.
3. Используй полученный observation в следующем агентском шаге; укажи evidenceHash и coverage/epoch limitations. Собственный текст не выдавай за PluginAPI facts.
4. Для будущей сборки выбери source-bound DS components, properties и SLOT операции. Запись возможна только после отдельного принятого capability/ownership admission. Source-owned FRAME нельзя удалять или классифицировать по имени.
5. Проверь readback по spec и нормам, исправляй только свою принятую transaction. Stale/cancel прекращает цикл; rollback касается только созданного scope. v1 не содержит этих write capabilities.
6. Верни actual observations и точные gaps: native correspondence, FRAME role, overflow/readback/rollback/white может оставаться UNKNOWN. Незавершённый контракт разрешён для тестового анализа, не для скрытого обхода safety/source gates.
