import type * as Y from "yjs";

// Binds a <textarea> to a Y.Text so two devices typing in the same note merge
// character by character. On local input we compute the smallest edit (shared
// prefix + suffix) and apply it as a delete/insert, which keeps the CRDT's
// per-character identity intact instead of replacing the whole string. On a
// remote change we rewrite the textarea while preserving the caret as best we
// can.

export function bindTextarea(ytext: Y.Text, textarea: HTMLTextAreaElement, origin: unknown): () => void {
  let applyingRemote = false;
  textarea.value = ytext.toString();

  const onInput = (): void => {
    if (applyingRemote) return;
    const next = textarea.value;
    const prev = ytext.toString();
    if (next === prev) return;

    let start = 0;
    const minLen = Math.min(prev.length, next.length);
    while (start < minLen && prev[start] === next[start]) start++;

    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--;
      endNext--;
    }

    ytext.doc?.transact(() => {
      if (endPrev > start) ytext.delete(start, endPrev - start);
      if (endNext > start) ytext.insert(start, next.slice(start, endNext));
    }, origin);
  };

  const onRemote = (): void => {
    const value = ytext.toString();
    if (value === textarea.value) return;
    applyingRemote = true;
    const caret = textarea.selectionStart;
    textarea.value = value;
    textarea.setSelectionRange(caret, caret);
    applyingRemote = false;
  };

  textarea.addEventListener("input", onInput);
  ytext.observe(onRemote);

  return () => {
    textarea.removeEventListener("input", onInput);
    ytext.unobserve(onRemote);
  };
}
