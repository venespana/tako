// MissedOnceCatchUp.ts — pure missed-once catch-up decision (task 3.10)
//
// Spec `agent-jobs#Missed-Runs-Execute-Once`: a job that missed one or more
// firings while the agent was down runs EXACTLY ONCE — never once per missed
// occurrence. This is the pure decision the scheduler loop (RunSchedulerLoop,
// WU7) consults on start and every tick; the loop itself owns persistence.
//
// Crash-guard protocol (design §Job & Run Model): the loop sets
// `last_fire_enqueued` when it enqueues the firing and clears it once the
// watermark advances. A crash inside that window leaves guard=true with the
// watermark behind — this decision then returns `advance` instead of
// `enqueue`, so the enqueued run can never be duplicated.
import { nextAfter } from '../../domain/schedule.js';

export interface CatchUpInput {
  /** Validated cron expression of the job's schedule. */
  readonly expr: string;
  /** ISO 8601 instant of the last accounted fire; undefined = freshly registered job. */
  readonly watermark?: string;
  /** Crash guard read from schedule_state.last_fire_enqueued. */
  readonly lastFireEnqueued: boolean;
  readonly now: Date;
}

export type CatchUpDecision =
  | {
      readonly action: 'enqueue';
      /** True when MORE than one firing was missed. */
      readonly catchup: boolean;
      /** ISO instant of the (single) fire being executed — the first missed one. */
      readonly fireAt: string;
      /** ISO instant the loop must persist as the new watermark. */
      readonly nextWatermark: string;
    }
  | { readonly action: 'advance'; readonly nextWatermark: string }
  | { readonly action: 'none' };

/**
 * Decide the catch-up action for one job. Pure: same input → same decision.
 *
 * @throws RangeError when the watermark is not a valid instant.
 */
export function decideCatchUp(input: CatchUpInput): CatchUpDecision {
  const { expr, now } = input;

  if (input.lastFireEnqueued) {
    return { action: 'advance', nextWatermark: nextWatermarkOrFallback(expr, now, input.watermark) };
  }

  if (input.watermark === undefined) {
    // Fresh job: the loop initializes the watermark at registration; no catch-up.
    return { action: 'none' };
  }

  const watermark = new Date(input.watermark);
  if (Number.isNaN(watermark.getTime())) {
    throw new RangeError(`invalid catch-up watermark: ${input.watermark}`);
  }

  const firstMissed = nextAfter(expr, watermark);
  if (firstMissed === null || firstMissed.getTime() > now.getTime()) {
    return { action: 'none' };
  }

  // More than one firing missed? Only the SECOND missed fire's existence matters.
  const secondMissed = nextAfter(expr, firstMissed);
  const catchup = secondMissed !== null && secondMissed.getTime() <= now.getTime();

  return {
    action: 'enqueue',
    catchup,
    fireAt: firstMissed.toISOString(),
    nextWatermark: nextWatermarkOrFallback(expr, now, input.watermark),
  };
}

/** Next future occurrence; falls back so the watermark always moves forward. */
function nextWatermarkOrFallback(expr: string, now: Date, fallback?: string): string {
  return nextAfter(expr, now)?.toISOString() ?? fallback ?? now.toISOString();
}
