<script lang="ts">
  import { onMount } from 'svelte';
  import { query, mutate } from '../lib/graphql';

  interface Webhook {
    id: string;
    name: string;
    url: string;
    events: string[];
    active: boolean;
    createdAt: string;
    lastSuccess: string | null;
    lastFailure: string | null;
    failureCount: number;
  }

  interface WebhookDelivery {
    id: string;
    event: string;
    status: string;
    statusCode: number | null;
    response: string | null;
    attempts: number;
    createdAt: string;
    deliveredAt: string | null;
  }

  let webhooks: Webhook[] = [];
  let loading = true;
  let error = '';

  // Modal states
  let showCreateModal = false;
  let showEditModal = false;
  let showDeliveriesModal = false;
  let showSecretModal = false;

  // Form data
  let formName = '';
  let formUrl = '';
  let formEvents: string[] = [];
  let editingWebhook: Webhook | null = null;
  let newWebhookSecret = '';

  // Deliveries
  let selectedWebhook: Webhook | null = null;
  let deliveries: WebhookDelivery[] = [];
  let loadingDeliveries = false;

  const availableEvents = [
    { value: 'SCAN_COMPLETED', label: 'Scan Completed', description: 'Triggered when a scan finishes successfully' },
    { value: 'SCAN_FAILED', label: 'Scan Failed', description: 'Triggered when a scan fails' },
    { value: 'SCAN_STARTED', label: 'Scan Started', description: 'Triggered when a scan begins' },
    { value: 'FINDING_CREATED', label: 'Finding Created', description: 'Triggered when any finding is discovered' },
    { value: 'FINDING_HIGH_SEVERITY', label: 'High Severity Finding', description: 'Triggered for high severity findings' },
    { value: 'FINDING_CRITICAL', label: 'Critical Finding', description: 'Triggered for critical findings' }
  ];

  onMount(() => {
    loadWebhooks();
  });

  async function loadWebhooks() {
    loading = true;
    error = '';

    try {
      const result = await query(`
        query {
          webhooks {
            id
            name
            url
            events
            active
            createdAt
            lastSuccess
            lastFailure
            failureCount
          }
        }
      `);

      webhooks = result.webhooks;
    } catch (err: any) {
      error = err.message || 'Failed to load webhooks';
      console.error('Error loading webhooks:', err);
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    formName = '';
    formUrl = '';
    formEvents = [];
    showCreateModal = true;
  }

  function openEditModal(webhook: Webhook) {
    editingWebhook = webhook;
    formName = webhook.name;
    formUrl = webhook.url;
    formEvents = [...webhook.events];
    showEditModal = true;
  }

  function closeModals() {
    showCreateModal = false;
    showEditModal = false;
    showDeliveriesModal = false;
    showSecretModal = false;
    editingWebhook = null;
    selectedWebhook = null;
    newWebhookSecret = '';
  }

  function toggleEvent(event: string) {
    if (formEvents.includes(event)) {
      formEvents = formEvents.filter(e => e !== event);
    } else {
      formEvents = [...formEvents, event];
    }
  }

  async function createWebhook() {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      alert('Please fill in all fields and select at least one event');
      return;
    }

    try {
      const result = await mutate(`
        mutation($name: String!, $url: String!, $events: [String!]!) {
          createWebhook(name: $name, url: $url, events: $events) {
            id
            name
            url
            events
            active
            secret
            createdAt
            lastSuccess
            lastFailure
            failureCount
          }
        }
      `, {
        name: formName,
        url: formUrl,
        events: formEvents
      });

      // Show secret once
      newWebhookSecret = result.createWebhook.secret;
      showSecretModal = true;
      showCreateModal = false;

      // Add to list (without secret for security)
      const { secret, ...webhookWithoutSecret } = result.createWebhook;
      webhooks = [...webhooks, webhookWithoutSecret];
    } catch (err: any) {
      alert('Failed to create webhook: ' + (err.message || 'Unknown error'));
      console.error('Error creating webhook:', err);
    }
  }

  async function updateWebhook() {
    if (!editingWebhook || !formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      alert('Please fill in all fields and select at least one event');
      return;
    }

    try {
      const result = await mutate(`
        mutation($id: ID!, $name: String, $url: String, $events: [String!]) {
          updateWebhook(id: $id, name: $name, url: $url, events: $events) {
            id
            name
            url
            events
            active
            createdAt
            lastSuccess
            lastFailure
            failureCount
          }
        }
      `, {
        id: editingWebhook.id,
        name: formName,
        url: formUrl,
        events: formEvents
      });

      webhooks = webhooks.map(w => w.id === result.updateWebhook.id ? result.updateWebhook : w);
      closeModals();
    } catch (err: any) {
      alert('Failed to update webhook: ' + (err.message || 'Unknown error'));
      console.error('Error updating webhook:', err);
    }
  }

  async function toggleWebhookActive(webhook: Webhook) {
    try {
      const result = await mutate(`
        mutation($id: ID!, $active: Boolean) {
          updateWebhook(id: $id, active: $active) {
            id
            name
            url
            events
            active
            createdAt
            lastSuccess
            lastFailure
            failureCount
          }
        }
      `, {
        id: webhook.id,
        active: !webhook.active
      });

      webhooks = webhooks.map(w => w.id === result.updateWebhook.id ? result.updateWebhook : w);
    } catch (err: any) {
      alert('Failed to toggle webhook: ' + (err.message || 'Unknown error'));
      console.error('Error toggling webhook:', err);
    }
  }

  async function deleteWebhook(webhook: Webhook) {
    if (!confirm(`Are you sure you want to delete webhook "${webhook.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await mutate(`
        mutation($id: ID!) {
          deleteWebhook(id: $id)
        }
      `, { id: webhook.id });

      webhooks = webhooks.filter(w => w.id !== webhook.id);
    } catch (err: any) {
      alert('Failed to delete webhook: ' + (err.message || 'Unknown error'));
      console.error('Error deleting webhook:', err);
    }
  }

  async function testWebhook(webhook: Webhook) {
    try {
      const result = await mutate(`
        mutation($id: ID!) {
          testWebhook(id: $id)
        }
      `, { id: webhook.id });

      if (result.testWebhook) {
        alert('Test webhook sent successfully! Check your endpoint.');
      } else {
        alert('Test webhook failed. Check the delivery history for details.');
      }

      // Reload to get updated stats
      await loadWebhooks();
    } catch (err: any) {
      alert('Failed to test webhook: ' + (err.message || 'Unknown error'));
      console.error('Error testing webhook:', err);
    }
  }

  async function viewDeliveries(webhook: Webhook) {
    selectedWebhook = webhook;
    showDeliveriesModal = true;
    loadingDeliveries = true;
    deliveries = [];

    try {
      const result = await query(`
        query($webhookId: ID!) {
          webhookDeliveries(webhookId: $webhookId) {
            id
            event
            status
            statusCode
            response
            attempts
            createdAt
            deliveredAt
          }
        }
      `, { webhookId: webhook.id });

      deliveries = result.webhookDeliveries;
    } catch (err: any) {
      alert('Failed to load deliveries: ' + (err.message || 'Unknown error'));
      console.error('Error loading deliveries:', err);
    } finally {
      loadingDeliveries = false;
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(newWebhookSecret);
    alert('Secret copied to clipboard!');
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString();
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'SUCCESS': return 'text-green-600';
      case 'FAILED': return 'text-red-600';
      case 'PENDING': return 'text-yellow-600';
      case 'RETRYING': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  }

  function getStatusBadge(status: string): string {
    switch (status) {
      case 'SUCCESS': return 'bg-green-100 text-green-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'RETRYING': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
</script>

<div class="p-6">
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Webhooks</h1>
      <p class="text-gray-600 mt-1">Manage webhook integrations for real-time notifications</p>
    </div>
    <button
      on:click={openCreateModal}
      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      Create Webhook
    </button>
  </div>

  {#if loading}
    <div class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <p class="text-gray-600 mt-4">Loading webhooks...</p>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
      {error}
    </div>
  {:else if webhooks.length === 0}
    <div class="text-center py-12 bg-gray-50 rounded-lg">
      <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">No webhooks configured</h3>
      <p class="text-gray-600 mb-4">Create your first webhook to receive real-time notifications</p>
      <button
        on:click={openCreateModal}
        class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
      >
        Create Webhook
      </button>
    </div>
  {:else}
    <div class="grid gap-4">
      {#each webhooks as webhook (webhook.id)}
        <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-lg font-semibold text-gray-900">{webhook.name}</h3>
                <span class={`px-2 py-1 text-xs font-semibold rounded ${webhook.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {webhook.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p class="text-gray-600 text-sm mb-2">{webhook.url}</p>
              <div class="flex flex-wrap gap-2 mb-2">
                {#each webhook.events as event}
                  <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {event.replace(/_/g, ' ')}
                  </span>
                {/each}
              </div>
            </div>

            <div class="flex gap-2">
              <button
                on:click={() => testWebhook(webhook)}
                class="text-blue-600 hover:text-blue-800 p-2"
                title="Test Webhook"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                on:click={() => viewDeliveries(webhook)}
                class="text-purple-600 hover:text-purple-800 p-2"
                title="View Delivery History"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                on:click={() => toggleWebhookActive(webhook)}
                class={`p-2 ${webhook.active ? 'text-gray-600 hover:text-gray-800' : 'text-green-600 hover:text-green-800'}`}
                title={webhook.active ? 'Disable' : 'Enable'}
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {#if webhook.active}
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  {:else}
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  {/if}
                </svg>
              </button>
              <button
                on:click={() => openEditModal(webhook)}
                class="text-gray-600 hover:text-gray-800 p-2"
                title="Edit"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                on:click={() => deleteWebhook(webhook)}
                class="text-red-600 hover:text-red-800 p-2"
                title="Delete"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200 text-sm">
            <div>
              <p class="text-gray-500">Created</p>
              <p class="text-gray-900 font-medium">{formatDate(webhook.createdAt)}</p>
            </div>
            <div>
              <p class="text-gray-500">Last Success</p>
              <p class="text-gray-900 font-medium">{webhook.lastSuccess ? formatDate(webhook.lastSuccess) : 'Never'}</p>
            </div>
            <div>
              <p class="text-gray-500">Failures</p>
              <p class={`font-medium ${webhook.failureCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {webhook.failureCount}
              </p>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Webhook Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">Create Webhook</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              type="text"
              bind:value={formName}
              placeholder="My Webhook"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Webhook URL</label>
            <input
              type="url"
              bind:value={formUrl}
              placeholder="https://your-server.com/webhook"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p class="text-xs text-gray-500 mt-1">POST requests will be sent to this URL</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Events to Subscribe</label>
            <div class="space-y-2">
              {#each availableEvents as event}
                <label class="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEvents.includes(event.value)}
                    on:change={() => toggleEvent(event.value)}
                    class="mt-1"
                  />
                  <div class="flex-1">
                    <p class="font-medium text-gray-900">{event.label}</p>
                    <p class="text-sm text-gray-600">{event.description}</p>
                  </div>
                </label>
              {/each}
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            on:click={createWebhook}
            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Create Webhook
          </button>
          <button
            on:click={closeModals}
            class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Webhook Modal -->
{#if showEditModal && editingWebhook}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">Edit Webhook</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              type="text"
              bind:value={formName}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Webhook URL</label>
            <input
              type="url"
              bind:value={formUrl}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Events to Subscribe</label>
            <div class="space-y-2">
              {#each availableEvents as event}
                <label class="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEvents.includes(event.value)}
                    on:change={() => toggleEvent(event.value)}
                    class="mt-1"
                  />
                  <div class="flex-1">
                    <p class="font-medium text-gray-900">{event.label}</p>
                    <p class="text-sm text-gray-600">{event.description}</p>
                  </div>
                </label>
              {/each}
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            on:click={updateWebhook}
            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Save Changes
          </button>
          <button
            on:click={closeModals}
            class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Secret Display Modal -->
{#if showSecretModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg max-w-2xl w-full">
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="bg-yellow-100 p-2 rounded-lg">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Webhook Secret</h2>
        </div>

        <div class="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
          <p class="text-sm text-yellow-800 mb-2">
            <strong>Important:</strong> This secret will only be shown once. Please save it securely.
          </p>
          <p class="text-sm text-yellow-700">
            Use this secret to verify webhook signatures on your endpoint.
          </p>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Secret</label>
          <div class="flex gap-2">
            <input
              type="text"
              value={newWebhookSecret}
              readonly
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
            />
            <button
              on:click={copySecret}
              class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              Copy
            </button>
          </div>
        </div>

        <div class="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-4">
          <p class="text-sm font-medium text-gray-900 mb-2">Signature Verification Example (Node.js):</p>
          <pre class="text-xs text-gray-700 overflow-x-auto"><code>const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {'{'}
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
{'}'}</code></pre>
        </div>

        <button
          on:click={closeModals}
          class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          I've Saved the Secret
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Deliveries Modal -->
{#if showDeliveriesModal && selectedWebhook}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">Delivery History: {selectedWebhook.name}</h2>

        {#if loadingDeliveries}
          <div class="text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        {:else if deliveries.length === 0}
          <div class="text-center py-8 text-gray-600">
            <p>No deliveries yet</p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each deliveries as delivery (delivery.id)}
              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <span class={`px-2 py-1 text-xs font-semibold rounded ${getStatusBadge(delivery.status)}`}>
                      {delivery.status}
                    </span>
                    <span class="font-medium text-gray-900">{delivery.event}</span>
                  </div>
                  <span class="text-sm text-gray-600">{formatDate(delivery.createdAt)}</span>
                </div>

                <div class="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p class="text-gray-500">Status Code</p>
                    <p class="text-gray-900 font-medium">{delivery.statusCode || 'N/A'}</p>
                  </div>
                  <div>
                    <p class="text-gray-500">Attempts</p>
                    <p class="text-gray-900 font-medium">{delivery.attempts}</p>
                  </div>
                  <div>
                    <p class="text-gray-500">Delivered At</p>
                    <p class="text-gray-900 font-medium">
                      {delivery.deliveredAt ? formatDate(delivery.deliveredAt) : 'N/A'}
                    </p>
                  </div>
                </div>

                {#if delivery.response}
                  <div class="mt-3">
                    <p class="text-xs text-gray-500 mb-1">Response:</p>
                    <pre class="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{delivery.response}</pre>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <button
          on:click={closeModals}
          class="w-full mt-6 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
