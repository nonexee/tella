<script lang="ts">
  export let title: string;
  export let value: number;
  export let icon: string;
  export let color: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' = 'primary';
  export let pulse: boolean = false;
</script>

<div class="stats-card card" class:pulse>
  <div class="icon {color}">{icon}</div>
  <div class="content">
    <div class="title">{title}</div>
    <div class="value">{value}</div>
  </div>
</div>

<style>
  .stats-card {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    transition: transform 0.2s;
  }

  .stats-card:hover {
    transform: translateY(-2px);
  }

  .icon {
    font-size: 2.5rem;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
  }

  .icon.primary {
    background: rgba(99, 102, 241, 0.1);
  }

  .icon.secondary {
    background: rgba(139, 92, 246, 0.1);
  }

  .icon.success {
    background: rgba(16, 185, 129, 0.1);
  }

  .icon.warning {
    background: rgba(245, 158, 11, 0.1);
  }

  .icon.danger {
    background: rgba(239, 68, 68, 0.1);
  }

  .content {
    flex: 1;
  }

  .title {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }
</style>
