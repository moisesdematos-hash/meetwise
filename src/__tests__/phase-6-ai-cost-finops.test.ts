import { describe, it, expect } from 'vitest';
import { AiCostService } from '@/modules/billing/ai-cost-service';

describe('Phase 6 — AI Cost Accounting & FinOps Margin Protection', () => {
  const costService = new AiCostService();
  const orgId = 'org-finops-test-uuid';

  it('should calculate direct operational costs accurately across STT and LLM providers', () => {
    // 60 minutes with Deepgram ($0.0043/min) = $0.258
    const costDeepgram = AiCostService.calculateCallCost({
      provider: 'deepgram',
      audioDurationSeconds: 3600,
    });
    expect(costDeepgram).toBe(0.258);

    // 100k tokens in, 20k tokens out with Gemini 2.0 Flash ($0.10/M in, $0.40/M out)
    // (100k/1M)*0.10 + (20k/1M)*0.40 = 0.01 + 0.008 = $0.018
    const costGemini = AiCostService.calculateCallCost({
      provider: 'gemini',
      tokensIn: 100000,
      tokensOut: 20000,
    });
    expect(costGemini).toBe(0.018);
  });

  it('should record AI calls and aggregate breakdown per organization', async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    await costService.recordAiCall({
      organizationId: orgId,
      provider: 'deepgram',
      endpoint: '/v1/listen',
      durationMs: 4200,
      audioDurationSeconds: 1800,
      estimatedCostUsd: 0.129,
      statusCode: 200,
    });

    await costService.recordAiCall({
      organizationId: orgId,
      provider: 'gemini',
      endpoint: 'models/gemini-2.0-flash:generateContent',
      durationMs: 1200,
      tokensIn: 45000,
      tokensOut: 5000,
      estimatedCostUsd: 0.0065,
      statusCode: 200,
    });

    const breakdown = await costService.getOrganizationDirectCosts(orgId, periodStart, periodEnd);
    expect(breakdown.totalCostUsd).toBeGreaterThan(0.13);
    expect(breakdown.breakdown.stt).toBe(0.129);
    expect(breakdown.breakdown.llm).toBe(0.0065);
  });

  it('should calculate gross margins and trigger alert when margin is below 60%', () => {
    // Healthy margin: Revenue $100, Direct Costs $15 => Margin 85%, no alert
    const healthy = costService.calculateGrossMargin({
      revenueUsd: 100,
      directCostsUsd: 15,
    });
    expect(healthy.grossMarginPercentage).toBe(85.0);
    expect(healthy.grossProfitUsd).toBe(85.0);
    expect(healthy.alertTriggered).toBe(false);

    // Unhealthy margin: Revenue $100, Direct Costs $45 => Margin 55%, alert triggered
    const degraded = costService.calculateGrossMargin({
      revenueUsd: 100,
      directCostsUsd: 45,
    });
    expect(degraded.grossMarginPercentage).toBe(55.0);
    expect(degraded.alertTriggered).toBe(true);

    // Negative revenue / loss
    const loss = costService.calculateGrossMargin({
      revenueUsd: 0,
      directCostsUsd: 25,
    });
    expect(loss.alertTriggered).toBe(true);
    expect(loss.grossProfitUsd).toBe(-25);
  });
});
