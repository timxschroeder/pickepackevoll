// Writes data files with one list entry per line, so they stay easy to read and edit by hand.

const fmt = (v) => {
  if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(', ')} }`;
  return JSON.stringify(v);
};

export function formatDataFile(data, listKey) {
  const head = Object.entries(data)
    .filter(([k]) => k !== listKey)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const rows = (data[listKey] ?? []).map((e) => `    ${fmt(e)}`);
  return `{\n${head.join('\n')}${head.length ? '\n' : ''}  ${JSON.stringify(listKey)}: [${rows.length ? `\n${rows.join(',\n')}\n  ` : ''}]\n}\n`;
}
