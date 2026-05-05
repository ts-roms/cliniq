import { describe, expect, it } from '@jest/globals';
import { checkInteractions } from './interactions';

describe('checkInteractions', () => {
  it('returns no findings when nothing pairs', () => {
    expect(
      checkInteractions({ newDrugs: ['paracetamol'], currentMedications: [] }),
    ).toEqual([]);
  });

  it('flags warfarin + aspirin as high severity', () => {
    const out = checkInteractions({
      newDrugs: ['Aspirin'],
      currentMedications: ['warfarin'],
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('high');
    expect(out[0].kind).toBe('interaction');
  });

  it('flags penicillin allergy when prescribing amoxicillin', () => {
    const out = checkInteractions({
      newDrugs: ['amoxicillin 500mg'],
      allergies: ['penicillin'],
    });
    expect(out.find((f) => f.kind === 'allergy')?.severity).toBe('urgent');
  });

  it('does not flag amoxicillin when allergy is to NSAIDs', () => {
    const out = checkInteractions({
      newDrugs: ['amoxicillin'],
      allergies: ['NSAID'],
    });
    expect(out.find((f) => f.kind === 'allergy')).toBeUndefined();
  });

  it('finds multiple interactions when pairs co-occur', () => {
    const out = checkInteractions({
      newDrugs: ['warfarin', 'aspirin'],
      currentMedications: ['amoxicillin'],
    });
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});
