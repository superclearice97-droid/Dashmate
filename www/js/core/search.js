// Settings search: every word typed must start a word in the setting's text or keywords.
// "dark" finds Appearance, "km" finds Units, "toll" finds Avoid tolls.

const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

export function matches(text, query) {
  const q = words(query);
  if (!q.length) return true;
  const w = words(text);
  return q.every((part) => w.some((x) => x.startsWith(part)));
}
