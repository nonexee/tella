# IMMEDIATE FIXES - Action Plan to Make Platform Functional

## 🔴 CRITICAL: Do These First (2-3 days)

### 1. OpenAI API Key Configuration (4 hours)

**Problem**: Scans fail silently without API key, users have no idea why

**Fix**:
```typescript
// src/client/components/Settings.svelte (NEW FILE)
<script lang="ts">
  let apiKey = '';
  let testStatus = '';

  async function saveApiKey() {
    const response = await fetch('/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `mutation UpdateSettings($openaiKey: String!) {
          updateSystemSettings(openaiApiKey: $openaiKey) {
            success
            message
          }
        }`,
        variables: { openaiKey: apiKey }
      })
    });
    // Handle response...
  }

  async function testApiKey() {
    const response = await fetch('/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `query TestOpenAI {
          testOpenAIConnection {
            success
            model
            message
          }
        }`
      })
    });
    // Show success/failure...
  }
</script>

<div class="settings-page">
  <h1>System Settings</h1>

  <section>
    <h2>OpenAI Configuration</h2>
    <p class="warning">⚠️ Required for AI-powered scanning</p>

    <label>API Key</label>
    <input type="password" bind:value={apiKey} placeholder="sk-...">

    <button on:click={testApiKey}>Test Connection</button>
    <button on:click={saveApiKey}>Save</button>

    {#if testStatus}
      <div class="status {testStatus.success ? 'success' : 'error'}">
        {testStatus.message}
      </div>
    {/if}
  </section>
</div>
```

**Backend** (`src/server/graphql/resolvers.ts`):
```typescript
updateSystemSettings: async (
  _parent: unknown,
  { openaiApiKey }: { openaiApiKey: string },
  context: Context
): Promise<{ success: boolean; message: string }> => {
  requirePermission(context, 'admin:write');

  // Store in database or .env file
  await prisma.systemSettings.upsert({
    where: { key: 'OPENAI_API_KEY' },
    create: { key: 'OPENAI_API_KEY', value: openaiApiKey },
    update: { value: openaiApiKey }
  });

  // Update environment variable for current process
  process.env.OPENAI_API_KEY = openaiApiKey;

  return { success: true, message: 'API key saved successfully' };
},

testOpenAIConnection: async () => {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5
    });
    return {
      success: true,
      model: response.model,
      message: 'Connected successfully to OpenAI'
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}
```

**Files to Create/Modify**:
- ✅ `src/client/components/Settings.svelte` (new)
- ✅ `src/server/graphql/schema.graphql` (add mutations)
- ✅ `src/server/graphql/resolvers.ts` (add resolvers)
- ✅ `prisma/schema.prisma` (add SystemSettings model)

---

### 2. Show Scan Errors in UI (2 hours)

**Problem**: When scans fail, UI shows FAILED status but no error message

**Fix**:
```typescript
// Add error field to Scan model
model Scan {
  // ... existing fields
  error String? // Add this
}

// Update startScan to catch and store errors
orchestrator.orchestrateScan(id).catch(async (err) => {
  await prisma.scan.update({
    where: { id },
    data: {
      status: 'FAILED',
      error: err.message,
      completedAt: new Date()
    }
  });
});

// Show in UI (src/client/components/Scans.svelte)
{#if scan.status === 'FAILED' && scan.error}
  <div class="error-message">
    <span class="error-icon">⚠️</span>
    <span class="error-text">{scan.error}</span>
  </div>
{/if}
```

---

### 3. Install Nmap in Docker (1 hour)

**Problem**: No actual security tools installed

**Fix** (`Dockerfile`):
```dockerfile
# After line 39, add:
RUN apk add --no-cache \
    nmap \
    nmap-scripts \
    nmap-doc

# Verify installation
RUN nmap --version
```

**Create Nmap Wrapper** (`src/server/tools/nmap-wrapper.ts`):
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface NmapScanOptions {
  target: string;
  ports?: string; // e.g., "1-1000" or "80,443,8080"
  scanType?: 'syn' | 'tcp' | 'udp' | 'comprehensive';
  timeout?: number;
}

export interface NmapResult {
  host: string;
  ports: Array<{
    port: number;
    protocol: string;
    state: string;
    service: string;
    version?: string;
  }>;
  os?: {
    name: string;
    accuracy: number;
  };
  scripts?: Record<string, string>;
}

export class NmapWrapper {
  async scan(options: NmapScanOptions): Promise<NmapResult> {
    const {
      target,
      ports = '1-1000',
      scanType = 'tcp',
      timeout = 300000 // 5 minutes
    } = options;

    // Build nmap command
    let command = 'nmap -oX - '; // Output XML to stdout

    switch (scanType) {
      case 'syn':
        command += '-sS '; // SYN scan (requires root)
        break;
      case 'tcp':
        command += '-sT '; // TCP connect scan
        break;
      case 'udp':
        command += '-sU '; // UDP scan
        break;
      case 'comprehensive':
        command += '-sS -sV -O -sC '; // Version, OS, default scripts
        break;
    }

    command += `-p ${ports} `;
    command += `--max-rtt-timeout 1000ms `;
    command += `${target}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      if (stderr && !stderr.includes('Warning')) {
        throw new Error(`Nmap error: ${stderr}`);
      }

      return this.parseXmlOutput(stdout);
    } catch (error) {
      throw new Error(`Nmap scan failed: ${error.message}`);
    }
  }

  private parseXmlOutput(xml: string): NmapResult {
    // Use xml2js or fast-xml-parser to parse Nmap XML output
    const parser = new XMLParser();
    const result = parser.parse(xml);

    // Extract ports, OS, scripts from parsed XML
    // ... implementation ...

    return {
      host: target,
      ports: [...],
      os: { ... },
      scripts: { ... }
    };
  }
}
```

**Integrate with SecurityTools** (`src/server/tools/security-tools.ts`):
```typescript
import { NmapWrapper } from './nmap-wrapper';

class SecurityTools {
  private nmap: NmapWrapper;

  constructor() {
    this.nmap = new NmapWrapper();
  }

  async portScan(params: PortScanParams): Promise<PortScanResult> {
    // Use Nmap instead of custom TCP connect
    try {
      const nmapResult = await this.nmap.scan({
        target: params.target,
        ports: params.ports || '1-1000',
        scanType: 'tcp',
        timeout: params.timeout || 300000
      });

      return {
        target: params.target,
        ports: nmapResult.ports.map(p => ({
          port: p.port,
          state: p.state,
          service: p.service,
          version: p.version
        })),
        scanTime: Date.now(),
        tool: 'nmap'
      };
    } catch (error) {
      // Fallback to custom implementation if Nmap fails
      return this.customPortScan(params);
    }
  }
}
```

---

## 🟡 HIGH PRIORITY: Do Next Week (5-7 days)

### 4. Implement BullMQ Queue (8 hours)

**Create Queue Infrastructure**:

```typescript
// src/server/queue/index.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

// Task queue for agent work
export const taskQueue = new Queue('agent-tasks', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed
    removeOnFail: 1000,    // Keep last 1000 failed
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// Worker to process tasks
export const taskWorker = new Worker(
  'agent-tasks',
  async (job) => {
    const { taskId, agentId } = job.data;

    // Get task from database
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { agent: true }
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Execute task using AgentRunner logic
    const runner = new AgentRunner(task.agent, orchestrator);
    await runner.executeTask(task);

    return { success: true, taskId };
  },
  {
    connection,
    concurrency: 5, // Process 5 tasks concurrently
    limiter: {
      max: 10,      // Max 10 jobs
      duration: 1000 // per second
    }
  }
);

// Events for monitoring
export const queueEvents = new QueueEvents('agent-tasks', { connection });

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info(`Task ${jobId} completed:`, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Task ${jobId} failed:`, failedReason);
});
```

**Replace Polling in AgentOrchestrator**:
```typescript
// OLD (polling):
private pollInterval: NodeJS.Timeout | null = null;

async start(): Promise<void> {
  this.pollInterval = setInterval(async () => {
    const task = await this.getNextTask();
    if (task) await this.executeTask(task);
  }, AGENT_POLL_INTERVAL);
}

// NEW (queue-based):
import { taskQueue } from '../queue';

async createTask(params): Promise<Task> {
  const task = await prisma.task.create({ data: params });

  // Add to queue instead of polling
  await taskQueue.add('execute-task', {
    taskId: task.id,
    agentId: task.agentId,
    priority: task.priority
  }, {
    priority: task.priority, // Higher priority = processed first
    delay: task.scheduledFor ?
      new Date(task.scheduledFor).getTime() - Date.now() :
      0
  });

  return task;
}
```

---

### 5. WebSocket Real-time Updates (6 hours)

**Enable Subscriptions in Frontend**:

```typescript
// src/client/lib/graphql-client.ts
import { createClient } from 'graphql-ws';

const wsClient = createClient({
  url: 'ws://localhost:4000/graphql',
  connectionParams: () => ({
    authorization: localStorage.getItem('token')
  })
});

export function subscribeScanUpdates(scanId: string, callback: (scan: any) => void) {
  const unsubscribe = wsClient.subscribe(
    {
      query: `
        subscription ScanUpdated($id: ID!) {
          scanUpdated(id: $id) {
            id
            status
            progress
            stats {
              totalTasks
              completedTasks
              totalFindings
            }
          }
        }
      `,
      variables: { id: scanId }
    },
    {
      next: (data) => callback(data.data.scanUpdated),
      error: (err) => console.error('Subscription error:', err),
      complete: () => console.log('Subscription complete')
    }
  );

  return unsubscribe;
}
```

**Use in Scan Detail Modal**:
```typescript
// src/client/components/Scans.svelte
import { subscribeScanUpdates } from '../lib/graphql-client';

let unsubscribe: (() => void) | null = null;

async function openScanDetails(scan: any) {
  selectedScan = scan;
  showScanDetailModal = true;

  // Subscribe to real-time updates
  unsubscribe = subscribeScanUpdates(scan.id, (updatedScan) => {
    scanDetails = { ...scanDetails, ...updatedScan };
  });

  // Fetch initial data
  await fetchScanDetails(scan.id);
}

function closeScanDetails() {
  // Unsubscribe when closing modal
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  showScanDetailModal = false;
  selectedScan = null;
  scanDetails = null;
}
```

---

### 6. Basic Report Export (4 hours)

**Add Export Mutation**:
```typescript
// src/server/graphql/resolvers.ts
exportScanReport: async (
  _parent: unknown,
  { id, format }: { id: string; format: 'JSON' | 'PDF' | 'CSV' },
  context: Context
): Promise<{ url: string; expiresAt: string }> => {
  requirePermission(context, 'scan:read');

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      target: true,
      findings: true,
      agents: true,
      tasks: true
    }
  });

  if (!scan) throw new Error('Scan not found');

  let fileBuffer: Buffer;
  let filename: string;
  let contentType: string;

  switch (format) {
    case 'JSON':
      fileBuffer = Buffer.from(JSON.stringify(scan, null, 2));
      filename = `scan-${id}.json`;
      contentType = 'application/json';
      break;

    case 'CSV':
      fileBuffer = await generateCSV(scan);
      filename = `scan-${id}.csv`;
      contentType = 'text/csv';
      break;

    case 'PDF':
      fileBuffer = await generatePDF(scan);
      filename = `scan-${id}.pdf`;
      contentType = 'application/pdf';
      break;
  }

  // Store file temporarily (or upload to S3)
  const filepath = `/tmp/${filename}`;
  await fs.writeFile(filepath, fileBuffer);

  // Return download URL (expires in 1 hour)
  return {
    url: `/api/downloads/${filename}`,
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };
}
```

**Add Download Endpoint**:
```typescript
// src/server/index.ts
app.get('/api/downloads/:filename', async (req, res) => {
  const { filename } = req.params;
  const filepath = `/tmp/${filename}`;

  if (!await fs.pathExists(filepath)) {
    return res.status(404).send('File not found');
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      logger.error('Download error:', err);
      res.status(500).send('Download failed');
    }

    // Delete file after download
    fs.unlink(filepath).catch(console.error);
  });
});
```

---

## 🟢 NICE TO HAVE: Do This Month (2-3 weeks)

### 7. Email Notifications (6 hours)

Install nodemailer and create notification service...

### 8. Install More Tools (8 hours)

Add Nikto, SQLmap, Nuclei to Dockerfile...

### 9. User Settings Page (4 hours)

Create profile management UI...

### 10. Delete/Edit Operations (6 hours)

Add CRUD for all entities...

---

## 📋 IMPLEMENTATION CHECKLIST

### Week 1: Critical Fixes
- [ ] OpenAI API key configuration UI
- [ ] Test OpenAI connection GraphQL query
- [ ] Store API key in database
- [ ] Show scan errors in UI
- [ ] Add error field to Scan model
- [ ] Install Nmap in Dockerfile
- [ ] Create Nmap wrapper class
- [ ] Parse Nmap XML output
- [ ] Integrate Nmap with SecurityTools

### Week 2: Queue & Real-time
- [ ] Initialize BullMQ and Redis connection
- [ ] Create task queue and worker
- [ ] Replace polling with queue
- [ ] Add queue monitoring
- [ ] Enable GraphQL subscriptions in frontend
- [ ] Subscribe to scan updates
- [ ] Subscribe to finding created
- [ ] Remove polling intervals

### Week 3: Reports & Settings
- [ ] Add export mutation to GraphQL
- [ ] Generate JSON reports
- [ ] Generate CSV reports
- [ ] Generate PDF reports (optional)
- [ ] Add download endpoint
- [ ] Create Settings page component
- [ ] Add user profile section
- [ ] Add API key management

### Week 4: Polish & Deploy
- [ ] Add email notifications
- [ ] Install Nikto wrapper
- [ ] Install SQLmap wrapper
- [ ] Add delete operations
- [ ] Add edit operations
- [ ] Write deployment guide
- [ ] Test end-to-end
- [ ] Deploy to production

---

## 🎯 SUCCESS METRICS

After implementing these fixes, you should have:

1. ✅ Scans that actually run (with OpenAI API key)
2. ✅ Real security tool execution (Nmap)
3. ✅ Scalable task processing (BullMQ)
4. ✅ Real-time UI updates (WebSocket)
5. ✅ Exportable reports (JSON/CSV/PDF)
6. ✅ User configuration (Settings page)
7. ✅ Clear error messages (no more silent failures)

**Estimated Total Time**: 3-4 weeks for one developer

**Order of Implementation**:
1. Week 1: Make it work (API key + Nmap + errors)
2. Week 2: Make it scale (Queue + WebSocket)
3. Week 3: Make it useful (Reports + Settings)
4. Week 4: Make it complete (Notifications + More tools)
