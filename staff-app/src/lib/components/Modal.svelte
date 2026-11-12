<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, onclose, children, actions }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    actions?: Snippet;
  } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); onclose(); }} aria-labelledby="modal-title">
  <h2 id="modal-title">{title}</h2>
  <div class="body">{@render children()}</div>
  {#if actions}<div class="actions row">{@render actions()}</div>{/if}
</dialog>

<style>
  dialog {
    border: 2px solid var(--shadow);
    border-radius: var(--radius);
    box-shadow: 5px 5px 0 var(--shadow);
    background: var(--surface);
    color: var(--ink);
    padding: 1.2rem 1.4rem;
    width: min(30rem, calc(100vw - 2rem));
  }
  dialog::backdrop { background: rgb(29 27 58 / 0.45); }
  .actions { justify-content: flex-end; margin-top: 1.2rem; }
  .actions :global(button) { white-space: nowrap; }
</style>
