# Webhook Implementation - Complete Documentation

**Status**: ✅ **FULLY COMPLETE** (Backend + UI + Integration)
**Completed**: 2025-11-20
**Commits**: `3890a98`, `fed553b`, `213d6ff`

---

## Overview

Complete webhook system for real-time event notifications to external services. Enables CI/CD integration, Slack/Discord notifications, and custom automation workflows.

---

## Features Implemented

### 1. **Webhook Backend** (Commit: `3890a98`)

#### Database Schema
- **Webhook Model**
  - `id`, `name`, `url`, `events[]`, `secret`, `active`
  - `userId` (ownership), timestamps
  - `lastSuccess`, `lastFailure`, `failureCount` (statistics)

- **WebhookDelivery Model**
  - `id`, `webhookId`, `event`, `payload`, `status`
  - `statusCode`, `response`, `attempts`
  - `createdAt`, `deliveredAt`

- **Enums**
  - `WebhookDeliveryStatus`: PENDING, SUCCESS, FAILED, RETRYING

#### GraphQL API
**Queries:**
- `webhooks` - List all user's webhooks
- `webhook(id)` - Get specific webhook
- `webhookDeliveries(webhookId)` - Get delivery history

**Mutations:**
- `createWebhook(name, url, events)` - Create new webhook
- `updateWebhook(id, name?, url?, events?, active?)` - Update webhook
- `deleteWebhook(id)` - Delete webhook
- `testWebhook(id)` - Send test event

#### Webhook Service (330+ lines)
**Features:**
- **Retry Logic**: Exponential backoff (1s, 5s, 15s) with max 3 attempts
- **HMAC Signing**: SHA-256 signature generation for payload verification
- **Timeout**: 10-second timeout per request
- **Concurrent Delivery**: Promise.allSettled for parallel webhook execution
- **Delivery Tracking**: Full audit trail with status, attempts, responses
- **Statistics**: Track success/failure counts and timestamps

**Methods:**
```typescript
WebhookService.triggerWebhooks(event, data) // Find and trigger all matching webhooks
WebhookService.deliverWebhook(webhookId, event, data, attempt) // Deliver with retry
WebhookService.testWebhook(webhookId) // Send test event
WebhookService.generateSecret() // Generate secure random secret
WebhookService.verifySignature(payload, signature, secret) // Verify HMAC
```

**Security:**
- Ownership verification on all operations
- URL validation
- Event validation (6 supported events)
- Secure secret generation (crypto.randomBytes 32 bytes)
- Timing-safe signature comparison

---

### 2. **Webhook UI** (Commit: `fed553b`)

#### Webhooks.svelte Component (850+ lines)
**Features:**
- List all webhooks with status indicators (active/inactive)
- Create new webhooks with event selection
- Edit existing webhooks (name, URL, events)
- Delete webhooks with confirmation
- Toggle webhook active/inactive status
- Test webhook functionality (sends test event)
- View delivery history with detailed status
- Display webhook secret on creation (one-time only)
- Signature verification example code
- Real-time stats (last success/failure, failure count)

**Modals:**
1. **Create Webhook Modal**
   - Name and URL fields
   - Event checkboxes with descriptions
   - Validation

2. **Edit Webhook Modal**
   - Update name, URL, events
   - Same UI as create

3. **Secret Display Modal**
   - One-time secret display
   - Copy to clipboard
   - Warning message
   - Signature verification code example (Node.js)

4. **Delivery History Modal**
   - List of deliveries with status badges
   - Status code, attempts, timestamps
   - Response preview
   - Color-coded status indicators

**UI Elements:**
- Empty state with call-to-action
- Responsive card layout
- Action buttons (test, history, toggle, edit, delete)
- Color-coded status badges
- Real-time stat display

**Integration:**
- Added to App.svelte routing
- Added to Sidebar navigation (⚡ Webhooks)

---

### 3. **Event Integration** (Commit: `213d6ff`)

#### Supported Events

**SCAN_STARTED**
- **Triggered**: When scan execution begins
- **Payload**:
  ```json
  {
    "event": "SCAN_STARTED",
    "timestamp": "2025-11-20T...",
    "data": {
      "scan": {
        "id": "...",
        "name": "...",
        "status": "RUNNING",
        "startedAt": "..."
      },
      "target": {
        "id": "...",
        "name": "...",
        "url": "..."
      }
    }
  }
  ```

**SCAN_COMPLETED**
- **Triggered**: When all scan tasks complete successfully
- **Payload**:
  ```json
  {
    "event": "SCAN_COMPLETED",
    "timestamp": "2025-11-20T...",
    "data": {
      "scan": {
        "id": "...",
        "name": "...",
        "status": "COMPLETED",
        "progress": 100,
        "completedAt": "..."
      },
      "target": {
        "id": "...",
        "name": "...",
        "url": "..."
      },
      "summary": {
        "totalTasks": 10,
        "completedTasks": 9,
        "failedTasks": 1,
        "totalFindings": 15,
        "findingsBySeverity": {
          "CRITICAL": 2,
          "HIGH": 5,
          "MEDIUM": 6,
          "LOW": 2
        }
      }
    }
  }
  ```

**SCAN_FAILED**
- **Triggered**: When scan fails or all tasks fail
- **Payload**:
  ```json
  {
    "event": "SCAN_FAILED",
    "timestamp": "2025-11-20T...",
    "data": {
      "scan": {
        "id": "...",
        "name": "...",
        "status": "FAILED",
        "error": "Error message",
        "completedAt": "..."
      },
      "target": {
        "id": "...",
        "name": "...",
        "url": "..."
      },
      "summary": {
        "totalTasks": 10,
        "completedTasks": 3,
        "failedTasks": 7
      }
    }
  }
  ```

**FINDING_CREATED**
- **Triggered**: For every new finding
- **Payload**:
  ```json
  {
    "event": "FINDING_CREATED",
    "timestamp": "2025-11-20T...",
    "data": {
      "finding": {
        "id": "...",
        "title": "SQL Injection in login form",
        "description": "...",
        "severity": "HIGH",
        "category": "Injection",
        "cvss": 8.5,
        "confidence": 0.95
      },
      "scan": {
        "id": "...",
        "name": "..."
      },
      "target": {
        "id": "..."
      }
    }
  }
  ```

**FINDING_HIGH_SEVERITY**
- **Triggered**: For HIGH severity findings
- **Payload**: Same as FINDING_CREATED (filtered by severity)

**FINDING_CRITICAL**
- **Triggered**: For CRITICAL severity findings
- **Payload**: Same as FINDING_CREATED (filtered by severity)

#### Integration Points

**1. Finding Creation** (`agent-orchestrator.ts`)
- Location: `AgentRunner.reportFinding()` method (line ~1330)
- Triggers: FINDING_CREATED + severity-specific (CRITICAL/HIGH)
- Error handling: Webhook failures don't block finding creation

**2. Scan Started** (`workers.ts`)
- Location: Scan worker, after scan status update (line ~63)
- Triggers: SCAN_STARTED
- Error handling: Logged, doesn't block scan execution

**3. Scan Completion** (`workers.ts`)
- Location: `checkScanCompletion()` function (line ~569)
- Triggers: SCAN_COMPLETED or SCAN_FAILED based on final status
- Includes: Full summary with task counts and finding statistics
- Error handling: Logged, doesn't affect scan completion

**4. Scan Failure** (`workers.ts`)
- Location: Scan worker catch block (line ~113)
- Triggers: SCAN_FAILED
- Includes: Error message and scan context
- Error handling: Logged, doesn't affect error propagation

---

## Usage Examples

### Creating a Webhook

**Via UI:**
1. Navigate to Webhooks page
2. Click "Create Webhook"
3. Enter name and URL
4. Select events to subscribe
5. Save and copy secret (shown once)

**Via GraphQL:**
```graphql
mutation {
  createWebhook(
    name: "Slack Notifications"
    url: "https://hooks.slack.com/services/..."
    events: ["SCAN_COMPLETED", "FINDING_CRITICAL"]
  ) {
    id
    name
    secret
  }
}
```

### Receiving Webhooks

**Node.js Example:**
```javascript
const express = require('express');
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const event = req.headers['x-webhook-event'];
  const payload = req.body;

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )) {
    return res.status(401).send('Invalid signature');
  }

  // Handle event
  console.log(`Received ${event}:`, payload.data);

  res.status(200).send('OK');
});
```

### Testing a Webhook

**Via UI:**
1. Go to Webhooks page
2. Click the play button on a webhook
3. Check your endpoint for the test event

**Test Event Payload:**
```json
{
  "event": "webhook.test",
  "timestamp": "2025-11-20T...",
  "data": {
    "message": "This is a test webhook from Tella AI Security",
    "webhookId": "...",
    "webhookName": "..."
  }
}
```

---

## HTTP Headers

All webhook requests include:
- `Content-Type: application/json`
- `X-Webhook-Signature: <hmac-sha256-hex>` - HMAC signature for verification
- `X-Webhook-Event: <event-name>` - Event type
- `X-Webhook-Delivery: <delivery-id>` - Unique delivery ID
- `User-Agent: Tella-Webhook/1.0`

---

## Retry Mechanism

**Strategy**: Exponential backoff with max 3 attempts

**Delays:**
1. First retry: 1 second
2. Second retry: 5 seconds
3. Third retry: 15 seconds

**Behavior:**
- After 3 failed attempts, delivery marked as FAILED
- Webhook statistics updated (failureCount incremented)
- All attempts tracked in WebhookDelivery records

---

## Security Features

1. **HMAC-SHA256 Signatures**
   - Every payload signed with webhook secret
   - Receivers can verify authenticity
   - Prevents tampering

2. **Secret Generation**
   - Cryptographically secure random (32 bytes)
   - Shown only once after creation
   - Stored securely in database

3. **Ownership Verification**
   - All operations check userId
   - Users can only access their own webhooks
   - Prevents unauthorized access

4. **URL Validation**
   - Valid URL format required
   - HTTPS recommended (not enforced)

5. **Event Validation**
   - Only supported events allowed
   - Invalid events rejected on creation/update

6. **Timeout Protection**
   - 10-second timeout per request
   - Prevents hanging on slow endpoints

7. **Audit Logging**
   - All webhook operations logged
   - Delivery history preserved
   - Full transparency

---

## Database Indexes

**Webhook table:**
- `userId` - Fast lookup of user's webhooks
- `active` - Filter active webhooks

**WebhookDelivery table:**
- `webhookId` - Fast lookup of webhook deliveries
- `status` - Filter by delivery status
- `createdAt` - Chronological sorting

---

## Files Modified

**Backend:**
- `prisma/schema.prisma` - Database models
- `src/server/graphql/schema.graphql` - GraphQL types
- `src/server/graphql/resolvers.ts` - Query/mutation resolvers
- `src/server/services/webhook-service.ts` - NEW (330+ lines)
- `src/server/ai/agent-orchestrator.ts` - Finding webhooks
- `src/server/queue/workers.ts` - Scan lifecycle webhooks

**Frontend:**
- `src/client/components/Webhooks.svelte` - NEW (850+ lines)
- `src/client/App.svelte` - Route integration
- `src/client/components/Sidebar.svelte` - Navigation link

---

## Statistics

- **Total Lines Added**: 1,100+ lines
- **Commits**: 3 production-ready commits
- **Backend**: 530+ lines (models, service, resolvers, integration)
- **Frontend**: 850+ lines (complete UI)
- **Integration Points**: 4 (scan start, scan complete, scan fail, finding create)
- **Events Supported**: 6 event types
- **Delivery Attempts**: Max 3 with exponential backoff

---

## Next Steps (Optional Enhancements)

1. **Webhook Templates**
   - Pre-configured templates for Slack, Discord, Microsoft Teams
   - Quick setup with token-based configuration

2. **Webhook Playground**
   - Test webhook payloads before sending
   - Preview payload structure
   - Validate endpoint responses

3. **Rate Limiting**
   - Limit webhook delivery rate per user
   - Prevent abuse

4. **Custom Headers**
   - Allow users to specify custom headers
   - API key authentication support

5. **Batch Deliveries**
   - Option to batch multiple events
   - Reduce number of requests

6. **Conditional Webhooks**
   - Trigger only if conditions met (e.g., severity >= HIGH)
   - Filter by scan config or target

---

## Testing Checklist

- ✅ Create webhook via UI
- ✅ Edit webhook via UI
- ✅ Delete webhook via UI
- ✅ Toggle webhook active/inactive
- ✅ Test webhook delivery
- ✅ View delivery history
- ✅ Copy webhook secret
- ✅ SCAN_STARTED event triggers
- ✅ SCAN_COMPLETED event triggers with summary
- ✅ SCAN_FAILED event triggers
- ✅ FINDING_CREATED event triggers
- ✅ FINDING_HIGH_SEVERITY event triggers
- ✅ FINDING_CRITICAL event triggers
- ✅ Retry logic works (3 attempts)
- ✅ HMAC signature generation
- ✅ Webhook failures don't block operations
- ✅ Ownership verification
- ✅ URL validation
- ✅ Event validation

---

## Impact

**Before:**
- No real-time notifications
- Manual checking required
- No CI/CD integration
- Limited automation

**After:**
- Real-time event notifications
- Automatic alerts to Slack/Discord/Teams
- Full CI/CD integration capability
- Complete automation workflows
- Professional webhook management UI
- Comprehensive delivery tracking
- Secure signature verification

---

**Status**: ✅ **PRODUCTION READY**
**Risk Level**: Low (all additive, comprehensive error handling)
**Recommendation**: Merge and deploy

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
