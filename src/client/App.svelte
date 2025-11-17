<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Login from './components/Login.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import { authStore } from './stores/auth';

  let currentView = 'dashboard';
  let isAuthenticated = false;

  authStore.subscribe(state => {
    isAuthenticated = state.isAuthenticated;
  });

  function handleViewChange(event: CustomEvent<string>) {
    currentView = event.detail;
  }
</script>

<main>
  {#if !isAuthenticated}
    <Login />
  {:else}
    <div class="app-layout">
      <Sidebar on:navigate={handleViewChange} />
      <div class="content">
        {#if currentView === 'dashboard'}
          <Dashboard />
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    width: 100%;
    min-height: 100vh;
  }

  .app-layout {
    display: flex;
    min-height: 100vh;
  }

  .content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }

  @media (max-width: 768px) {
    .app-layout {
      flex-direction: column;
    }

    .content {
      padding: 1rem;
    }
  }
</style>
