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
      <h2>No AI Agents Found</h2>
      <p class="empty-lead">AI agents are automatically created when you start a security scan.</p>
      <div class="empty-state-guide">
        <div class="guide-section">
          <h3>What are AI Agents?</h3>
          <div class="agent-types">
            <div class="agent-type-item"><span>🎯</span> <strong>Orchestrator</strong> - Coordinates testing</div>
            <div class="agent-type-item"><span>🔍</span> <strong>Recon</strong> - Discovers attack surface</div>
            <div class="agent-type-item"><span>📡</span> <strong>Scanner</strong> - Finds vulnerabilities</div>
            <div class="agent-type-item"><span>💥</span> <strong>Exploiter</strong> - Tests exploitability</div>
            <div class="agent-type-item"><span>📊</span> <strong>Analyst</strong> - Prioritizes risks</div>
          </div>
        </div>
        <div class="guide-section">
          <h3>How to see agents:</h3>
          <ol class="guide-steps">
            <li>Go to <strong>Targets</strong> and create a target</li>
            <li>Go to <strong>Scans</strong> and create a new scan</li>
            <li>Click <strong>Start Scan</strong></li>
            <li>Return here to see agents working in real-time</li>
          </ol>
        </div>
      </div>
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
  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--text-secondary); max-width: 900px; margin: 0 auto; }
  .empty-icon { font-size: 4rem; display: block; margin-bottom: 1rem; }
  .empty-state h2 { font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text-primary); }
  .empty-lead { font-size: 1rem; margin-bottom: 2rem; }
  .empty-state-guide { background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 2rem; margin-top: 2rem; text-align: left; }
  .guide-section { margin-bottom: 2rem; }
  .guide-section:last-child { margin-bottom: 0; }
  .guide-section h3 { font-size: 1.125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; }
  .agent-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
  .agent-type-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.5rem; font-size: 0.875rem; }
  .agent-type-item span { font-size: 1.5rem; }
  .guide-steps { padding-left: 1.5rem; line-height: 2; }
  .guide-steps li { margin-bottom: 0.5rem; color: var(--text-secondary); }
  .guide-steps strong { color: var(--primary); font-weight: 600; }
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; color: var(--text-secondary); }
  .spinner { width: 40px; height: 40px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; margin-bottom: 1rem; }
</style>
