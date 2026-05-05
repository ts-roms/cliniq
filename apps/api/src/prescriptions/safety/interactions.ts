// Rule-based drug-interaction + allergy check.
//
// Pragmatic v1 — a small rule list curated from common high-severity
// pairings. Real production should layer the AI check from libs/ai-prompts
// on top + integrate a licensed drug database (e.g. RxNav, FDA).
//
// Entries are paired by lowercased generic name. Brand-name lookup happens
// outside this module via the drug catalog.

export type InteractionSeverity = 'low' | 'medium' | 'high' | 'urgent';

export interface InteractionFinding {
  kind: 'interaction' | 'allergy';
  severity: InteractionSeverity;
  message: string;
  drugs: string[];
}

interface InteractionRule {
  pair: [string, string];
  severity: InteractionSeverity;
  message: string;
}

// Curated examples — extend as the formulary grows.
const RULES: InteractionRule[] = [
  {
    pair: ['warfarin', 'aspirin'],
    severity: 'high',
    message: 'Warfarin + aspirin sharply increases bleeding risk',
  },
  {
    pair: ['warfarin', 'amoxicillin'],
    severity: 'medium',
    message: 'Antibiotics may potentiate warfarin (monitor INR)',
  },
  {
    pair: ['simvastatin', 'clarithromycin'],
    severity: 'high',
    message: 'CYP3A4 inhibition risks rhabdomyolysis',
  },
  {
    pair: ['ssri', 'tramadol'],
    severity: 'high',
    message: 'Serotonin syndrome risk with SSRI + tramadol',
  },
  {
    pair: ['metformin', 'iodinated contrast'],
    severity: 'medium',
    message: 'Hold metformin around contrast administration',
  },
  {
    pair: ['ace-inhibitor', 'spironolactone'],
    severity: 'medium',
    message: 'Hyperkalaemia risk',
  },
];

const ALLERGY_FAMILIES: Record<string, string[]> = {
  penicillin: ['amoxicillin', 'ampicillin', 'penicillin', 'piperacillin', 'oxacillin'],
  sulfa: ['sulfamethoxazole', 'cotrimoxazole', 'sulfasalazine'],
  nsaid: ['ibuprofen', 'naproxen', 'diclofenac', 'mefenamic acid', 'celecoxib'],
  aspirin: ['aspirin', 'acetylsalicylic acid'],
};

export interface CheckInput {
  newDrugs: string[];                  // generics being added in this Rx
  currentMedications?: string[];        // patient's existing meds
  allergies?: string[];                 // free-form allergy substances
}

const norm = (s: string) => s.trim().toLowerCase();

function hits(rule: InteractionRule, drugs: Set<string>): boolean {
  return drugs.has(rule.pair[0]) && drugs.has(rule.pair[1]);
}

function allergyFamily(allergyText: string): string[] {
  const lower = norm(allergyText);
  for (const [family, members] of Object.entries(ALLERGY_FAMILIES)) {
    if (lower.includes(family)) return members;
  }
  return [lower];
}

export function checkInteractions(input: CheckInput): InteractionFinding[] {
  const findings: InteractionFinding[] = [];

  const newDrugs = input.newDrugs.map(norm);
  const allDrugs = new Set([...newDrugs, ...(input.currentMedications ?? []).map(norm)]);

  // Interactions
  for (const rule of RULES) {
    if (hits(rule, allDrugs)) {
      findings.push({
        kind: 'interaction',
        severity: rule.severity,
        message: rule.message,
        drugs: [...rule.pair],
      });
    }
  }

  // Allergies — flag any new drug that matches an allergy family.
  for (const allergy of input.allergies ?? []) {
    const banned = new Set(allergyFamily(allergy));
    for (const drug of newDrugs) {
      if ([...banned].some((b) => drug.includes(b))) {
        findings.push({
          kind: 'allergy',
          severity: 'urgent',
          message: `Patient has documented allergy to "${allergy}" — ${drug} may cross-react`,
          drugs: [drug],
        });
      }
    }
  }

  return findings;
}
