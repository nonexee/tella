<script lang="ts">
  import { onMount } from 'svelte';

  let scans: any[] = [];
  let showNewScanModal = false;
  let targets: any[] = [];
  let loading = true;

  // New scan form data
  let newScan = {
    name: '',
    targetId: '',
    config: {
      maxDepth: 3,
      timeout: 300000,
      aggressive: false
    }
  };

  onMount(async () => {
    await fetchScans();
    await fetchTargets();
    const interval = setInterval(fetchScans, 15000);
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
            query AllScans {
              scans {
                id
                name
                status
                progress
                createdAt
                startedAt
                completedAt
                target {
                  id
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
    } finally {
      loading = false;
    }
  }

  async function fetchTargets() {
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
            query AllTargets {
              targets {
                id
                name
                url
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.targets) {
        targets = result.data.targets;
      }
    } catch (err) {
      console.error('Failed to fetch targets:', err);
    }
  }

  async function createScan() {
    try {
      const token = localStorage.getItem('token');

      // Step 1: Create the scan
      const createResponse = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: `
            mutation CreateScan($name: String!, $targetId: ID!, $config: JSON!) {
              createScan(name: $name, targetId: $targetId, config: $config) {
                id
                name
                status
              }
            }
          `,
          variables: newScan
        })
      });

      const createResult = await createResponse.json();
      console.log('Create scan response:', createResult);

      if (createResult.data?.createScan) {
        const scanId = createResult.data.createScan.id;

        // Step 2: Immediately start the scan
        const startResponse = await fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query: `
              mutation StartScan($id: ID!) {
                startScan(id: $id) {
                  id
                  status
                }
              }
            `,
            variables: { id: scanId }
          })
        });

        const startResult = await startResponse.json();
        console.log('Start scan response:', startResult);

        if (startResult.data?.startScan) {
          showNewScanModal = false;
          newScan = { name: '', targetId: '', config: { maxDepth: 3, timeout: 300000, aggressive: false } };
          await fetchScans();
        } else if (startResult.errors) {
          console.error('Failed to start scan:', startResult.errors);
          alert('Scan created but failed to start: ' + startResult.errors[0].message);
        }
      } else if (createResult.errors) {
        const error = createResult.errors[0];
        console.error('GraphQL error:', error);
        alert('Error creating scan: ' + error.message + (error.extensions ? '\n' + JSON.stringify(error.extensions) : ''));
      } else {
        alert('Unknown error creating scan');
      }
    } catch (err) {
      console.error('Failed to create scan:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to create scan'));
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      QUEUED: 'secondary',
      RUNNING: 'warning',
      PAUSED: 'secondary',
      COMPLETED: 'success',
      FAILED: 'danger',
      CANCELLED: 'secondary'
    };
    return colors[status] || 'secondary';
  }
</script>

<div class="scans-page">
  <header class="page-header">
    <div>
      <h1>Security Scans</h1>
      <p>Manage and monitor security scanning operations</p>
    </div>
    <button class="btn btn-primary" on:click={() => showNewScanModal = true}>
      <span>⚡</span>
      New Scan
    </button>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading scans...</p>
    </div>
  {:else if scans.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🔍</span>
      <h2>No scans yet</h2>
      <p>Create your first security scan to get started</p>
      <button class="btn btn-primary" on:click={() => showNewScanModal = true}>
        Create Scan
      </button>
    </div>
  {:else}
    <div class="scans-grid">
      {#each scans as scan (scan.id)}
        <div class="scan-card fade-in">
          <div class="scan-header">
            <div>
              <h3>{scan.name}</h3>
              <p class="scan-target">{scan.target.url}</p>
            </div>
            <span class="badge badge-{getStatusColor(scan.status)}">
              {scan.status}
            </span>
          </div>

          {#if scan.status === 'RUNNING'}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {scan.progress}%"></div>
            </div>
            <p class="progress-text">{Math.round(scan.progress)}% complete</p>
          {/if}

          <div class="scan-stats">
            <div class="stat">
              <span class="stat-label">Tasks</span>
              <span class="stat-value">{scan.stats.completedTasks}/{scan.stats.totalTasks}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Findings</span>
              <span class="stat-value">{scan.stats.totalFindings}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Critical</span>
              <span class="stat-value critical">{scan.stats.criticalFindings}</span>
            </div>
          </div>

          <div class="scan-footer">
            <span class="scan-date">Started: {formatDate(scan.startedAt)}</span>
            {#if scan.completedAt}
              <span class="scan-date">Completed: {formatDate(scan.completedAt)}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showNewScanModal}
  <div class="modal-overlay" on:click={() => showNewScanModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Create New Scan</h2>
        <button class="close-btn" on:click={() => showNewScanModal = false}>×</button>
      </div>

      <form on:submit|preventDefault={createScan}>
        <div class="form-group">
          <label for="scan-name">Scan Name</label>
          <input
            id="scan-name"
            type="text"
            bind:value={newScan.name}
            placeholder="e.g., Weekly Security Audit"
            required
          />
        </div>

        <div class="form-group">
          <label for="target">Target</label>
          <select id="target" bind:value={newScan.targetId} required>
            <option value="">Select a target</option>
            {#each targets as target}
              <option value={target.id}>{target.name} ({target.url})</option>
            {/each}
          </select>
          {#if targets.length === 0}
            <p class="help-text">No targets available. Create a target first.</p>
          {/if}
        </div>

        <div class="form-group">
          <label for="max-depth">Max Crawl Depth</label>
          <input
            id="max-depth"
            type="number"
            bind:value={newScan.config.maxDepth}
            min="1"
            max="10"
          />
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" bind:checked={newScan.config.aggressive} />
            Enable Aggressive Testing
          </label>
          <p class="help-text">May generate more load on the target</p>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" on:click={() => showNewScanModal = false}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Create Scan
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .scans-page {
    max-width: 1600px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .page-header p {
    color: var(--text-secondary);
  }

  .scans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .scan-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    transition: all 0.2s;
  }

  .scan-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .scan-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .scan-header h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .scan-target {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
  }

  .progress-bar {
    height: 8px;
    background: var(--bg-dark);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--secondary));
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  .scan-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--bg-dark);
    border-radius: 0.5rem;
  }

  .stat {
    text-align: center;
  }

  .stat-label {
    display: block;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .stat-value {
    display: block;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .stat-value.critical {
    color: var(--critical);
  }

  .scan-footer {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary);
  }

  .empty-icon {
    font-size: 4rem;
    display: block;
    margin-bottom: 1rem;
  }

  .empty-state h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  .empty-state button {
    margin-top: 1.5rem;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-card);
    border-radius: 0.75rem;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    color: var(--text-secondary);
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--text-primary);
  }

  form {
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .form-group input[type="text"],
  .form-group input[type="number"],
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-group input[type="checkbox"] {
    margin-right: 0.5rem;
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
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
</style>
