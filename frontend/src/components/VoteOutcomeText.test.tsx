// The vote step's explainer read "goes to the committee.Vote by the market's own rules": JSX drops a line break that
// sits between text and an expression, so the space before the timing rule was lost. It renders as one paragraph with
// every sentence spaced, ending with the rule that an early close does not move the moment a vote judges.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoteOutcomeText } from './VoteOutcomeText';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");

describe('VoteOutcomeText', () => {
  it('spaces every sentence and ends with the vote timing rule', () => {
    const out = text(renderToStaticMarkup(<VoteOutcomeText bond="0.1 NEAR" minVoters={1} />));
    expect(out).toContain('with a 0.1 NEAR bond. One vote is enough before the market can advance. Wrong voters');
    expect(out).toContain("goes to the committee. Vote by the market's own rules");
    expect(out).toMatch(/Ending trading early does not move that moment: wait until it has passed/);
  });

  it('names the quorum when one vote is not enough', () => {
    expect(text(renderToStaticMarkup(<VoteOutcomeText bond="10 NEAR" minVoters={3} />))).toContain(
      'with a 10 NEAR bond. 3 voters are required before the market can advance.',
    );
  });
});
