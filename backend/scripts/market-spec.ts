// New markets are Yes/No only, as on the create page. A spec file may leave "outcomes" out or give exactly
// ["Yes","No"]: the order fixes which outcome is 1, the number every vote and redeem uses.

/** The outcomes of a new market described by a spec file; anything but Yes/No is refused. */
export function binaryOutcomes(spec: { outcomes?: unknown }): ['Yes', 'No'] {
  const o = spec.outcomes;
  if (o === undefined || o === null) return ['Yes', 'No'];
  if (Array.isArray(o) && o.length === 2 && o[0] === 'Yes' && o[1] === 'No') return ['Yes', 'No'];
  throw new Error('new markets are Yes/No only: remove "outcomes" from the spec or set it to ["Yes","No"]');
}
