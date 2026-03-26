export type UsageWindowKind = 'rolling-24h';

export type UsageState = {
  allowed: boolean;
  checkedAt: string | null;
  limit: number;
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
  limit: usageMessageLimit,
  remaining: usageMessageLimit,
  resetsAt: null,
  used: 0,
  windowKind: usageWindowKind,
});
