<script lang="ts">
  import { onMount } from 'svelte';
  import { apiRequest } from '../lib/api';

  let loading = true;
  let user: any = null;
  let apiKeys: any[] = [];
  let error: string | null = null;

  // Profile form
  let profileForm = {
    name: '',
    email: ''
  };
  let profileSaving = false;

  // Password change form
  let passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  let passwordSaving = false;
  let passwordSuccess = false;

  // API Key form
  let newApiKeyForm = {
    name: '',
    expiresInDays: 90
  };
  let creatingApiKey = false;
  let showNewApiKeyModal = false;
  let newlyCreatedApiKey: string | null = null;

  // Fetch user profile and API keys
  async function fetchProfile() {
    loading = true;
    error = null;

    try {
      const response = await apiRequest(`
        query GetProfile {
          me {
            id
            name
            email
            role
            createdAt
            apiKeys {
              id
              name
              key
              createdAt
              expiresAt
              lastUsed
            }
          }
        }
      `);

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to fetch profile');
      }

      user = response.data.me;
      apiKeys = response.data.me.apiKeys;

      // Initialize profile form
      profileForm.name = user.name;
      profileForm.email = user.email;
    } catch (e: any) {
      error = e.message;
      console.error('Error fetching profile:', e);
    } finally {
      loading = false;
    }
  }

  // Update profile
  async function updateProfile(event: Event) {
    event.preventDefault();
    profileSaving = true;

    try {
      const response = await apiRequest(`
        mutation UpdateProfile($name: String, $email: String) {
          updateProfile(name: $name, email: $email) {
            id
            name
            email
          }
        }
      `, {
        name: profileForm.name !== user.name ? profileForm.name : undefined,
        email: profileForm.email !== user.email ? profileForm.email : undefined
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to update profile');
      }

      user = { ...user, ...response.data.updateProfile };
      alert('Profile updated successfully!');
    } catch (e: any) {
      alert(`Error updating profile: ${e.message}`);
      console.error('Error updating profile:', e);
    } finally {
      profileSaving = false;
    }
  }

  // Change password
  async function changePassword(event: Event) {
    event.preventDefault();

    // Validate
    if (passwordForm.newPassword.length < 8) {
      alert('Password must be at least 8 characters long');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    passwordSaving = true;
    passwordSuccess = false;

    try {
      const response = await apiRequest(`
        mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
          changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
        }
      `, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to change password');
      }

      // Clear form
      passwordForm = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };

      passwordSuccess = true;
      setTimeout(() => passwordSuccess = false, 5000);
      alert('Password changed successfully!');
    } catch (e: any) {
      alert(`Error changing password: ${e.message}`);
      console.error('Error changing password:', e);
    } finally {
      passwordSaving = false;
    }
  }

  // Create API key
  async function createApiKey(event: Event) {
    event.preventDefault();
    creatingApiKey = true;

    try {
      const expiresAt = newApiKeyForm.expiresInDays > 0
        ? new Date(Date.now() + newApiKeyForm.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const response = await apiRequest(`
        mutation CreateApiKey($name: String, $expiresAt: DateTime) {
          createApiKey(name: $name, expiresAt: $expiresAt) {
            id
            name
            key
            createdAt
            expiresAt
            lastUsed
          }
        }
      `, {
        name: newApiKeyForm.name || null,
        expiresAt
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to create API key');
      }

      const apiKey = response.data.createApiKey;
      newlyCreatedApiKey = apiKey.key;
      apiKeys = [apiKey, ...apiKeys];

      // Reset form
      newApiKeyForm = {
        name: '',
        expiresInDays: 90
      };
    } catch (e: any) {
      alert(`Error creating API key: ${e.message}`);
      console.error('Error creating API key:', e);
      showNewApiKeyModal = false;
    } finally {
      creatingApiKey = false;
    }
  }

  // Revoke API key
  async function revokeApiKey(id: string, name?: string) {
    const keyName = name || 'this API key';
    if (!confirm(`Are you sure you want to revoke "${keyName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiRequest(`
        mutation RevokeApiKey($id: ID!) {
          revokeApiKey(id: $id)
        }
      `, { id });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Failed to revoke API key');
      }

      apiKeys = apiKeys.filter(key => key.id !== id);
      alert('API key revoked successfully');
    } catch (e: any) {
      alert(`Error revoking API key: ${e.message}`);
      console.error('Error revoking API key:', e);
    }
  }

  // Copy to clipboard
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  }

  // Format date
  function formatDate(dateString: string): string {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  }

  // Check if API key is expired
  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  // Mask API key
  function maskApiKey(key: string): string {
    if (key.length <= 12) return key;
    return key.substring(0, 12) + '•'.repeat(Math.min(key.length - 12, 20));
  }

  // Close API key modal
  function closeApiKeyModal() {
    showNewApiKeyModal = false;
    newlyCreatedApiKey = null;
  }

  onMount(() => {
    fetchProfile();
  });
</script>

<div class="profile-page">
  <header class="page-header">
    <div>
      <h1>Profile Settings</h1>
      <p>Manage your account settings and API keys</p>
    </div>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner spin"></div>
      <p>Loading profile...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button class="btn btn-primary" on:click={fetchProfile}>Retry</button>
    </div>
  {:else if user}
    <div class="profile-content">
      <!-- Profile Information -->
      <section class="profile-section">
        <h2>Profile Information</h2>
        <form on:submit={updateProfile}>
          <div class="form-group">
            <label for="name">Name *</label>
            <input
              type="text"
              id="name"
              bind:value={profileForm.name}
              required
              placeholder="Your name"
            />
          </div>

          <div class="form-group">
            <label for="email">Email *</label>
            <input
              type="email"
              id="email"
              bind:value={profileForm.email}
              required
              placeholder="your.email@example.com"
            />
          </div>

          <div class="form-group">
            <label>Role</label>
            <input
              type="text"
              value={user.role}
              disabled
              title="Role cannot be changed"
            />
            <p class="help-text">Contact an administrator to change your role</p>
          </div>

          <div class="form-group">
            <label>Member Since</label>
            <input
              type="text"
              value={formatDate(user.createdAt)}
              disabled
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            disabled={profileSaving}
          >
            {profileSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </section>

      <!-- Change Password -->
      <section class="profile-section">
        <h2>Change Password</h2>
        {#if passwordSuccess}
          <div class="alert alert-success">
            Password changed successfully!
          </div>
        {/if}
        <form on:submit={changePassword}>
          <div class="form-group">
            <label for="current-password">Current Password *</label>
            <input
              type="password"
              id="current-password"
              bind:value={passwordForm.currentPassword}
              required
              placeholder="Enter current password"
            />
          </div>

          <div class="form-group">
            <label for="new-password">New Password *</label>
            <input
              type="password"
              id="new-password"
              bind:value={passwordForm.newPassword}
              required
              minlength="8"
              placeholder="At least 8 characters"
            />
            <p class="help-text">Password must be at least 8 characters long</p>
          </div>

          <div class="form-group">
            <label for="confirm-password">Confirm New Password *</label>
            <input
              type="password"
              id="confirm-password"
              bind:value={passwordForm.confirmPassword}
              required
              minlength="8"
              placeholder="Re-enter new password"
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            disabled={passwordSaving}
          >
            {passwordSaving ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </section>

      <!-- API Keys -->
      <section class="profile-section">
        <div class="section-header">
          <h2>API Keys</h2>
          <button
            class="btn btn-primary"
            on:click={() => showNewApiKeyModal = true}
          >
            🔑 Create API Key
          </button>
        </div>

        {#if apiKeys.length === 0}
          <div class="empty-state">
            <p>No API keys yet. Create one to access the Tella API programmatically.</p>
          </div>
        {:else}
          <div class="api-keys-list">
            {#each apiKeys as apiKey}
              <div class="api-key-card" class:expired={isExpired(apiKey.expiresAt)}>
                <div class="api-key-header">
                  <div class="api-key-info">
                    <strong>{apiKey.name || 'Unnamed Key'}</strong>
                    {#if isExpired(apiKey.expiresAt)}
                      <span class="badge badge-danger">Expired</span>
                    {/if}
                  </div>
                  <button
                    class="btn btn-danger btn-small"
                    on:click={() => revokeApiKey(apiKey.id, apiKey.name)}
                  >
                    Revoke
                  </button>
                </div>

                <div class="api-key-value">
                  <code>{maskApiKey(apiKey.key)}</code>
                  <button
                    class="btn-icon"
                    on:click={() => copyToClipboard(apiKey.key)}
                    title="Copy full key to clipboard"
                  >
                    📋
                  </button>
                </div>

                <div class="api-key-meta">
                  <span>Created: {formatDate(apiKey.createdAt)}</span>
                  {#if apiKey.expiresAt}
                    <span>• Expires: {formatDate(apiKey.expiresAt)}</span>
                  {:else}
                    <span>• Never expires</span>
                  {/if}
                  {#if apiKey.lastUsed}
                    <span>• Last used: {formatDate(apiKey.lastUsed)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<!-- Create API Key Modal -->
{#if showNewApiKeyModal}
  <div class="modal-backdrop" on:click={closeApiKeyModal}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h3>{newlyCreatedApiKey ? 'API Key Created' : 'Create API Key'}</h3>
        <button class="btn-close" on:click={closeApiKeyModal}>×</button>
      </div>

      <div class="modal-body">
        {#if newlyCreatedApiKey}
          <div class="api-key-created">
            <div class="alert alert-warning">
              <strong>⚠️ Save this API key!</strong>
              <p>You won't be able to see it again after closing this dialog.</p>
            </div>

            <div class="api-key-display">
              <label>Your API Key:</label>
              <div class="key-value">
                <code>{newlyCreatedApiKey}</code>
                <button
                  class="btn btn-secondary btn-small"
                  on:click={() => copyToClipboard(newlyCreatedApiKey!)}
                >
                  📋 Copy
                </button>
              </div>
            </div>

            <div class="api-key-usage">
              <label>Usage Example:</label>
              <pre><code>curl -H "Authorization: Bearer {newlyCreatedApiKey}" \\
  https://your-server/graphql</code></pre>
            </div>
          </div>
        {:else}
          <form on:submit={createApiKey}>
            <div class="form-group">
              <label for="api-key-name">Name (optional)</label>
              <input
                type="text"
                id="api-key-name"
                bind:value={newApiKeyForm.name}
                placeholder="e.g., CI/CD Pipeline, Mobile App"
              />
              <p class="help-text">A descriptive name to help you identify this key</p>
            </div>

            <div class="form-group">
              <label for="expires-in">Expires In</label>
              <select id="expires-in" bind:value={newApiKeyForm.expiresInDays}>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={0}>Never</option>
              </select>
              <p class="help-text">When this API key will expire</p>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                on:click={closeApiKeyModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                disabled={creatingApiKey}
              >
                {creatingApiKey ? 'Creating...' : 'Create API Key'}
              </button>
            </div>
          </form>
        {/if}
      </div>

      {#if newlyCreatedApiKey}
        <div class="modal-footer">
          <button class="btn btn-primary" on:click={closeApiKeyModal}>
            Done
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .profile-page {
    max-width: 900px;
    margin: 0 auto;
  }

  .profile-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .profile-section {
    background: var(--bg-secondary);
    padding: 2rem;
    border-radius: 12px;
    border: 1px solid var(--border-color);
  }

  .profile-section h2 {
    margin: 0 0 1.5rem 0;
    font-size: 1.3rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .section-header h2 {
    margin: 0;
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

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 1rem;
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .help-text {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .alert-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--success);
    color: var(--success);
  }

  .alert-warning {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--warning);
    color: var(--warning);
  }

  .api-keys-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .api-key-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .api-key-card.expired {
    opacity: 0.6;
    border-color: var(--danger);
  }

  .api-key-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .api-key-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .api-key-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
  }

  .api-key-value code {
    flex: 1;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  .btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0.25rem 0.5rem;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .btn-icon:hover {
    opacity: 1;
  }

  .api-key-meta {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .api-key-created {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .api-key-display label,
  .api-key-usage label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .key-value {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    border: 2px solid var(--primary);
  }

  .key-value code {
    flex: 1;
    font-family: 'Courier New', monospace;
    font-size: 0.95rem;
    word-break: break-all;
  }

  .api-key-usage pre {
    margin: 0;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    overflow-x: auto;
  }

  .api-key-usage code {
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .loading, .error {
    text-align: center;
    padding: 3rem;
  }

  .error {
    color: var(--danger);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
    font-style: italic;
  }
</style>
