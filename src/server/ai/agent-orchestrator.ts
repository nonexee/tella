/**
 * Agent Orchestrator - Multi-Agent Coordination System
 *
 * This is the brain of the offensive security testing platform.
 * It manages multiple specialized AI agents that work together to
 * perform comprehensive security assessments.
 *
 * FIXES:
 * - Added graceful shutdown handling
 * - Fixed infinite loop with proper error handling
 * - Added memory persistence and cleanup
 * - Added rate limiting for OpenAI calls
 * - Added timeout handling
 * - Fixed task queue management
 * - Added proper error recovery
 */

import { OpenAI } from 'openai';
import { Agent, AgentType, AgentStatus, Task, TaskStatus, PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { SecurityTools } from '../tools/security-tools.js';
import { prisma } from '../utils/prisma.js';
import { sanitizeError } from '../utils/security.js';
import pLimit from 'p-limit';

const MAX_SHORT_TERM_MESSAGES = 50; // Prevent memory leak
const AGENT_POLL_INTERVAL = 5000; // 5 seconds between task checks

// Load from environment variables with safe defaults
const OPENAI_RATE_LIMIT = parseInt(process.env.MAX_CONCURRENT_AGENTS || '10', 10);
const MAX_TASK_RETRIES = 3;
const TASK_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10);

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  autonomyLevel: 'low' | 'medium' | 'high';
}

export interface AgentMemory {
  shortTerm: Message[];
  longTerm: KnowledgeItem[];
  workingContext: Record<string, any>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface KnowledgeItem {
  key: string;
  value: any;
  confidence: number;
  source: string;
  timestamp: Date;
}

export class AgentOrchestrator extends EventEmitter {
  private openai: OpenAI;
  private securityTools: SecurityTools;
  private activeAgents: Map<string, AgentRunner>;
  private openaiLimiter: any;
  private isShuttingDown: boolean = false;
  private sigtermHandler: () => void;
  private sigintHandler: () => void;

  constructor() {
    super();

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 60000
    });
    this.securityTools = new SecurityTools();
    this.activeAgents = new Map();
    this.openaiLimiter = pLimit(OPENAI_RATE_LIMIT);

    // Graceful shutdown handling
    // Store bound handlers so we can remove them later
    this.sigtermHandler = () => this.shutdown();
    this.sigintHandler = () => this.shutdown();
    process.on('SIGTERM', this.sigtermHandler);
    process.on('SIGINT', this.sigintHandler);
  }

  /**
   * Graceful shutdown with timeout
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    logger.info('Shutting down Agent Orchestrator...');

    const SHUTDOWN_TIMEOUT = 10000; // 10 seconds

    try {
      // Stop all active agents with timeout
      const shutdownPromises = Array.from(this.activeAgents.values()).map(
        agent => agent.stop()
      );

      // Race between shutdown and timeout
      await Promise.race([
        Promise.allSettled(shutdownPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Shutdown timeout')), SHUTDOWN_TIMEOUT)
        )
      ]);

      logger.info('All agents stopped successfully');
    } catch (error) {
      logger.warn('Agent shutdown timeout reached, forcing shutdown', { error });
      // Force shutdown by clearing active agents
      this.activeAgents.clear();
    } finally {
      // Remove event listeners to prevent memory leaks
      process.off('SIGTERM', this.sigtermHandler);
      process.off('SIGINT', this.sigintHandler);

      // Database disconnection handled by centralized prisma client
      logger.info('Prisma will be disconnected by centralized client');

      logger.info('Agent Orchestrator shut down complete');
    }
  }

  /**
   * Create a specialized security testing agent
   */
  async createAgent(params: {
    type: AgentType;
    role: string;
    scanId?: string;
    config?: Record<string, any>;
  }): Promise<Agent> {
    const capabilities = this.getAgentCapabilities(params.type);

    const agent = await prisma.agent.create({
      data: {
        id: uuidv4(),
        name: `${params.type}-${Date.now()}`,
        type: params.type,
        role: params.role,
        status: AgentStatus.IDLE,
        scanId: params.scanId,
        capabilities: capabilities as any,
        config: params.config || {},
        memory: {
          shortTerm: [],
          longTerm: [],
          workingContext: {}
        }
      }
    });

    logger.info(`Created agent: ${agent.id} (${agent.type})`);
    return agent;
  }

  /**
   * Start an agent for a security scan
   */
  async startAgent(agentId: string): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start agent during shutdown');
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { scan: true }
    });

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (this.activeAgents.has(agentId)) {
      logger.warn(`Agent ${agentId} is already running`);
      return;
    }

    // Create agent runner
    const runner = new AgentRunner(
      agent,
      this.openai,
      prisma,
      this.securityTools,
      this.openaiLimiter,
      () => this.isShuttingDown
    );

    this.activeAgents.set(agentId, runner);

    // Update status
    await prisma.agent.update({
      where: { id: agentId },
      data: { status: AgentStatus.ACTIVE }
    });

    // Start the agent's main loop (don't await - runs in background)
    runner.start().catch(error => {
      logger.error(`Agent ${agentId} crashed:`, error);
      this.activeAgents.delete(agentId);
    });

    this.emit('agent:started', { agentId, type: agent.type });
    logger.info(`Started agent: ${agentId}`);
  }

  /**
   * Coordinate multiple agents for a security scan
   */
  async orchestrateScan(scanId: string): Promise<void> {
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: { target: true }
    });

    if (!scan) {
      throw new Error(`Scan ${scanId} not found`);
    }

    logger.info(`Starting orchestration for scan: ${scanId}`);

    try {
      // Create specialized agents based on scan configuration
      const agents = await Promise.all([
        this.createAgent({
          type: AgentType.ORCHESTRATOR,
          role: 'Main coordinator',
          scanId,
          config: scan.config as any
        }),
        this.createAgent({
          type: AgentType.RECON,
          role: 'Reconnaissance specialist',
          scanId,
          config: scan.config as any
        }),
        this.createAgent({
          type: AgentType.SCANNER,
          role: 'Vulnerability scanner',
          scanId,
          config: scan.config as any
        }),
        this.createAgent({
          type: AgentType.EXPLOITER,
          role: 'Exploitation specialist',
          scanId,
          config: scan.config as any
        })
      ]);

      // Start all agents
      await Promise.all(agents.map(agent => this.startAgent(agent.id)));

      // Create initial reconnaissance task
      const reconAgent = agents.find(a => a.type === AgentType.RECON);
      if (reconAgent) {
        await this.createTask({
          agentId: reconAgent.id,
          scanId,
          type: 'RECON',
          description: `Perform reconnaissance on ${scan.target.url}`,
          input: {
            target: scan.target.url,
            targetType: scan.target.type,
            depth: 'comprehensive'
          },
          priority: 10
        });
      }

      this.emit('scan:orchestration:started', { scanId });
    } catch (error) {
      logger.error(`Failed to orchestrate scan ${scanId}:`, error);
      throw error;
    }
  }

  /**
   * Create a task for an agent
   */
  async createTask(params: {
    agentId: string;
    scanId: string;
    type: string;
    description: string;
    input: Record<string, any>;
    priority?: number;
    dependencies?: string[];
  }): Promise<Task> {
    const task = await prisma.task.create({
      data: {
        id: uuidv4(),
        agentId: params.agentId,
        scanId: params.scanId,
        type: params.type as any,
        description: params.description,
        input: params.input,
        priority: params.priority || 5,
        status: TaskStatus.PENDING,
        maxRetries: MAX_TASK_RETRIES
      }
    });

    // Notify agent runner
    const runner = this.activeAgents.get(params.agentId);
    if (runner) {
      runner.notifyNewTask();
    }

    this.emit('task:created', { taskId: task.id, agentId: params.agentId });
    logger.info(`Created task ${task.id} for agent ${params.agentId}`);

    return task;
  }

  /**
   * Get capabilities for agent type
   */
  private getAgentCapabilities(type: AgentType): AgentCapability[] {
    const capabilityMap: Record<AgentType, AgentCapability[]> = {
      [AgentType.ORCHESTRATOR]: [
        {
          name: 'task_coordination',
          description: 'Coordinate tasks across multiple agents',
          tools: ['create_task', 'assign_agent', 'monitor_progress'],
          autonomyLevel: 'high'
        },
        {
          name: 'strategic_planning',
          description: 'Plan attack strategies and methodologies',
          tools: ['analyze_target', 'plan_attack', 'prioritize'],
          autonomyLevel: 'high'
        }
      ],
      [AgentType.RECON]: [
        {
          name: 'passive_recon',
          description: 'Gather intelligence without touching target',
          tools: ['whois', 'dns_enum', 'subdomain_enum', 'osint'],
          autonomyLevel: 'high'
        },
        {
          name: 'active_recon',
          description: 'Active reconnaissance and enumeration',
          tools: ['port_scan', 'service_detection', 'tech_stack_analysis'],
          autonomyLevel: 'medium'
        }
      ],
      [AgentType.SCANNER]: [
        {
          name: 'vulnerability_detection',
          description: 'Identify security vulnerabilities',
          tools: ['web_scanner', 'api_scanner', 'ssl_scanner', 'cve_check'],
          autonomyLevel: 'medium'
        },
        {
          name: 'configuration_analysis',
          description: 'Analyze security configurations',
          tools: ['header_analysis', 'cors_check', 'security_txt'],
          autonomyLevel: 'medium'
        }
      ],
      [AgentType.EXPLOITER]: [
        {
          name: 'exploit_development',
          description: 'Develop and test exploits',
          tools: ['sqli_test', 'xss_test', 'ssrf_test', 'rce_test'],
          autonomyLevel: 'low'
        },
        {
          name: 'exploit_validation',
          description: 'Validate identified vulnerabilities',
          tools: ['poc_generator', 'exploit_verifier'],
          autonomyLevel: 'low'
        }
      ],
      [AgentType.ANALYST]: [
        {
          name: 'result_analysis',
          description: 'Analyze and correlate findings',
          tools: ['correlate_findings', 'false_positive_detection', 'risk_assessment'],
          autonomyLevel: 'high'
        }
      ],
      [AgentType.REPORTER]: [
        {
          name: 'report_generation',
          description: 'Generate comprehensive security reports',
          tools: ['generate_report', 'export_findings', 'executive_summary'],
          autonomyLevel: 'medium'
        }
      ]
    };

    return capabilityMap[type] || [];
  }

  /**
   * Stop all agents for a scan
   */
  async stopScan(scanId: string): Promise<void> {
    const agents = await prisma.agent.findMany({
      where: { scanId }
    });

    for (const agent of agents) {
      const runner = this.activeAgents.get(agent.id);
      if (runner) {
        await runner.stop();
        this.activeAgents.delete(agent.id);
      }

      await prisma.agent.update({
        where: { id: agent.id },
        data: { status: AgentStatus.TERMINATED }
      });
    }

    logger.info(`Stopped all agents for scan: ${scanId}`);
  }
}

/**
 * Agent Runner - Executes individual agent's logic
 * FIXED: Proper error handling, memory management, shutdown handling
 */
class AgentRunner {
  private agent: Agent;
  private openai: OpenAI;
  private prisma: PrismaClient;
  private securityTools: SecurityTools;
  private running: boolean = false;
  private memory: AgentMemory;
  private systemPrompt: string;
  private openaiLimiter: any;
  private isShuttingDown: () => boolean;
  private currentTaskAbortController: AbortController | null = null;

  constructor(
    agent: Agent,
    openai: OpenAI,
    prismaClient: PrismaClient,
    securityTools: SecurityTools,
    openaiLimiter: any,
    isShuttingDown: () => boolean
  ) {
    this.agent = agent;
    this.openai = openai;
    this.prisma = prismaClient;
    this.securityTools = securityTools;
    this.openaiLimiter = openaiLimiter;
    this.isShuttingDown = isShuttingDown;

    this.memory = (agent.memory as unknown as AgentMemory) || {
      shortTerm: [],
      longTerm: [],
      workingContext: {}
    };

    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Build system prompt based on agent type and role
   */
  private buildSystemPrompt(): string {
    const basePrompt = `You are an AI security testing agent specialized in offensive security.
Your type: ${this.agent.type}
Your role: ${this.agent.role}
Your capabilities: ${JSON.stringify(this.agent.capabilities, null, 2)}

You are part of a multi-agent security testing system. Your goal is to:
1. Think like an attacker
2. Be thorough and methodical
3. Identify security vulnerabilities
4. Validate findings before reporting
5. Coordinate with other agents when needed

IMPORTANT: Only perform actions on authorized targets. All testing must be ethical and legal.`;

    const typeSpecificPrompts: Record<AgentType, string> = {
      [AgentType.ORCHESTRATOR]: `
As the orchestrator, you coordinate all security testing activities:
- Break down security assessments into specific tasks
- Assign tasks to specialized agents
- Monitor progress and adapt strategy
- Ensure comprehensive coverage
- Prioritize based on risk and findings`,

      [AgentType.RECON]: `
As a reconnaissance specialist:
- Gather intelligence about the target
- Map attack surface (subdomains, endpoints, technologies)
- Identify potential entry points
- Build a comprehensive target profile
- Use both passive and active techniques`,

      [AgentType.SCANNER]: `
As a vulnerability scanner:
- Systematically test for known vulnerabilities
- Check for misconfigurations
- Test security headers and policies
- Identify outdated/vulnerable components
- Minimize false positives`,

      [AgentType.EXPLOITER]: `
As an exploitation specialist:
- Validate vulnerabilities with proof-of-concept exploits
- Test attack chains and privilege escalation
- Demonstrate real-world impact
- Be careful and controlled in testing
- Document exploitation steps clearly`,

      [AgentType.ANALYST]: `
As an analyst:
- Correlate findings across different tests
- Assess risk and business impact
- Filter false positives
- Identify attack patterns and chains
- Provide actionable recommendations`,

      [AgentType.REPORTER]: `
As a reporter:
- Synthesize findings into clear reports
- Provide executive summaries
- Include technical details and evidence
- Suggest remediation strategies
- Prioritize findings by severity and impact`
    };

    return basePrompt + '\n' + typeSpecificPrompts[this.agent.type as AgentType];
  }

  /**
   * Start the agent's main execution loop
   * FIXED: Proper error handling, shutdown detection, memory cleanup
   */
  async start(): Promise<void> {
    this.running = true;
    logger.info(`Agent ${this.agent.id} starting execution loop`);

    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    while (this.running && !this.isShuttingDown()) {
      try {
        // Get next task
        const task = await this.getNextTask();

        if (task) {
          consecutiveErrors = 0; // Reset error counter on successful task fetch
          await this.executeTask(task);
        } else {
          // No tasks, wait before checking again
          await this.sleep(AGENT_POLL_INTERVAL);
        }

        // Cleanup memory periodically
        await this.cleanupMemory();

      } catch (error: any) {
        consecutiveErrors++;
        logger.error(`Agent ${this.agent.id} error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, sanitizeError(error));

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logger.error(`Agent ${this.agent.id} exceeded max consecutive errors, stopping`);
          break;
        }

        // Exponential backoff on errors
        await this.sleep(Math.min(AGENT_POLL_INTERVAL * consecutiveErrors, 60000));
      }
    }

    // Save final state
    await this.persistMemory();
    logger.info(`Agent ${this.agent.id} stopped`);
  }

  /**
   * Execute a task using GPT-5
   * FIXED: Timeout handling, abort controller, proper error handling
   */
  private async executeTask(task: Task): Promise<void> {
    logger.info(`Agent ${this.agent.id} executing task ${task.id}: ${task.description}`);

    this.currentTaskAbortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.currentTaskAbortController?.abort();
    }, TASK_TIMEOUT_MS);

    try {
      // Update task status
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.RUNNING,
          startedAt: new Date()
        }
      });

      // Build conversation context (limit size to prevent token overflow)
      const recentMessages = this.memory.shortTerm.slice(-10);
      const messages: any[] = [
        { role: 'system', content: this.systemPrompt },
        ...recentMessages.map(m => ({
          role: m.role,
          content: m.content
        })),
        {
          role: 'user',
          content: `Execute the following task:\n\nTask: ${task.description}\n\nInput: ${JSON.stringify(task.input, null, 2)}\n\nAnalyze the task, plan your approach, and execute using available tools. Be thorough and think like an attacker.`
        }
      ];

      // Call GPT-5 with rate limiting
      const response = await this.openaiLimiter(async () => {
        return this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
          messages,
          tools: this.getAvailableTools(),
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 4000
        });
      });

      clearTimeout(timeoutId);

      const assistantMessage = response.choices[0].message;

      // Handle tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);

        // Store in memory (with size limit)
        this.addToMemory({
          role: 'assistant',
          content: assistantMessage.content || 'Executed tools',
          timestamp: new Date(),
          metadata: { tool_calls: assistantMessage.tool_calls.map(tc => tc.function.name) }
        });

        // Update task with results
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.COMPLETED,
            output: {
              reasoning: assistantMessage.content,
              tool_results: toolResults
            },
            completedAt: new Date()
          }
        });
      } else {
        // No tool calls, just reasoning
        this.addToMemory({
          role: 'assistant',
          content: assistantMessage.content || 'Task analyzed',
          timestamp: new Date()
        });

        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.COMPLETED,
            output: {
              reasoning: assistantMessage.content
            },
            completedAt: new Date()
          }
        });
      }

      logger.info(`Agent ${this.agent.id} completed task ${task.id}`);

      // Persist memory after task completion
      await this.persistMemory();

    } catch (error: any) {
      clearTimeout(timeoutId);

      const isTimeout = error.name === 'AbortError';
      const isRateLimit = error.status === 429 || error.code === 'rate_limit_exceeded';
      const errorMessage = isTimeout ? 'Task timeout' : isRateLimit ? 'OpenAI rate limit exceeded' : error.message;

      logger.error(`Agent ${this.agent.id} task ${task.id} failed:`, sanitizeError(error));

      // Rate limit errors: always retry with exponential backoff
      if (isRateLimit && task.retries < task.maxRetries + 2) {
        const backoffDelay = Math.min(1000 * Math.pow(2, task.retries), 30000); // Max 30s
        logger.warn(`Rate limit hit, will retry task ${task.id} after ${backoffDelay}ms (attempt ${task.retries + 1})`);

        await new Promise(resolve => setTimeout(resolve, backoffDelay));

        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.PENDING,
            error: errorMessage,
            retries: task.retries + 1
          }
        });
      }
      // Regular errors: retry if within limit and not timeout
      else if (task.retries < task.maxRetries && !isTimeout) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.PENDING,
            error: errorMessage,
            retries: task.retries + 1
          }
        });
        logger.info(`Will retry task ${task.id} (attempt ${task.retries + 1}/${task.maxRetries})`);
      } else {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.FAILED,
            error: errorMessage,
            completedAt: new Date()
          }
        });
      }
    } finally {
      this.currentTaskAbortController = null;
    }
  }

  /**
   * Add message to memory with size limit
   */
  private addToMemory(message: Message): void {
    this.memory.shortTerm.push(message);

    // Keep only recent messages to prevent memory leak
    if (this.memory.shortTerm.length > MAX_SHORT_TERM_MESSAGES) {
      this.memory.shortTerm = this.memory.shortTerm.slice(-MAX_SHORT_TERM_MESSAGES);
    }
  }

  /**
   * Cleanup memory and persist to database
   */
  private async cleanupMemory(): Promise<void> {
    // Ensure we don't exceed memory limits
    if (this.memory.shortTerm.length > MAX_SHORT_TERM_MESSAGES) {
      this.memory.shortTerm = this.memory.shortTerm.slice(-MAX_SHORT_TERM_MESSAGES);
    }

    // Persist every 10 messages
    if (this.memory.shortTerm.length % 10 === 0) {
      await this.persistMemory();
    }
  }

  /**
   * Persist agent memory to database
   */
  private async persistMemory(): Promise<void> {
    try {
      await prisma.agent.update({
        where: { id: this.agent.id },
        data: {
          memory: this.memory as any,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error(`Failed to persist memory for agent ${this.agent.id}:`, error);
    }
  }

  /**
   * Get available tools for this agent
   */
  private getAvailableTools(): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'port_scan',
          description: 'Scan target for open ports and services',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Target IP or hostname' },
              ports: { type: 'string', description: 'Port range (e.g., "1-1000" or "common")' },
              technique: { type: 'string', enum: ['syn', 'connect', 'stealth'], description: 'Scanning technique' }
            },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'web_scan',
          description: 'Scan web application for vulnerabilities',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Target URL' },
              scan_types: {
                type: 'array',
                items: { type: 'string', enum: ['xss', 'sqli', 'csrf', 'ssrf', 'lfi', 'rce'] },
                description: 'Types of vulnerabilities to test for'
              },
              depth: { type: 'number', description: 'Crawl depth' }
            },
            required: ['url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'subdomain_enum',
          description: 'Enumerate subdomains of target domain',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Target domain' },
              techniques: {
                type: 'array',
                items: { type: 'string', enum: ['dns', 'certificate', 'brute', 'osint'] },
                description: 'Enumeration techniques to use'
              }
            },
            required: ['domain']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'exploit_test',
          description: 'Test a specific exploit against target',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Target URL or IP' },
              exploit_type: { type: 'string', description: 'Type of exploit to test' },
              payload: { type: 'string', description: 'Exploit payload' },
              safe_mode: { type: 'boolean', description: 'Run in safe validation mode', default: true }
            },
            required: ['target', 'exploit_type', 'payload']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'report_finding',
          description: 'Report a security finding',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Finding title' },
              description: { type: 'string', description: 'Detailed description' },
              severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] },
              category: { type: 'string', description: 'Vulnerability category (e.g., OWASP)' },
              evidence: { type: 'object', description: 'Evidence of vulnerability' },
              cvss: { type: 'number', description: 'CVSS score' },
              remediation: { type: 'string', description: 'Remediation advice' }
            },
            required: ['title', 'description', 'severity', 'category', 'evidence']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_subtask',
          description: 'Create a subtask for another agent',
          parameters: {
            type: 'object',
            properties: {
              agent_type: { type: 'string', enum: ['RECON', 'SCANNER', 'EXPLOITER', 'ANALYST'] },
              description: { type: 'string', description: 'Task description' },
              input: { type: 'object', description: 'Task input data' },
              priority: { type: 'number', description: 'Priority (1-10)' }
            },
            required: ['agent_type', 'description', 'input']
          }
        }
      }
    ];
  }

  /**
   * Execute tool calls from GPT-5
   */
  private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      let args;

      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error) {
        logger.error(`Failed to parse tool arguments for ${functionName}:`, error);
        results.push({
          tool: functionName,
          error: 'Invalid arguments format'
        });
        continue;
      }

      logger.info(`Agent ${this.agent.id} calling tool: ${functionName}`, args);

      try {
        let result;

        switch (functionName) {
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
          default:
            result = { error: `Unknown tool: ${functionName}` };
        }

        results.push({
          tool: functionName,
          args,
          result
        });

        // Record tool execution
        await this.recordToolExecution(functionName, args, result);

      } catch (error: any) {
        logger.error(`Tool execution failed: ${functionName}`, sanitizeError(error));
        results.push({
          tool: functionName,
          args,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Report a security finding
   */
  private async reportFinding(args: any): Promise<any> {
    if (!this.agent.scanId) {
      throw new Error('Agent not associated with a scan');
    }

    const scan = await prisma.scan.findUnique({
      where: { id: this.agent.scanId }
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    const finding = await prisma.finding.create({
      data: {
        id: uuidv4(),
        scanId: this.agent.scanId,
        targetId: scan.targetId,
        title: args.title,
        description: args.description,
        severity: args.severity,
        category: args.category,
        evidence: args.evidence,
        cvss: args.cvss,
        remediation: args.remediation,
        confidence: args.confidence || 1.0,
        references: args.references || [],
        status: 'NEW'
      }
    });

    logger.info(`Finding reported: ${finding.id} - ${finding.title} (${finding.severity})`);

    return { findingId: finding.id, success: true };
  }

  /**
   * Create a subtask for another agent
   */
  private async createSubtask(args: any): Promise<any> {
    if (!this.agent.scanId) {
      throw new Error('Agent not associated with a scan');
    }

    // Find an agent of the requested type
    const targetAgent = await prisma.agent.findFirst({
      where: {
        scanId: this.agent.scanId,
        type: args.agent_type,
        status: { in: [AgentStatus.ACTIVE, AgentStatus.IDLE] }
      }
    });

    if (!targetAgent) {
      throw new Error(`No available agent of type ${args.agent_type} found for this scan`);
    }

    const task = await prisma.task.create({
      data: {
        id: uuidv4(),
        agentId: targetAgent.id,
        scanId: this.agent.scanId,
        type: args.agent_type,
        description: args.description,
        input: args.input,
        priority: args.priority || 5,
        status: TaskStatus.PENDING
      }
    });

    logger.info(`Subtask created: ${task.id} for agent ${targetAgent.id}`);

    return { taskId: task.id, assignedTo: targetAgent.id };
  }

  /**
   * Record tool execution in database
   */
  private async recordToolExecution(toolName: string, args: any, result: any): Promise<void> {
    try {
      // Find or create tool
      let tool = await prisma.tool.findUnique({
        where: { name: toolName }
      });

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
    } catch (error) {
      logger.error(`Failed to record tool execution:`, error);
    }
  }

  /**
   * Get next task from queue
   */
  private async getNextTask(): Promise<Task | null> {
    const tasks = await prisma.task.findMany({
      where: {
        agentId: this.agent.id,
        status: TaskStatus.PENDING
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ],
      take: 1
    });

    return tasks[0] || null;
  }

  /**
   * Notify agent of new task (wakes up polling loop)
   */
  notifyNewTask(): void {
    logger.debug(`Agent ${this.agent.id} notified of new task`);
    // In a production system, this could use a more sophisticated
    // event mechanism to wake up the agent immediately
  }

  /**
   * Stop the agent gracefully
   */
  async stop(): Promise<void> {
    this.running = false;

    // Abort current task if any
    if (this.currentTaskAbortController) {
      this.currentTaskAbortController.abort();
    }

    // Wait a bit for current task to finish
    await this.sleep(1000);

    // Persist final state
    await this.persistMemory();

    // Update agent status
    await prisma.agent.update({
      where: { id: this.agent.id },
      data: { status: AgentStatus.IDLE }
    });

    logger.info(`Agent ${this.agent.id} stopped gracefully`);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
