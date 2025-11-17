<script lang="ts">
  import { login } from '../stores/auth';
  import { mutate, GraphQLError, NetworkError } from '../lib/graphql-client';
  import type { User } from '../stores/auth';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleLogin() {
    if (!email || !password) {
      error = 'Please fill in all fields';
      return;
    }

    loading = true;
    error = '';

    try {
      const result = await mutate<{
        login: {
          accessToken: string;
          refreshToken: string;
          user: User;
        };
      }>(
        `
          mutation Login($email: String!, $password: String!) {
            login(email: $email, password: $password) {
              accessToken
              refreshToken
              user {
                id
                email
                name
                role
              }
            }
          }
        `,
        { email, password }
      );

      const { accessToken, refreshToken, user } = result.login;
      login(accessToken, refreshToken, user);
    } catch (err) {
      if (err instanceof GraphQLError) {
        error = err.message;
      } else if (err instanceof NetworkError) {
        error = 'Network error. Please check your connection.';
      } else {
        error = 'Failed to login. Please try again.';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-container">
  <div class="login-card">
    <div class="logo">
      <div class="logo-icon">🛡️</div>
      <h1>Tella AI</h1>
      <p>Offensive Security Testing Platform</p>
    </div>

    <form on:submit|preventDefault={handleLogin}>
      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="Enter your email"
          disabled={loading}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Enter your password"
          disabled={loading}
        />
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" class="btn btn-primary btn-block" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>

    <div class="footer">
      <p>Authorized Personnel Only</p>
    </div>
  </div>
</div>

<style>
  .login-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .login-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 3rem;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .logo {
    text-align: center;
    margin-bottom: 2rem;
  }

  .logo-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .logo h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .logo p {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group input {
    width: 100%;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 0.75rem;
    border-radius: 0.375rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }

  .btn-block {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
  }

  .footer {
    margin-top: 2rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.75rem;
  }
</style>
