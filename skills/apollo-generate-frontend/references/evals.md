# Eval каждого прохода генерации

Используй новый durable directory в разрешённой области; храни небольшие
snapshots/patches и pins, без копии репозитория и node_modules.

Сохрани input.json с запросом, ScreenVersion, source/mapping pins, доступными
capabilities и evidence kind; skill-snapshot с точными SKILL.md/required
references; результат агента, actual observations/checks, screenshot/target,
eval.json и lessons.json. После последней проверки закрой outputs seal-ом.
Старые входы, результаты и expectations не переписывай.

В eval.json укажи runId/caseId, skill version и pins, input/version hashes,
target, synthetic/browser/native-live статус, автора и независимость reviewer.
Для критериев используй PASS/FAIL/PARTIAL/BLOCKED/NOT_RUN с конкретным evidence:

- fidelity: состав, ID, тексты, порядок, props/slots, состояния и поведение spec;
- source/API: реальные контрактные нормы, exports и выбранный mapping;
- execution: фактические файлы/сборка/DOM либо native дерево, не только отчёт;
- checks: какие условия/RuleID исполнялись, actual verdict и какие не покрыты;
- repair: сохранённый первый failed результат, исправление и повторная проверка;
- history/cancel: фактически проверенная сохранность и остановка, если применимо;
- honesty: неподдержанное и UNKNOWN не выданы за PASS/Ready.

Блокирующий missing input отличается от неверного решения агента. Техническая
ошибка и визуальное суждение сохраняются отдельно. Один сборочный PASS не
закрывает нормативные критерии. False Ready, подмена spec, потеря действий или
выдуманные evidence — FAIL независимо от среднего балла. Без независимого
reviewer пометь independent=false; повторное чтение автором не independent.

Для независимого forward eval автор получает skill/raw inputs/request, но не
private expected answer/rubric или старые выводы reviewer. Пользовательские
native действия нельзя заменять synthetic. Перед оценкой проверь применимость
текущего checker: пропущенное условие — gap, а не успешно пройденный тест.

После каждого прохода добавь запись результата в evals/registry.json либо в
связанный runtime index вне pinned skill; не мутируй запущенную skill версию.
Ошибка становится lesson с фактом/evidence, причиной или «не установлена»,
последствиями, исправлением, защитой, владельцем и проверкой. Процессные случаи
свяжи с APOLLO_PROCESS_LESSONS.md, сохраняя закрытые исторические snapshots.

Классифицируй причину: skill decision, input/mapping gap, validator/runtime,
source conflict, process. Исправь именно это место. Правка инструкции требует
новой версии и first-failure → after-fix replay плюс затронутые regression/forward
кейсы. Если ошибка не воспроизведена или причина неизвестна, сохрани candidate
изменение и gap. Не редактируй скилл автоматически после каждого успеха/ошибки.
