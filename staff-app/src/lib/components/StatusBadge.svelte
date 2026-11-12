<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { MessageKey } from '#lib/i18n/dict.ts';
  let { status }: { status: string } = $props();
</script>

<span class="badge {status}">{t(`status.${status}` as MessageKey)}</span>
