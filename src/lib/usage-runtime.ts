export type UsageWindowKind = 'rolling-24h';

export type UsageState = {
  allowed: boolean;
  checkedAt: string | null;
  isOverrideUnlocked: boolean;
  limit: number;
  overrideUnlockedAt: string | null;
  remaining: number;
  resetsAt: string | null;
  used: number;
  windowKind: UsageWindowKind;
};

export type UsageBackgroundMessage =
  | {
      type: 'usage:get-state';
    }
  | {
      type: 'usage:consume-user-message';
      source: 'chat' | 'voice';
    }
  | {
      code: string;
      type: 'usage:unlock-override';
    }
  | {
      type: 'usage:clear-override';
    };

export type UsageBackgroundResponse =
  | {
      ok: true;
      usage: UsageState;
    }
  | {
      ok: false;
      error: string;
      usage?: UsageState;
    };

export const usageMessageLimit = 5;
export const usageWindowKind: UsageWindowKind = 'rolling-24h';
export const usageWindowMs = 24 * 60 * 60 * 1000;

export const createInitialUsageState = (): UsageState => ({
  allowed: true,
  checkedAt: null,
  isOverrideUnlocked: false,
  limit: usageMessageLimit,
  overrideUnlockedAt: null,
  remaining: usageMessageLimit,
  resetsAt: null,
  used: 0,
  windowKind: usageWindowKind,
});
