const URL_RE = /https?:\/\/[^\s<>'")\]]+/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape HTML, then convert bare URLs into clickable links. */
export function linkifyUrls(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(URL_RE, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline hover:text-pink-200">${url}</a>`;
  });
}
