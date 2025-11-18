<script lang="ts">
  import { onMount } from 'svelte';

  let findings: any[] = [];
  let loading = true;
  let filter = 'all'; // all, critical, high, medium, low

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
        <div class="finding-card fade-in">
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
</style>
