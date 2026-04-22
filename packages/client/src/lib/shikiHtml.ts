/**
 * Shiki emits one <span class="line"> per line, separated by literal newlines.
 * When the container does not collapse font-size to 0, those whitespace text
 * nodes become visible gaps between block-rendered line spans.
 */
export function compactShikiLineWhitespace(html: string): string {
  return html.replace(/(<\/span>)\s+(?=<span class="line(?:\s|"))/g, "$1");
}
