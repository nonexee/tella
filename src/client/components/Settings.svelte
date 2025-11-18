<script lang="ts">
  import { onMount } from 'svelte';

  let loading = true;
  let saving = false;
  let testing = false;
  let testResult: { success: boolean; message: string } | null = null;

  // Settings data
  let openaiApiKey = '';
  let hasExistingKey = false;
  let showKey = false;

  // Success/error messages
  let saveMessage: { type: 'success' | 'error'; text: string } | null = null;

  onMount(async () => {
    await loadSettings();
  });

  async function loadSettings() {
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
            query GetSettings {
              systemSetting(key: "OPENAI_API_KEY") {
                id
                key
                value
                encrypted
              }
            }
          `
        })
      });

      const result = await response.json();
      if (result.data?.systemSetting) {
        hasExistingKey = true;
        // Don't show the actual key for security, just indicate it exists
        openaiApiKey = ''; // Keep empty, user can update if needed
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      loading = false;
    }
  }

  async function saveSettings() {
    if (!openaiApiKey.trim()) {
      saveMessage = { type: 'error', text: 'Please enter an OpenAI API key' };
      return;
    }

    if (!openaiApiKey.startsWith('sk-')) {
      saveMessage = { type: 'error', text: 'Invalid OpenAI API key format (should start with "sk-")' };
      return;
    }

    saving = true;
    saveMessage = null;

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
            mutation UpdateSetting($key: String!, $value: String!, $encrypted: Boolean) {
              updateSystemSetting(key: $key, value: $value, encrypted: $encrypted) {
                success
                message
              }
            }
          `,
          variables: {
            key: 'OPENAI_API_KEY',
            value: openaiApiKey,
            encrypted: true
          }
        })
      });

      const result = await response.json();
      if (result.data?.updateSystemSetting?.success) {
        saveMessage = { type: 'success', text: 'OpenAI API key saved successfully!' };
        hasExistingKey = true;
        openaiApiKey = ''; // Clear the input for security

        // Also update .env file warning
        showEnvWarning();
      } else {
        const errorMsg = result.data?.updateSystemSetting?.message || 'Failed to save API key';
        saveMessage = { type: 'error', text: errorMsg };
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      saveMessage = { type: 'error', text: 'Network error: Failed to save settings' };
    } finally {
      saving = false;
    }
  }

  async function testConnection() {
    if (!openaiApiKey.trim() && !hasExistingKey) {
      testResult = { success: false, message: 'Please enter or save an API key first' };
      return;
    }

    testing = true;
    testResult = null;

    try {
      // Test by making a simple OpenAI API call
      const keyToTest = openaiApiKey.trim() || 'use-existing-key';

      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${openaiApiKey.trim()}`
        }
      });

      if (response.ok) {
        testResult = { success: true, message: 'Connection successful! OpenAI API key is valid.' };
      } else if (response.status === 401) {
        testResult = { success: false, message: 'Invalid API key. Please check your OpenAI API key.' };
      } else {
        testResult = { success: false, message: `Connection failed: ${response.statusText}` };
      }
    } catch (err) {
      console.error('Failed to test connection:', err);
      testResult = { success: false, message: 'Network error: Could not connect to OpenAI' };
    } finally {
      testing = false;
    }
  }

  function showEnvWarning() {
    // Show warning about updating .env file
    alert('⚠️ Important: For the changes to take effect, you need to:\n\n1. Update your .env file with: OPENAI_API_KEY=' + (openaiApiKey || '[your-key]') + '\n2. Restart the server\n\nOr the setting will only be stored in the database but not used by the AI agents.');
  }

  function clearSaveMessage() {
    saveMessage = null;
  }

  function clearTestResult() {
    testResult = null;
  }
</script>

<div class="settings-page">
  <header class="page-header">
    <div>
      <h1>System Settings</h1>
      <p>Configure platform settings and API integrations</p>
    </div>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading settings...</p>
    </div>
  {:else}
    <div class="settings-container">
      <!-- OpenAI API Key Section -->
      <section class="settings-section">
        <div class="section-header">
          <h2>🤖 OpenAI API Configuration</h2>
          <span class="badge badge-critical">Required</span>
        </div>
        <p class="section-description">
          Configure your OpenAI API key to enable AI-powered security scanning agents.
          Without a valid API key, all scans will fail immediately.
        </p>

        {#if hasExistingKey}
          <div class="info-message">
            <span class="info-icon">ℹ️</span>
            <div>
              <strong>API Key Configured</strong>
              <p>An OpenAI API key is currently configured. Enter a new key below to update it.</p>
            </div>
          </div>
        {/if}

        <div class="form-group">
          <label for="openai-key">
            OpenAI API Key
            <span class="required">*</span>
          </label>
          <div class="input-with-toggle">
            <input
              id="openai-key"
              type={showKey ? 'text' : 'password'}
              bind:value={openaiApiKey}
              on:input={clearSaveMessage}
              on:input={clearTestResult}
              placeholder={hasExistingKey ? 'Enter new API key to update...' : 'sk-...'}
              class="input-field"
            />
            <button
              type="button"
              class="btn btn-icon"
              on:click={() => showKey = !showKey}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <small class="help-text">
            Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>
          </small>
        </div>

        <div class="button-group">
          <button
            class="btn btn-primary"
            on:click={saveSettings}
            disabled={saving || !openaiApiKey.trim()}
          >
            {#if saving}
              <span class="spinner spin-small"></span>
              Saving...
            {:else}
              💾 Save API Key
            {/if}
          </button>

          <button
            class="btn btn-secondary"
            on:click={testConnection}
            disabled={testing || (!openaiApiKey.trim() && !hasExistingKey)}
          >
            {#if testing}
              <span class="spinner spin-small"></span>
              Testing...
            {:else}
              🔌 Test Connection
            {/if}
          </button>
        </div>

        {#if saveMessage}
          <div class="message message-{saveMessage.type}">
            <span class="message-icon">
              {saveMessage.type === 'success' ? '✅' : '❌'}
            </span>
            <span>{saveMessage.text}</span>
          </div>
        {/if}

        {#if testResult}
          <div class="message message-{testResult.success ? 'success' : 'error'}">
            <span class="message-icon">
              {testResult.success ? '✅' : '❌'}
            </span>
            <span>{testResult.message}</span>
          </div>
        {/if}

        <div class="warning-box">
          <strong>⚠️ Cost Warning</strong>
          <p>
            OpenAI API usage costs money:
          </p>
          <ul>
            <li>GPT-4 Turbo: ~$1.20-$2.00 per scan</li>
            <li>100 scans/day ≈ $3,600-$6,000/month</li>
          </ul>
          <p>
            Consider using GPT-3.5 Turbo for lower costs or implementing rate limiting.
          </p>
        </div>
      </section>

      <!-- Future Settings Sections -->
      <section class="settings-section disabled">
        <div class="section-header">
          <h2>📧 Email Notifications</h2>
          <span class="badge badge-secondary">Coming Soon</span>
        </div>
        <p class="section-description">
          Configure email notifications for scan completion and critical findings.
        </p>
      </section>

      <section class="settings-section disabled">
        <div class="section-header">
          <h2>🔗 Webhook Integration</h2>
          <span class="badge badge-secondary">Coming Soon</span>
        </div>
        <p class="section-description">
          Set up webhooks for Slack, Discord, or custom integrations.
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
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
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
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
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

  .badge {
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-critical {
    background: rgba(239, 68, 68, 0.2);
    color: var(--danger);
  }

  .badge-secondary {
    background: rgba(107, 114, 128, 0.2);
    color: var(--text-secondary);
  }

  .info-message {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 1rem;
    margin-bottom: 1.5rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-left: 4px solid #3b82f6;
    border-radius: 0.5rem;
  }

  .info-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .info-message strong {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--text-primary);
  }

  .info-message p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .required {
    color: var(--danger);
  }

  .input-with-toggle {
    display: flex;
    gap: 0.5rem;
  }

  .input-field {
    flex: 1;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
  }

  .input-field:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .btn-icon {
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1.25rem;
  }

  .btn-icon:hover {
    background: var(--bg-tertiary);
  }

  .help-text {
    display: block;
    margin-top: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .help-text a {
    color: var(--primary);
    text-decoration: none;
  }

  .help-text a:hover {
    text-decoration: underline;
  }

  .button-group {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.5rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--primary-dark);
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-secondary);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .message {
    padding: 1rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .message-success {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }

  .message-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: var(--danger);
  }

  .message-icon {
    font-size: 1.25rem;
  }

  .warning-box {
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-left: 4px solid #fbbf24;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-top: 1.5rem;
  }

  .warning-box strong {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  .warning-box p {
    margin: 0.5rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .warning-box ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
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
    border: 4px solid var(--border-color);
    border-top-color: var(--primary);
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  .spin-small {
    width: 16px;
    height: 16px;
    border-width: 2px;
    margin: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
