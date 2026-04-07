const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

export interface TextSegment {
  type: 'text' | 'url';
  value: string;
}

export function parseUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const url = match[0].replace(/[.,!?;:'")\]]+$/, '');
    segments.push({ type: 'url', value: url });
    lastIndex = match.index + url.length;
    URL_REGEX.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

export function isPwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
