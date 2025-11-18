<script lang="ts">
  import { onMount } from 'svelte';

  let tools: any[] = [];
  let loading = true;

  onMount(async () => {
    await fetchTools();
  });

  async function fetchTools() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: `
            query AllTools {
              tools {
                id
                name
                description
                category
                version
                enabled
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.tools) {
        tools = result.data.tools;
      }
    } catch (err) {
      console.error('Failed to fetch tools:', err);
    } finally {
      loading = false;
    }
  }

  function getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      SCANNER: '📡',
      EXPLOITER: '💥',
      ANALYZER: '📊',
      RECON: '🔍',
      CUSTOM: '🔧'
    };
    return icons[category] || '🔧';
  }
</script>

<div class="tools-page">
  <header class="page-header">
    <div>
      <h1>Security Tools</h1>
      <p>Available tools and utilities for security testing</p>
    </div>
  </header>

  {#if loading}
    <div class="loading"><div class="spinner spin"></div><p>Loading tools...</p></div>
  {:else if tools.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🔧</span>
      <h2>No tools configured</h2>
      <p>Security testing tools will appear here</p>
    </div>
  {:else}
    <div class="tools-grid">
      {#each tools as tool (tool.id)}
        <div class="tool-card fade-in">
          <div class="tool-header">
            <span class="tool-icon">{getCategoryIcon(tool.category)}</span>
            <div class="tool-info">
              <h3>{tool.name}</h3>
              <span class="badge">{tool.category}</span>
            </div>
            <span class="badge badge-{tool.enabled ? 'success' : 'secondary'}">
              {tool.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p class="tool-description">{tool.description}</p>
          {#if tool.version}
            <p class="tool-version">Version: {tool.version}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tools-page { max-width: 1600px; margin: 0 auto; }
  .page-header { margin-bottom: 2rem; }
  .page-header h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
  .page-header p { color: var(--text-secondary); }
  .tools-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; }
  .tool-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; transition: all 0.2s; }
  .tool-card:hover { border-color: var(--primary); }
  .tool-header { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
  .tool-icon { font-size: 2rem; }
  .tool-info { flex: 1; }
  .tool-info h3 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.25rem; }
  .tool-description { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
  .tool-version { font-size: 0.75rem; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }
  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--text-secondary); }
  .empty-icon { font-size: 4rem; display: block; margin-bottom: 1rem; }
  .empty-state h2 { font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text-primary); }
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--text-secondary); }
  .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; margin-bottom: 1rem; }
</style>
