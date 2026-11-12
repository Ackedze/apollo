import React from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import type { AnswerBlock } from './controller';

const labels = { hig: 'HIG', material2: 'Material 2', material3: 'Material 3' };

export function AssistantAnswer({ text, blocks }: { text: string; blocks?: AnswerBlock[] }) {
  if (!blocks?.length) return <MarkdownMessage text={text} />;
  const guides = blocks.filter((block): block is Extract<AnswerBlock, { kind: 'guide' }> => block.kind === 'guide');
  const families = Array.from(new Set(guides.map(block => labels[block.family])));
  return <div className="apollo-answer-blocks">
    {blocks.map((block, index) => {
      if (block.kind !== 'text') return null;
      if (block.questionHeading) {
        // A question answered only by guides is labelled inside the disclosure.
        const nextHeading = blocks.findIndex((item, next) => next > index && item.kind === 'text' && item.questionHeading);
        const scope = blocks.slice(index + 1, nextHeading < 0 ? undefined : nextHeading);
        if (!scope.some(item => item.kind === 'text' && !item.questionHeading)) return null;
      }
      return <MarkdownMessage text={block.text} key={index} />;
    })}
    {guides.length > 0 && <details className="apollo-guide-recommendations">
      <summary className="apollo-guide-recommendations__summary">
        <span className="apollo-guide-recommendations__heading">
          <span className="apollo-guide-recommendations__title">Рекомендации гайдов</span>
          <span className="apollo-guide-recommendations__families">{families.join(' · ')}</span>
        </span>
        <span className="apollo-guide-recommendations__chevron" aria-hidden="true" />
      </summary>
      <div className="apollo-guide-recommendations__content">{guides.map((block, index) => <div key={index}>
        {block.question && block.question !== guides[index - 1]?.question && <p className="apollo-guide-recommendations__question"><strong>{block.question}</strong></p>}
        <h4 className="apollo-guide-recommendations__family">{labels[block.family]}</h4>
        <MarkdownMessage text={block.text} />
      </div>)}</div>
    </details>}
  </div>;
}
