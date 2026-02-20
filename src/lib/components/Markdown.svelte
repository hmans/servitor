<script lang="ts">
  import { marked } from 'marked';

  let { content }: { content: string } = $props();

  const renderer = new marked.Renderer();
  renderer.link = ({ href, text }) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

  const html = $derived(marked.parse(content, { async: false, renderer }) as string);
</script>

<div class="markdown text-sm leading-[1.8]">
  {@html html}
</div>

<style>
  .markdown :global(ul),
  .markdown :global(ol) {
    padding-left: 1.5em;
  }

  .markdown :global(ul) {
    list-style-type: disc;
  }

  .markdown :global(ol) {
    list-style-type: decimal;
  }
</style>
