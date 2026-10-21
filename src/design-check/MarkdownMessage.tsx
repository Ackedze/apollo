import React from 'react';
import { parseMarkdownBlocks, normalizeMarkdownSource, groupCollapsibleMarkdownSections } from "./markdown";
import { parseInlineTokens } from "./markdown-inline";

function Inline({ text, depth = 0 }: { text: string; depth?: number }): React.ReactNode {
  if (depth >= 16) return text;
  return parseInlineTokens(text).map((token: any, index: number) => {
    const content = <Inline text={token.text} depth={depth + 1} />;
    if (token.type === 'strong') return <strong className="md-strong" key={index}>{content}</strong>;
    if (token.type === 'em') return <em className="md-em" key={index}>{content}</em>;
    if (token.type === 'code') return <code className="md-code-inline" key={index}>{token.text}</code>;
    if (token.type === 'break') return <br className="md-line-break" key={index} />;
    if (token.type === 'link') return token.href
      ? <a className="md-link" href={token.href} target="_blank" rel="noopener noreferrer" key={index}>{content}</a>
      : <span className="md-reference" title={token.target} key={index}>{content}</span>;
    return <React.Fragment key={index}>{token.text}</React.Fragment>;
  });
}
function Block({ block }: { block: any }) {
  if (block.type === 'heading') {
    const tag = `h${block.depth}`;
    return <div className={`md-block md-block--h${block.depth}`}>{React.createElement(tag, { className: `md-h${block.depth}` }, <Inline text={block.text} />)}</div>;
  }
  if (block.type === 'paragraph') return <div className="md-block md-block--paragraph"><p className="md-p"><Inline text={block.text} /></p></div>;
  if (block.type === 'quote') return <div className="md-block md-block--quote"><blockquote className="md-quote"><Inline text={block.text} /></blockquote></div>;
  if (block.type === 'divider') return <div className="md-block md-block--divider"><hr className="md-divider" /></div>;
  if (block.type === 'code') return <div className="md-block md-block--code"><pre className="md-pre"><code>{block.code}</code></pre></div>;
  if (block.type === 'collapsible') return <details className="md-block md-collapsible"><summary className="md-collapsible__summary"><Inline text={block.title} /></summary>
    <div className="md-collapsible__content">{block.children.map((child: any, index: number) => <Block block={child} key={index} />)}</div></details>;
  if (block.type === 'table') return <div className="md-block md-block--table"><div className="md-table-scroll"><table className="md-table">
    <thead><tr className="md-tr">{block.headers.map((text: string, index: number) => <th className="md-th" scope="col" key={index}><Inline text={text} /></th>)}</tr></thead>
    <tbody>{block.rows.map((row: string[], index: number) => <tr className="md-tr" key={index}>{row.map((text, cell) => <td className="md-td" key={cell}><Inline text={text} /></td>)}</tr>)}</tbody>
  </table></div></div>;
  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    return <div className="md-block md-block--list">{React.createElement(tag, { className: 'md-list' }, block.items.map((text: string, index: number) => <li className="md-list-item" key={index}>
      <span className={`md-list-marker${block.ordered ? ' numbered' : ''}`} aria-hidden="true">{block.ordered ? `${index + 1}.` : '–'}</span><span className="md-list-content"><Inline text={text} /></span>
    </li>))}</div>;
  }
  return null;
}
export function MarkdownMessage({ text }: { text: string }) {
  const blocks = groupCollapsibleMarkdownSections(parseMarkdownBlocks(normalizeMarkdownSource(text)));
  return <div className="markdown-root">{blocks.map((block: any, index: number) => <Block block={block} key={index} />)}</div>;
}
