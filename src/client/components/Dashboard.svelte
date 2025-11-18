<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import StatsCard from './StatsCard.svelte';
  import AgentMonitor from './AgentMonitor.svelte';
  import RecentFindings from './RecentFindings.svelte';
  import ActiveScans from './ActiveScans.svelte';

  const dispatch = createEventDispatcher();

  let stats = {
    totalScans: 0,
    activeScans: 0,
    totalFindings: 0,
    criticalFindings: 0,
    activeAgents: 0,
    completedTasks: 0
  };

  let loading = true;

  onMount(async () => {
    await fetchDashboardStats();
    // Set up real-time updates (poll every 10 seconds instead of 5)
    const interval = setInterval(fetchDashboardStats, 10000);
    return () => clearInterval(interval);
  });

  async function fetchDashboardStats() {
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
            query DashboardStats {
              dashboardStats {
                totalScans
                activeScans
                totalFindings
                criticalFindings
                activeAgents
                completedTasks
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.dashboardStats) {
        stats = result.data.dashboardStats;
      }
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="dashboard">
  <header class="dashboard-header">
    <div>
      <h1>Security Testing Dashboard</h1>
      <p>Real-time AI-powered offensive security testing</p>
    </div>
    <button class="btn btn-primary" on:click={() => dispatch('navigate', 'scans')}>
      <span>⚡</span>
      New Scan
    </button>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading dashboard...</p>
    </div>
  {:else}
    <div class="stats-grid fade-in">
      <StatsCard
        title="Total Scans"
        value={stats.totalScans}
        icon="🔍"
        color="primary"
      />
      <StatsCard
        title="Active Scans"
        value={stats.activeScans}
        icon="⚡"
        color="warning"
        pulse={stats.activeScans > 0}
      />
      <StatsCard
        title="AI Agents Active"
        value={stats.activeAgents}
        icon="🤖"
        color="success"
      />
      <StatsCard
        title="Critical Findings"
        value={stats.criticalFindings}
        icon="🚨"
        color="danger"
        pulse={stats.criticalFindings > 0}
      />
      <StatsCard
        title="Total Findings"
        value={stats.totalFindings}
        icon="🐛"
        color="secondary"
      />
      <StatsCard
        title="Completed Tasks"
        value={stats.completedTasks}
        icon="✅"
        color="success"
      />
    </div>

    <div class="dashboard-grid fade-in">
      <div class="dashboard-section">
        <AgentMonitor />
      </div>

      <div class="dashboard-section">
        <ActiveScans />
      </div>
    </div>

    <div class="dashboard-section fade-in">
      <RecentFindings />
    </div>
  {/if}
</div>

<style>
  .dashboard {
    max-width: 1600px;
    margin: 0 auto;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .dashboard-header p {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .dashboard-header button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    padding: 0.75rem 1.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .dashboard-section {
    animation: fadeIn 0.3s ease-out;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: var(--text-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  @media (max-width: 768px) {
    .dashboard-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
