export interface WaterAdvisoryInput {
  status: string;
  reasonCode?: string | null;
  reason?: string | null;
  dataQuality?: string | null;
  deficitEstimate?: { netDepthMm?: number | null } | null;
}

export function saveWaterAdvisory(result: WaterAdvisoryInput, extra?: Record<string, unknown>): void;
export function loadWaterAdvisory(): (Record<string, unknown> & { status: string }) | null;
