import type { AIAgent } from '../../types.ts';
import type { CrewMember, CrewTask, FarmCheck, LivePlan, MissingField, Proposal } from '../../data/ops/types.ts';
import {
  decideProposal,
  getContract,
  getFarmCheck,
  getSummary,
  getTerritoryProfile,
  lintAgri,
  planLive,
  type FarmSummary,
  type LintDiagnostic,
} from '../api.ts';
import { ApiError } from '../apiError.ts';
import { activeSession } from '../session.ts';
import { WIND_CEILING_MS, standardLabel } from '../safety.ts';

export const DEMO_FARM_ID = 'farm_ayeyarwady_demo';

export type AgentToolId = 'plan' | 'summary' | 'farm_check' | 'location' | 'contract_lint';

export interface AgentLine {
  label: string;
  value: string;
}

export interface AgentRun {
  id: string;
  tool: AgentToolId;
  farmId: string;
  at: string;
  lines: AgentLine[];
  crew: CrewMember[] | null;
  error: string | null;
}

interface AgentTool {
  id: AgentToolId;
  label: string;
  source: string;
  run: (farmId: string, script: string) => Promise<AgentLine[] | { lines: AgentLine[]; crew: CrewMember[] | null }>;
}

type TerritoryProfile = Awaited<ReturnType<typeof getTerritoryProfile>>;

export const SIGN_IN_TO_APPROVE = 'Sign in to approve';
export const APPROVED_NEEDS_PIN = 'Approved · the valve still needs the PIN step in Farm Operations';

export const unknown = (reason: string): string => `unknown: ${reason}`;

const CREW: readonly { id: string; name: string; role: AIAgent['role']; mission: string; practice: string; tools: AgentToolId[] }[] = [
  { id: 'water_steward', name: 'Water Steward', role: 'irrigation', mission: 'Irrigation and drainage', practice: 'Alternate wetting and drying, read from the field water tube', tools: ['plan', 'farm_check'] },
  { id: 'crop_scout', name: 'Crop Scout', role: 'field', mission: 'Canopy health', practice: 'Walk the bunds and compare the greenness week to week', tools: ['plan', 'summary'] },
  { id: 'pest_watcher', name: 'Pest Watcher', role: 'pest-scout', mission: 'Disease and pest pressure', practice: 'Watch for long wet, mild nights that bring blast', tools: ['plan', 'contract_lint'] },
  { id: 'harvest_planner', name: 'Harvest Planner', role: 'planner', mission: 'Harvest and machinery', practice: 'Drain early and cut on a run of dry days', tools: ['plan', 'location'] },
  { id: 'drone_pilot', name: 'Drone Pilot', role: 'pest-scout', mission: 'Aerial scouting and spraying', practice: 'Fly only in calm air', tools: ['plan', 'farm_check'] },
];

export const INITIAL_AI_AGENTS: AIAgent[] = CREW.map((member) => ({
  id: member.id,
  name: member.name,
  role: member.role,
  avatarIcon: member.name.split(' ').map((word) => word[0]).join(''),
  color: '#10B981',
  status: 'idle',
  mission: member.mission,
  currentObjective: member.practice,
  confidenceScore: 0,
  lastEvaluation: 'not run',
  telemetrySummary: {},
  activeTools: member.tools,
  recentThoughts: [],
}));

function missingLines(missing: readonly MissingField[] | undefined): AgentLine[] {
  return (missing ?? []).map((item) => ({ label: `Missing: ${item.field}`, value: item.reason }));
}

function reasonOf(missing: readonly MissingField[] | undefined, status: string): string {
  return missing && missing.length > 0 ? missing.map((item) => item.reason).join('; ') : `status ${status}`;
}

export function isSprayOrDrone(task: CrewTask): boolean {
  return task.agent === 'drone_pilot' || task.actuation?.target === 'drone' || /spray/i.test(task.title);
}

export function planLines(plan: LivePlan): AgentLine[] {
  const lines: AgentLine[] = [];
  const weather = plan.weather;
  lines.push({
    label: 'Weather',
    value: weather
      ? `${weather.source.provider}${weather.stale ? ' (stale)' : ''} · ${weather.licence}`
      : unknown(reasonOf(plan.missing, plan.status)),
  });
  const winds = weather ? weather.days.map((day) => day.wind_ms) : [];
  lines.push({
    label: 'Highest forecast wind',
    value: winds.length > 0
      ? `${Math.max(...winds).toFixed(1)} m/s (hard halt above ${WIND_CEILING_MS} m/s)`
      : unknown('no forecast days returned'),
  });
  const scheduled = plan.tasks.filter((task) => task.schedule?.status === 'scheduled').length;
  const blocked = plan.tasks.filter((task) => task.blocked_reason || task.schedule?.status === 'blocked').length;
  lines.push({ label: 'Jobs', value: `${plan.tasks.length} planned · ${scheduled} scheduled · ${blocked} blocked` });
  const spray = plan.tasks.filter(isSprayOrDrone);
  if (spray.length === 0) lines.push({ label: 'Spray and drone jobs', value: 'none planned for this farm' });
  for (const task of spray) {
    const verdict = task.blocked_reason
      ? `blocked: ${task.blocked_reason}`
      : task.schedule?.status ?? 'not scheduled';
    const gates = task.schedule?.gates ? ` · gates: ${task.schedule.gates}` : '';
    const approval = task.requires_human_approval ? ' · needs a person to approve' : '';
    lines.push({ label: task.title, value: `${verdict}${gates}${approval}` });
  }
  return [...lines, ...missingLines(plan.missing)];
}

export function summaryLines(summary: FarmSummary): AgentLine[] {
  const { contract, monitoring, weather, work, proposals, ledger } = summary;
  return [
    { label: 'Farm', value: summary.name ?? unknown('the contract has no name') },
    { label: 'Contract', value: `${contract.valid ? 'valid' : 'not valid'} · ${contract.parcels} parcels · ${contract.area_ha} ha · ${contract.to_verify} TO VERIFY` },
    { label: 'Standard', value: standardLabel(contract.standard) },
    {
      label: 'Monitoring',
      value: monitoring
        ? `${monitoring.paddies} paddies · ${monitoring.sensor_ok} sensor ok · ${monitoring.scout_72h} scouted in 72 h · ${monitoring.model} model only · ${monitoring.unknown} unknown`
        : unknown('no monitoring data for this farm'),
    },
    { label: 'Weather', value: weather ? `${weather.provider} · ${weather.retrieved_at}` : unknown('no weather fetched yet') },
    { label: 'Work', value: `${work.tasks} jobs · ${work.scheduled} scheduled · ${work.blocked.length} blocked` },
    ...work.blocked.map((item) => ({ label: `Blocked: ${item.title}`, value: item.reason })),
    { label: 'Proposals', value: `${proposals.open} open · ${proposals.approved} approved · ${proposals.rejected} rejected` },
    { label: 'Ledger', value: `${ledger.valid ? 'chain valid' : 'chain broken'} · ${ledger.entries} entries` },
    ...missingLines(summary.missing),
  ];
}

export function checkLines(check: FarmCheck): AgentLine[] {
  const { backtest, spray_recent: spray, inputs } = check;
  const overall = backtest.overall;
  const lines: AgentLine[] = [
    {
      label: 'Water model check',
      value: overall
        ? `${overall.pairs} pairs · model error ${overall.model_mae_cm} cm vs no-change ${overall.no_change_mae_cm} cm${overall.pairs < 10 ? ' · a first look, not a verdict' : ''}`
        : unknown(reasonOf(backtest.missing, backtest.status)),
    },
    {
      label: 'Recent spray hours',
      value: spray.days !== undefined && spray.days_without_safe_hour !== undefined
        ? `${spray.days_without_safe_hour} of ${spray.days} days had no safe spray hour`
        : unknown(reasonOf(spray.missing, spray.status)),
    },
    {
      label: 'Inputs',
      value: `${inputs.applications.length} applications · ${standardLabel(inputs.standard)}${inputs.banned_checked === false ? ' · banned list not checked' : ''}`,
    },
  ];
  for (const application of inputs.applications) {
    if (application.flags.length > 0) {
      lines.push({ label: `${application.applied_at} ${application.product}`, value: application.flags.join('; ') });
    }
  }
  return [...lines, ...missingLines(backtest.missing), ...missingLines(inputs.missing)];
}

export function locationLines(location: [number, number] | null, profile: TerritoryProfile | null, failure: string | null): AgentLine[] {
  if (!location) return [{ label: 'Location', value: unknown('the contract has no location') }];
  const [lat, lon] = location;
  const lines: AgentLine[] = [{ label: 'Location', value: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }];
  if (!profile) return [...lines, { label: 'Soil and weather', value: unknown(failure ?? 'no profile returned') }];
  return [
    ...lines,
    { label: 'Soil', value: `${profile.soil_profile.provider} · ${profile.soil_profile.layers.length} layers` },
    { label: 'Weather', value: `${profile.weather_forecast.provider} · ${profile.weather_forecast.forecast_days} forecast days` },
  ];
}

export function lintLines(result: { is_valid: boolean; diagnostics: LintDiagnostic[] }): AgentLine[] {
  return [
    { label: 'Contract check', value: result.is_valid ? 'passes' : 'fails' },
    ...result.diagnostics.map((item) => ({
      label: `${item.severity} line ${item.line}`,
      value: `${item.code}: ${item.message}`,
    })),
  ];
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Sign in to read this farm';
    if (error.status === 404) return 'This farm is not registered';
  }
  return error instanceof Error ? error.message : String(error);
}

export const AGENT_TOOLS: readonly AgentTool[] = [
  {
    id: 'plan',
    label: 'Plan and spray gates',
    source: 'POST /contracts/{farm}/plan',
    run: async (farmId) => {
      const plan = await planLive(farmId);
      return { lines: planLines(plan), crew: plan.crew ?? null };
    },
  },
  {
    id: 'summary',
    label: 'Farm summary',
    source: 'GET /contracts/{farm}/summary',
    run: async (farmId) => summaryLines(await getSummary(farmId)),
  },
  {
    id: 'farm_check',
    label: 'Farm records check',
    source: 'GET /contracts/{farm}/check',
    run: async (farmId) => checkLines(await getFarmCheck(farmId)),
  },
  {
    id: 'location',
    label: 'Soil and weather here',
    source: 'GET /contracts/{farm} + /territory-profile',
    run: async (farmId) => {
      const location = (await getContract(farmId)).contract?.farm.location ?? null;
      if (!location) return locationLines(null, null, null);
      try {
        return locationLines(location, await getTerritoryProfile(location[0], location[1]), null);
      } catch (error) {
        return locationLines(location, null, `territory profile failed: ${errorText(error)}`);
      }
    },
  },
  {
    id: 'contract_lint',
    label: 'Check the open .agri file',
    source: 'POST /dsl/lint',
    run: async (_farmId, script) =>
      script.trim() ? lintLines(await lintAgri(script)) : [{ label: 'Contract check', value: unknown('no .agri file is open') }],
  },
];

export async function runAgentTool(tool: AgentToolId, farmId: string, script: string): Promise<AgentRun> {
  const at = new Date().toISOString();
  const run = { id: `${tool}-${at}`, tool, farmId, at, lines: [], crew: null };
  const definition = AGENT_TOOLS.find((item) => item.id === tool);
  if (!definition) return { ...run, error: `unknown tool ${tool}` };
  try {
    const result = await definition.run(farmId, script);
    return Array.isArray(result) ? { ...run, lines: result, error: null } : { ...run, ...result, error: null };
  } catch (error) {
    return { ...run, error: errorText(error) };
  }
}

export async function decide(
  proposal: Proposal,
  decision: 'approved' | 'rejected',
  send: typeof decideProposal = decideProposal,
  who: string | undefined = activeSession()?.name,
): Promise<string> {
  if (!who) return SIGN_IN_TO_APPROVE;
  try {
    await send(proposal.proposal_id, decision, who);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return SIGN_IN_TO_APPROVE;
    return errorText(error);
  }
  if (decision === 'rejected') return 'Rejected';
  return proposal.task.actuation ? APPROVED_NEEDS_PIN : 'Approved';
}
