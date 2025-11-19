<script lang="ts">
  import { onMount } from 'svelte';

  let loading = true;
  let configStatus: any = null;

  onMount(async () => {
    await loadConfigStatus();
  });

  async function loadConfigStatus() {
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
            query {
              me {
                id
                email
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data) {
        // Just check if we're authenticated
        configStatus = {
          authenticated: true
        };
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    } finally {
      loading = false;
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
</script>

<div class="settings-page">
  <header class="page-header">
    <div>
      <h1>⚙️ System Configuration</h1>
      <p>View system configuration and setup instructions</p>
    </div>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading...</p>
    </div>
  {:else}
    <div class="settings-container">
      <!-- Configuration Instructions -->
      <section class="settings-section">
        <div class="section-header">
          <h2>🔧 Environment Configuration</h2>
        </div>
        <p class="section-description">
          All system configuration is managed through environment variables in the <code>.env</code> file.
          Settings cannot be changed through the UI for security reasons.
        </p>

        <div class="config-info-box">
          <h3>📝 Required Configuration</h3>
          <p>Edit your <code>.env</code> file to configure the following:</p>

          <div class="config-item">
            <div class="config-header">
              <strong>OpenAI API Key</strong>
              <span class="badge badge-critical">Required</span>
            </div>
            <pre class="config-example">OPENAI_API_KEY=sk-proj-your-api-key-here</pre>
            <p class="config-description">
              Required for AI-powered security scanning. Get your API key from
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a>.
            </p>
          </div>

          <div class="config-item">
            <div class="config-header">
              <strong>OpenAI Model</strong>
              <span class="badge badge-info">Optional</span>
            </div>
            <pre class="config-example">OPENAI_MODEL=gpt-4-turbo-preview</pre>
            <p class="config-description">
              Defaults to <code>gpt-4-turbo-preview</code>. Can use <code>gpt-3.5-turbo</code> for lower costs.
            </p>
          </div>

          <div class="config-item">
            <div class="config-header">
              <strong>JWT Secret</strong>
              <span class="badge badge-critical">Required</span>
            </div>
            <pre class="config-example">JWT_SECRET=your-secret-key-min-64-characters-long</pre>
            <p class="config-description">
              Used for authentication token signing. Must be at least 64 characters.
            </p>
          </div>

          <div class="config-item">
            <div class="config-header">
              <strong>Max Concurrent Agents</strong>
              <span class="badge badge-info">Optional</span>
            </div>
            <pre class="config-example">MAX_CONCURRENT_AGENTS=5</pre>
            <p class="config-description">
              Maximum number of concurrent AI agents. Defaults to 5.
            </p>
          </div>

          <div class="config-item">
            <div class="config-header">
              <strong>Agent Timeout</strong>
              <span class="badge badge-info">Optional</span>
            </div>
            <pre class="config-example">AGENT_TIMEOUT_MS=300000</pre>
            <p class="config-description">
              Timeout for agent tasks in milliseconds. Defaults to 300000 (5 minutes).
            </p>
          </div>
        </div>
      </section>

      <!-- Apply Changes -->
      <section class="settings-section">
        <div class="section-header">
          <h2>🔄 Applying Configuration Changes</h2>
        </div>
        <p class="section-description">
          After editing the <code>.env</code> file, you must restart the application for changes to take effect.
        </p>

        <div class="steps-box">
          <h3>Steps to Apply Changes:</h3>
          <ol>
            <li>
              <strong>Edit the .env file</strong>
              <pre>nano .env</pre>
              <p>or</p>
              <pre>vim .env</pre>
            </li>
            <li>
              <strong>Save your changes</strong>
            </li>
            <li>
              <strong>Restart the application</strong>
              <pre>docker-compose restart</pre>
              <p>or if not using Docker:</p>
              <pre>npm run dev</pre>
            </li>
            <li>
              <strong>Verify configuration</strong>
              <p>Check the console logs for any configuration warnings or errors.</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- Security Notice -->
      <section class="settings-section">
        <div class="section-header">
          <h2>🔒 Security Best Practices</h2>
        </div>

        <div class="warning-box">
          <strong>⚠️ Important Security Notes</strong>
          <ul>
            <li><strong>Never commit</strong> your <code>.env</code> file to version control</li>
            <li><strong>Keep API keys secure</strong> and rotate them regularly</li>
            <li><strong>Use environment-specific</strong> .env files (e.g., <code>.env.production</code>, <code>.env.development</code>)</li>
            <li><strong>Monitor API usage</strong> to detect unauthorized access</li>
            <li><strong>Set spending limits</strong> on your OpenAI account to prevent unexpected charges</li>
          </ul>
        </div>

        <div class="info-box">
          <strong>💡 Cost Warning</strong>
          <p>
            OpenAI API usage incurs costs. Typical scan costs:
          </p>
          <ul>
            <li>GPT-4 Turbo: $1.20-$2.00 per scan</li>
            <li>GPT-3.5 Turbo: $0.10-$0.30 per scan</li>
          </ul>
          <p>
            Monitor your usage at <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer">OpenAI Usage Dashboard</a>
          </p>
        </div>
      </section>

      <!-- Environment Status (Future) -->
      <section class="settings-section disabled">
        <div class="section-header">
          <h2>📊 Configuration Status</h2>
          <span class="badge badge-secondary">Coming Soon</span>
        </div>
        <p class="section-description">
          Future feature: Real-time monitoring of configuration status and health checks.
        </p>
      </section>
    </div>
  {/if}
</div>

<style>
  .settings-page {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .page-header p {
    color: var(--text-secondary);
    margin: 0;
  }

  .settings-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .settings-section {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .settings-section.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .section-header h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .section-description {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
  }

  code {
    background: var(--bg-primary);
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.875rem;
    color: var(--primary);
  }

  pre {
    background: #1a1a1a;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 0.875rem;
    color: #0dcaf0;
    margin: 0.5rem 0;
    border: 1px solid #333;
  }

  .config-info-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .config-info-box h3 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
    font-size: 1.125rem;
  }

  .config-info-box > p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
  }

  .config-item {
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .config-item:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  .config-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .config-header strong {
    color: var(--text-primary);
    font-size: 1rem;
  }

  .config-example {
    margin: 0.75rem 0;
  }

  .config-description {
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
    margin: 0.5rem 0 0 0;
  }

  .config-description a {
    color: var(--primary);
    text-decoration: none;
  }

  .config-description a:hover {
    text-decoration: underline;
  }

  .badge {
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-critical {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .badge-info {
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
  }

  .badge-secondary {
    background: rgba(107, 114, 128, 0.2);
    color: var(--text-secondary);
  }

  .steps-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .steps-box h3 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
    font-size: 1.125rem;
  }

  .steps-box ol {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--text-secondary);
  }

  .steps-box li {
    margin-bottom: 1.5rem;
    line-height: 1.6;
  }

  .steps-box li:last-child {
    margin-bottom: 0;
  }

  .steps-box strong {
    color: var(--text-primary);
    display: block;
    margin-bottom: 0.5rem;
  }

  .steps-box p {
    margin: 0.5rem 0;
    font-size: 0.875rem;
  }

  .warning-box {
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-left: 4px solid #fbbf24;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .warning-box strong {
    display: block;
    margin-bottom: 0.75rem;
    color: var(--text-primary);
  }

  .warning-box ul {
    margin: 0.5rem 0 0 0;
    padding-left: 1.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.8;
  }

  .warning-box li {
    margin-bottom: 0.5rem;
  }

  .info-box {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-left: 4px solid #3b82f6;
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .info-box strong {
    display: block;
    margin-bottom: 0.75rem;
    color: var(--text-primary);
  }

  .info-box p {
    margin: 0.5rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .info-box ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .info-box a {
    color: var(--primary);
    text-decoration: none;
  }

  .info-box a:hover {
    text-decoration: underline;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
