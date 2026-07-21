import React, { useEffect, useId, useRef, useState } from 'react';
import type { GenerationExampleCaptureRequest } from '../types';
import styles from './GenerationExampleModal.module.css';

type GenerationExampleModalProps = {
  initialPlatform: GenerationExampleCaptureRequest['platform'];
  disabled?: boolean;
  onClose: () => void;
  onSubmit: (request: GenerationExampleCaptureRequest) => void;
};

const CYRILLIC_SLUG_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

export function GenerationExampleModal({
  initialPlatform,
  disabled = false,
  onClose,
  onSubmit,
}: GenerationExampleModalProps): React.JSX.Element {
  const dialogTitleId = useId();
  const titleInputId = useId();
  const exampleIdInputId = useId();
  const exampleSetIdInputId = useId();
  const breakpointInputId = useId();
  const sourceFigmaUrlInputId = useId();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [exampleId, setExampleId] = useState('');
  const [exampleIdEdited, setExampleIdEdited] = useState(false);
  const [exampleSetId, setExampleSetId] = useState('');
  const [breakpointLabel, setBreakpointLabel] = useState('');
  const [pageType, setPageType] =
    useState<GenerationExampleCaptureRequest['pageType']>('other');
  const [platform, setPlatform] =
    useState<GenerationExampleCaptureRequest['platform']>(initialPlatform);
  const [exampleKind, setExampleKind] =
    useState<GenerationExampleCaptureRequest['exampleKind']>('golden');
  const [includeTextContent, setIncludeTextContent] = useState(false);
  const [sourceFigmaUrl, setSourceFigmaUrl] = useState(
    getDefaultFigmaSourceUrl,
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => titleInputRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const normalizedExampleId = normalizeExampleId(exampleId);
  const canSubmit =
    !disabled && Boolean(title.trim()) && Boolean(normalizedExampleId);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <form
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            exampleId: normalizedExampleId,
            exampleSetId: normalizeOptionalId(exampleSetId),
            breakpointLabel: breakpointLabel.trim() || null,
            title: title.trim(),
            pageType,
            platform,
            exampleKind,
            includeTextContent,
            sourceFigmaUrl: sourceFigmaUrl.trim() || null,
          });
          onClose();
        }}
      >
        <div className={styles.header}>
          <div>
            <h2 id={dialogTitleId} className={styles.title}>Подготовить пример</h2>
            <p className={styles.subtitle}>
              Apollo соберёт runtime-кандидат из одного выделенного фрейма.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className={styles.fields}>
          <label className={styles.field} htmlFor={titleInputId}>
            <span className={styles.label}>Название примера</span>
            <input
              ref={titleInputRef}
              id={titleInputId}
              className={styles.input}
              value={title}
              placeholder="Форма создания платежа"
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!exampleIdEdited) setExampleId(slugify(nextTitle));
              }}
            />
          </label>

          <label className={styles.field} htmlFor={exampleIdInputId}>
            <span className={styles.label}>ID примера</span>
            <input
              id={exampleIdInputId}
              className={styles.input}
              value={exampleId}
              placeholder="payment-create-form"
              spellCheck={false}
              onChange={(event) => {
                setExampleIdEdited(true);
                setExampleId(normalizeExampleId(event.target.value));
              }}
            />
            <span className={styles.hint}>
              Строчные латинские буквы, цифры, точки и дефисы.
            </span>
          </label>

          <div className={styles.grid}>
            <label className={styles.field} htmlFor={exampleSetIdInputId}>
              <span className={styles.label}>Группа примеров</span>
              <input
                id={exampleSetIdInputId}
                className={styles.input}
                value={exampleSetId}
                placeholder="alfa-komandirovki"
                spellCheck={false}
                onChange={(event) =>
                  setExampleSetId(normalizeExampleId(event.target.value))
                }
              />
              <span className={styles.hint}>Один ID для responsive-вариантов.</span>
            </label>

            <label className={styles.field} htmlFor={breakpointInputId}>
              <span className={styles.label}>Брейкпоинт</span>
              <input
                id={breakpointInputId}
                className={styles.input}
                value={breakpointLabel}
                placeholder="1600 или desktop-wide"
                onChange={(event) => setBreakpointLabel(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Тип страницы</span>
              <select
                className={styles.select}
                value={pageType}
                onChange={(event) =>
                  setPageType(
                    event.target.value as GenerationExampleCaptureRequest['pageType'],
                  )
                }
              >
                <option value="other">Другое</option>
                <option value="form">Форма</option>
                <option value="landing">Лендинг</option>
                <option value="data-list">Список данных</option>
                <option value="details">Детальная страница</option>
                <option value="status-screen">Статусный экран</option>
                <option value="dashboard">Дашборд</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Платформа</span>
              <select
                className={styles.select}
                value={platform}
                onChange={(event) =>
                  setPlatform(
                    event.target.value as GenerationExampleCaptureRequest['platform'],
                  )
                }
              >
                <option value="desktop">Desktop</option>
                <option value="mobile-web">Mobile Web</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Роль примера</span>
            <select
              className={styles.select}
              value={exampleKind}
              onChange={(event) =>
                setExampleKind(
                  event.target.value as GenerationExampleCaptureRequest['exampleKind'],
                )
              }
            >
              <option value="golden">Эталонный</option>
              <option value="variant">Допустимый вариант</option>
              <option value="anti-example">Антипример</option>
            </select>
          </label>

          <label className={styles.field} htmlFor={sourceFigmaUrlInputId}>
            <span className={styles.label}>Ссылка на исходник Figma</span>
            <input
              id={sourceFigmaUrlInputId}
              className={styles.input}
              value={sourceFigmaUrl}
              placeholder="https://www.figma.com/design/..."
              spellCheck={false}
              onChange={(event) => setSourceFigmaUrl(event.target.value)}
            />
            <span className={styles.hint}>
              Нужна, если Figma API не возвращает fileKey.
            </span>
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includeTextContent}
              onChange={(event) => setIncludeTextContent(event.target.checked)}
            />
            <span>
              Включить текстовое содержимое
              <small>
                По умолчанию выключено, чтобы не экспортировать продуктовые данные.
              </small>
            </span>
          </label>
        </div>

        <div className={styles.notice}>
          Результат остаётся runtime-кандидатом. Apollo не изменяет manual-файлы и
          не подтверждает пример автоматически.
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
            Собрать JSON
          </button>
        </div>
      </form>
    </div>
  );
}

function slugify(value: string): string {
  const transliterated = Array.from(value.toLowerCase())
    .map((character) => CYRILLIC_SLUG_MAP[character] ?? character)
    .join('');
  return normalizeExampleId(transliterated);
}

function normalizeExampleId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/[.-]{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function normalizeOptionalId(value: string): string | null {
  const normalized = normalizeExampleId(value);
  return normalized || null;
}

function getDefaultFigmaSourceUrl(): string {
  const referrer = document.referrer || '';
  return /^https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\//i.test(
    referrer,
  )
    ? referrer
    : '';
}
