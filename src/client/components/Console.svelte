<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let auditLogs: any[] = [];
  let filteredLogs: any[] = [];
  let loading = true;
  let error = '';
  let selectedScanId = '';
  let selectedEventType = '';
  let selectedSeverity = '';
  let autoScroll = true;
  let refreshInterval: any = null;

  const eventTypes = [
    'SCAN_STARTED', 'SCAN_COMPLETED', 'SCAN_FAILED',
    'AGENT_CREATED', 'AGENT_REASONING',
    'TASK_CREATED', 'TASK_STARTED', 'TASK_COMPLETED', 'TASK_FAILED',
    'TOOL_EXECUTION', 'LLM_INTERACTION',
    'FINDING_CREATED', 'DECISION_MADE',
    'ERROR_OCCURRED', 'PROGRESS_UPDATE'
  ];

  const severities = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

  async function fetchAuditLogs() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        error = 'Not authenticated';
        loading = false;
        return;
      }

      const params = new URLSearchParams();
      if (selectedScanId) params.append('scanId', selectedScanId);
      if (selectedEventType) params.append('eventType', selectedEventType);
      if (selectedSeverity) params.append('severity', selectedSeverity);

      const query = `
        query AuditLogs($scanId: ID, $eventType: AuditEventType, $severity: AuditSeverity) {
          auditLogs(scanId: $scanId, eventType: $eventType, severity: $severity) {
            id
            eventType
            severity
            title
            message
            timestamp
            data
            scan {
              id
              name
              status
            }
            agent {
              id
              name
              type
            }
            task {
              id
              type
              description
            }
          }
        }
      `;

      const variables: any = {};
      if (selectedScanId) variables.scanId = selectedScanId;
      if (selectedEventType) variables.eventType = selectedEventType;
      if (selectedSeverity) variables.severity = selectedSeverity;

      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query, variables })
      });

      const result = await response.json();

      if (result.errors) {
        error = result.errors[0].message;
        loading = false;
        return;
      }

      auditLogs = result.data.auditLogs || [];
      applyFilters();
      loading = false;

      if (autoScroll) {
        scrollToBottom();
      }
    } catch (err: any) {
      error = err.message;
      loading = false;
    }
  }

  function applyFilters() {
    filteredLogs = auditLogs;
  }

  function scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.console-content');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }

  function getSeverityClass(severity: string): string {
    return `severity-${severity.toLowerCase()}`;
  }

  function getEventTypeIcon(eventType: string): string {
    const icons: Record<string, string> = {
      SCAN_STARTED: '🚀',
      SCAN_COMPLETED: '✅',
      SCAN_FAILED: '❌',
      AGENT_CREATED: '🤖',
      AGENT_REASONING: '💭',
      TASK_CREATED: '📋',
      TASK_STARTED: '▶️',
      TASK_COMPLETED: '✔️',
      TASK_FAILED: '⚠️',
      TOOL_EXECUTION: '🔧',
      LLM_INTERACTION: '🧠',
      FINDING_CREATED: '🔍',
      DECISION_MADE: '⚡',
      ERROR_OCCURRED: '💥',
      PROGRESS_UPDATE: '📊'
    };
    return icons[eventType] || '📝';
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function clearFilters() {
    selectedScanId = '';
    selectedEventType = '';
    selectedSeverity = '';
    fetchAuditLogs();
  }

  function toggleAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    } else {
      refreshInterval = setInterval(fetchAuditLogs, 2000);
    }
  }

  onMount(() => {
    fetchAuditLogs();
    // Auto-refresh every 2 seconds
    refreshInterval = setInterval(fetchAuditLogs, 2000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
</script>

<div class="console-container">
  <div class="console-header">
    <h1>📟 Execution Console</h1>
    <p>Real-time view of all scan execution events, LLM interactions, and decisions</p>
  </div>

  <div class="console-controls">
    <div class="filter-group">
      <input
        type="text"
        placeholder="Filter by Scan ID..."
        bind:value={selectedScanId}
        on:change={fetchAuditLogs}
        class="filter-input"
      />

      <select bind:value={selectedEventType} on:change={fetchAuditLogs} class="filter-select">
        <option value="">All Event Types</option>
        {#each eventTypes as type}
          <option value={type}>{type.replace(/_/g, ' ')}</option>
        {/each}
      </select>

      <select bind:value={selectedSeverity} on:change={fetchAuditLogs} class="filter-select">
        <option value="">All Severities</option>
        {#each severities as severity}
          <option value={severity}>{severity}</option>
        {/each}
      </select>

      <button class="btn btn-secondary" on:click={clearFilters}>Clear Filters</button>
    </div>

    <div class="action-group">
      <label class="auto-scroll-toggle">
        <input type="checkbox" bind:checked={autoScroll} />
        Auto-scroll
      </label>

      <button
        class="btn {refreshInterval ? 'btn-warning' : 'btn-primary'}"
        on:click={toggleAutoRefresh}
      >
        {refreshInterval ? '⏸️ Pause' : '▶️ Resume'} Auto-refresh
      </button>

      <button class="btn btn-secondary" on:click={fetchAuditLogs}>🔄 Refresh</button>
    </div>
  </div>

  {#if loading && auditLogs.length === 0}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading audit logs...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <span class="error-icon">⚠️</span>
      <p>{error}</p>
    </div>
  {:else if filteredLogs.length === 0}
    <div class="empty-state">
      <span class="empty-icon">📭</span>
      <h2>No Logs Found</h2>
      <p>No audit logs match your current filters. Try adjusting your filters or start a new scan.</p>
    </div>
  {:else}
    <div class="console-content">
      {#each filteredLogs as log (log.id)}
        <div class="log-entry {getSeverityClass(log.severity)}">
          <div class="log-header">
            <span class="log-timestamp">{formatTimestamp(log.timestamp)}</span>
            <span class="log-icon">{getEventTypeIcon(log.eventType)}</span>
            <span class="log-event-type">{log.eventType.replace(/_/g, ' ')}</span>
            <span class="log-severity badge-{log.severity.toLowerCase()}">{log.severity}</span>
          </div>
          <div class="log-title">{log.title}</div>
          <div class="log-message">{log.message}</div>

          {#if log.scan}
            <div class="log-context">
              <span class="context-label">Scan:</span>
              <span class="context-value">{log.scan.name} ({log.scan.status})</span>
            </div>
          {/if}

          {#if log.agent}
            <div class="log-context">
              <span class="context-label">Agent:</span>
              <span class="context-value">{log.agent.type} - {log.agent.name}</span>
            </div>
          {/if}

          {#if log.task}
            <div class="log-context">
              <span class="context-label">Task:</span>
              <span class="context-value">{log.task.type} - {log.task.description}</span>
            </div>
          {/if}

          {#if log.data && Object.keys(log.data).length > 0}
            <details class="log-data">
              <summary>📋 View Details</summary>
              <pre>{JSON.stringify(log.data, null, 2)}</pre>
            </details>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .console-container {
    padding: 2rem;
    min-height: 100vh;
    background: var(--bg-primary);
  }

  .console-header {
    margin-bottom: 2rem;
  }

  .console-header h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  .console-header p {
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .console-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    flex-wrap: wrap;
  }

  .filter-group, .action-group {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-input, .filter-select {
    padding: 0.5rem 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
  }

  .filter-input {
    min-width: 200px;
  }

  .auto-scroll-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }

  .console-content {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 0.75rem;
    padding: 1.5rem;
    max-height: calc(100vh - 350px);
    overflow-y: auto;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.875rem;
  }

  .log-entry {
    padding: 1rem;
    margin-bottom: 1rem;
    background: #252525;
    border-left: 4px solid #666;
    border-radius: 0.5rem;
    transition: all 0.2s;
  }

  .log-entry:hover {
    background: #2a2a2a;
    transform: translateX(4px);
  }

  .log-entry.severity-debug { border-left-color: #6c757d; }
  .log-entry.severity-info { border-left-color: #0dcaf0; }
  .log-entry.severity-warning { border-left-color: #ffc107; }
  .log-entry.severity-error { border-left-color: #dc3545; }
  .log-entry.severity-critical { border-left-color: #d9534f; animation: pulse 2s infinite; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .log-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .log-timestamp {
    color: #888;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .log-icon {
    font-size: 1.25rem;
  }

  .log-event-type {
    color: #0dcaf0;
    font-weight: 600;
    text-transform: capitalize;
  }

  .log-severity {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge-debug { background: #6c757d; color: white; }
  .badge-info { background: #0dcaf0; color: black; }
  .badge-warning { background: #ffc107; color: black; }
  .badge-error { background: #dc3545; color: white; }
  .badge-critical { background: #d9534f; color: white; }

  .log-title {
    color: #fff;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .log-message {
    color: #ccc;
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }

  .log-context {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
  }

  .context-label {
    color: #888;
    font-weight: 600;
  }

  .context-value {
    color: #aaa;
  }

  .log-data {
    margin-top: 0.75rem;
    cursor: pointer;
  }

  .log-data summary {
    color: #0dcaf0;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.5rem;
    background: #1a1a1a;
    border-radius: 0.25rem;
    user-select: none;
  }

  .log-data pre {
    margin-top: 0.5rem;
    padding: 1rem;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 0.25rem;
    overflow-x: auto;
    color: #0dcaf0;
    font-size: 0.75rem;
  }

  .loading-state, .error-state, .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .spinner {
    width: 3rem;
    height: 3rem;
    border: 4px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon, .empty-icon {
    font-size: 4rem;
    display: block;
    margin-bottom: 1rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-secondary {
    background: var(--secondary);
    color: white;
  }

  .btn-secondary:hover {
    opacity: 0.9;
  }

  .btn-warning {
    background: #ffc107;
    color: black;
  }

  .btn-warning:hover {
    opacity: 0.9;
  }
</style>
