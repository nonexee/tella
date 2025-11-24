# Bugs and Issues Found - Comprehensive Audit

**Date:** 2025-11-20
**Audit Type:** Code review for bugs, logical errors, and potential issues

---

## 🔴 CRITICAL BUGS

### 1. **Webhook Retry Logic Memory Leak**
**File:** `src/server/services/webhook-service.ts:131-133`
**Severity:** CRITICAL

```typescript
setTimeout(() => {
  this.deliverWebhook(webhookId, event, data, attempt + 1);
}, delay);
```

**Problem:**
- `setTimeout` is used without storing the timer ID
- If the server restarts during retry delay, retries are lost
- No cleanup mechanism for pending retries
- Memory leak if many webhooks fail simultaneously

**Impact:**
- Webhook deliveries can be silently dropped
- Memory accumulation over time
- No way to cancel pending retries during shutdown

**Fix Needed:**
- Use BullMQ for webhook delivery queue with retry logic
- Add cleanup in graceful shutdown
- Store retry state in database

---

### 2. **Email Service Not Initialized Before Use**
**File:** `src/server/services/email-service.ts:51-60`
**Severity:** CRITICAL

```typescript
export const emailService = new EmailService();
```

**Problem:**
- Email service singleton created at module load time
- Environment variables might not be loaded yet
- Constructor silently fails if SMTP config missing
- No way to reinitialize if config changes

**Impact:**
- Emails might never work even if SMTP is configured
- Silent failures with no user feedback
- Difficult to debug

**Fix Needed:**
- Lazy initialization on first use
- Throw error if used before initialization
- Add health check endpoint
- Log warning if SMTP not configured

---

### 3. **Race Condition in Scan Completion Check**
**File:** `src/server/queue/workers.ts:500-530`
**Severity:** HIGH

```typescript
// Get all tasks for this scan
const tasks = await prisma.task.findMany({
  where: { scanId },
  select: { status: true }
});

// ... later ...
const allTasksComplete = tasks.every(task =>
  terminalStatuses.includes(task.status)
);
```

**Problem:**
- Tasks are fetched, then checked
- New tasks could be created between fetch and check
- No transaction or lock
- Could mark scan complete prematurely

**Impact:**
- Scan marked complete while tasks still running
- Incorrect completion status
- Missing findings

**Fix Needed:**
- Use database transaction
- Add row-level lock on scan
- Check task count matches expected count

---

### 4. **Prisma Migration Not Applied**
**File:** `prisma/schema.prisma:24-27`
**Severity:** HIGH

```prisma
// Email notification preferences
emailNotifications Boolean  @default(true)
notifyOnScanComplete Boolean @default(true)
notifyOnScanFailed Boolean  @default(true)
notifyOnCriticalFinding Boolean @default(true)
```

**Problem:**
- Schema modified but migration not created
- Database schema out of sync with code
- Will cause runtime errors when accessing these fields
- All GraphQL queries for User will fail

**Impact:**
- Application will crash on startup
- Cannot read user preferences
- All authentication will fail

**Fix Needed:**
```bash
npx prisma migrate dev --name add_email_preferences
npx prisma generate
```

---

## 🟠 HIGH PRIORITY BUGS

### 5. **Webhook Delivery Record Created Even If Webhook Inactive**
**File:** `src/server/services/webhook-service.ts:67-91`
**Severity:** MEDIUM

```typescript
if (!webhook || !webhook.active) {
  logger.debug(`Webhook ${webhookId} not found or inactive`);
  return;  // Returns before creating delivery record
}

// Create delivery record
const delivery = await prisma.webhookDelivery.create({...});
```

**Problem:**
- Check happens, then record created
- Webhook could be deactivated between check and create
- Creates orphan delivery records

**Impact:**
- Database bloat with unused records
- Inaccurate delivery statistics
- Minor performance impact

**Fix Needed:**
- Create delivery record first with status
- Update if webhook inactive
- Or use transaction

---

### 6. **Email HTML Injection Vulnerability**
**File:** `src/server/services/email-service.ts:180-350`
**Severity:** HIGH (Security)

```typescript
<div class="finding-title">${data.title}</div>
<p style="margin: 0;">${data.description}</p>
```

**Problem:**
- User-provided data (title, description) inserted directly into HTML
- No HTML escaping or sanitization
- XSS vulnerability in email clients
- Could inject malicious HTML/JS

**Impact:**
- Security vulnerability
- Email client XSS attacks
- Could steal credentials or data

**Fix Needed:**
- HTML escape all user-provided data
- Use template library with auto-escaping
- Sanitize input before insertion

---

### 7. **Missing Error Handling in Email Send**
**File:** `src/server/queue/workers.ts:624-667`
**Severity:** MEDIUM

```typescript
try {
  const user = await prisma.user.findUnique({
    where: { id: completedScan.userId }
  });

  if (user && user.emailNotifications) {
    // ... no check if email service is available
    await emailService.sendScanCompletedEmail(user.email, {...});
  }
} catch (emailError) {
  logger.error(`Failed to send email for scan ${finalStatus}:`, emailError);
}
```

**Problem:**
- Doesn't check if email service is enabled
- Will try to send even if SMTP not configured
- Error swallowed silently
- User has no way to know emails failed

**Impact:**
- False sense of security (think emails sent)
- No notification if SMTP misconfigured
- Silent failures

**Fix Needed:**
- Check `emailService.isEnabled()` before sending
- Add UI indicator if email service unavailable
- Retry failed emails with queue

---

### 8. **Webhook Signature Verification Has Timing Attack**
**File:** `src/server/services/webhook-service.ts:296-305`
**Severity:** MEDIUM (Security)

```typescript
static verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Problem:**
- Uses `timingSafeEqual` correctly (good!)
- BUT signature parameter comes as string
- If signatures are different lengths, Buffer.from will create different sized buffers
- timingSafeEqual will throw error instead of returning false
- Timing attack still possible through error vs false return

**Impact:**
- Crashes on invalid signature
- Potential timing attack vector
- Poor error messages

**Fix Needed:**
- Pad signatures to same length first
- Catch and handle length mismatch
- Return false on any error

---

## 🟡 MEDIUM PRIORITY ISSUES

### 9. **Inconsistent Error Handling in Agent Orchestrator**
**File:** `src/server/ai/agent-orchestrator.ts:1384-1416`
**Severity:** MEDIUM

```typescript
} catch (webhookError) {
  // Don't fail finding creation if webhook fails
  logger.error('Failed to trigger webhooks for finding:', webhookError);
}
```

**Problem:**
- Webhook errors caught and swallowed
- Email errors also caught separately
- But if webhook triggers and email fails, email error  shadows webhook error
- Inconsistent error reporting

**Impact:**
- Lost error context
- Hard to debug
- Unclear which notification failed

**Fix Needed:**
- Log both errors separately
- Aggregate errors
- Return success/failure status for each

---

### 10. **Missing Validation on Notification Preferences**
**File:** `src/server/graphql/resolvers.ts:1159-1202`
**Severity:** LOW

```typescript
updateNotificationPreferences: async (
  _parent: unknown,
  {
    emailNotifications,
    notifyOnScanComplete,
    notifyOnScanFailed,
    notifyOnCriticalFinding
  }: {...},
  context: Context
): Promise<any> => {
  // No validation of values
  const updateData: any = {};

  if (emailNotifications !== undefined) {
    updateData.emailNotifications = emailNotifications;
  }
```

**Problem:**
- No validation that values are actually boolean
- GraphQL schema says Boolean! but resolver doesn't validate
- Could accept non-boolean values
- Type coercion could cause issues

**Impact:**
- Invalid data in database
- Unexpected behavior
- Type safety broken

**Fix Needed:**
- Add type validation
- Use Zod or similar validation library
- Return clear errors for invalid input

---

### 11. **Email Duration Calculation Incorrect**
**File:** `src/server/queue/workers.ts:632-639`
**Severity:** LOW

```typescript
let duration: string | undefined;
if (completedScan.startedAt && completedScan.completedAt) {
  const durationMs = completedScan.completedAt.getTime() - completedScan.startedAt.getTime();
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
```

**Problem:**
- Doesn't handle hours (scans > 60 minutes)
- Doesn't handle days (long-running scans)
- Negative duration if timestamps wrong
- No error handling for invalid dates

**Impact:**
- Incorrect duration display for long scans
- Confusing output for users
- Negative durations possible

**Fix Needed:**
- Add hours and days support
- Handle negative durations
- Add validation for timestamps
- Use duration library (dayjs, moment, etc.)

---

### 12. **Missing User Lookup Error Handling**
**File:** `src/server/ai/agent-orchestrator.ts:1370-1393`
**Severity:** MEDIUM

```typescript
const user = await prisma.user.findUnique({
  where: { id: scan.userId }
});

if (user && user.emailNotifications && user.notifyOnCriticalFinding) {
  // ... send email
}
```

**Problem:**
- If scan.userId is invalid, user will be null
- Silently skips email without logging
- Data integrity issue (scan without user)
- Should be impossible but no safeguard

**Impact:**
- Silent failures
- Hard to debug
- Orphaned scans

**Fix Needed:**
- Log warning if user not found
- Add data integrity check
- Possibly alert admins

---

## 🟢 LOW PRIORITY / MINOR ISSUES

### 13. **Inconsistent Naming: "Tella AI" vs "Tella AI Security"**
**Files:** Multiple
**Severity:** TRIVIAL

**Problem:**
- Email subjects use "[Tella AI]"
- SMTP from uses "Tella AI Security"
- Sidebar shows "Tella AI"
- Inconsistent branding

**Fix:** Pick one name and use consistently

---

### 14. **Debug Console.log Statements Left in Production**
**File:** `src/server/index.ts:37,42,106,109,111,114,116,120,122,524,527`
**Severity:** LOW

```typescript
console.log('[DEBUG] Module loaded, about to load env...');
console.log('[DEBUG] Environment loaded, continuing initialization...');
// ... many more
```

**Problem:**
- Debug statements in production code
- Should use logger instead
- Clutters output
- Can't be filtered by log level

**Fix:** Replace with logger.debug() calls

---

### 15. **Email Template APP_URL Defaults to localhost**
**File:** `src/server/services/email-service.ts:multiple`
**Severity:** LOW

```typescript
<a href="${process.env.APP_URL || 'http://localhost:3000'}/scans" class="button">
```

**Problem:**
- Default URL is localhost
- Will be wrong in production
- Links won't work for remote users
- Should require APP_URL in production

**Impact:**
- Broken links in emails
- Poor user experience
- Users can't access referenced scans

**Fix Needed:**
- Make APP_URL required
- Validate on startup
- No default for production

---

### 16. **Missing Webhook Delivery Cleanup**
**File:** `src/server/services/webhook-service.ts`
**Severity:** LOW

**Problem:**
- WebhookDelivery records created forever
- No cleanup of old deliveries
- Database will grow unbounded
- No retention policy

**Impact:**
- Database bloat over time
- Slow queries
- Storage costs

**Fix Needed:**
- Add cleanup job (delete deliveries > 30 days)
- Add configuration for retention
- Consider archival strategy

---

### 17. **No Rate Limiting on Webhook Delivery**
**File:** `src/server/services/webhook-service.ts`
**Severity:** LOW

**Problem:**
- Can trigger unlimited webhooks simultaneously
- No rate limiting per user
- Could overwhelm external services
- Could be used for DoS

**Impact:**
- External API rate limits hit
- Network congestion
- Webhook bans

**Fix Needed:**
- Add rate limiting per webhook
- Queue webhook deliveries
- Add configurable delays

---

### 18. **Email stripHtml Function is Naive**
**File:** `src/server/services/email-service.ts:533-539`
**Severity:** LOW

```typescript
private stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**Problem:**
- Very basic HTML stripping
- Doesn't decode HTML entities (&nbsp;, &lt;, etc.)
- Doesn't handle nested tags well
- Doesn't preserve line breaks

**Impact:**
- Poor plain text email quality
- Hard to read fallback emails
- HTML entities show as literal text

**Fix Needed:**
- Use proper HTML-to-text library (html-to-text)
- Preserve formatting
- Decode entities

---

##🔧 ARCHITECTURAL ISSUES

### 19. **No Idempotency in Webhook/Email Delivery**
**Files:** webhook-service.ts, email-service.ts
**Severity:** MEDIUM

**Problem:**
- If retry succeeds after timeout, might deliver twice
- No idempotency key
- No deduplication
- Same finding could trigger multiple emails

**Impact:**
- Duplicate notifications
- Poor user experience
- Webhook receiver confusion

**Fix Needed:**
- Add idempotency keys
- Track sent notifications
- Deduplicate within time window

---

### 20. **Scan Completion Email Sent Before All Webhooks**
**File:** `src/server/queue/workers.ts:620-667`
**Severity:** LOW

**Problem:**
- Webhook triggered, then email sent
- Both in same try-catch
- If webhook takes long, email delays
- Should be independent

**Impact:**
- Email delays
- Tight coupling
- One failure affects other

**Fix Needed:**
- Send webhooks and emails concurrently
- Use Promise.allSettled
- Independent error handling

---

## 📊 SUMMARY

### By Severity:
- 🔴 **CRITICAL:** 4 bugs
- 🟠 **HIGH:** 4 bugs
- 🟡 **MEDIUM:** 7 issues
- 🟢 **LOW:** 5 issues

### Most Critical to Fix:
1. ✅ Apply Prisma migration (blocks everything)
2. ✅ Fix webhook retry memory leak
3. ✅ Fix email service initialization
4. ✅ Add HTML escaping in emails
5. ✅ Fix race condition in scan completion

### Quick Wins:
- Remove console.log debug statements
- Add APP_URL validation
- Fix duration calculation
- Add email service enabled check

---

## 🎯 RECOMMENDED FIXES (Priority Order)

1. **Immediate (Blocks deployment):**
   - Apply Prisma migration
   - Fix email HTML injection
   - Add email service initialization check

2. **High Priority (Before production):**
   - Fix webhook retry memory leak
   - Fix scan completion race condition
   - Add proper error handling

3. **Medium Priority (After launch):**
   - Add webhook delivery queue
   - Implement idempotency
   - Add rate limiting
   - Cleanup old deliveries

4. **Low Priority (Technical debt):**
   - Remove debug statements
   - Improve HTML stripping
   - Consistent naming
   - Add validation

---

**Total Issues Found:** 20
**Estimated Fix Time:** 12-16 hours
**Risk Level:** HIGH (without migrations, CRITICAL)

---

Generated: 2025-11-20
Auditor: Claude Code
