import React from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import type { AnswerBlock } from './controller';

const labels = { hig: 'HIG', material2: 'Material 2', material3: 'Material 3' };
const patternCaption = (text: string) => /^Паттерн: «([^»\n]+)», (v\.[\w.-]+)$/u.exec(text.split(/\n\s*\n/).at(-1) || '');
// Only a standalone, trailing footer emitted by Proxy is moved to details.
const isUsageFooter = (block: AnswerBlock) => block.kind === 'text' && !block.questionHeading
  && /^\*Токены: (?:всего [\d\s\u00a0\u202f]+ · вход [\d\s\u00a0\u202f]+(?: \(из них кеш: [\d\s\u00a0\u202f]+\))? · выход [\d\s\u00a0\u202f]+\.|агент не передал полный расход\.)\*$/u.test(block.text);

// Presentation only: keep the original question and dialogue unchanged for RAG.
function displayQuestion(value: string) {
  return value.trim().replace(/^([^\p{L}]*)(\p{L})/u, (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('ru-RU')).replace(/[?!.…]+$/u, '') + '?';
}
function displayQuestionHeading(value: string) {
  return '**' + displayQuestion(value.replace(/^\*\*([\s\S]*)\*\*$/u, '$1')) + '**';
}
function displayMissingQuestions(value: string) {
  if (!value.startsWith('**Не нашёл ответа в паттернах АБМ.')) return value;
  return value.replace(/^- (.+)$/gmu, (_match, question: string) => '- ' + displayQuestion(question));
}

function RuleText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/), last = paragraphs.at(-1) || '';
  const example = /^(?:🍏|🤖) \[Пример\]\(/u.test(last);
  return <div className="apollo-answer-rule">
    <MarkdownMessage text={example ? paragraphs.slice(0, -1).join('\n\n') : text} />
    {example && <div className="apollo-answer-examples"><MarkdownMessage text={last} /></div>}
  </div>;
}

function PatternText({ text }: { text: string }) {
  const caption = patternCaption(text);
  if (!caption) return <MarkdownMessage text={text} />;
  const paragraphs = text.split(/\n\s*\n/).slice(0, -1), rules: string[] = [];
  let pending: string[] = [];
  for (const paragraph of paragraphs) {
    pending.push(paragraph);
    if (/^(?:🍏|🤖) \[Пример\]\(/u.test(paragraph)) { rules.push(pending.join('\n\n')); pending = []; }
  }
  if (pending.length) rules.push(pending.join('\n\n'));
  return <div className="apollo-answer-pattern">
    {rules.map((rule, index) => <RuleText text={rule} key={index} />)}
    <p className="apollo-answer-source">Паттерн: <span>«{caption[1]}», {caption[2]}</span></p>
  </div>;
}

function GuideText({ text }: { text: string }) {
  const groups: { text: string; caption: string }[] = [];
  let pending: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (/^Гайд: (?:HIG|Material 2|Material 3) — /u.test(paragraph)) {
      groups.push({ text: pending.join('\n\n'), caption: paragraph.replace(/^Гайд: (?:HIG|Material 2|Material 3) — /u, '') });
      pending = [];
    } else pending.push(paragraph);
  }
  if (!groups.length) return <MarkdownMessage text={text} />;
  return <>{groups.map((group, index) => <div className="apollo-guide-recommendations__document" key={index}>
    <MarkdownMessage text={group.text} />
    <div className="apollo-guide-recommendations__source"><MarkdownMessage text={group.caption} />{group.caption.includes('](https://') && <span aria-hidden="true">↗</span>}</div>
  </div>)}{pending.length > 0 && <MarkdownMessage text={pending.join('\n\n')} />}</>;
}

export function AssistantAnswer({ text, blocks, provenance }: { text: string; blocks?: AnswerBlock[]; provenance?: React.ReactNode }) {
  const usage = blocks?.length && isUsageFooter(blocks[blocks.length - 1]) ? blocks[blocks.length - 1].text : null;
  const content = usage ? blocks!.slice(0, -1) : blocks;
  const guides = (content || []).filter((block): block is Extract<AnswerBlock, { kind: 'guide' }> => block.kind === 'guide');
  const families = Array.from(new Set(guides.map(block => labels[block.family])));
  return <div className="apollo-answer-blocks">
    {!content ? <MarkdownMessage text={text} /> : content.map((block, index) => {
      if (block.kind !== 'text') return null;
      if (block.questionHeading) {
        const nextHeading = content.findIndex((item, next) => next > index && item.kind === 'text' && item.questionHeading);
        const scope = content.slice(index + 1, nextHeading < 0 ? undefined : nextHeading);
        if (!scope.some(item => item.kind === 'text' && !item.questionHeading)) return null;
        return <div className="apollo-answer-question" key={index}><MarkdownMessage text={displayQuestionHeading(block.text)} /></div>;
      }
      return <PatternText text={displayMissingQuestions(block.text)} key={index} />;
    })}
    {guides.length > 0 && <details className="apollo-guide-recommendations">
      <summary className="apollo-guide-recommendations__summary">
        <svg className="apollo-guide-recommendations__icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 5.5C7 4 9 4 12 6c3-2 5-2 8-.5V19c-3-1.5-5-1.5-8 .5-3-2-5-2-8-.5z" /><path d="M12 6v13" /></svg>
        <span className="apollo-guide-recommendations__heading">
          <span className="apollo-guide-recommendations__title">Рекомендации гайдов</span>
          <span className="apollo-guide-recommendations__families">{families.join(' · ')}</span>
        </span>
        <span className="apollo-guide-recommendations__chevron" aria-hidden="true" />
      </summary>
      <div className="apollo-guide-recommendations__content">{guides.map((block, index) => <div className="apollo-guide-recommendations__item" key={index}>
        {block.question && block.question !== guides[index - 1]?.question && <p className="apollo-guide-recommendations__question"><strong>{displayQuestion(block.question)}</strong></p>}
        <h4 className="apollo-guide-recommendations__family">{labels[block.family]}</h4>
        <GuideText text={block.text} />
      </div>)}</div>
    </details>}
    {(provenance || usage) && <details className="apollo-answer-details">
      <summary>Детали ответа <span aria-hidden="true">⌄</span></summary>
      <div className="apollo-answer-details__content">{usage && <MarkdownMessage text={usage} />}{provenance}</div>
    </details>}
  </div>;
}
