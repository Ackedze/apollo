# Текущий interface-v7 / MAP-02

Это конечный engineering profile текущего adapter. Его рабочий допуск задаёт
текущий provider и независимая приёмка; наличие этого файла не подключает route.
Readonly лаборатория и owned generation — разные профили, входы не смешиваются.

Подтверждённые choices: CC desktop, BG size56 Overflow=false/true, desktop
OptionList и Cell. Внутренний Plain profile CellContent не отдельный декоративный
компонент. Исполнитель импортирует точный published key и создаёт экземпляр
штатным createInstance сразу в конечном родителе, до чтения потомков.
Перед записью проверяются актуальность источника, фактические типы свойств и
единственные native TEXT/SLOT references. Catalog-only свойства, не используемые
рецептом, не являются обязательными портами. Независимые pristine экземпляры
не создаются. Фактические main identities всего результата проверяются в финальном
check_scope; Unknown ключа, типа или reference блокирует зависимую запись.

CC body разрешается как SLOT. Заменяется только собственный default payload
нового экземпляра. BG button.1..4.label/visible — подтверждённые порты; четвёртый
occurrence в Overflow=true — SingleIcon trigger, ему не присваивается action
label. Не меняй BG Auto Layout, иконки, business priority, disabled/loading и
не detach экземпляры. Сохраняй исходную структуру компонента.

В текущем 5+2 reference пять действий распределяются как три inline и два Cell
в статичном overflow list; trigger не действие. Два действия второй группы
остаются inline. Это описание данного reference, не универсальный шаблон любого
ScreenSpec. Сохрани все logical IDs и порядок зафиксированного задания.
Overflow=false с пятью действиями противоречит текущей возможности: верни gap,
не включай Overflow=true молча и не обрезай коллекцию.

Связывай list с overflow-<groupId> внутри собственного overflow-host-<groupId>.
Собственные root/host scaffolds собирай через set_layout, чтобы статичный список
был виден целиком, помещался в экран и не перекрывал текст действий. Проверяй
размеры через read_tree и изображение; одного структурного PASS недостаточно.
Body списка append-only: сохрани полный default Scrollbar subtree. Cell
content.plain пишет только фиксированный source profile; content.label разрешает
единственный реальный TEXT reference, не cached IDs/имена. Figma показывает
статичную композицию; frontend click/focus не доказывает Figma prototypes.

check_scope возвращает observation.v3 с version/source hashes и фактическими
TEXT/semantic bindings. validatePostconditions проверяет поддержанные labels,
IDs, Body, overflow, order, background, viewport и gap точного ScreenVersion.
Header/Footer, полное manual-покрытие, интерактивность и native-live этим не
принимаются. Эти ограничения нужно включить в eval и результат.

После последних операций, включая export_png и focus_result, выполни финальный check_scope текущего owned root. Перед finish последнее наблюдение должно иметь прошедший native-readback и прошедшие version postconditions, привязанные к его evidenceHash и текущим ScreenVersion, identity, lease и source. Если после PASS появились новые операции или наблюдение, проверь scope заново; прежний PASS не завершает текущий шаг. Сохрани все предыдущие failed/unknown проверки и их hashes в истории.

Private candidate требует exact patch review, working apply, fresh physical
consumer inventory и полной штатной проверки v4. Исторический SDK/seal не
перезаписывается после изменения источников. Реальный пользовательский native
запуск и synthetic проверки отмечаются раздельно; Ready=false.
