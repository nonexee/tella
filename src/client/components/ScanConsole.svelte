<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { subscribeScanUpdated, subscribeScanProgress } from '../lib/subscription-client';

  export let scanId: string;

  let scanInfo: any = null;
  let auditLogs: any[] = [];
  let refreshInterval: any = null;
  let consoleContainer: HTMLElement;
  let isAtBottom = true;
  let lastScrollTop = 0;
  let unsubscribeScan: (() => void) | null = null;
  let unsubscribeProgress: (() => void) | null = null;

  onMount(async () => {
    await loadScanInfo();
    await fetchAuditLogs();

    // Subscribe to real-time scan updates
    unsubscribeScan = subscribeScanUpdated(
      scanId,
      (updatedScan) => {
        scanInfo = { ...scanInfo, ...updatedScan };

        // If scan completed or failed, fetch final audit logs
        if (updatedScan.status === 'COMPLETED' || updatedScan.status === 'FAILED') {
          fetchAuditLogs();
        }
      },
      (error) => {
        console.error('Scan subscription error:', error);
      }
    );

    // Subscribe to scan progress updates
    unsubscribeProgress = subscribeScanProgress(
      scanId,
      (progress) => {
        // Log progress updates
        console.log('Scan progress:', progress);
      },
      (error) => {
        console.error('Progress subscription error:', error);
      }
    );

    // Keep polling for audit logs since they're not in subscriptions yet
    // TODO: Add audit log subscriptions to backend
    refreshInterval = setInterval(fetchAuditLogs, 2000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    if (unsubscribeScan) {
      unsubscribeScan();
    }
    if (unsubscribeProgress) {
      unsubscribeProgress();
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
                target {
                  name
                  url
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
    } catch (err) {
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
                agent {
                  id
                  type
                  role
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
      if (result.data?.auditLogs) {
        const prevLength = auditLogs.length;
        auditLogs = result.data.auditLogs;

        // Only auto-scroll if we were already at bottom AND new logs arrived
        if (isAtBottom && auditLogs.length > prevLength) {
          scrollToBottom();
        }
      }

      await loadScanInfo();
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  }

  function handleScroll() {
    if (!consoleContainer) return;

    const { scrollTop, scrollHeight, clientHeight } = consoleContainer;

    // Consider "at bottom" if within 50px of bottom
    isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    lastScrollTop = scrollTop;
  }

  function scrollToBottom() {
    if (consoleContainer) {
      consoleContainer.scrollTop = consoleContainer.scrollHeight;
    }
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  function formatThought(log: any): string {
    if (log.data?.thought) {
      return log.data.thought;
    }
    return log.message || '';
  }

  function formatToolCall(log: any): { tool: string, params: string } {
    if (log.data?.tool && log.data?.command) {
      return {
        tool: log.data.tool,
        params: log.data.command
      };
    }
    return {
      tool: log.title || 'unknown',
      params: ''
    };
  }

  function getSeverityClass(severity: string): string {
    switch (severity) {
      case 'ERROR': return 'severity-error';
      case 'WARNING': return 'severity-warning';
      case 'INFO': return 'severity-info';
      case 'DEBUG': return 'severity-debug';
      default: return 'severity-info';
    }
  }
</script>

<div class="hacktron-console">
  <!-- Minimal Header -->
  <div class="console-header">
    <div class="logo">TELLA AI</div>
    {#if scanInfo}
      <div class="scan-meta">
        <span class="target-name">{scanInfo.target?.name || 'Unknown'}</span>
        <span class="divider">│</span>
        <span class="target-url">{scanInfo.target?.url || ''}</span>
        <span class="divider">│</span>
        <span class="status" class:status-running={scanInfo.status === 'RUNNING'} class:status-completed={scanInfo.status === 'COMPLETED'}>
          {scanInfo.status}
        </span>
      </div>
    {/if}
  </div>

  <!-- Console Output (Chronological, no grouping) -->
  <div
    class="console-output"
    bind:this={consoleContainer}
    on:scroll={handleScroll}
  >
    {#each auditLogs as log (log.id)}
      <!-- AGENT_REASONING - Thought -->
      {#if log.eventType === 'AGENT_REASONING'}
        <div class="log-line thought-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="thought-marker">◇ Thought:</span>
          <span class="thought-content">{formatThought(log)}</span>
        </div>

      <!-- TOOL_EXECUTION - Tool Call -->
      {:else if log.eventType === 'TOOL_EXECUTION'}
        {@const toolInfo = formatToolCall(log)}
        <div class="log-line tool-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="tool-marker">Tool →</span>
          <span class="tool-name">{toolInfo.tool}</span>
          {#if toolInfo.params}
            <span class="tool-params">({toolInfo.params})</span>
          {/if}
        </div>

        <!-- Tool Result (if exists) -->
        {#if log.data?.result}
          <div class="log-line tool-result-line">
            <span class="result-prefix">  └─</span>
            {#if typeof log.data.result === 'string'}
              <span class="result-text">{log.data.result}</span>
            {:else}
              <pre class="result-json">{JSON.stringify(log.data.result, null, 2)}</pre>
            {/if}
          </div>
        {/if}

      <!-- DECISION_MADE -->
      {:else if log.eventType === 'DECISION_MADE'}
        <div class="log-line decision-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="decision-marker">⚡ Decision:</span>
          <span class="decision-content">{log.title}</span>
        </div>
        {#if log.message}
          <div class="log-line decision-detail">
            <span class="indent">  </span>
            <span class="detail-text">{log.message}</span>
          </div>
        {/if}

      <!-- TASK_STARTED -->
      {:else if log.eventType === 'TASK_STARTED'}
        <div class="log-line task-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="task-marker">▶</span>
          <span class="task-content">{log.message}</span>
        </div>

      <!-- TASK_COMPLETED -->
      {:else if log.eventType === 'TASK_COMPLETED'}
        <div class="log-line task-complete-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="task-complete-marker">✓</span>
          <span class="task-content">{log.message}</span>
        </div>

      <!-- TASK_FAILED -->
      {:else if log.eventType === 'TASK_FAILED'}
        <div class="log-line task-failed-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="task-failed-marker">✗</span>
          <span class="task-content">{log.message}</span>
        </div>

      <!-- FINDING_CREATED -->
      {:else if log.eventType === 'FINDING_CREATED'}
        <div class="log-line finding-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="finding-marker">⚠</span>
          <span class="finding-content">{log.title}</span>
        </div>

      <!-- SCAN_STARTED -->
      {:else if log.eventType === 'SCAN_STARTED'}
        <div class="log-line scan-start-line">
          <span class="scan-separator">{'═'.repeat(80)}</span>
          <span class="scan-title">🛡️  SCAN STARTED</span>
          <span class="scan-separator">{'═'.repeat(80)}</span>
        </div>

      <!-- SCAN_COMPLETED -->
      {:else if log.eventType === 'SCAN_COMPLETED'}
        <div class="log-line scan-complete-line">
          <span class="scan-separator">{'═'.repeat(80)}</span>
          <span class="scan-title">✓ SCAN COMPLETED</span>
          <span class="scan-separator">{'═'.repeat(80)}</span>
        </div>

      <!-- ERROR_OCCURRED -->
      {:else if log.eventType === 'ERROR_OCCURRED'}
        <div class="log-line error-line">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="error-marker">✗ Error:</span>
          <span class="error-content">{log.message}</span>
        </div>

      <!-- Default (Other Events) -->
      {:else}
        <div class="log-line default-line {getSeverityClass(log.severity)}">
          <span class="timestamp">{formatTimestamp(log.timestamp)}</span>
          <span class="default-content">{log.message || log.title}</span>
        </div>
      {/if}
    {/each}

    {#if auditLogs.length === 0}
      <div class="log-line empty-state">
        <span class="dim">Waiting for scan to initialize...</span>
      </div>
    {/if}
  </div>

  <!-- Minimal Footer -->
  <div class="console-footer">
    <div class="footer-content">
      {#if scanInfo?.status === 'RUNNING'}
        <span class="status-indicator running">● RUNNING</span>
      {:else if scanInfo?.status === 'COMPLETED'}
        <span class="status-indicator completed">● COMPLETED</span>
      {:else if scanInfo?.status === 'FAILED'}
        <span class="status-indicator failed">● FAILED</span>
      {:else}
        <span class="status-indicator idle">● IDLE</span>
      {/if}

      <span class="divider">│</span>
      <span class="log-count">{auditLogs.length} events</span>

      {#if !isAtBottom}
        <span class="divider">│</span>
        <button class="scroll-button" on:click={scrollToBottom}>
          ↓ Jump to bottom
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Base Console */
  .hacktron-console {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #000;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Header */
  .console-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: #0a0a0a;
    border-bottom: 1px solid #222;
  }

  .logo {
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: 3px;
    color: #0dcaf0;
  }

  .scan-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8rem;
  }

  .target-name {
    color: #5cb85c;
    font-weight: 500;
  }

  .divider {
    color: #333;
  }

  .target-url {
    color: #666;
  }

  .status {
    color: #888;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75rem;
  }

  .status-running {
    color: #ffc107;
  }

  .status-completed {
    color: #5cb85c;
  }

  /* Console Output */
  .console-output {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem 1.5rem;
    background: #000;
    scroll-behavior: smooth;
  }

  .log-line {
    margin-bottom: 0.35rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .timestamp {
    color: #444;
    font-size: 0.75rem;
    flex-shrink: 0;
    font-family: 'Fira Code', monospace;
    user-select: none;
  }

  /* Thought Lines */
  .thought-line {
    margin: 0.75rem 0;
  }

  .thought-marker {
    color: #0dcaf0;
    font-weight: 600;
    flex-shrink: 0;
  }

  .thought-content {
    color: #ccc;
    line-height: 1.6;
  }

  /* Tool Lines */
  .tool-line {
    margin: 0.5rem 0;
  }

  .tool-marker {
    color: #5cb85c;
    font-weight: 600;
    flex-shrink: 0;
  }

  .tool-name {
    color: #5cb85c;
    font-weight: 500;
  }

  .tool-params {
    color: #888;
  }

  .tool-result-line {
    margin-left: 1rem;
    color: #777;
  }

  .result-prefix {
    color: #444;
    flex-shrink: 0;
  }

  .result-text {
    color: #888;
  }

  .result-json {
    margin: 0;
    padding: 0.5rem;
    background: #0a0a0a;
    border-left: 2px solid #333;
    color: #777;
    font-size: 0.75rem;
    overflow-x: auto;
  }

  /* Decision Lines */
  .decision-line {
    margin: 0.75rem 0;
  }

  .decision-marker {
    color: #ffc107;
    font-weight: 600;
    flex-shrink: 0;
  }

  .decision-content {
    color: #fff;
    font-weight: 500;
  }

  .decision-detail {
    color: #999;
    margin-left: 1rem;
  }

  .indent {
    flex-shrink: 0;
  }

  .detail-text {
    color: #888;
  }

  /* Task Lines */
  .task-line {
    margin: 0.5rem 0;
  }

  .task-marker {
    color: #5d9cec;
    font-weight: 600;
    flex-shrink: 0;
  }

  .task-complete-line {
    margin: 0.5rem 0;
  }

  .task-complete-marker {
    color: #5cb85c;
    font-weight: 600;
    flex-shrink: 0;
  }

  .task-failed-line {
    margin: 0.5rem 0;
  }

  .task-failed-marker {
    color: #d9534f;
    font-weight: 600;
    flex-shrink: 0;
  }

  .task-content {
    color: #ccc;
  }

  /* Finding Lines */
  .finding-line {
    margin: 0.75rem 0;
  }

  .finding-marker {
    color: #ff6b6b;
    font-weight: 600;
    flex-shrink: 0;
  }

  .finding-content {
    color: #fff;
    font-weight: 500;
  }

  /* Scan Separator Lines */
  .scan-start-line,
  .scan-complete-line {
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .scan-start-line .scan-separator {
    color: #ff00ff;
  }

  .scan-start-line .scan-title {
    color: #ff00ff;
    font-weight: 700;
    font-size: 1.1rem;
  }

  .scan-complete-line .scan-separator {
    color: #5cb85c;
  }

  .scan-complete-line .scan-title {
    color: #5cb85c;
    font-weight: 700;
    font-size: 1.1rem;
  }

  /* Error Lines */
  .error-line {
    margin: 0.5rem 0;
  }

  .error-marker {
    color: #d9534f;
    font-weight: 600;
    flex-shrink: 0;
  }

  .error-content {
    color: #ff6b6b;
  }

  /* Default/Other Lines */
  .default-line {
    color: #888;
  }

  .severity-error {
    color: #d9534f;
  }

  .severity-warning {
    color: #ffc107;
  }

  .severity-info {
    color: #888;
  }

  .severity-debug {
    color: #666;
  }

  .default-content {
    color: inherit;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }

  .dim {
    color: #555;
    font-style: italic;
  }

  /* Footer */
  .console-footer {
    padding: 0.5rem 1.5rem;
    background: #0a0a0a;
    border-top: 1px solid #222;
    font-size: 0.75rem;
  }

  .footer-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .status-indicator {
    font-weight: 600;
    font-size: 0.75rem;
  }

  .status-indicator.running {
    color: #ffc107;
  }

  .status-indicator.completed {
    color: #5cb85c;
  }

  .status-indicator.failed {
    color: #d9534f;
  }

  .status-indicator.idle {
    color: #666;
  }

  .log-count {
    color: #666;
  }

  .scroll-button {
    background: none;
    border: 1px solid #333;
    color: #0dcaf0;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.75rem;
    transition: all 0.2s;
  }

  .scroll-button:hover {
    background: #0dcaf0;
    color: #000;
    border-color: #0dcaf0;
  }

  /* Scrollbar */
  .console-output::-webkit-scrollbar {
    width: 6px;
  }

  .console-output::-webkit-scrollbar-track {
    background: #000;
  }

  .console-output::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }

  .console-output::-webkit-scrollbar-thumb:hover {
    background: #444;
  }
</style>
