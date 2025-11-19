<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let targets: any[] = [];
  let showNewTargetModal = false;
  let showStartScanModal = false;
  let selectedTargetForScan: any = null;
  let loading = true;
  let startingScan = false;

  // New target form data
  let newTarget = {
    name: '',
    url: '',
    type: 'WEB_APP',
    description: ''
  };

  // New scan form data for quick start
  let newScan = {
    name: '',
    config: {
      maxDepth: 3,
      timeout: 300000,
      aggressive: false
    }
  };

  const targetTypes = [
    { value: 'WEB_APP', label: 'Web Application' },
    { value: 'API', label: 'API' },
    { value: 'MOBILE_APP', label: 'Mobile App' },
    { value: 'NETWORK', label: 'Network' },
    { value: 'CLOUD_INFRA', label: 'Cloud Infrastructure' },
    { value: 'CUSTOM', label: 'Custom' }
  ];

  onMount(async () => {
    await fetchTargets();
  });

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
                type
                status
                description
                createdAt
                scans {
                  id
                }
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
    } finally {
      loading = false;
    }
  }

  async function createTarget() {
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
            mutation CreateTarget($name: String!, $url: String!, $type: TargetType!, $description: String) {
              createTarget(name: $name, url: $url, type: $type, description: $description) {
                id
                name
                url
              }
            }
          `,
          variables: newTarget
        })
      });

      const result = await response.json();
      console.log('Create target response:', result);

      if (result.data?.createTarget) {
        showNewTargetModal = false;
        newTarget = { name: '', url: '', type: 'WEB_APP', description: '' };
        await fetchTargets();
      } else if (result.errors) {
        const error = result.errors[0];
        console.error('GraphQL error:', error);
        alert('Error creating target: ' + error.message + (error.extensions ? '\n' + JSON.stringify(error.extensions) : ''));
      } else {
        alert('Unknown error creating target');
      }
    } catch (err) {
      console.error('Failed to create target:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to create target'));
    }
  }

  function getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      WEB_APP: '🌐',
      API: '📡',
      MOBILE_APP: '📱',
      NETWORK: '🔌',
      CLOUD_INFRA: '☁️',
      CUSTOM: '🎯'
    };
    return icons[type] || '🎯';
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      ACTIVE: 'success',
      INACTIVE: 'secondary',
      ARCHIVED: 'secondary'
    };
    return colors[status] || 'secondary';
  }

  function openStartScanModal(target: any) {
    selectedTargetForScan = target;
    newScan.name = `${target.name} - Security Scan ${new Date().toISOString().split('T')[0]}`;
    showStartScanModal = true;
  }

  async function startScanForTarget() {
    if (!selectedTargetForScan) return;

    startingScan = true;
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
          variables: {
            name: newScan.name,
            targetId: selectedTargetForScan.id,
            config: newScan.config
          }
        })
      });

      const createResult = await createResponse.json();

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

        if (startResult.data?.startScan) {
          // Close modal and navigate to scan console
          showStartScanModal = false;
          selectedTargetForScan = null;
          newScan = { name: '', config: { maxDepth: 3, timeout: 300000, aggressive: false } };

          // Navigate to scan console with the new scan ID
          dispatch('navigate', { view: 'scan-console', scanId });
        } else if (startResult.errors) {
          console.error('Failed to start scan:', startResult.errors);
          alert('Scan created but failed to start: ' + startResult.errors[0].message);
        }
      } else if (createResult.errors) {
        const error = createResult.errors[0];
        console.error('GraphQL error:', error);
        alert('Error creating scan: ' + error.message);
      }
    } catch (err) {
      console.error('Failed to start scan:', err);
      alert('Network error: ' + (err instanceof Error ? err.message : 'Failed to start scan'));
    } finally {
      startingScan = false;
    }
  }
</script>

<div class="targets-page">
  <header class="page-header">
    <div>
      <h1>Security Targets</h1>
      <p>Manage systems and applications to be tested</p>
    </div>
    <button class="btn btn-primary" on:click={() => showNewTargetModal = true}>
      <span>🎯</span>
      New Target
    </button>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading targets...</p>
    </div>
  {:else if targets.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🎯</span>
      <h2>No targets yet</h2>
      <p>Add your first target to begin security testing</p>
      <button class="btn btn-primary" on:click={() => showNewTargetModal = true}>
        Add Target
      </button>
    </div>
  {:else}
    <div class="targets-grid">
      {#each targets as target (target.id)}
        <div class="target-card fade-in">
          <div class="target-header">
            <span class="target-icon">{getTypeIcon(target.type)}</span>
            <div class="target-info">
              <h3>{target.name}</h3>
              <p class="target-url">{target.url}</p>
            </div>
            <span class="badge badge-{getStatusColor(target.status)}">
              {target.status}
            </span>
          </div>

          {#if target.description}
            <p class="target-description">{target.description}</p>
          {/if}

          <div class="target-stats">
            <div class="stat">
              <span class="stat-label">Type</span>
              <span class="stat-value">{target.type.replace('_', ' ')}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Scans</span>
              <span class="stat-value">{target.scans.length}</span>
            </div>
          </div>

          <div class="target-actions">
            <button
              class="btn btn-primary btn-start-scan"
              on:click|stopPropagation={() => openStartScanModal(target)}
            >
              <span>🚀</span>
              Start Scan
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showNewTargetModal}
  <div
    class="modal-overlay"
    role="presentation"
    on:click={(e) => e.target === e.currentTarget && (showNewTargetModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showNewTargetModal = false)}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-header">
        <h2>Add New Target</h2>
        <button class="close-btn" on:click={() => showNewTargetModal = false}>×</button>
      </div>

      <form on:submit|preventDefault={createTarget}>
        <div class="form-group">
          <label for="target-name">Target Name</label>
          <input
            id="target-name"
            type="text"
            bind:value={newTarget.name}
            placeholder="e.g., Production Web App"
            required
          />
        </div>

        <div class="form-group">
          <label for="target-url">URL</label>
          <input
            id="target-url"
            type="url"
            bind:value={newTarget.url}
            placeholder="https://example.com"
            required
          />
        </div>

        <div class="form-group">
          <label for="target-type">Target Type</label>
          <select id="target-type" bind:value={newTarget.type} required>
            {#each targetTypes as type}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="target-description">Description (Optional)</label>
          <textarea
            id="target-description"
            bind:value={newTarget.description}
            placeholder="Additional information about this target"
            rows="3"
          ></textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" on:click={() => showNewTargetModal = false}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Add Target
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showStartScanModal}
  <div
    class="modal-overlay"
    role="presentation"
    on:click={(e) => e.target === e.currentTarget && (showStartScanModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showStartScanModal = false)}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-header">
        <h2>🚀 Start Security Scan</h2>
        <button class="close-btn" on:click={() => showStartScanModal = false}>×</button>
      </div>

      <form on:submit|preventDefault={startScanForTarget}>
        <div class="target-info-box">
          <div class="info-label">Target:</div>
          <div class="info-value">
            <strong>{selectedTargetForScan?.name}</strong>
            <div class="info-url">{selectedTargetForScan?.url}</div>
          </div>
        </div>

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
          <label for="max-depth">Max Crawl Depth</label>
          <input
            id="max-depth"
            type="number"
            bind:value={newScan.config.maxDepth}
            min="1"
            max="10"
          />
          <p class="help-text">How many levels deep to crawl the site (1-10)</p>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" bind:checked={newScan.config.aggressive} />
            Enable Aggressive Testing
          </label>
          <p class="help-text">May generate more load on the target</p>
        </div>

        <div class="modal-actions">
          <button
            type="button"
            class="btn btn-secondary"
            on:click={() => showStartScanModal = false}
            disabled={startingScan}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={startingScan}
          >
            {#if startingScan}
              <span class="spinner-small"></span>
              Starting...
            {:else}
              <span>🚀</span>
              Start Scan
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .targets-page {
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

  .targets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .target-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    transition: all 0.2s;
  }

  .target-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .target-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .target-icon {
    font-size: 2.5rem;
  }

  .target-info {
    flex: 1;
  }

  .target-info h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .target-url {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
    word-break: break-all;
  }

  .target-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  .target-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
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
    text-transform: uppercase;
  }

  .stat-value {
    display: block;
    font-size: 1.125rem;
    font-weight: 600;
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
  .form-group input[type="url"],
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
  }

  .form-group textarea {
    resize: vertical;
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

  .target-actions {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .btn-start-scan {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    font-weight: 600;
  }

  .btn-start-scan span {
    font-size: 1.25rem;
  }

  .target-info-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .info-value strong {
    display: block;
    color: var(--text-primary);
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }

  .info-url {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .spinner-small {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
