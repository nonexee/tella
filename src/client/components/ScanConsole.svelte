<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let scanId: string;

  let agents: any[] = [];
  let currentAgentIndex = 0;
  let totalAgents = 0;
  let scanInfo: any = null;
  let auditLogs: any[] = [];
  let refreshInterval: any = null;
  let thinkingDots = '⠿';
  let cwd = '/';
  let isThinking = false;

  onMount(async () => {
    await loadScanInfo();
    await fetchAuditLogs();
    refreshInterval = setInterval(fetchAuditLogs, 1000);

    // Animate thinking indicator
    setInterval(() => {
      const dots = ['⠿', '⠾', '⠽', '⠻', '⠯', '⠟', '⠷', '⠾'];
      thinkingDots = dots[Math.floor(Date.now() / 100) % dots.length];
    }, 100);
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
                target {
                  name
                  url
                }
                agents {
                  id
                  name
                  type
                  role
                  status
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
        agents = result.data.scan.agents || [];
        totalAgents = agents.length;
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
        auditLogs = result.data.auditLogs;
        isThinking = scanInfo?.status === 'RUNNING';
        scrollToBottom();
      }

      await loadScanInfo();
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.console-output');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }

  // Group logs by agent for sequential display
  $: agentLogs = groupLogsByAgent(auditLogs);

  function groupLogsByAgent(logs: any[]) {
    const grouped = new Map();

    logs.forEach(log => {
      const agentId = log.agent?.id || 'system';
      if (!grouped.has(agentId)) {
        grouped.set(agentId, {
          agent: log.agent,
          logs: []
        });
      }
      grouped.get(agentId).logs.push(log);
    });

    return Array.from(grouped.values());
  }

  function formatThought(message: string): string {
    return message;
  }

  function formatToolCall(log: any): string {
    if (log.eventType === 'TOOL_EXECUTION' && log.data) {
      const toolType = log.data.toolType || log.task?.type || 'unknown';
      const params = log.data.params || {};

      // Format like: grep(filter:*.js pattern:window\.location\.href)
      const paramStr = Object.entries(params)
        .map(([key, value]) => `${key}:${value}`)
        .join(' ');

      return paramStr ? `${toolType}(${paramStr})` : toolType;
    }
    return log.title;
  }

  function getAgentNumber(agentGroup: any): number {
    const agentIndex = agents.findIndex(a => a.id === agentGroup.agent?.id);
    return agentIndex >= 0 ? agentIndex + 1 : 0;
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  }
</script>

<div class="hacktron-console">
  <div class="console-header">
    <div class="logo">TELLA AI</div>
    {#if scanInfo}
      <div class="scan-meta">
        <span class="target-name">{scanInfo.target.name}</span>
        <span class="divider">│</span>
        <span class="target-url">{scanInfo.target.url}</span>
      </div>
    {/if}
  </div>

  <div class="console-output">
    {#each agentLogs as agentGroup}
      {@const agentNum = getAgentNumber(agentGroup)}

      {#if agentGroup.agent}
        <!-- Agent Started -->
        <div class="log-line agent-start">
          <span class="text-blue">Starting Agent {agentNum}/{totalAgents}: {agentGroup.agent.role || agentGroup.agent.type}</span>
        </div>
      {/if}

      {#each agentGroup.logs as log}
        <!-- Thought Process -->
        {#if log.eventType === 'AGENT_REASONING' || log.eventType === 'DECISION_MADE'}
          <div class="log-line thought">
            <span class="thought-marker">◆ Thought:</span>
            <span class="thought-text">{formatThought(log.message)}</span>
          </div>

        <!-- Tool Execution -->
        {:else if log.eventType === 'TOOL_EXECUTION'}
          <div class="log-line tool">
            <span class="tool-prefix">Tool →</span>
            <span class="tool-call">{formatToolCall(log)}</span>
          </div>

          <!-- Tool Result -->
          {#if log.data?.result}
            <div class="log-line tool-result">
              {#if log.data.result.files}
                <div class="files-list">
                  <span class="label">• Files list</span>
                  {#each log.data.result.files as file}
                    <div class="file-item">
                      <span class="label">• Path string:</span>
                      <span class="text-green">{file.path}</span>
                      {#if file.line}
                        <span class="text-green">/{file.path}</span>
                      {/if}
                    </div>
                    {#if file.line}
                      <div class="file-item">
                        <span class="label">• Line number:</span>
                        <span>{file.line}</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              {:else if typeof log.data.result === 'string'}
                <pre class="result-text">{log.data.result}</pre>
              {:else}
                <pre class="result-text">{JSON.stringify(log.data.result, null, 2)}</pre>
              {/if}
            </div>
          {/if}

        <!-- Task Status -->
        {:else if log.eventType === 'TASK_STARTED'}
          <div class="log-line info">
            <span class="dim">{log.title}</span>
          </div>

        <!-- Findings -->
        {:else if log.eventType === 'FINDING_CREATED'}
          <div class="log-line finding">
            <span class="finding-marker">• Finding:</span>
            <span class="finding-title">{log.title}</span>
          </div>
          {#if log.message}
            <div class="log-line finding-detail">
              <span class="dim">{log.message}</span>
            </div>
          {/if}

        <!-- Progress Updates -->
        {:else if log.eventType === 'PROGRESS_UPDATE'}
          <div class="log-line dim">
            {log.message}
          </div>

        <!-- Stream Completed -->
        {:else if log.eventType === 'TASK_COMPLETED' && log.title.includes('Stream completed')}
          <div class="log-line dim">
            Stream completed.
          </div>
        {/if}
      {/each}

      {#if agentGroup.agent}
        <!-- Agent Completed -->
        <div class="log-line agent-end">
          <span class="text-blue">Agent {agentNum}/{totalAgents} completed: {agentGroup.agent.role || agentGroup.agent.type}</span>
        </div>
        <div class="spacer"></div>
      {/if}
    {/each}

    {#if auditLogs.length === 0}
      <div class="log-line dim">
        Waiting for scan to initialize...
      </div>
    {/if}
  </div>

  <div class="console-footer">
    <div class="footer-left">
      {#if isThinking}
        <span class="thinking">thinking {thinkingDots}</span>
      {:else}
        <span class="status">CWD:</span>
      {/if}
    </div>
    <div class="footer-center">
      <span class="hint">Press ! for shell mode</span>
    </div>
    <div class="footer-right">
      <span class="prompt">&gt; </span>
      <span class="cursor">▋</span>
      <span class="help-text dim">What are we securing today? Use /help for more information.</span>
    </div>
  </div>
</div>

<style>
  .hacktron-console {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #000;
    color: #e0e0e0;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
  }

  .console-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: #000;
    border-bottom: 1px solid #333;
  }

  .logo {
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 2px;
    color: #fff;
  }

  .scan-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  .target-name {
    color: #0dcaf0;
  }

  .divider {
    color: #444;
  }

  .target-url {
    color: #888;
  }

  .console-output {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    background: #000;
  }

  .log-line {
    margin-bottom: 0.5rem;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .spacer {
    height: 1.5rem;
  }

  /* Agent Start/End */
  .agent-start, .agent-end {
    margin: 1rem 0;
  }

  .text-blue {
    color: #5d9cec;
    font-weight: 500;
  }

  /* Thought Process */
  .thought {
    margin: 1rem 0 0.5rem 0;
  }

  .thought-marker {
    color: #fff;
    font-weight: 600;
  }

  .thought-text {
    color: #ccc;
    display: block;
    margin-left: 2rem;
    margin-top: 0.5rem;
    line-height: 1.8;
  }

  /* Tool Execution */
  .tool {
    margin: 0.75rem 0 0.25rem 0;
  }

  .tool-prefix {
    color: #fff;
    font-weight: 600;
  }

  .tool-call {
    color: #e0e0e0;
  }

  /* Tool Results */
  .tool-result {
    margin-left: 2rem;
    margin-top: 0.5rem;
    color: #999;
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-item {
    margin-left: 1rem;
  }

  .label {
    color: #888;
  }

  .text-green {
    color: #5cb85c;
  }

  .result-text {
    margin: 0.5rem 0;
    padding: 0.75rem;
    background: #0a0a0a;
    border-left: 3px solid #333;
    color: #aaa;
    overflow-x: auto;
  }

  /* Findings */
  .finding {
    margin: 0.75rem 0 0.25rem 0;
  }

  .finding-marker {
    color: #ffc107;
    font-weight: 600;
  }

  .finding-title {
    color: #fff;
  }

  .finding-detail {
    margin-left: 2rem;
    color: #999;
  }

  /* Utility */
  .dim {
    color: #666;
  }

  .info {
    color: #888;
  }

  /* Footer / Status Bar */
  .console-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    background: #1a1a1a;
    border-top: 1px solid #333;
    font-size: 0.875rem;
  }

  .footer-left, .footer-center, .footer-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .footer-right {
    flex: 1;
    justify-content: flex-end;
  }

  .thinking {
    color: #ffc107;
    font-weight: 600;
  }

  .status {
    color: #888;
    font-weight: 600;
  }

  .hint {
    color: #666;
    font-size: 0.8rem;
  }

  .prompt {
    color: #0dcaf0;
    font-weight: 700;
  }

  .cursor {
    color: #0dcaf0;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }

  .help-text {
    color: #555;
    font-size: 0.8rem;
    margin-left: 0.5rem;
  }

  /* Scrollbar */
  .console-output::-webkit-scrollbar {
    width: 8px;
  }

  .console-output::-webkit-scrollbar-track {
    background: #0a0a0a;
  }

  .console-output::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 4px;
  }

  .console-output::-webkit-scrollbar-thumb:hover {
    background: #444;
  }
</style>
