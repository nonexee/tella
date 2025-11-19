<script lang="ts">
  import { onMount } from 'svelte';

  let findings: any[] = [];
  let loading = true;
  let filter = 'all'; // all, critical, high, medium, low
  let showFindingDetailModal = false;
  let selectedFinding: any = null;
  let findingDetails: any = null;
  let detailsLoading = false;

  onMount(async () => {
    await fetchFindings();
  });

  async function fetchFindings() {
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
            query AllFindings {
              findings {
                id
                title
                description
                severity
                category
                cvss
                cve
                confidence
                status
                createdAt
                target {
                  name
                  url
                }
                scan {
                  name
                }
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.findings) {
        findings = result.data.findings;
      }
    } catch (err) {
      console.error('Failed to fetch findings:', err);
    } finally {
      loading = false;
    }
  }

  $: filteredFindings = filter === 'all'
    ? findings
    : findings.filter(f => f.severity === filter.toUpperCase());

  function getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      CRITICAL: 'danger',
      HIGH: 'warning',
      MEDIUM: 'secondary',
      LOW: 'success',
      INFO: 'secondary'
    };
    return colors[severity] || 'secondary';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  async function openFindingDetails(finding: any) {
    selectedFinding = finding;
    showFindingDetailModal = true;
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
            query FindingDetails($id: ID!) {
              finding(id: $id) {
                id
                title
                description
                severity
                category
                cvss
                cve
                confidence
                status
                evidence
                remediation
                references
                metadata
                createdAt
                updatedAt
                target {
                  id
                  name
                  url
                  type
                }
                scan {
                  id
                  name
                  createdAt
                }
              }
            }
          `,
          variables: { id: finding.id }
        })
      });

      const result = await response.json();
      if (result.data?.finding) {
        findingDetails = result.data.finding;
      }
    } catch (err) {
      console.error('Failed to fetch finding details:', err);
      alert('Failed to load finding details');
    } finally {
      detailsLoading = false;
    }
  }

  function closeFindingDetails() {
    showFindingDetailModal = false;
    selectedFinding = null;
    findingDetails = null;
  }
</script>

<div class="findings-page">
  <header class="page-header">
    <div>
      <h1>Security Findings</h1>
      <p>Vulnerabilities and issues discovered during scans</p>
    </div>
  </header>

  <div class="filter-bar">
    <button class="filter-btn" class:active={filter === 'all'} on:click={() => filter = 'all'}>
      All ({findings.length})
    </button>
    <button class="filter-btn" class:active={filter === 'critical'} on:click={() => filter = 'critical'}>
      Critical ({findings.filter(f => f.severity === 'CRITICAL').length})
    </button>
    <button class="filter-btn" class:active={filter === 'high'} on:click={() => filter = 'high'}>
      High ({findings.filter(f => f.severity === 'HIGH').length})
    </button>
    <button class="filter-btn" class:active={filter === 'medium'} on:click={() => filter = 'medium'}>
      Medium ({findings.filter(f => f.severity === 'MEDIUM').length})
    </button>
    <button class="filter-btn" class:active={filter === 'low'} on:click={() => filter = 'low'}>
      Low ({findings.filter(f => f.severity === 'LOW').length})
    </button>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading findings...</p>
    </div>
  {:else if filteredFindings.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🐛</span>
      <h2>No findings</h2>
      <p>{filter === 'all' ? 'No vulnerabilities discovered yet' : `No ${filter} severity findings`}</p>
    </div>
  {:else}
    <div class="findings-list">
      {#each filteredFindings as finding (finding.id)}
        <div class="finding-card fade-in" on:click={() => openFindingDetails(finding)}>
          <div class="finding-header">
            <span class="badge badge-{getSeverityColor(finding.severity)}">
              {finding.severity}
            </span>
            {#if finding.cvss}
              <span class="cvss-badge">CVSS: {finding.cvss.toFixed(1)}</span>
            {/if}
            {#if finding.cve}
              <span class="cve-badge">{finding.cve}</span>
            {/if}
          </div>

          <h3>{finding.title}</h3>
          <p class="finding-description">{finding.description}</p>

          <div class="finding-meta">
            <span>📦 {finding.category}</span>
            <span>🎯 {finding.target.name}</span>
            <span>🔍 {finding.scan.name}</span>
            <span>📊 Confidence: {Math.round(finding.confidence * 100)}%</span>
          </div>

          <div class="finding-footer">
            <span class="finding-date">Discovered: {formatDate(finding.createdAt)}</span>
            <span class="badge badge-{finding.status.toLowerCase()}">{finding.status}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showFindingDetailModal}
  <div class="modal-overlay" on:click={closeFindingDetails}>
    <div class="modal modal-large" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Finding Details</h2>
        <button class="close-btn" on:click={closeFindingDetails}>×</button>
      </div>

      {#if detailsLoading}
        <div class="loading">
          <div class="spinner spin"></div>
          <p>Loading finding details...</p>
        </div>
      {:else if findingDetails}
        <div class="finding-detail-content">
          <!-- Header Section -->
          <div class="detail-section">
            <div class="detail-header">
              <h3>{findingDetails.title}</h3>
              <div class="badges">
                <span class="badge badge-{getSeverityColor(findingDetails.severity)}">{findingDetails.severity}</span>
                {#if findingDetails.cvss}
                  <span class="cvss-badge-large">CVSS: {findingDetails.cvss.toFixed(1)}</span>
                {/if}
                {#if findingDetails.cve}
                  <span class="cve-badge-large">{findingDetails.cve}</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Overview Section -->
          <div class="detail-section">
            <h4>Overview</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Category</span>
                <span>{findingDetails.category}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="badge badge-{findingDetails.status.toLowerCase()}">{findingDetails.status}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Confidence</span>
                <span>{Math.round(findingDetails.confidence * 100)}%</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Discovered</span>
                <span>{formatDate(findingDetails.createdAt)}</span>
              </div>
              {#if findingDetails.evidence && findingDetails.evidence.affectedComponent}
                <div class="detail-item">
                  <span class="detail-label">Affected Component</span>
                  <span class="monospace">{findingDetails.evidence.affectedComponent}</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Description Section -->
          <div class="detail-section">
            <h4>Description</h4>
            <p class="description-text">{findingDetails.description}</p>
          </div>

          <!-- Target Information -->
          <div class="detail-section">
            <h4>Target Information</h4>
            <div class="target-info">
              <div class="info-row">
                <span class="info-label">Target:</span>
                <span>{findingDetails.target.name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">URL:</span>
                <span class="monospace">{findingDetails.target.url}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Type:</span>
                <span>{findingDetails.target.type}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Scan:</span>
                <span>{findingDetails.scan.name}</span>
              </div>
            </div>
          </div>

          <!-- Evidence Section -->
          {#if findingDetails.evidence}
            <div class="detail-section">
              <h4>Evidence</h4>
              <div class="evidence-box">
                <pre>{findingDetails.evidence}</pre>
              </div>
            </div>
          {/if}

          <!-- Remediation Section -->
          {#if findingDetails.remediation}
            <div class="detail-section">
              <h4>Remediation</h4>
              <div class="remediation-box">
                <p>{findingDetails.remediation}</p>
              </div>
            </div>
          {/if}

          <!-- References Section -->
          {#if findingDetails.references && findingDetails.references.length > 0}
            <div class="detail-section">
              <h4>References</h4>
              <div class="references-list">
                {#each JSON.parse(findingDetails.references) as reference}
                  <div class="reference-item">
                    <a href={reference} target="_blank" rel="noopener noreferrer">
                      {reference}
                    </a>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" on:click={closeFindingDetails}>Close</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .findings-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
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

  .filter-bar {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .filter-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
  }

  .filter-btn:hover {
    border-color: var(--primary);
    color: var(--text-primary);
  }

  .filter-btn.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .findings-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .finding-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    transition: all 0.2s;
  }

  .finding-card:hover {
    border-color: var(--primary);
  }

  .finding-header {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .cvss-badge, .cve-badge {
    padding: 0.25rem 0.5rem;
    background: var(--bg-dark);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
  }

  .finding-card h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .finding-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .finding-meta {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  .finding-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
  }

  .finding-date {
    color: var(--text-secondary);
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

  /* Finding card clickable */
  .finding-card {
    cursor: pointer;
  }

  .finding-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  /* Finding Detail Modal Styles */
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
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-large {
    max-width: 900px;
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

  .finding-detail-content {
    padding: 1.5rem;
    max-height: 70vh;
    overflow-y: auto;
  }

  .detail-section {
    margin-bottom: 2rem;
  }

  .detail-section h4 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--border);
    color: var(--text-primary);
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .detail-header h3 {
    font-size: 1.5rem;
    font-weight: 700;
    flex: 1;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .cvss-badge-large, .cve-badge-large {
    padding: 0.5rem 1rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
    font-weight: 600;
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

  .description-text {
    line-height: 1.6;
    color: var(--text-primary);
  }

  .target-info {
    background: var(--bg-dark);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
  }

  .info-row {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .info-label {
    font-weight: 600;
    min-width: 80px;
    color: var(--text-secondary);
  }

  .monospace {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
  }

  .resources-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .resource-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
  }

  .resource-icon {
    font-size: 1.25rem;
  }

  .evidence-box {
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
  }

  .evidence-box pre {
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .remediation-box {
    background: var(--bg-dark);
    border-left: 4px solid var(--success);
    padding: 1rem;
    border-radius: 0.375rem;
  }

  .remediation-box p {
    line-height: 1.6;
    margin: 0;
  }

  .references-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .reference-item a {
    display: block;
    padding: 0.75rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--primary);
    text-decoration: none;
    transition: all 0.2s;
  }

  .reference-item a:hover {
    border-color: var(--primary);
    background: var(--bg-card);
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid var(--border);
  }
</style>
