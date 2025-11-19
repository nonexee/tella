<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let scanId: string;

  let auditLogs: any[] = [];
  let loading = true;
  let error = '';
  let scanInfo: any = null;
  let refreshInterval: any = null;
  let autoScroll = true;

  onMount(async () => {
    await loadScanInfo();
    await fetchAuditLogs();
    // Auto-refresh every 1 second for real-time feel
    refreshInterval = setInterval(fetchAuditLogs, 1000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  async function loadScanInfo() {
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
            query GetScan($id: ID!) {
              scan(id: $id) {
                id
                name
                status
                progress
                createdAt
                target {
                  id
                  name
                  url
                  type
                }
              }
            }
          `,
          variables: { id: scanId }
        })
      });

      const result = await response.json();
      if (result.data?.scan) {
        scanInfo = result.data.scan;
      }
    } catch (err: any) {
      console.error('Failed to load scan info:', err);
    }
  }

  async function fetchAuditLogs() {
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
            query AuditLogs($scanId: ID!) {
              auditLogs(scanId: $scanId) {
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
          `,
          variables: { scanId }
        })
      });

      const result = await response.json();

      if (result.errors) {
        error = result.errors[0].message;
        loading = false;
        return;
      }

      const newLogs = result.data.auditLogs || [];

      // Only update if there are new logs
      if (newLogs.length !== auditLogs.length) {
        auditLogs = newLogs;
        if (autoScroll) {
          scrollToBottom();
        }
      }

      loading = false;

      // Also refresh scan info
      if (scanInfo && scanInfo.status === 'RUNNING') {
        await loadScanInfo();
      }
    } catch (err: any) {
      error = err.message;
      loading = false;
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.console-stream');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
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
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }

  function getStatusBadgeClass(status: string): string {
    const classes: Record<string, string> = {
      'PENDING': 'badge-pending',
      'QUEUED': 'badge-queued',
      'RUNNING': 'badge-running',
      'COMPLETED': 'badge-completed',
      'FAILED': 'badge-failed',
      'CANCELLED': 'badge-cancelled'
    };
    return classes[status] || 'badge-default';
  }
</script>

<div class="scan-console">
  {#if scanInfo}
    <header class="scan-header">
      <div class="scan-title-area">
        <h1>🎯 Live Execution Console</h1>
        <div class="scan-info">
          <span class="scan-name">{scanInfo.name}</span>
          <span class="separator">•</span>
          <span class="target-name">{scanInfo.target.name}</span>
          <span class="separator">•</span>
          <span class="target-url">{scanInfo.target.url}</span>
        </div>
      </div>
      <div class="scan-status-area">
        <div class="status-badge {getStatusBadgeClass(scanInfo.status)}">
          {scanInfo.status}
        </div>
        {#if scanInfo.status === 'RUNNING'}
          <div class="progress-bar">
            <div class="progress-fill" style="width: {scanInfo.progress}%"></div>
            <span class="progress-text">{scanInfo.progress}%</span>
          </div>
        {/if}
      </div>
    </header>
  {/if}

  {#if loading && auditLogs.length === 0}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Initializing console...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <span class="error-icon">⚠️</span>
      <p>{error}</p>
    </div>
  {:else if auditLogs.length === 0}
    <div class="empty-state">
      <div class="waiting-animation">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <h2>Waiting for scan to start...</h2>
      <p>The console will show live updates as the scan executes.</p>
    </div>
  {:else}
    <div class="console-stream">
      {#each auditLogs as log (log.id)}
        <div class="stream-entry severity-{log.severity.toLowerCase()} event-{log.eventType.toLowerCase()}">
          <div class="entry-header">
            <span class="entry-timestamp">{formatTimestamp(log.timestamp)}</span>
            <span class="entry-icon">{getEventTypeIcon(log.eventType)}</span>
            <span class="entry-type">{log.eventType.replace(/_/g, ' ')}</span>
            {#if log.agent}
              <span class="entry-agent">{log.agent.type}</span>
            {/if}
          </div>

          <div class="entry-title">{log.title}</div>

          {#if log.message}
            <div class="entry-message">{log.message}</div>
          {/if}

          {#if log.task}
            <div class="entry-context">
              <span class="context-icon">📋</span>
              <span class="context-text">{log.task.type}: {log.task.description}</span>
            </div>
          {/if}

          {#if log.data && Object.keys(log.data).length > 0}
            <details class="entry-data">
              <summary>View detailed data</summary>
              <pre>{JSON.stringify(log.data, null, 2)}</pre>
            </details>
          {/if}
        </div>
      {/each}

      {#if scanInfo && scanInfo.status === 'RUNNING'}
        <div class="stream-indicator">
          <span class="pulse"></span>
          <span class="text">Streaming live...</span>
        </div>
      {/if}
    </div>
  {/if}

  <div class="console-controls">
    <label class="control-label">
      <input type="checkbox" bind:checked={autoScroll} />
      Auto-scroll to latest
    </label>
  </div>
</div>

<style>
  .scan-console {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0a0a0a;
    color: #e0e0e0;
  }

  .scan-header {
    padding: 1.5rem 2rem;
    background: #1a1a1a;
    border-bottom: 2px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
  }

  .scan-title-area h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #fff;
    margin: 0 0 0.5rem 0;
  }

  .scan-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #999;
  }

  .scan-name {
    color: #0dcaf0;
    font-weight: 600;
  }

  .target-url {
    font-family: 'JetBrains Mono', monospace;
    color: #aaa;
  }

  .separator {
    color: #555;
  }

  .scan-status-area {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .status-badge {
    padding: 0.5rem 1rem;
    border-radius: 1.5rem;
    font-size: 0.875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-running {
    background: #198754;
    color: white;
    animation: pulse-glow 2s infinite;
  }

  .badge-completed {
    background: #0dcaf0;
    color: black;
  }

  .badge-failed {
    background: #dc3545;
    color: white;
  }

  .badge-pending, .badge-queued {
    background: #6c757d;
    color: white;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 10px rgba(25, 135, 84, 0.5); }
    50% { box-shadow: 0 0 20px rgba(25, 135, 84, 0.8); }
  }

  .progress-bar {
    width: 200px;
    height: 24px;
    background: #2a2a2a;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #198754, #0dcaf0);
    transition: width 0.5s ease;
  }

  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.75rem;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .console-stream {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .stream-entry {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: #1a1a1a;
    border-left: 4px solid #666;
    border-radius: 0.5rem;
    animation: slide-in 0.3s ease-out;
  }

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .stream-entry.severity-debug { border-left-color: #6c757d; }
  .stream-entry.severity-info { border-left-color: #0dcaf0; }
  .stream-entry.severity-warning { border-left-color: #ffc107; }
  .stream-entry.severity-error { border-left-color: #dc3545; }
  .stream-entry.severity-critical {
    border-left-color: #d9534f;
    background: rgba(217, 83, 79, 0.1);
    animation: slide-in 0.3s ease-out, pulse-critical 2s infinite;
  }

  @keyframes pulse-critical {
    0%, 100% { box-shadow: 0 0 0 rgba(217, 83, 79, 0); }
    50% { box-shadow: 0 0 20px rgba(217, 83, 79, 0.3); }
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .entry-timestamp {
    color: #666;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .entry-icon {
    font-size: 1.25rem;
  }

  .entry-type {
    color: #0dcaf0;
    font-weight: 600;
    text-transform: capitalize;
  }

  .entry-agent {
    padding: 0.25rem 0.5rem;
    background: rgba(13, 202, 240, 0.2);
    border: 1px solid rgba(13, 202, 240, 0.4);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: #0dcaf0;
  }

  .entry-title {
    color: #fff;
    font-weight: 600;
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }

  .entry-message {
    color: #ccc;
    white-space: pre-wrap;
    margin-bottom: 0.5rem;
  }

  .entry-context {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(13, 202, 240, 0.1);
    border-radius: 0.25rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }

  .context-icon {
    font-size: 1rem;
  }

  .context-text {
    color: #aaa;
  }

  .entry-data {
    margin-top: 0.75rem;
    cursor: pointer;
  }

  .entry-data summary {
    color: #0dcaf0;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.5rem;
    background: #0a0a0a;
    border-radius: 0.25rem;
    user-select: none;
  }

  .entry-data pre {
    margin-top: 0.5rem;
    padding: 1rem;
    background: #0a0a0a;
    border: 1px solid #333;
    border-radius: 0.25rem;
    overflow-x: auto;
    color: #0dcaf0;
    font-size: 0.75rem;
  }

  .stream-indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    justify-content: center;
    color: #0dcaf0;
    font-size: 0.875rem;
  }

  .pulse {
    width: 12px;
    height: 12px;
    background: #0dcaf0;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.5;
    }
  }

  .loading-state, .error-state, .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
  }

  .spinner {
    width: 3rem;
    height: 3rem;
    border: 4px solid #333;
    border-top-color: #0dcaf0;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .waiting-animation {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .dot {
    width: 1rem;
    height: 1rem;
    background: #0dcaf0;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(1) { animation-delay: -0.32s; }
  .dot:nth-child(2) { animation-delay: -0.16s; }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  .empty-state h2 {
    color: #fff;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: #999;
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .console-controls {
    padding: 1rem 2rem;
    background: #1a1a1a;
    border-top: 1px solid #333;
  }

  .control-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
    color: #aaa;
    font-size: 0.875rem;
  }

  .control-label input[type="checkbox"] {
    cursor: pointer;
  }
</style>
