<script lang="ts">
  import { onMount } from 'svelte';

  let findings: any[] = [];

  onMount(async () => {
    await fetchFindings();
    const interval = setInterval(fetchFindings, 5000);
    return () => clearInterval(interval);
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
            query RecentFindings {
              findings(status: NEW) {
                id
                title
                severity
                category
                confidence
                target {
                  name
                }
                createdAt
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.findings) {
        findings = result.data.findings.slice(0, 10);
      }
    } catch (err) {
      console.error('Failed to fetch findings:', err);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
</script>

<div class="card recent-findings">
  <h2 class="section-title">
    <span>🐛</span>
    Recent Findings
  </h2>

  {#if findings.length === 0}
    <div class="empty-state">
      <p>No new findings</p>
    </div>
  {:else}
    <div class="findings-list">
      {#each findings as finding (finding.id)}
        <div class="finding-item fade-in">
          <div class="finding-severity">
            <span class="badge badge-{finding.severity.toLowerCase()}">
              {finding.severity}
            </span>
          </div>
          <div class="finding-info">
            <div class="finding-title">{finding.title}</div>
            <div class="finding-meta">
              <span class="finding-target">{finding.target.name}</span>
              <span class="finding-category">{finding.category}</span>
              <span class="finding-time">{formatDate(finding.createdAt)}</span>
            </div>
          </div>
          <div class="finding-confidence">
            <div class="confidence-label">Confidence</div>
            <div class="confidence-value">{Math.round(finding.confidence * 100)}%</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .recent-findings {
    width: 100%;
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

  .findings-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .finding-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-dark);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    transition: all 0.2s;
  }

  .finding-item:hover {
    border-color: var(--primary);
    cursor: pointer;
  }

  .finding-info {
    flex: 1;
  }

  .finding-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .finding-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .finding-target {
    font-family: 'JetBrains Mono', monospace;
  }

  .finding-confidence {
    text-align: right;
  }

  .confidence-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .confidence-value {
    font-weight: 600;
    color: var(--success);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }
</style>
