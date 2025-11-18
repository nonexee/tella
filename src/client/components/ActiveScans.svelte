<script lang="ts">
  import { onMount } from 'svelte';

  let scans: any[] = [];

  onMount(async () => {
    await fetchScans();
    const interval = setInterval(fetchScans, 10000);
    return () => clearInterval(interval);
  });

  async function fetchScans() {
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
            query ActiveScans {
              scans(status: RUNNING) {
                id
                name
                progress
                target {
                  name
                  url
                }
                stats {
                  totalTasks
                  completedTasks
                  totalFindings
                  criticalFindings
                }
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.scans) {
        scans = result.data.scans;
      }
    } catch (err) {
      console.error('Failed to fetch scans:', err);
    }
  }
</script>

<div class="card active-scans">
  <h2 class="section-title">
    <span>⚡</span>
    Active Scans
  </h2>

  {#if scans.length === 0}
    <div class="empty-state">
      <p>No active scans</p>
    </div>
  {:else}
    <div class="scans-list">
      {#each scans as scan (scan.id)}
        <div class="scan-item fade-in">
          <div class="scan-header">
            <div class="scan-name">{scan.name}</div>
            <div class="scan-target">{scan.target.url}</div>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" style="width: {scan.progress}%"></div>
          </div>

          <div class="scan-stats">
            <div class="stat">
              <span class="stat-label">Tasks:</span>
              <span class="stat-value">{scan.stats.completedTasks}/{scan.stats.totalTasks}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Findings:</span>
              <span class="stat-value">{scan.stats.totalFindings}</span>
            </div>
            {#if scan.stats.criticalFindings > 0}
              <div class="stat critical">
                <span class="stat-label">Critical:</span>
                <span class="stat-value pulse">{scan.stats.criticalFindings}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .active-scans {
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

  .scans-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .scan-item {
    padding: 1rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .scan-header {
    margin-bottom: 0.75rem;
  }

  .scan-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .scan-target {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
  }

  .progress-bar {
    height: 6px;
    background: var(--bg-card);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.75rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--secondary));
    transition: width 0.3s ease;
  }

  .scan-stats {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
  }

  .stat {
    display: flex;
    gap: 0.25rem;
  }

  .stat-label {
    color: var(--text-secondary);
  }

  .stat-value {
    font-weight: 600;
  }

  .stat.critical .stat-value {
    color: var(--critical);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }
</style>
