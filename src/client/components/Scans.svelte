<script lang="ts">
  import { onMount } from 'svelte';

  let scans: any[] = [];
  let showNewScanModal = false;
  let showScanDetailModal = false;
  let selectedScan: any = null;
  let scanDetails: any = null;
  let targets: any[] = [];
  let loading = true;
  let detailsLoading = false;

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
                error
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

  async function startScan(scanId: string) {
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

      const result = await response.json();
      if (result.data?.startScan) {
        await fetchScans();
      } else if (result.errors) {
        alert('Failed to start scan: ' + result.errors[0].message);
      }
    } catch (err) {
      console.error('Failed to start scan:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to start scan'));
    }
  }

  async function pauseScan(scanId: string) {
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
            mutation PauseScan($id: ID!) {
              pauseScan(id: $id) {
                id
                status
              }
            }
          `,
          variables: { id: scanId }
        })
      });

      const result = await response.json();
      if (result.data?.pauseScan) {
        await fetchScans();
      } else if (result.errors) {
        alert('Failed to pause scan: ' + result.errors[0].message);
      }
    } catch (err) {
      console.error('Failed to pause scan:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to pause scan'));
    }
  }

  async function resumeScan(scanId: string) {
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
            mutation ResumeScan($id: ID!) {
              resumeScan(id: $id) {
                id
                status
              }
            }
          `,
          variables: { id: scanId }
        })
      });

      const result = await response.json();
      if (result.data?.resumeScan) {
        await fetchScans();
      } else if (result.errors) {
        alert('Failed to resume scan: ' + result.errors[0].message);
      }
    } catch (err) {
      console.error('Failed to resume scan:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to resume scan'));
    }
  }

  async function stopScan(scanId: string) {
    if (!confirm('Are you sure you want to stop this scan? This action cannot be undone.')) {
      return;
    }

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
            mutation StopScan($id: ID!) {
              stopScan(id: $id) {
                id
                status
              }
            }
          `,
          variables: { id: scanId }
        })
      });

      const result = await response.json();
      if (result.data?.stopScan) {
        await fetchScans();
      } else if (result.errors) {
        alert('Failed to stop scan: ' + result.errors[0].message);
      }
    } catch (err) {
      console.error('Failed to stop scan:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to stop scan'));
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

  async function openScanDetails(scan: any) {
    selectedScan = scan;
    showScanDetailModal = true;
    detailsLoading = true;

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
            query ScanDetails($id: ID!) {
              scan(id: $id) {
                id
                name
                status
                progress
                createdAt
                startedAt
                completedAt
                config
                target {
                  id
                  name
                  url
                  type
                }
                tasks {
                  id
                  type
                  status
                  priority
                  input
                  output
                  createdAt
                  completedAt
                }
                agents {
                  id
                  name
                  type
                  status
                  role
                }
                findings {
                  id
                  title
                  severity
                  category
                  confidence
                  status
                  cvss
                  cve
                  createdAt
                }
                stats {
                  totalTasks
                  completedTasks
                  totalFindings
                  criticalFindings
                }
              }
            }
          `,
          variables: { id: scan.id }
        })
      });

      const result = await response.json();
      if (result.data?.scan) {
        scanDetails = result.data.scan;
      }
    } catch (err) {
      console.error('Failed to fetch scan details:', err);
      alert('Failed to load scan details');
    } finally {
      detailsLoading = false;
    }
  }

  function closeScanDetails() {
    showScanDetailModal = false;
    selectedScan = null;
    scanDetails = null;
  }

  async function exportReport(scanId: string) {
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
            query ExportScanReport($scanId: ID!) {
              exportScanReport(scanId: $scanId, format: JSON)
            }
          `,
          variables: { scanId }
        })
      });

      const result = await response.json();
      if (result.data?.exportScanReport) {
        const report = result.data.exportScanReport;

        // Create downloadable JSON file
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scan-report-${scanId}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Report exported successfully');
      } else {
        console.error('Failed to export report:', result.errors);
        alert('Failed to export report: ' + (result.errors?.[0]?.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Network error: Failed to export report');
    }
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
        <div class="scan-card fade-in" on:click={() => openScanDetails(scan)}>
          <div class="scan-header">
            <div>
              <h3>{scan.name}</h3>
              <p class="scan-target">{scan.target.url}</p>
            </div>
            <span class="badge badge-{getStatusColor(scan.status)}">
              {scan.status}
            </span>
          </div>

          {#if scan.status === 'FAILED' && scan.error}
            <div class="error-message">
              <span class="error-icon">⚠️</span>
              <div class="error-content">
                <strong>Scan Failed:</strong>
                <p>{scan.error}</p>
              </div>
            </div>
          {/if}

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

          <div class="scan-actions" on:click|stopPropagation>
            {#if scan.status === 'QUEUED'}
              <button class="btn btn-sm btn-primary" on:click={() => startScan(scan.id)}>
                Start Scan
              </button>
            {:else if scan.status === 'RUNNING'}
              <button class="btn btn-sm btn-warning" on:click={() => pauseScan(scan.id)}>
                Pause
              </button>
              <button class="btn btn-sm btn-danger" on:click={() => stopScan(scan.id)}>
                Stop
              </button>
            {:else if scan.status === 'PAUSED'}
              <button class="btn btn-sm btn-primary" on:click={() => resumeScan(scan.id)}>
                Resume
              </button>
              <button class="btn btn-sm btn-danger" on:click={() => stopScan(scan.id)}>
                Stop
              </button>
            {/if}
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

{#if showScanDetailModal}
  <div class="modal-overlay" on:click={closeScanDetails}>
    <div class="modal modal-large" on:click|stopPropagation>
      <div class="modal-header">
        <h2>{selectedScan?.name || 'Scan Details'}</h2>
        <button class="close-btn" on:click={closeScanDetails}>×</button>
      </div>

      {#if detailsLoading}
        <div class="loading">
          <div class="spinner spin"></div>
          <p>Loading scan details...</p>
        </div>
      {:else if scanDetails}
        <div class="scan-detail-content">
          <!-- Overview Section -->
          <div class="detail-section">
            <h3>Overview</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="badge badge-{getStatusColor(scanDetails.status)}">{scanDetails.status}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Progress</span>
                <span>{Math.round(scanDetails.progress)}%</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Target</span>
                <span>{scanDetails.target.name}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">URL</span>
                <span class="monospace">{scanDetails.target.url}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Created</span>
                <span>{formatDate(scanDetails.createdAt)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Started</span>
                <span>{formatDate(scanDetails.startedAt)}</span>
              </div>
            </div>
          </div>

          <!-- Stats Section -->
          <div class="detail-section">
            <h3>Statistics</h3>
            <div class="stats-row">
              <div class="stat-box">
                <div class="stat-value-large">{scanDetails.stats.completedTasks}/{scanDetails.stats.totalTasks}</div>
                <div class="stat-label">Tasks</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">{scanDetails.stats.totalFindings}</div>
                <div class="stat-label">Total Findings</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large critical">{scanDetails.stats.criticalFindings}</div>
                <div class="stat-label">Critical</div>
              </div>
            </div>
          </div>

          <!-- Agents Section -->
          {#if scanDetails.agents && scanDetails.agents.length > 0}
            <div class="detail-section">
              <h3>Active Agents ({scanDetails.agents.length})</h3>
              <div class="agents-list">
                {#each scanDetails.agents as agent}
                  <div class="agent-item">
                    <span class="agent-type">{agent.type}</span>
                    <span class="agent-role">{agent.role}</span>
                    <span class="badge badge-{getStatusColor(agent.status)}">{agent.status}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Tasks Section -->
          {#if scanDetails.tasks && scanDetails.tasks.length > 0}
            <div class="detail-section">
              <h3>Tasks ({scanDetails.tasks.length})</h3>
              <div class="tasks-list">
                {#each scanDetails.tasks.slice(0, 10) as task}
                  <div class="task-item">
                    <div class="task-info">
                      <span class="task-type">{task.type}</span>
                      <span class="task-priority">Priority: {task.priority}</span>
                    </div>
                    <span class="badge badge-{getStatusColor(task.status)}">{task.status}</span>
                  </div>
                {/each}
                {#if scanDetails.tasks.length > 10}
                  <p class="more-info">And {scanDetails.tasks.length - 10} more tasks...</p>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Findings Section -->
          {#if scanDetails.findings && scanDetails.findings.length > 0}
            <div class="detail-section">
              <h3>Findings ({scanDetails.findings.length})</h3>
              <div class="findings-list">
                {#each scanDetails.findings.slice(0, 10) as finding}
                  <div class="finding-item-detail">
                    <div class="finding-header-detail">
                      <span class="badge badge-{finding.severity.toLowerCase()}">{finding.severity}</span>
                      <span class="finding-title-detail">{finding.title}</span>
                    </div>
                    <div class="finding-meta-detail">
                      <span>{finding.category}</span>
                      {#if finding.cve}
                        <span class="cve-badge">{finding.cve}</span>
                      {/if}
                      <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
                    </div>
                  </div>
                {/each}
                {#if scanDetails.findings.length > 10}
                  <p class="more-info">And {scanDetails.findings.length - 10} more findings...</p>
                {/if}
              </div>
            </div>
          {:else}
            <div class="detail-section">
              <h3>Findings</h3>
              <p class="empty-text">No findings yet</p>
            </div>
          {/if}
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" on:click={() => exportReport(selectedScan.id)}>
            <span>📥</span>
            Export JSON Report
          </button>
          <button class="btn btn-secondary" on:click={closeScanDetails}>Close</button>
        </div>
      {/if}
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

  .scan-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1rem 0;
  }

  .scan-actions .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border-radius: 0.375rem;
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

  /* Scan Detail Modal Styles */
  .modal-large {
    max-width: 900px;
  }

  .scan-detail-content {
    padding: 1.5rem;
    max-height: 70vh;
    overflow-y: auto;
  }

  .detail-section {
    margin-bottom: 2rem;
  }

  .detail-section h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--border);
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .detail-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 500;
  }

  .monospace {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }

  .stat-box {
    background: var(--bg-dark);
    padding: 1.5rem;
    border-radius: 0.5rem;
    text-align: center;
    border: 1px solid var(--border);
  }

  .stat-value-large {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .stat-value-large.critical {
    color: var(--critical);
  }

  .agents-list, .tasks-list, .findings-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .agent-item, .task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .agent-type, .task-type {
    font-weight: 600;
    margin-right: 1rem;
  }

  .agent-role, .task-priority {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .task-info {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .finding-item-detail {
    padding: 1rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .finding-header-detail {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .finding-title-detail {
    font-weight: 600;
  }

  .finding-meta-detail {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .cve-badge {
    background: var(--bg-card);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
  }

  .more-info {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .empty-text {
    color: var(--text-secondary);
    text-align: center;
    padding: 2rem;
  }

  .scan-card {
    cursor: pointer;
  }

  .scan-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .error-message {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 1rem;
    margin-bottom: 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-left: 4px solid var(--danger);
    border-radius: 0.5rem;
  }

  .error-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
  }

  .error-content strong {
    display: block;
    color: var(--danger);
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .error-content p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-primary);
  }
</style>
