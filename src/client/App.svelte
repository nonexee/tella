<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Scans from './components/Scans.svelte';
  import Targets from './components/Targets.svelte';
  import Findings from './components/Findings.svelte';
  import Agents from './components/Agents.svelte';
  import Tools from './components/Tools.svelte';
  import Console from './components/Console.svelte';
  import ScanConsole from './components/ScanConsole.svelte';
  import Settings from './components/Settings.svelte';
  import Profile from './components/Profile.svelte';
  import Login from './components/Login.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import { authStore } from './stores/auth';

  let currentView = 'dashboard';
  let currentScanId: string | null = null;
  let isAuthenticated = false;

  authStore.subscribe(state => {
    isAuthenticated = state.isAuthenticated;
  });

  function handleViewChange(event: CustomEvent<string | {view: string, scanId?: string}>) {
    if (typeof event.detail === 'string') {
      currentView = event.detail;
      currentScanId = null;
    } else {
      currentView = event.detail.view;
      currentScanId = event.detail.scanId || null;
    }
  }
</script>

<ErrorBoundary>
  <main>
    {#if !isAuthenticated}
      <Login />
    {:else}
      <div class="app-layout">
        <Sidebar on:navigate={handleViewChange} />
        <div class="content">
          {#if currentView === 'dashboard'}
            <Dashboard on:navigate={handleViewChange} />
          {:else if currentView === 'scans'}
            <Scans on:navigate={handleViewChange} />
          {:else if currentView === 'targets'}
            <Targets on:navigate={handleViewChange} />
          {:else if currentView === 'findings'}
            <Findings />
          {:else if currentView === 'agents'}
            <Agents />
          {:else if currentView === 'tools'}
            <Tools />
          {:else if currentView === 'console'}
            <Console />
          {:else if currentView === 'scan-console' && currentScanId}
            <ScanConsole scanId={currentScanId} />
          {:else if currentView === 'settings'}
            <Settings />
          {:else if currentView === 'profile'}
            <Profile />
          {/if}
        </div>
      </div>
    {/if}
  </main>
</ErrorBoundary>

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
