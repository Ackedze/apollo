# Security Policy

## Сообщение об уязвимости

Не создавайте публичный Issue для уязвимостей, утечки токенов, обхода permission boundary или раскрытия пользовательских данных. Используйте GitHub Security Advisory репозитория Apollo: `Security -> Advisories -> Report a vulnerability`.

В сообщении укажите затронутую версию, сценарий воспроизведения, возможное влияние и минимальное доказательство. Не прикладывайте реальные отчёты пользователей и действующие credentials.

## Поддерживаемая версия

Security fixes выпускаются для текущей опубликованной версии Apollo. Старые development builds отдельно не поддерживаются.

## Sensitive areas

Особого ревью требуют:

- `manifest.json`, permissions и network domains;
- отправка статистики и agent reports;
- GitHub/Supabase/Yandex endpoints;
- обработка Figma user, file, node и selection metadata;
- GitHub Actions и любые release credentials.

Секреты не должны находиться в plugin bundle, исходном коде, fixtures, логах и PR. Fork pull requests не получают release secrets.
