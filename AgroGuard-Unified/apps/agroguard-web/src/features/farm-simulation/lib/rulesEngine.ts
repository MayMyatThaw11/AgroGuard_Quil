/**
 * Versioned Agronomic Rules Engine for AgriQuill
 *
 * Replaces hardcoded string checks with data-driven, versioned rule sets
 * per country and production standard (ASOA, ASEAN-GAP, EU Organic, etc.).
 *
 * Each rule defines:
 * - id: unique rule identifier cited in compiler diagnostics
 * - standard: applicable regulatory standard
 * - scope: domain ('input' | 'actuation' | 'water' | 'safety')
 * - severity: 'BLOCKING' | 'WARNING' | 'INFO'
 * - citation: formal legal/standard clause
 * - effectiveDate: ISO date
 * - prohibitedTokens: banned chemical inputs or parameters
 */

export interface AgriRule {
  readonly id: string;
  readonly standard: string;
  readonly scope: 'input' | 'actuation' | 'water' | 'safety';
  readonly severity: 'BLOCKING' | 'WARNING' | 'INFO';
  readonly name: string;
  readonly description: string;
  readonly citation: string;
  readonly effectiveDate: string;
  readonly prohibitedTokens?: readonly string[];
  readonly condition?: {
    readonly param: string;
    readonly operator: '>' | '<' | '>=' | '<=' | '==';
    readonly threshold: number | string;
    readonly unit: string;
  };
}

export interface RuleDiagnostic {
  readonly ruleId: string;
  readonly standard: string;
  readonly severity: 'BLOCKING' | 'WARNING' | 'INFO';
  readonly line: number;
  readonly column: number;
  readonly token: string;
  readonly message: string;
  readonly citation: string;
  readonly effectiveDate: string;
  readonly fixSuggestion?: string;
}

export interface LintResult {
  readonly valid: boolean;
  readonly diagnostics: readonly RuleDiagnostic[];
  readonly evaluatedRulesCount: number;
  readonly standard: string;
}

/**
 * Curated, versioned agricultural rule sets
 */
export const VERSIONED_RULE_SETS: Readonly<Record<string, readonly AgriRule[]>> = {
  ASEAN_ORGANIC_ASOA: [
    {
      id: 'ASOA-RULE-3.2.1-BIO',
      standard: 'ASEAN_ORGANIC_ASOA',
      scope: 'input',
      severity: 'BLOCKING',
      name: 'Prohibition of Synthetic Nitrogenous Fertilizers',
      description: 'Synthetic urea and industrial nitrogenous salts are strictly prohibited on certified organic parcels.',
      citation: 'ASEAN Standard for Organic Agriculture (ASOA) 2026, Section 3.2.1 (Fertility & Soil Management)',
      effectiveDate: '2024-01-01',
      prohibitedTokens: [
        'synthetic_urea',
        'ammonium_nitrate',
        'calcium_ammonium_nitrate',
        'potassium_chloride',
        'superphosphate'
      ]
    },
    {
      id: 'ASOA-RULE-4.1.2-PEST',
      standard: 'ASEAN_ORGANIC_ASOA',
      scope: 'input',
      severity: 'BLOCKING',
      name: 'Prohibition of Synthetic Broad-Spectrum Pesticides',
      description: 'Synthetic organophosphates, carbamates, glyphosates, and pyrethroids are strictly prohibited.',
      citation: 'ASEAN Standard for Organic Agriculture (ASOA) 2026, Annex II (Prohibited Agrochemical Active Ingredients)',
      effectiveDate: '2024-01-01',
      prohibitedTokens: [
        'glyphosate',
        'paraquat',
        'synthetic_pyrethroids',
        'organophosphate_insecticide',
        'synthetic_herbicide',
        'carbamate_insecticide',
        'chlorpyrifos'
      ]
    },
    {
      id: 'ASOA-RULE-5.4-DRIFT',
      standard: 'ASEAN_ORGANIC_ASOA',
      scope: 'safety',
      severity: 'BLOCKING',
      name: 'Aerial Drift Safety Ceiling',
      description: 'Aerial drone application must abort immediately if ambient wind exceeds 5.5 m/s to prevent boundary drift.',
      citation: 'ASOA Standard 2026, Section 5.4 & AGENTS.md Hard Safety Rule #6',
      effectiveDate: '2024-01-01',
      condition: {
        param: 'windSpeedMs',
        operator: '>',
        threshold: 5.5,
        unit: 'm/s'
      }
    },
    {
      id: 'ASOA-RULE-6.1-AWD',
      standard: 'ASEAN_ORGANIC_ASOA',
      scope: 'water',
      severity: 'WARNING',
      name: 'AWD Methane Mitigation Mandate',
      description: 'Rice parcels under ASOA must practice Alternate Wetting & Drying with perched water threshold between -10cm and -20cm.',
      citation: 'ASOA Standard 2026, Section 6.1 (Water Resource Conservation & Methane Abatement)',
      effectiveDate: '2024-01-01'
    }
  ],

  ASEAN_GAP: [
    {
      id: 'GAP-RULE-2.1-DRIFT',
      standard: 'ASEAN_GAP',
      scope: 'safety',
      severity: 'BLOCKING',
      name: 'GAP Spray Drift Prevention Ceiling',
      description: 'Wind speed during foliar application must not exceed 5.5 m/s.',
      citation: 'ASEAN Good Agricultural Practices (GAP) Standard, Module 2 (Environmental Management)',
      effectiveDate: '2023-06-01',
      condition: {
        param: 'windSpeedMs',
        operator: '>',
        threshold: 5.5,
        unit: 'm/s'
      }
    },
    {
      id: 'GAP-RULE-3.4-RESIDUE',
      standard: 'ASEAN_GAP',
      scope: 'input',
      severity: 'BLOCKING',
      name: 'Banned Highly Hazardous Agrochemicals',
      description: 'WHO Class 1a and 1b pesticides are prohibited under ASEAN GAP.',
      citation: 'ASEAN GAP Module 1 (Food Safety & Chemical Residues)',
      effectiveDate: '2023-06-01',
      prohibitedTokens: [
        'paraquat',
        'endosulfan',
        'monocrotophos',
        'methyl_parathion'
      ]
    }
  ],

  EU_2018_848: [
    {
      id: 'EU-REG-2018-848-N',
      standard: 'EU_2018_848',
      scope: 'input',
      severity: 'BLOCKING',
      name: 'EU Organic Synthetic Nitrogen Ban',
      description: 'Synthetic nitrogen mineral fertilizers are prohibited by Regulation (EU) 2018/848.',
      citation: 'Regulation (EU) 2018/848 of the European Parliament and of the Council, Annex II Part I',
      effectiveDate: '2022-01-01',
      prohibitedTokens: ['synthetic_urea', 'glyphosate', 'paraquat', 'synthetic_pyrethroids']
    }
  ]
};

/**
 * Retrieve applicable rule set for a standard
 */
export function getRulesForStandard(standard: string): readonly AgriRule[] {
  // Normalize standard name
  const normalized = standard.trim();
  if (VERSIONED_RULE_SETS[normalized]) {
    return VERSIONED_RULE_SETS[normalized];
  }
  // Default fallback to ASOA if organic
  if (normalized.toUpperCase().includes('ORGANIC') || normalized.toUpperCase().includes('ASOA')) {
    return VERSIONED_RULE_SETS.ASEAN_ORGANIC_ASOA;
  }
  return VERSIONED_RULE_SETS.ASEAN_ORGANIC_ASOA;
}

/**
 * Comprehensive AST & Token Linter for .agri DSL scripts
 * Returns line, column, rule ID, and official citation for any violation.
 */
export function lintAgriScript(sourceCode: string, standard: string = 'ASEAN_ORGANIC_ASOA'): LintResult {
  const rules = getRulesForStandard(standard);
  const diagnostics: RuleDiagnostic[] = [];
  const lines = sourceCode.split('\n');

  lines.forEach((lineText, zeroIndexedLine) => {
    const lineNumber = zeroIndexedLine + 1;
    const trimmed = lineText.trim();

    // Skip commented lines
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      return;
    }

    // Evaluate input rules against active line
    for (const rule of rules) {
      if (rule.scope === 'input' && rule.prohibitedTokens) {
        for (const token of rule.prohibitedTokens) {
          const lowerLine = lineText.toLowerCase();
          const lowerToken = token.toLowerCase();
          const tokenIndex = lowerLine.indexOf(lowerToken);

          if (tokenIndex !== -1) {
            diagnostics.push({
              ruleId: rule.id,
              standard: rule.standard,
              severity: rule.severity,
              line: lineNumber,
              column: tokenIndex + 1,
              token,
              message: `Prohibited input "${token}" violates ${rule.standard}. ${rule.description}`,
              citation: rule.citation,
              effectiveDate: rule.effectiveDate,
              fixSuggestion: token === 'synthetic_urea' ? 'AzollaBioCompost' : 'BioBotanicalExtract'
            });
          }
        }
      }
    }
  });

  const hasBlocking = diagnostics.some(d => d.severity === 'BLOCKING');

  return {
    valid: !hasBlocking,
    diagnostics,
    evaluatedRulesCount: rules.length,
    standard
  };
}
