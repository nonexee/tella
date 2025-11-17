<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { logout } from '../stores/auth';

  const dispatch = createEventDispatcher();

  let activeView = 'dashboard';

  function navigate(view: string) {
    activeView = view;
    dispatch('navigate', view);
  }

  function handleLogout() {
    logout();
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <div class="logo">
      <span class="icon">🛡️</span>
      <span class="text">Tella AI</span>
    </div>
  </div>

  <nav class="sidebar-nav">
    <button
      class="nav-item"
      class:active={activeView === 'dashboard'}
      on:click={() => navigate('dashboard')}
    >
      <span class="icon">📊</span>
      <span>Dashboard</span>
    </button>

    <button
      class="nav-item"
      class:active={activeView === 'scans'}
      on:click={() => navigate('scans')}
    >
      <span class="icon">🔍</span>
      <span>Scans</span>
    </button>

    <button
      class="nav-item"
      class:active={activeView === 'agents'}
      on:click={() => navigate('agents')}
    >
      <span class="icon">🤖</span>
      <span>AI Agents</span>
    </button>

    <button
      class="nav-item"
      class:active={activeView === 'findings'}
      on:click={() => navigate('findings')}
    >
      <span class="icon">🐛</span>
      <span>Findings</span>
    </button>

    <button
      class="nav-item"
      class:active={activeView === 'targets'}
      on:click={() => navigate('targets')}
    >
      <span class="icon">🎯</span>
      <span>Targets</span>
    </button>

    <button
      class="nav-item"
      class:active={activeView === 'tools'}
      on:click={() => navigate('tools')}
    >
      <span class="icon">🔧</span>
      <span>Tools</span>
    </button>
  </nav>

  <div class="sidebar-footer">
    <button class="nav-item logout" on:click={handleLogout}>
      <span class="icon">🚪</span>
      <span>Logout</span>
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 250px;
    background: var(--bg-card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: sticky;
    top: 0;
  }

  .sidebar-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .logo .icon {
    font-size: 2rem;
  }

  .logo .text {
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .sidebar-nav {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }

  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .nav-item .icon {
    font-size: 1.25rem;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--primary);
    color: white;
  }

  .sidebar-footer {
    padding: 1rem;
    border-top: 1px solid var(--border);
  }

  .logout {
    color: var(--danger);
  }

  .logout:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 100%;
      height: auto;
      position: static;
    }

    .sidebar-nav {
      display: flex;
      overflow-x: auto;
    }

    .nav-item span:not(.icon) {
      display: none;
    }
  }
</style>
