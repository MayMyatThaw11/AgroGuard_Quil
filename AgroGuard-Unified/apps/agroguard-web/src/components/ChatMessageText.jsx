import React from 'react';

// Renders an AI chat reply as tidy paragraphs, section titles and bullet lists.
// The model answers in Markdown; this turns the common parts of it (headings,
// **bold**, numbered sections, bullets, simple tables) into real elements and
// drops the leftover symbols, so farmers never see raw ###, **, --- or |.
// Built from React elements only, never injected HTML.

const RULE = /^\s*([-*_=]\s*){3,}$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const BULLET = /^\s*[-*•+]\s+(.*)$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;

function cleanInline(text) {
  return text
    .replace(/`+/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
    .replace(/^#+\s*/, '')
    .trim();
}

// Splits **bold** / __bold__ into <strong>; any unpaired markers are removed.
function renderInline(text, keyPrefix) {
  const parts = cleanInline(text).split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  return parts
    .filter(Boolean)
    .map((part, i) => {
      const bold = part.match(/^(\*\*|__)(.+)\1$/);
      if (bold) return <strong key={`${keyPrefix}-${i}`}>{bold[2]}</strong>;
      return part.replace(/\*{1,2}|(^|\s)_{1,2}|_{1,2}(\s|$)/g, '$1$2');
    });
}

function tableCells(line) {
  return line.match(TABLE_ROW)[1].split('|').map((c) => c.trim()).filter(Boolean);
}

export function parseReply(content) {
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  const lastSection = () => {
    const last = blocks[blocks.length - 1];
    return last && last.type === 'section' ? last : null;
  };

  let afterBlank = false;
  let lastTableRow = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      afterBlank = true;
      continue;
    }
    if (TABLE_DIVIDER.test(line)) {
      // The row above a |---| divider is the table's header: drop it.
      if (lastTableRow) lastTableRow.list.splice(lastTableRow.list.indexOf(lastTableRow.text), 1);
      lastTableRow = null;
      continue;
    }
    if (RULE.test(line)) continue;
    const wasAfterBlank = afterBlank;
    afterBlank = false;
    lastTableRow = null;

    let m;
    if ((m = line.match(HEADING))) {
      flushParagraph();
      blocks.push({ type: 'heading', text: m[1] });
    } else if ((m = line.match(NUMBERED))) {
      flushParagraph();
      blocks.push({ type: 'section', number: m[1], text: m[2], bullets: [] });
    } else if ((m = line.match(BULLET)) || TABLE_ROW.test(line)) {
      flushParagraph();
      const text = m ? m[1] : tableCells(line).join(': ');
      // An unindented bullet after a blank line starts a new list rather than
      // continuing the numbered section above it.
      const indented = /^\s/.test(line);
      const section = indented || !wasAfterBlank ? lastSection() : null;
      let list;
      if (section) list = section.bullets;
      else {
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'list') list = last.items;
        else {
          list = [];
          blocks.push({ type: 'list', items: list });
        }
      }
      list.push(text);
      if (!m) lastTableRow = { list, text };
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}

export default function ChatMessageText({ content }) {
  const blocks = parseReply(content || '');
  return (
    <div className="chat-reply">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        if (block.type === 'heading') {
          return <p key={key} className="chat-reply-heading">{renderInline(block.text, key)}</p>;
        }
        if (block.type === 'section') {
          return (
            <div key={key} className="chat-reply-section">
              <p className="chat-reply-heading">
                <span className="chat-reply-number">{block.number}.</span>{' '}
                {renderInline(block.text, key)}
              </p>
              {block.bullets.length > 0 && (
                <ul>
                  {block.bullets.map((b, j) => <li key={j}>{renderInline(b, `${key}-${j}`)}</li>)}
                </ul>
              )}
            </div>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={key}>
              {block.items.map((b, j) => <li key={j}>{renderInline(b, `${key}-${j}`)}</li>)}
            </ul>
          );
        }
        return <p key={key}>{renderInline(block.text, key)}</p>;
      })}
    </div>
  );
}
