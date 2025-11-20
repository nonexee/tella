# Tella AI - Remaining Work TODO List

Last Updated: 2025-11-20

## Summary

This document tracks remaining features and improvements needed for the Tella AI security testing platform.

### What's Already Done ✅

- ✅ **BullMQ Queue System** - Full implementation with 3 queues (scans, tasks, agents)
- ✅ **Real AI Reasoning** - Multi-turn iterative AI with OpenAI GPT-4/GPT-5
- ✅ **Agent Orchestration** - 6 specialized agent types with proper lifecycle management
- ✅ **Scan Detail Modals** - Full UI for viewing scan details and progress
- ✅ **Finding Detail Modals** - Comprehensive vulnerability details and evidence
- ✅ **Settings Page** - Configuration guide for .env variables
- ✅ **Authentication** - JWT with access/refresh tokens, RBAC, rate limiting
- ✅ **Audit Logging** - Complete audit trail with scan console output
- ✅ **GraphQL API** - Full API with queries, mutations, and subscriptions
- ✅ **Custom Security Tools** - Port scanning, web vuln scanning, subdomain enumeration
- ✅ **Graceful Shutdown** - Proper cleanup for agents, queues, and database
- ✅ **Docker Deployment** - Full docker-compose setup with PostgreSQL and Redis

---

## Priority 1: Core Missing Features (Must Have)

### 1. Install External Security Tools in Docker

**Status**: ❌ Not Started
**Priority**: P0 - Critical
**Effort**: High (8 hours)

**Description**: Install real security tools (Nmap, Nikto, SQLmap, Nuclei) in Docker container.

**Tasks**:
- [ ] Update Dockerfile to install Nmap + nmap-scripts
- [ ] Install Nikto (from package or GitHub)
- [ ] Install SQLmap via pip
- [ ] Install Nuclei (Go binary)
- [ ] Install Subfinder (Go binary)
- [ ] Create tool wrapper classes for each tool
- [ ] Implement XML/JSON output parsers
- [ ] Test tool execution in container

**Files to Modify**:
- `Dockerfile`
- `src/server/tools/` (create wrappers: `nmap-wrapper.ts`, `nikto-wrapper.ts`, etc.)
- `src/server/tools/security-tools.ts` (integrate wrappers)

**Reference**: See `SECURITY-TOOLS-ANALYSIS.md` for detailed implementation plan

---

### 2. Implement WebSocket Real-time Updates

**Status**: ❌ Not Started
**Priority**: P1 - High
**Effort**: Medium (6 hours)

**Description**: Replace polling with GraphQL WebSocket subscriptions for real-time updates.

**Tasks**:
- [ ] Install `graphql-ws` client in frontend
- [ ] Create WebSocket connection manager
- [ ] Implement `scanUpdated` subscription in Scans.svelte
- [ ] Implement `findingCreated` subscription in Findings.svelte
- [ ] Implement `agentStatusChanged` subscription
- [ ] Remove polling intervals (replace with subscriptions)
- [ ] Add reconnection logic on disconnect
- [ ] Test real-time updates across components

**Files to Modify**:
- `src/client/lib/graphql-client.ts` (add WebSocket client)
- `src/client/components/Scans.svelte` (use subscriptions)
- `src/client/components/Findings.svelte` (use subscriptions)
- `src/client/components/ScanConsole.svelte` (real-time audit logs)

**Note**: GraphQL subscriptions are already implemented in backend (`src/server/graphql/schema.graphql`), just need frontend integration.

---

### 3. Implement Exploit Testing

**Status**: ❌ Placeholder Only
**Priority**: P1 - High
**Effort**: High (12 hours)

**Description**: Implement actual exploit testing functionality (currently returns placeholder).

**Tasks**:
- [ ] Design safe exploit testing framework
- [ ] Implement XSS exploitation (safe mode)
- [ ] Implement SQLi exploitation (safe mode)
- [ ] Implement CSRF exploitation
- [ ] Implement SSRF exploitation
- [ ] Add exploit result validation
- [ ] Create proof-of-concept generators
- [ ] Add exploit safety checks (target validation, rate limiting)
- [ ] Document ethical testing guidelines

**Files to Modify**:
- `src/server/tools/security-tools.ts` (lines 844-866, replace placeholder)

**Safety Considerations**:
- Always run in safe mode by default
- Validate target is authorized
- Rate limit exploit attempts
- Log all exploit activities
- Require explicit user permission for aggressive testing

---

## Priority 2: Important Features (Should Have)

### 4. Report Export Functionality

**Status**: ❌ Not Started
**Priority**: P1 - High
**Effort**: Medium (8 hours)

**Description**: Add ability to export scan reports in JSON, CSV, and PDF formats.

**Tasks**:
- [ ] Implement JSON export (simple: serialize scan + findings)
- [ ] Implement CSV export (findings table)
- [ ] Install PDF generation library (puppeteer or pdfkit)
- [ ] Create PDF report template with:
  - Executive summary
  - Findings by severity
  - Technical details
  - Remediation recommendations
  - Appendix with evidence
- [ ] Add GraphQL mutation `exportScanReport(id, format)`
- [ ] Add download endpoint `/api/downloads/:filename`
- [ ] Add export buttons to Scan Detail modal
- [ ] Implement temporary file cleanup (1-hour expiry)

**Files to Create/Modify**:
- `src/server/graphql/resolvers.ts` (add export mutation)
- `src/server/utils/report-generator.ts` (new file)
- `src/server/index.ts` (add download endpoint)
- `src/client/components/Scans.svelte` (add export button)

---

### 5. Delete/Edit Operations

**Status**: ❌ Not Started
**Priority**: P1 - High
**Effort**: Medium (6 hours)

**Description**: Add CRUD operations for targets, scans, and findings.

**Tasks**:
- [ ] Add GraphQL mutations:
  - `updateTarget(id, name, url, description)`
  - `deleteTarget(id)` (only if no scans)
  - `deleteScan(id)`
  - `updateFinding(id, status)` (mark false positives)
  - `archiveScan(id)`
- [ ] Add permission checks (only ADMIN can delete)
- [ ] Add confirmation dialogs in UI
- [ ] Implement cascade delete safety checks
- [ ] Add "Delete" and "Edit" buttons to UI
- [ ] Test cascade delete behavior

**Files to Modify**:
- `src/server/graphql/schema.graphql` (add mutations)
- `src/server/graphql/resolvers.ts` (implement mutations)
- `src/client/components/Targets.svelte` (add edit/delete)
- `src/client/components/Scans.svelte` (add delete)
- `src/client/components/Findings.svelte` (add mark as false positive)

---

### 6. Target Detail View

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Low (4 hours)

**Description**: Add modal/page to view target details, scan history, and findings.

**Tasks**:
- [ ] Create Target Detail modal component
- [ ] Query scan history for target
- [ ] Display target metadata
- [ ] Show findings count by severity
- [ ] Add timeline of scans
- [ ] Link to individual scan details
- [ ] Add edit target button (if P2 #5 done)

**Files to Create**:
- `src/client/components/TargetDetail.svelte` (modal or dedicated component)

**Files to Modify**:
- `src/client/components/Targets.svelte` (add click handler)

---

## Priority 3: Nice-to-Have Features (Could Have)

### 7. Email Notifications

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Medium (6 hours)

**Description**: Send email notifications for scan completion and critical findings.

**Tasks**:
- [ ] Install nodemailer
- [ ] Create email service wrapper
- [ ] Configure SMTP settings in .env
- [ ] Create email templates (HTML):
  - Scan completed
  - Critical finding discovered
  - Scan failed
- [ ] Add notification preferences to User model
- [ ] Implement email sending in:
  - Scan completion (workers.ts)
  - Critical finding creation (agent-orchestrator.ts)
- [ ] Add retry logic for failed emails
- [ ] Add email queue (BullMQ)

**Files to Create**:
- `src/server/services/email-service.ts`
- `src/server/templates/email/` (HTML templates)

**Environment Variables**:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Tella AI Security <noreply@tella.ai>"
```

---

### 8. Webhook Support

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Medium (4 hours)

**Description**: Allow users to configure webhooks for scan events (Slack, Discord, custom).

**Tasks**:
- [ ] Add Webhook model to schema
- [ ] Add CRUD mutations for webhooks
- [ ] Implement webhook delivery system
- [ ] Support webhook events:
  - scan.completed
  - scan.failed
  - finding.created
- [ ] Add webhook signature (HMAC)
- [ ] Add retry logic (3 attempts)
- [ ] Create webhook management UI

**Files to Create**:
- `src/server/services/webhook-service.ts`
- `src/client/components/Webhooks.svelte`

---

### 9. User Profile Management

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Low (4 hours)

**Description**: Add user profile page for password changes and API key management.

**Tasks**:
- [ ] Create Profile.svelte component
- [ ] Add GraphQL mutations:
  - `changePassword(currentPassword, newPassword)`
  - `createApiKey(name, expiresAt?)`
  - `revokeApiKey(id)`
  - `updateProfile(name, email)`
- [ ] Add password strength validator
- [ ] Display user's API keys (masked)
- [ ] Add API key creation UI
- [ ] Add API key revocation
- [ ] Test password change flow

**Files to Create**:
- `src/client/components/Profile.svelte`

**Files to Modify**:
- `src/server/graphql/schema.graphql`
- `src/server/graphql/resolvers.ts`
- `src/client/App.svelte` (add Profile route)

---

### 10. CVE Database Integration

**Status**: ❌ Not Started
**Priority**: P3 - Low
**Effort**: Medium (6 hours)

**Description**: Integrate with NVD API to enrich findings with CVE data.

**Tasks**:
- [ ] Register for NVD API key
- [ ] Create CVE lookup service
- [ ] Add CVE enrichment to finding creation
- [ ] Display CVE links in Finding detail
- [ ] Pull official CVSS scores
- [ ] Cache CVE data to reduce API calls
- [ ] Add CVE search functionality

**Files to Create**:
- `src/server/services/cve-service.ts`

**Environment Variables**:
```
NVD_API_KEY=your-nvd-api-key
```

---

## Priority 4: Advanced Features (Future)

### 11. Compliance Reporting

**Status**: ❌ Not Started
**Priority**: P3 - Low
**Effort**: High (12 hours)

**Description**: Generate compliance reports (OWASP Top 10, PCI-DSS, HIPAA).

**Tasks**:
- [ ] Map findings to OWASP Top 10 categories
- [ ] Map findings to PCI-DSS requirements
- [ ] Create compliance report templates
- [ ] Add compliance dashboard
- [ ] Generate compliance gap reports
- [ ] Track remediation progress

---

### 12. Advanced Search/Filtering

**Status**: ❌ Not Started
**Priority**: P3 - Low
**Effort**: Medium (4 hours)

**Description**: Add search and advanced filtering to all list views.

**Tasks**:
- [ ] Add search to Scans page (by name, target, status)
- [ ] Add search to Targets page (by name, URL)
- [ ] Add search to Findings page (by title, description, CVE)
- [ ] Add date range filters
- [ ] Add tag filtering
- [ ] Implement full-text search (PostgreSQL)

---

### 13. Multi-User Collaboration

**Status**: ❌ Not Started
**Priority**: P3 - Low
**Effort**: High (16 hours)

**Description**: Add team/organization support with shared workspaces.

**Tasks**:
- [ ] Add Organization model
- [ ] Add team membership
- [ ] Implement workspace isolation
- [ ] Add sharing permissions
- [ ] Create organization admin panel
- [ ] Add activity feed

---

## Documentation Improvements

### 14. API Documentation

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Low (2 hours)

**Description**: Generate GraphQL API documentation.

**Tasks**:
- [ ] Install GraphQL Playground or GraphiQL
- [ ] Add schema introspection endpoint
- [ ] Document all queries and mutations
- [ ] Add usage examples
- [ ] Create API authentication guide

---

### 15. User Guide

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Medium (4 hours)

**Description**: Create comprehensive user guide.

**Tasks**:
- [ ] Write "Getting Started" tutorial
- [ ] Document scan configuration options
- [ ] Explain finding severity levels
- [ ] Document agent types and capabilities
- [ ] Add troubleshooting guide
- [ ] Create video walkthrough

---

## Architecture Improvements

### 16. Distributed Scanning

**Status**: ❌ Not Started
**Priority**: P3 - Low
**Effort**: Very High (40 hours)

**Description**: Support horizontal scaling with multiple worker nodes.

**Tasks**:
- [ ] Design distributed architecture
- [ ] Implement work distribution
- [ ] Add node health monitoring
- [ ] Implement result aggregation
- [ ] Add load balancing
- [ ] Test multi-node deployment

---

### 17. Performance Optimization

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Medium (8 hours)

**Description**: Optimize database queries and API performance.

**Tasks**:
- [ ] Add database query profiling
- [ ] Optimize N+1 queries with DataLoader
- [ ] Add Redis caching layer
- [ ] Implement query result pagination
- [ ] Add database connection pooling
- [ ] Profile and optimize slow queries

---

## Testing & Quality

### 18. Unit Tests

**Status**: ❌ Not Started
**Priority**: P1 - High
**Effort**: High (16 hours)

**Description**: Add comprehensive unit tests.

**Tasks**:
- [ ] Set up Vitest configuration
- [ ] Test SecurityTools class
- [ ] Test AgentOrchestrator
- [ ] Test GraphQL resolvers
- [ ] Test authentication/authorization
- [ ] Aim for 80%+ code coverage

---

### 19. Integration Tests

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Medium (8 hours)

**Description**: Add API and workflow integration tests.

**Tasks**:
- [ ] Test full scan workflow
- [ ] Test GraphQL API endpoints
- [ ] Test queue job processing
- [ ] Test agent lifecycle
- [ ] Test error recovery

---

### 20. E2E Tests

**Status**: ❌ Not Started
**Priority**: P2 - Medium
**Effort**: Medium (8 hours)

**Description**: Add end-to-end UI tests with Playwright.

**Tasks**:
- [ ] Install Playwright
- [ ] Test login flow
- [ ] Test scan creation and execution
- [ ] Test finding review
- [ ] Test report export

---

## Summary of Priorities

### Must Do Now (P0-P1):
1. Install external security tools in Docker
2. WebSocket real-time updates
3. Implement exploit testing
4. Report export (JSON/CSV/PDF)
5. Delete/Edit operations
6. Unit tests

### Should Do Soon (P1-P2):
7. Target detail view
8. Email notifications
9. User profile management
10. API documentation
11. Performance optimization

### Nice to Have (P2-P3):
12. Webhook support
13. CVE integration
14. Compliance reporting
15. Advanced search
16. Integration/E2E tests

### Future Enhancements (P3):
17. Multi-user collaboration
18. Distributed scanning

---

## Notes

- **CRITICAL-GAPS.md** contains detailed analysis of missing external tools
- **SECURITY-TOOLS-ANALYSIS.md** explains current custom tool implementation
- **SCAN_LOGS.md** documents how to access scan console logs
- **DOCKER_SETUP.md** and **PRODUCTION-DEPLOYMENT.md** for deployment guides

---

**Last Review**: 2025-11-20
**Status**: Active Development
