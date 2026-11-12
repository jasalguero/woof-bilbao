<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  // Today is the landing screen after signing in.
  onMount(() => goto('/today', { replaceState: true }));
</script>
