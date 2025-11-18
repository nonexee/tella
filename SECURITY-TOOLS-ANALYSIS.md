# Security Tools Implementation Investigation Report

## Executive Summary

This investigation examined the security tools implementation in the Tella AI Security platform to understand:
1. What tools are installed/available
2. How tools are integrated into the system
3. Whether tools are actually executed
4. How tool results are parsed and stored
5. What's missing for full tool execution

### Key Finding: **Security tools are NOT actually being executed via system commands**

The platform implements custom Python/JavaScript versions of security scanning tools within the application, NOT wrapping or executing external tools like Nmap, Nikto, SQLmap, etc.

---

## 1. What Security Tools Are "Installed"?

### Database Records Only
Four security tools are seeded into the database in `src/server/db/seed.ts`:

```typescript
const tools = [
  {
    name: 'nmap',
    description: 'Network mapper for port scanning and service detection',
    category: 'SCANNER',
    config: { timeout: 30000 }
  },
  {
    name: 'subfinder',
    description: 'Subdomain discovery tool',
    category: 'RECON',
    config: { sources: ['certificate', 'dns'] }
  },
  {
    name: 'nuclei',
    description: 'Fast vulnerability scanner',
    category: 'SCANNER',
    config: { templates: 'all' }
  },
  {
    name: 'sqlmap',
    description: 'SQL injection detection and exploitation',
    category: 'EXPLOIT',
    config: { risk: 1, level: 1 }
  }
];
```

**Status**: These are ONLY database records. The actual Nmap, Subfinder, Nuclei, and SQLmap binaries are NOT installed in the Docker image.

### Dockerfile Analysis
`Dockerfile` (lines 1-77):
- **Base Image**: `node:18-alpine`
- **System Packages Installed**: 
  - `libc6-compat`, `python3`, `make`, `g++` (for build)
  - `dumb-init`, `openssl` (for runtime)
- **Missing**: No installation of Nmap, Nikto, Sqlmap, Metasploit, Nuclei, Subfinder, or any other security tools

**Conclusion**: External security tools are NOT available in the container environment.

---

## 2. Custom Security Tools Implementation

Instead of wrapping external tools, the platform implements custom security scanning in TypeScript:

### File: `src/server/tools/security-tools.ts`

#### Class: `SecurityTools`
Implements 4 main security testing functions:

**A. Port Scanning**
```typescript
async portScan(params: {
  target: string;
  ports?: string;
  technique?: 'syn' | 'connect' | 'stealth';
}): Promise<PortScanResult>
```

- **Implementation**: Custom TCP connect scan using Node.js `net` module
- **Lines 136-164**: `tcpConnectScan()` method
- **How it works**:
  1. Parses target and port range
  2. Creates socket connections using `net.Socket()`
  3. Tests connectivity with 3-second timeout per port
  4. Rate limits to 50 concurrent port scans via `p-limit`
  5. Returns list of open ports with service names

**B. Web Vulnerability Scanning**
```typescript
async webScan(params: {
  url: string;
  scan_types?: string[];
  depth?: number;
}): Promise<WebScanResult>
```

- **Capabilities**:
  - Technology fingerprinting (Angular, Next.js, React, WordPress, Drupal, etc.)
  - Security header analysis (HSTS, X-Content-Type-Options, CSP, etc.)
  - Cookie security assessment
  - XSS vulnerability testing (lines 271-326)
  - SQL Injection testing (lines 331-401)
  - CSRF protection detection (lines 406-442)
  - SSRF vulnerability testing (lines 447-513)
  - Sensitive file enumeration (/.git/config, /.env, /web.config, etc.)
  - Server version detection

- **Implementation**: Uses `axios` HTTP library to:
  1. Send payloads to URL parameters
  2. Check for reflections in responses
  3. Analyze HTTP headers
  4. Detect security misconfigurations

**C. Subdomain Enumeration**
```typescript
async subdomainEnum(params: {
  domain: string;
  techniques?: string[];
}): Promise<SubdomainEnumResult>
```

- **Techniques**:
  - Certificate Transparency (queries crt.sh)
  - DNS brute-forcing with common subdomain wordlist
  - Rate limited to 20 concurrent DNS queries

**D. Exploit Testing**
```typescript
async exploitTest(params: {
  target: string;
  exploit_type: string;
  payload: string;
  safe_mode?: boolean;
}): Promise<any>
```

- **Status**: NOT IMPLEMENTED
- **Current behavior**: Returns placeholder response
- **Code**: Lines 844-866

### Issue #1: Unused Shell Execution Import
```typescript
import { exec } from 'child_process';
const execAsync = promisify(exec);  // Line 24
```

- **Imported**: ✓
- **Used in security-tools.ts**: ✗ (NEVER CALLED)
- **Conclusion**: Even though child_process is imported, it's never used to execute external tools

---

## 3. How Tools Are Actually Executed

### Execution Flow

#### Step 1: Agent Framework
File: `src/server/ai/agent-orchestrator.ts`

The AgentRunner class has a list of available tools (lines 816-928):
```typescript
private getAvailableTools(): any[] {
  return [
    {
      type: 'function',
      function: {
        name: 'port_scan',
        description: 'Scan target for open ports and services',
        parameters: { /* ... */ }
      }
    },
    {
      type: 'function',
      function: {
        name: 'web_scan',
        description: 'Scan web application for vulnerabilities',
        parameters: { /* ... */ }
      }
    },
    // ... more tools
  ];
}
```

#### Step 2: Tool Execution Switch Statement
Lines 956-977 in agent-orchestrator.ts:
```typescript
case 'port_scan':
  result = await this.securityTools.portScan(args);
  break;
case 'web_scan':
  result = await this.securityTools.webScan(args);
  break;
case 'subdomain_enum':
  result = await this.securityTools.subdomainEnum(args);
  break;
case 'exploit_test':
  result = await this.securityTools.exploitTest(args);
  break;
case 'report_finding':
  result = await this.reportFinding(args);
  break;
case 'create_subtask':
  result = await this.createSubtask(args);
  break;
```

#### Step 3: Tool Execution Recording
Lines 1082-1119 in agent-orchestrator.ts:
```typescript
private async recordToolExecution(toolName: string, args: any, result: any): Promise<void> {
  // Find or create tool in database
  let tool = await prisma.tool.findUnique({ where: { name: toolName } });
  if (!tool) {
    tool = await prisma.tool.create({
      data: {
        id: uuidv4(),
        name: toolName,
        description: `Security testing tool: ${toolName}`,
        category: 'CUSTOM',
        config: {},
        enabled: true
      }
    });
  }

  // Record execution in ToolExecution table
  await prisma.toolExecution.create({
    data: {
      id: uuidv4(),
      toolId: tool.id,
      agentId: this.agent.id,
      command: toolName,
      args,
      status: result.error ? 'FAILED' : 'COMPLETED',
      output: JSON.stringify(result),
      error: result.error,
      startedAt: new Date(),
      completedAt: new Date()
    }
  });
}
```

**Key Points**:
1. Tools are CREATED in database if they don't exist
2. Execution is RECORDED but no shell execution happens
3. Results are JSON-serialized and stored directly

---

## 4. Database Schema for Tools

File: `prisma/schema.prisma`

### Tool Model (lines 273-288)
```prisma
model Tool {
  id          String   @id @default(uuid())
  name        String   @unique
  description String
  category    ToolCategory
  command     String?        // Never used
  config      Json
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  executions  ToolExecution[]

  @@index([category])
  @@index([enabled])
}
```

### ToolExecution Model (lines 300-321)
```prisma
model ToolExecution {
  id          String            @id @default(uuid())
  toolId      String
  tool        Tool              @relation(fields: [toolId], references: [id])
  agentId     String
  agent       Agent             @relation(fields: [agentId], references: [id], onDelete: Cascade)
  command     String            // Tool function name (e.g., 'port_scan')
  args        Json              // Arguments passed to tool
  status      ExecutionStatus   // QUEUED, RUNNING, COMPLETED, FAILED, TIMEOUT, CANCELLED
  output      String?           // JSON-serialized result
  error       String?           // Error message if failed
  exitCode    Int?              // Not used (no process execution)
  duration    Int?              // Not captured
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime          @default(now())

  @@index([status])
  @@index([toolId])
  @@index([agentId])
  @@index([createdAt])
}
```

**Issue #2**: The `command` field in Tool model is never used. The `exitCode` field in ToolExecution is not populated.

---

## 5. GraphQL Integration

### Tool Queries (schema.graphql lines 351-356)
```graphql
tools(category: ToolCategory): [Tool!]!
tool(id: ID!): Tool
toolExecutions(agentId: ID, toolId: ID): [ToolExecution!]!
```

### Tool Mutations (schema.graphql lines 484-506)
```graphql
createTool(
  name: String!
  description: String!
  category: ToolCategory!
  command: String
  config: JSON!
): Tool!

updateTool(
  id: ID!
  description: String
  command: String
  config: JSON
  enabled: Boolean
): Tool!

deleteTool(id: ID!): Boolean!

executeTool(
  toolId: ID!
  agentId: ID!
  args: JSON!
): ToolExecution!
```

### Resolver: executeTool (resolvers.ts lines 1222-1245)
```typescript
executeTool: async (
  _parent: unknown,
  { toolId, agentId, args }: any,
  context: Context
) => {
  requirePermission(context, 'tool:execute');

  const execution = await prisma.toolExecution.create({
    data: {
      id: uuidv4(),
      toolId,
      agentId,
      command: 'execute',
      args,
      status: 'QUEUED'  // Created but never processed
    },
    include: {
      tool: true,
      agent: true
    }
  });

  return execution;
}
```

**Issue #3**: The `executeTool` mutation only CREATES a ToolExecution record with status 'QUEUED'. It's never picked up and executed. No actual tool execution happens.

---

## 6. Tool Result Parsing

### No Result Parsing Infrastructure
Currently, tool results are:
1. Generated in-memory by SecurityTools methods
2. Returned as structured TypeScript objects
3. Stored directly as JSON in database
4. Never parsed from external tool output

**Why**: No external tools to parse results from.

### Finding Creation
Tools report findings via the `report_finding` tool (agent-orchestrator.ts lines 1004-1038):

```typescript
private async reportFinding(args: any): Promise<any> {
  const finding = await prisma.finding.create({
    data: {
      id: uuidv4(),
      scanId: this.agent.scanId,
      targetId: scan.targetId,
      title: args.title,
      description: args.description,
      severity: args.severity,      // CRITICAL, HIGH, MEDIUM, LOW, INFO
      category: args.category,      // Vulnerability category (OWASP, etc.)
      evidence: args.evidence,      // Raw evidence object
      cvss: args.cvss,
      remediation: args.remediation,
      confidence: args.confidence || 1.0,
      references: args.references || [],
      status: 'NEW'
    }
  });
  return { findingId: finding.id, success: true };
}
```

---

## 7. AI Agent Integration

### How Agents Use Tools
File: `src/server/ai/agent-orchestrator.ts` lines 620-767

```typescript
async executeTask(task: Task): Promise<void> {
  // Build messages for OpenAI with tool definitions
  const messages = [
    { role: 'system', content: this.systemPrompt },
    // ... previous messages ...
    {
      role: 'user',
      content: `Execute task: ${task.description}\nInput: ${JSON.stringify(task.input)}`
    }
  ];

  // Call OpenAI with tools
  const response = await this.openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages,
    tools: this.getAvailableTools(),  // SecurityTools wrapped as OpenAI functions
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 4000
  });

  // OpenAI returns tool_calls
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);
  }
}
```

### Agent Types
Six agent types with different capabilities (lines 356-433):
1. **ORCHESTRATOR**: Task coordination and strategy
2. **RECON**: Passive & active reconnaissance
3. **SCANNER**: Vulnerability detection
4. **EXPLOITER**: Exploit development and validation
5. **ANALYST**: Result analysis and correlation
6. **REPORTER**: Report generation

---

## 8. What's Missing for External Tool Integration

### Critical Gaps

#### 1. No Tool Installation in Docker
```
Required additions to Dockerfile:
- nmap
- nikto
- sqlmap
- nuclei
- subfinder
- burpsuite
- zaproxy
- ffuf
- etc.
```

#### 2. No Tool Wrapper System
Need:
- Configuration for tool paths and arguments
- Command-line argument builders
- Output format detection
- Result parsers for each tool

Example missing:
```typescript
// Not implemented:
class NmapWrapper {
  async scan(target: string, ports: string): Promise<NmapResult> {
    const cmd = `nmap -p ${ports} -oX - ${target}`;
    const output = await execAsync(cmd);
    return parseXmlOutput(output);
  }
}
```

#### 3. No Tool Execution Queue
Current state:
- ToolExecution records created with status 'QUEUED'
- No worker process picks them up
- BullMQ installed but not integrated (package.json has bullmq but no implementation)

Missing implementation:
```typescript
// Not implemented:
const toolQueue = new Queue('tools', { connection: redis });

toolQueue.process(async (job) => {
  const { toolId, args } = job.data;
  const tool = await prisma.tool.findUnique({ where: { id: toolId } });
  const result = await executeExternalTool(tool.name, args);
  return result;
});
```

#### 4. No Output Parsing
Current approach works for custom tools. For external tools, need:
- Parser registry for each tool
- Format detection (XML, JSON, plain text)
- Standardization to Finding model

Missing:
```typescript
// Not implemented:
const parsers = {
  nmap: (output) => ({ openPorts: [...] }),
  sqlmap: (output) => ({ vulnerable: [...] }),
  nikto: (output) => ({ vulnerabilities: [...] })
};
```

#### 5. No Tool Configuration Management
Current: Tools stored with empty `command` field

Missing:
```typescript
// Current tool record:
{
  name: 'nmap',
  description: '...',
  command: null,  // Never set!
  config: { timeout: 30000 }
}

// Should be:
{
  name: 'nmap',
  description: '...',
  command: '/usr/bin/nmap',
  config: {
    timeout: 30000,
    arguments: '-sV -sC -oX -',
    outputFormat: 'xml'
  }
}
```

#### 6. No Error Handling for Tool Failures
Current: Tools run in-process
Needed for external tools:
- Timeout management
- Resource limits (memory, CPU)
- Graceful error recovery
- Partial result handling

---

## 9. Current Capabilities Summary

### What Actually Works
✓ Port scanning (custom TCP implementation)
✓ Web vulnerability scanning (custom HTTP-based tests)
✓ Subdomain enumeration (DNS + Certificate Transparency)
✓ Technology fingerprinting
✓ Security header analysis
✓ Cookie analysis
✓ XSS payload injection testing
✓ SQL injection error detection
✓ CSRF protection assessment
✓ SSRF payload testing
✓ Sensitive file enumeration
✓ Server version detection
✓ Finding creation and storage
✓ Agent-driven tool execution via OpenAI

### What Doesn't Work
✗ External tool execution (Nmap, Nikto, SQLmap, etc.)
✗ Tool output parsing
✗ ToolExecution queue processing
✗ Exploit testing (returns placeholder only)
✗ Multi-threaded port scanning (no nmap-style range)
✗ OS fingerprinting
✗ Service version detection (beyond HTTP headers)
✗ Deep web crawling
✗ API endpoint discovery
✗ Authentication testing
✗ SSL/TLS vulnerability scanning

---

## 10. Recommendations

### Phase 1: Stabilize Current Implementation
1. Remove unused `execAsync` import and `child_process` dependency
2. Complete exploit_test implementation
3. Add duration tracking to ToolExecution
4. Implement ToolExecution queue processing for pending tasks

### Phase 2: Add External Tool Support
1. Install tools in Docker container
2. Create tool wrapper classes for each external tool
3. Implement output parsers
4. Build tool configuration system
5. Add BullMQ queue for tool execution

### Phase 3: Advanced Integration
1. Sandboxed tool execution (containers/VMs)
2. Rate limiting per tool
3. Tool dependency management
4. Advanced result correlation
5. Custom tool plugin system

---

## Files Affected Summary

| File | Issue | Lines |
|------|-------|-------|
| Dockerfile | No security tools installed | 1-77 |
| src/server/tools/security-tools.ts | execAsync imported but not used | 16, 24 |
| src/server/tools/security-tools.ts | exploit_test placeholder | 844-866 |
| src/server/ai/agent-orchestrator.ts | Tool execution handling | 956-977 |
| src/server/graphql/resolvers.ts | executeTool creates record only | 1222-1245 |
| prisma/schema.prisma | Tool.command never set | 278 |
| src/server/db/seed.ts | Tools seeded but not available | 34-73 |
| package.json | BullMQ installed but unused | 42 |

---

## Conclusion

The Tella AI Security platform implements **custom, in-process security scanning tools** rather than wrapping external tools like Nmap, Nikto, or SQLmap. This approach:

**Advantages:**
- No external dependencies required
- Consistent error handling
- Direct control over timeout/resource management
- Works in containerized environments without tool installation

**Disadvantages:**
- Limited vulnerability detection capabilities
- No support for advanced techniques (OS fingerprinting, advanced exploitation)
- Custom implementations may have blind spots
- Reimplements well-tested tools

The infrastructure for external tool integration exists (Tool model, ToolExecution, executeTool mutation) but the execution layer is not implemented.
