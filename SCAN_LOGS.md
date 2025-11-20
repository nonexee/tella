# Scan Console Logs

## Overview

Every scan that runs in Tella AI automatically saves its console output to a dedicated directory inside the Docker container. This allows you to review past scans, debug issues, and analyze AI reasoning.

## Directory Structure

```
/app/logs/scans/
├── <scan-id-1>/
│   └── console.log          # Complete console output
├── <scan-id-2>/
│   └── console.log
└── <scan-id-3>/
    └── console.log
```

Each scan gets its own directory named by its UUID scan ID.

## Console Log Format

The `console.log` files contain:
- **Timestamps**: ISO 8601 format `[2025-11-19T17:14:28.075Z]`
- **AI Thoughts**: `◇ Thought: ...`
- **Tool Executions**: `Tool → tool_name(params)`
- **Task Progress**: `▶` (started), `✓` (completed), `✗` (failed)
- **Decisions**: `⚡ Decision: ...`
- **Findings**: `⚠ Finding: ...`
- **Errors**: `✗ Error: ...`

## Viewing Scan Logs

### Option 1: List all scans
```bash
docker compose exec app ls -la /app/logs/scans/
```

### Option 2: View a specific scan
```bash
# Replace <scan-id> with actual scan UUID
docker compose exec app cat /app/logs/scans/<scan-id>/console.log
```

### Option 3: Follow a running scan
```bash
docker compose exec app tail -f /app/logs/scans/<scan-id>/console.log
```

### Option 4: Copy scan logs to host
```bash
# Copy a specific scan
docker compose cp tella-app:/app/logs/scans/<scan-id>/console.log ./scan_output.log

# Copy all scans
docker compose cp tella-app:/app/logs/scans ./scan_logs/
```

## Example Scan Log

```
============================================================
🛡️  SCAN STARTED
============================================================

[2025-11-19T17:14:28.075Z] Tool → port_scan(target:demo.testfire.net ports:common technique:connect)

[2025-11-19T17:14:33.742Z] ◇ Thought: ◇ Thought (Iteration 2)
  The port scan of the target `demo.testfire.net` has been completed using the "connect" technique, focusing on common ports. Here are the findings:

  ### Open Ports and Services:
  1. **Port 80**:
     - **Service**: HTTP
     - **State**: Open

  2. **Port 443**:
     - **Service**: HTTPS
     - **State**: Open

  3. **Port 8080**:
     - **Service**: HTTP-Proxy
     - **State**: Open

  ### Next Steps:
  - Considering the open HTTP and HTTPS services on port 80 and 443, I recommend conducting a web application scan to identify potential vulnerabilities like XSS, SQLi, and others.

[2025-11-19T17:14:34.970Z] Tool → report_finding(title:CSRF Vulnerability Detected ...)

[2025-11-19T17:14:37.352Z] Tool → report_finding(title:Missing Security Headers ...)

[2025-11-19T17:15:04.485Z] ✓ PORT_SCAN task completed successfully

============================================================
✓ SCAN COMPLETED
============================================================
```

## Finding Scan IDs

### From the Web UI
The scan ID is visible in the browser URL:
```
http://localhost:4000/scans/<scan-id>
```

### From the Database
```bash
docker compose exec app npx prisma studio
# Navigate to the "Scan" table
```

### From GraphQL
```graphql
query {
  scans {
    id
    name
    status
    createdAt
  }
}
```

## Troubleshooting

### Scan logs directory doesn't exist
The directory is created automatically when the first scan runs. If it doesn't exist, no scans have been executed yet.

### Console.log is empty
This means the scan was created but no events were logged. Check:
1. Is the scan status "RUNNING" or "COMPLETED"?
2. Check Docker logs: `docker compose logs app --tail=100`

### Permission denied
The logs directory is owned by the `node` user inside the container. Use `docker compose exec` to access files.

## Integration with CI/CD

You can extract scan logs in CI/CD pipelines:

```bash
# In GitHub Actions, GitLab CI, etc.
- name: Run security scan
  run: docker compose up -d

- name: Wait for scan
  run: sleep 60

- name: Extract scan logs
  run: |
    SCAN_ID=$(docker compose exec app cat /app/logs/scans/latest-scan-id.txt)
    docker compose cp tella-app:/app/logs/scans/$SCAN_ID/console.log ./artifacts/

- name: Upload artifacts
  uses: actions/upload-artifact@v3
  with:
    name: security-scan-logs
    path: ./artifacts/console.log
```

## Log Retention

Scan logs are persisted in the Docker volume. To clean up old scans:

```bash
# Remove logs older than 30 days
docker compose exec app find /app/logs/scans -type f -mtime +30 -delete

# Remove all scan logs
docker compose exec app rm -rf /app/logs/scans/*
```

## See Also

- Main logs: `/app/logs/combined-<date>.log`
- Error logs: `/app/logs/error-<date>.log`
- Docker logs: `docker compose logs app`
