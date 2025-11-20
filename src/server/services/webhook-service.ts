/**
 * Webhook Service
 *
 * Handles webhook delivery with retry logic, HMAC signing, and delivery tracking.
 */

import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
}

export class WebhookService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
  private static readonly TIMEOUT_MS = 10000; // 10 seconds

  /**
   * Trigger webhooks for a specific event
   */
  static async triggerWebhooks(event: string, data: any): Promise<void> {
    try {
      // Find all active webhooks subscribed to this event
      const webhooks = await prisma.webhook.findMany({
        where: {
          active: true,
          events: {
            has: event
          }
        }
      });

      if (webhooks.length === 0) {
        logger.debug(`No webhooks found for event: ${event}`);
        return;
      }

      logger.info(`Triggering ${webhooks.length} webhooks for event: ${event}`);

      // Deliver to all webhooks concurrently
      await Promise.allSettled(
        webhooks.map(webhook => this.deliverWebhook(webhook.id, event, data))
      );
    } catch (error) {
      logger.error('Error triggering webhooks:', error);
    }
  }

  /**
   * Deliver webhook with retry logic
   */
  static async deliverWebhook(
    webhookId: string,
    event: string,
    data: any,
    attempt: number = 1
  ): Promise<void> {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId }
      });

      if (!webhook || !webhook.active) {
        logger.debug(`Webhook ${webhookId} not found or inactive`);
        return;
      }

      // Create payload
      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data
      };

      // Generate HMAC signature
      const signature = this.generateSignature(payload, webhook.secret);

      // Create delivery record
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          payload,
          status: 'PENDING',
          attempts: attempt
        }
      });

      try {
        // Send HTTP request
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event,
            'X-Webhook-Delivery': delivery.id,
            'User-Agent': 'Tella-Webhook/1.0'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.TIMEOUT_MS)
        });

        const responseText = await response.text();

        if (response.ok) {
          // Success
          await this.markDeliverySuccess(delivery.id, response.status, responseText);
          await this.updateWebhookStats(webhookId, true);
          logger.info(`Webhook delivered successfully: ${webhookId} (${event})`);
        } else {
          // HTTP error
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }
      } catch (error: any) {
        // Delivery failed
        const errorMessage = error.message || 'Unknown error';
        logger.warn(`Webhook delivery failed: ${webhookId} (attempt ${attempt}/${this.MAX_RETRIES})`, {
          error: errorMessage
        });

        if (attempt < this.MAX_RETRIES) {
          // Retry with exponential backoff
          await this.markDeliveryRetrying(delivery.id, errorMessage);
          const delay = this.RETRY_DELAYS[attempt - 1];

          setTimeout(() => {
            this.deliverWebhook(webhookId, event, data, attempt + 1);
          }, delay);
        } else {
          // Max retries reached
          await this.markDeliveryFailed(delivery.id, errorMessage);
          await this.updateWebhookStats(webhookId, false);
          logger.error(`Webhook delivery failed after ${this.MAX_RETRIES} attempts: ${webhookId}`);
        }
      }
    } catch (error) {
      logger.error('Error in webhook delivery:', error);
    }
  }

  /**
   * Test webhook by sending a test event
   */
  static async testWebhook(webhookId: string): Promise<boolean> {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: webhookId }
      });

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from Tella AI Security',
          webhookId: webhook.id,
          webhookName: webhook.name
        }
      };

      const signature = this.generateSignature(testPayload, webhook.secret);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'webhook.test',
          'User-Agent': 'Tella-Webhook/1.0'
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(this.TIMEOUT_MS)
      });

      if (response.ok) {
        logger.info(`Webhook test successful: ${webhookId}`);
        return true;
      } else {
        logger.warn(`Webhook test failed: ${webhookId} (HTTP ${response.status})`);
        return false;
      }
    } catch (error: any) {
      logger.error(`Webhook test error: ${webhookId}`, { error: error.message });
      return false;
    }
  }

  /**
   * Generate HMAC signature for payload
   */
  private static generateSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Mark delivery as successful
   */
  private static async markDeliverySuccess(
    deliveryId: string,
    statusCode: number,
    response: string
  ): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SUCCESS',
        statusCode,
        response: response.substring(0, 1000), // Limit response length
        deliveredAt: new Date()
      }
    });
  }

  /**
   * Mark delivery as retrying
   */
  private static async markDeliveryRetrying(
    deliveryId: string,
    error: string
  ): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'RETRYING',
        response: error.substring(0, 1000)
      }
    });
  }

  /**
   * Mark delivery as failed
   */
  private static async markDeliveryFailed(
    deliveryId: string,
    error: string
  ): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        response: error.substring(0, 1000)
      }
    });
  }

  /**
   * Update webhook statistics
   */
  private static async updateWebhookStats(
    webhookId: string,
    success: boolean
  ): Promise<void> {
    if (success) {
      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          lastSuccess: new Date(),
          failureCount: 0
        }
      });
    } else {
      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          lastFailure: new Date(),
          failureCount: {
            increment: 1
          }
        }
      });
    }
  }

  /**
   * Generate secure random secret for webhook
   */
  static generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify webhook signature (for receiving webhooks)
   */
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
}

// Helper function to trigger webhooks from other parts of the application
export async function triggerWebhookEvent(event: string, data: any): Promise<void> {
  await WebhookService.triggerWebhooks(event, data);
}
