<script lang="ts">
  /**
   * Error Boundary Component
   *
   * FIXES:
   * - Global error handling
   * - User-friendly error messages
   * - Error recovery
   */

  import { onMount, onDestroy } from 'svelte';

  let error: Error | null = null;
  let errorInfo: string = '';

  function handleError(event: ErrorEvent) {
    console.error('Caught error:', event.error);
    error = event.error;
    errorInfo = event.error?.stack || '';
    event.preventDefault();
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    console.error('Unhandled promise rejection:', event.reason);
    error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    errorInfo = error.stack || '';
    event.preventDefault();
  }

  function reset() {
    error = null;
    errorInfo = '';
    window.location.reload();
  }

  onMount(() => {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
  });

  onDestroy(() => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  });
</script>

{#if error}
  <div class="error-boundary">
    <div class="error-card">
      <div class="error-icon">⚠️</div>
      <h1>Something went wrong</h1>
      <p class="error-message">{error.message || 'An unexpected error occurred'}</p>

      {#if import.meta.env.DEV}
        <details class="error-details">
          <summary>Error Details (Dev Only)</summary>
          <pre>{errorInfo}</pre>
        </details>
      {/if}

      <div class="error-actions">
        <button class="btn btn-primary" on:click={reset}>
          Reload Application
        </button>
      </div>
    </div>
  </div>
{:else}
  <slot />
{/if}

<style>
  .error-boundary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    background: var(--bg-primary, #0a0f1e);
  }

  .error-card {
    background: var(--bg-card, #111827);
    border: 1px solid var(--border, #1f2937);
    border-radius: 1rem;
    padding: 3rem;
    max-width: 600px;
    width: 100%;
    text-align: center;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 1.875rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: var(--text-primary, #f9fafb);
  }

  .error-message {
    color: var(--text-secondary, #9ca3af);
    margin-bottom: 2rem;
    font-size: 1.125rem;
  }

  .error-details {
    margin: 2rem 0;
    text-align: left;
    background: var(--bg-primary, #0a0f1e);
    border: 1px solid var(--border, #1f2937);
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .error-details summary {
    cursor: pointer;
    color: var(--primary, #3b82f6);
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .error-details pre {
    font-size: 0.75rem;
    color: var(--danger, #ef4444);
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .error-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-weight: 500;
  }

  .btn-primary {
    background: var(--primary, #3b82f6);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-hover, #2563eb);
  }
</style>
