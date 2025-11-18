<script lang="ts">
  import { onMount } from 'svelte';

  let agents: any[] = [];

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
            query Agents {
              agents(status: ACTIVE) {
                id
                name
                type
                status
                role
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

<div class="card agent-monitor">
  <h2 class="section-title">
    <span>🤖</span>
    Active AI Agents
  </h2>

  {#if agents.length === 0}
    <div class="empty-state">
      <p>No active agents</p>
    </div>
  {:else}
    <div class="agents-list">
      {#each agents as agent (agent.id)}
        <div class="agent-item fade-in">
          <div class="agent-icon">{getAgentIcon(agent.type)}</div>
          <div class="agent-info">
            <div class="agent-name">{agent.type}</div>
            <div class="agent-role">{agent.role}</div>
          </div>
          <div class="agent-status">
            <span class="badge badge-{getStatusColor(agent.status)}">
              {agent.status}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .agent-monitor {
    height: 100%;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }

  .section-title span {
    font-size: 1.5rem;
  }

  .agents-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    transition: all 0.2s;
  }

  .agent-item:hover {
    border-color: var(--primary);
  }

  .agent-icon {
    font-size: 2rem;
  }

  .agent-info {
    flex: 1;
  }

  .agent-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .agent-role {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }
</style>
