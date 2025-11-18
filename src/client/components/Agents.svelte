<script lang="ts">
  import { onMount } from 'svelte';

  let agents: any[] = [];
  let loading = true;

  onMount(async () => {
    await fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  });

  async function fetchAgents() {
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
            query AllAgents {
              agents {
                id
                name
                type
                status
                role
                createdAt
                scan {
                  name
                }
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.agents) {
        agents = result.data.agents;
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      loading = false;
    }
  }

  function getAgentIcon(type: string): string {
    const icons: Record<string, string> = {
      ORCHESTRATOR: '🎯',
      RECON: '🔍',
      SCANNER: '📡',
      EXPLOITER: '💥',
      ANALYST: '📊',
      REPORTER: '📝'
    };
    return icons[type] || '🤖';
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      ACTIVE: 'success',
      BUSY: 'warning',
      IDLE: 'secondary',
      ERROR: 'danger'
    };
    return colors[status] || 'secondary';
  }
</script>

<div class="agents-page">
  <header class="page-header">
    <div>
      <h1>AI Agents</h1>
      <p>Autonomous security testing agents</p>
    </div>
  </header>

  {#if loading}
    <div class="loading"><div class="spinner spin"></div><p>Loading agents...</p></div>
  {:else if agents.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🤖</span>
      <h2>No agents active</h2>
      <p>Agents will appear here when scans are running</p>
    </div>
  {:else}
    <div class="agents-grid">
      {#each agents as agent (agent.id)}
        <div class="agent-card fade-in">
          <div class="agent-icon">{getAgentIcon(agent.type)}</div>
          <h3>{agent.type}</h3>
          <p class="agent-role">{agent.role}</p>
          {#if agent.scan}
            <p class="agent-scan">Scan: {agent.scan.name}</p>
          {/if}
          <span class="badge badge-{getStatusColor(agent.status)}">{agent.status}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .agents-page { max-width: 1600px; margin: 0 auto; }
  .page-header { margin-bottom: 2rem; }
  .page-header h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
  .page-header p { color: var(--text-secondary); }
  .agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; }
  .agent-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; text-align: center; transition: all 0.2s; }
  .agent-card:hover { border-color: var(--primary); transform: translateY(-2px); }
  .agent-icon { font-size: 3rem; margin-bottom: 1rem; }
  .agent-card h3 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
  .agent-role { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
  .agent-scan { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1rem; }
  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--text-secondary); }
  .empty-icon { font-size: 4rem; display: block; margin-bottom: 1rem; }
  .empty-state h2 { font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text-primary); }
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--text-secondary); }
  .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; margin-bottom: 1rem; }
</style>
