<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiRequest } from '../lib/api';

  export let targetId: string;
  export let onClose: () => void;

  let target: any = null;
  let loading = true;
  let error: string | null = null;
  let showEditModal = false;
  let editForm = {
    name: '',
    url: '',
    type: 'WEB_APP',
    description: '',
    status: 'ACTIVE'
  };

  // Fetch target details including scan history and findings
  async function fetchTargetDetails() {
    loading = true;
    error = null;

    try {
      const response = await apiRequest(`
        query GetTargetDetails($id: ID!) {
          target(id: $id) {
            id
            name
            url
            description
            type
            status
            metadata
            createdAt
            updatedAt
            scans {
              id
              name
              status
              progress
              createdAt
              startedAt
              completedAt
              findings {
                id
                severity
              }
            }
            findings {
              id
              title
              severity
              status
              createdAt
            }
          }
        }
      `, { id: targetId });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to fetch target details');
      }

      target = response.data.target;
    } catch (e: any) {
      error = e.message;
      console.error('Error fetching target details:', e);
    } finally {
      loading = false;
    }
  }

  // Calculate findings count by severity
  function getFindingsCountBySeverity() {
    if (!target?.findings) return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };

    return target.findings.reduce((acc: any, finding: any) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1;
      return acc;
    }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 });
  }

  // Get scan status badge class
  function getScanStatusClass(status: string): string {
    const classes: Record<string, string> = {
      QUEUED: 'badge-info',
      RUNNING: 'badge-primary',
      PAUSED: 'badge-warning',
      COMPLETED: 'badge-success',
      FAILED: 'badge-danger',
      CANCELLED: 'badge-secondary'
    };
    return classes[status] || 'badge-secondary';
  }

  // Get severity badge class
  function getSeverityClass(severity: string): string {
    const classes: Record<string, string> = {
      CRITICAL: 'badge-critical',
      HIGH: 'badge-danger',
      MEDIUM: 'badge-warning',
      LOW: 'badge-info',
      INFO: 'badge-secondary'
    };
    return classes[severity] || 'badge-secondary';
  }

  // Format date
  function formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  // Get relative time
  function getRelativeTime(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(dateString);
  }

  // Open edit modal
  function openEditModal() {
    if (!target) return;
    editForm = {
      name: target.name,
      url: target.url,
      type: target.type,
      description: target.description || '',
      status: target.status
    };
    showEditModal = true;
  }

  // Update target
  async function updateTarget() {
    try {
      const response = await apiRequest(`
        mutation UpdateTarget($id: ID!, $name: String!, $url: String!, $type: TargetType!, $description: String, $status: TargetStatus!) {
          updateTarget(id: $id, name: $name, url: $url, type: $type, description: $description, status: $status) {
            id
            name
            url
            type
            description
            status
          }
        }
      `, {
        id: targetId,
        ...editForm
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to update target');
      }

      // Refresh target details
      await fetchTargetDetails();
      showEditModal = false;
      alert('Target updated successfully!');
    } catch (e: any) {
      alert(`Error updating target: ${e.message}`);
      console.error('Error updating target:', e);
    }
  }

  // Handle escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (showEditModal) {
        showEditModal = false;
      } else {
        onClose();
      }
    }
  }

  onMount(() => {
    fetchTargetDetails();
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="modal-backdrop" on:click={onClose}>
  <div class="modal-content target-detail-modal" on:click|stopPropagation>
    <div class="modal-header">
      <h2>Target Details</h2>
      <button class="btn-close" on:click={onClose}>×</button>
    </div>

    <div class="modal-body">
      {#if loading}
        <div class="loading">Loading target details...</div>
      {:else if error}
        <div class="error">
          <p>Error: {error}</p>
          <button class="btn btn-primary" on:click={fetchTargetDetails}>Retry</button>
        </div>
      {:else if target}
        <!-- Target Info -->
        <div class="target-info">
          <div class="info-header">
            <div>
              <h3>{target.name}</h3>
              <p class="target-url">{target.url}</p>
            </div>
            <div class="info-actions">
              <span class="badge {target.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}">
                {target.status}
              </span>
              <button class="btn btn-secondary btn-small" on:click={openEditModal}>
                ✏️ Edit
              </button>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <strong>Type:</strong>
              <span>{target.type.replace(/_/g, ' ')}</span>
            </div>
            <div class="info-item">
              <strong>Created:</strong>
              <span>{getRelativeTime(target.createdAt)}</span>
            </div>
            <div class="info-item">
              <strong>Updated:</strong>
              <span>{getRelativeTime(target.updatedAt)}</span>
            </div>
          </div>

          {#if target.description}
            <div class="info-description">
              <strong>Description:</strong>
              <p>{target.description}</p>
            </div>
          {/if}
        </div>

        <!-- Findings Summary -->
        <div class="findings-summary">
          <h4>Findings Summary</h4>
          {#if target.findings.length === 0}
            <p class="empty-state">No findings yet. Run a scan to discover vulnerabilities.</p>
          {:else}
            {@const counts = getFindingsCountBySeverity()}
            <div class="findings-stats">
              <div class="stat-item">
                <span class="badge badge-critical">{counts.CRITICAL}</span>
                <span>Critical</span>
              </div>
              <div class="stat-item">
                <span class="badge badge-danger">{counts.HIGH}</span>
                <span>High</span>
              </div>
              <div class="stat-item">
                <span class="badge badge-warning">{counts.MEDIUM}</span>
                <span>Medium</span>
              </div>
              <div class="stat-item">
                <span class="badge badge-info">{counts.LOW}</span>
                <span>Low</span>
              </div>
              <div class="stat-item">
                <span class="badge badge-secondary">{counts.INFO}</span>
                <span>Info</span>
              </div>
            </div>

            <div class="findings-list">
              <h5>Recent Findings ({target.findings.length})</h5>
              <div class="findings-scroll">
                {#each target.findings.slice(0, 10) as finding}
                  <div class="finding-item">
                    <span class="badge {getSeverityClass(finding.severity)}">{finding.severity}</span>
                    <span class="finding-title">{finding.title}</span>
                    <span class="finding-time">{getRelativeTime(finding.createdAt)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Scan History -->
        <div class="scan-history">
          <h4>Scan History ({target.scans.length})</h4>
          {#if target.scans.length === 0}
            <p class="empty-state">No scans yet. Create a new scan to start testing.</p>
          {:else}
            <div class="scans-timeline">
              {#each target.scans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as scan}
                <div class="timeline-item">
                  <div class="timeline-marker {getScanStatusClass(scan.status)}"></div>
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <strong>{scan.name}</strong>
                      <span class="badge {getScanStatusClass(scan.status)}">{scan.status}</span>
                    </div>
                    <div class="timeline-meta">
                      <span>Created: {getRelativeTime(scan.createdAt)}</span>
                      {#if scan.completedAt}
                        <span>• Completed: {getRelativeTime(scan.completedAt)}</span>
                      {/if}
                      {#if scan.findings}
                        <span>• {scan.findings.length} findings</span>
                      {/if}
                    </div>
                    {#if scan.status === 'RUNNING' || scan.status === 'PAUSED'}
                      <div class="progress-bar">
                        <div class="progress-fill" style="width: {scan.progress}%"></div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" on:click={onClose}>Close</button>
    </div>
  </div>
</div>

<!-- Edit Target Modal -->
{#if showEditModal}
  <div class="modal-backdrop" on:click={() => showEditModal = false}>
    <div class="modal-content" on:click|stopPropagation style="max-width: 600px;">
      <div class="modal-header">
        <h3>Edit Target</h3>
        <button class="btn-close" on:click={() => showEditModal = false}>×</button>
      </div>

      <div class="modal-body">
        <form on:submit|preventDefault={updateTarget}>
          <div class="form-group">
            <label for="edit-name">Name *</label>
            <input
              type="text"
              id="edit-name"
              bind:value={editForm.name}
              required
              placeholder="My Web Application"
            />
          </div>

          <div class="form-group">
            <label for="edit-url">URL *</label>
            <input
              type="url"
              id="edit-url"
              bind:value={editForm.url}
              required
              placeholder="https://example.com"
            />
          </div>

          <div class="form-group">
            <label for="edit-type">Type *</label>
            <select id="edit-type" bind:value={editForm.type} required>
              <option value="WEB_APP">Web Application</option>
              <option value="API">API</option>
              <option value="MOBILE_APP">Mobile App</option>
              <option value="NETWORK">Network</option>
              <option value="CLOUD_INFRA">Cloud Infrastructure</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>

          <div class="form-group">
            <label for="edit-status">Status *</label>
            <select id="edit-status" bind:value={editForm.status} required>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div class="form-group">
            <label for="edit-description">Description</label>
            <textarea
              id="edit-description"
              bind:value={editForm.description}
              rows="4"
              placeholder="Optional description..."
            ></textarea>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => showEditModal = false}>Cancel</button>
        <button class="btn btn-primary" on:click={updateTarget}>Save Changes</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .target-detail-modal {
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .target-info {
    background: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .info-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
  }

  .target-url {
    color: var(--text-secondary);
    font-size: 0.95rem;
    word-break: break-all;
    margin: 0;
  }

  .info-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item strong {
    color: var(--text-secondary);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-description {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .info-description strong {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.85rem;
    text-transform: uppercase;
  }

  .findings-summary, .scan-history {
    background: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .findings-summary h4, .scan-history h4 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
  }

  .findings-stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 80px;
  }

  .stat-item .badge {
    font-size: 1.2rem;
    font-weight: bold;
    padding: 0.5rem 1rem;
  }

  .stat-item span:last-child {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .findings-list h5 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
  }

  .findings-scroll {
    max-height: 300px;
    overflow-y: auto;
  }

  .finding-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .finding-title {
    flex: 1;
    font-size: 0.9rem;
  }

  .finding-time {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .scans-timeline {
    max-height: 400px;
    overflow-y: auto;
  }

  .timeline-item {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    position: relative;
  }

  .timeline-item:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 24px;
    bottom: -24px;
    width: 2px;
    background: var(--border-color);
  }

  .timeline-marker {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 4px;
  }

  .timeline-marker.badge-success { background: var(--success); }
  .timeline-marker.badge-danger { background: var(--danger); }
  .timeline-marker.badge-primary { background: var(--primary); }
  .timeline-marker.badge-warning { background: var(--warning); }
  .timeline-marker.badge-info { background: var(--info); }
  .timeline-marker.badge-secondary { background: var(--secondary); }

  .timeline-content {
    flex: 1;
    background: var(--bg-primary);
    padding: 1rem;
    border-radius: 6px;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .timeline-meta {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .progress-bar {
    margin-top: 0.75rem;
    height: 4px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 2rem;
    font-style: italic;
  }

  .loading, .error {
    text-align: center;
    padding: 3rem;
  }

  .error {
    color: var(--danger);
  }
</style>
