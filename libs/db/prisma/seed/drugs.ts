// Curated PH OPD drug seed — common generics + brands clinics actually
// prescribe. Not exhaustive (a real catalog has 5k+); good enough for the
// pilot, and extendable per-tenant.
//
// Format: { generic, brand?, strength, form, classes[], controlled? }
// `classes` powers the allergy guard at prescribe time — match a Patient's
// Allergy.substance against any class string for an instant red flag.

export interface SeedDrug {
  generic: string;
  brand?: string;
  strength?: string;
  form?: string;
  classes?: string[];
  controlled?: boolean;
  atcCode?: string;
}

export const SEED_DRUGS: SeedDrug[] = [
  // Antibiotics — penicillins
  { generic: 'amoxicillin', strength: '500 mg', form: 'CAP', classes: ['penicillin', 'beta-lactam', 'antibiotic'], atcCode: 'J01CA04' },
  { generic: 'amoxicillin', strength: '250 mg/5 ml', form: 'SUSP', classes: ['penicillin', 'beta-lactam', 'antibiotic'], atcCode: 'J01CA04' },
  { generic: 'amoxicillin', brand: 'Amoxil', strength: '500 mg', form: 'CAP', classes: ['penicillin', 'beta-lactam', 'antibiotic'], atcCode: 'J01CA04' },
  { generic: 'amoxicillin/clavulanic acid', brand: 'Co-amoxiclav', strength: '625 mg', form: 'TAB', classes: ['penicillin', 'beta-lactam', 'antibiotic'], atcCode: 'J01CR02' },
  { generic: 'penicillin V', strength: '500 mg', form: 'TAB', classes: ['penicillin', 'beta-lactam', 'antibiotic'], atcCode: 'J01CE02' },
  // Antibiotics — cephalosporins
  { generic: 'cephalexin', strength: '500 mg', form: 'CAP', classes: ['cephalosporin', 'beta-lactam', 'antibiotic'], atcCode: 'J01DB01' },
  { generic: 'cefuroxime', brand: 'Zinnat', strength: '500 mg', form: 'TAB', classes: ['cephalosporin', 'beta-lactam', 'antibiotic'], atcCode: 'J01DC02' },
  { generic: 'cefixime', strength: '200 mg', form: 'CAP', classes: ['cephalosporin', 'beta-lactam', 'antibiotic'], atcCode: 'J01DD08' },
  // Antibiotics — macrolides
  { generic: 'azithromycin', strength: '500 mg', form: 'TAB', classes: ['macrolide', 'antibiotic'], atcCode: 'J01FA10' },
  { generic: 'erythromycin', strength: '500 mg', form: 'TAB', classes: ['macrolide', 'antibiotic'], atcCode: 'J01FA01' },
  { generic: 'clarithromycin', strength: '500 mg', form: 'TAB', classes: ['macrolide', 'antibiotic'], atcCode: 'J01FA09' },
  // Antibiotics — others
  { generic: 'ciprofloxacin', strength: '500 mg', form: 'TAB', classes: ['quinolone', 'fluoroquinolone', 'antibiotic'], atcCode: 'J01MA02' },
  { generic: 'levofloxacin', strength: '500 mg', form: 'TAB', classes: ['quinolone', 'fluoroquinolone', 'antibiotic'], atcCode: 'J01MA12' },
  { generic: 'doxycycline', strength: '100 mg', form: 'CAP', classes: ['tetracycline', 'antibiotic'], atcCode: 'J01AA02' },
  { generic: 'metronidazole', strength: '500 mg', form: 'TAB', classes: ['nitroimidazole', 'antibiotic'], atcCode: 'J01XD01' },
  { generic: 'cotrimoxazole', brand: 'Bactrim', strength: '800/160 mg', form: 'TAB', classes: ['sulfonamide', 'antibiotic'], atcCode: 'J01EE01' },

  // Analgesics / antipyretics
  { generic: 'paracetamol', brand: 'Biogesic', strength: '500 mg', form: 'TAB', classes: ['analgesic', 'antipyretic'], atcCode: 'N02BE01' },
  { generic: 'paracetamol', strength: '250 mg/5 ml', form: 'SUSP', classes: ['analgesic', 'antipyretic'], atcCode: 'N02BE01' },
  { generic: 'paracetamol', strength: '120 mg/5 ml', form: 'SUSP', classes: ['analgesic', 'antipyretic'], atcCode: 'N02BE01' },
  { generic: 'ibuprofen', strength: '400 mg', form: 'TAB', classes: ['NSAID', 'analgesic'], atcCode: 'M01AE01' },
  { generic: 'mefenamic acid', brand: 'Ponstan', strength: '500 mg', form: 'CAP', classes: ['NSAID', 'analgesic'], atcCode: 'M01AG01' },
  { generic: 'naproxen', strength: '550 mg', form: 'TAB', classes: ['NSAID', 'analgesic'], atcCode: 'M01AE02' },
  { generic: 'aspirin', strength: '80 mg', form: 'TAB', classes: ['NSAID', 'salicylate', 'antiplatelet'], atcCode: 'B01AC06' },
  { generic: 'celecoxib', strength: '200 mg', form: 'CAP', classes: ['NSAID', 'COX-2 inhibitor'], atcCode: 'M01AH01' },

  // Antihistamines
  { generic: 'cetirizine', strength: '10 mg', form: 'TAB', classes: ['antihistamine', 'H1 blocker'], atcCode: 'R06AE07' },
  { generic: 'loratadine', brand: 'Claritin', strength: '10 mg', form: 'TAB', classes: ['antihistamine', 'H1 blocker'], atcCode: 'R06AX13' },
  { generic: 'diphenhydramine', strength: '50 mg', form: 'CAP', classes: ['antihistamine', 'H1 blocker'], atcCode: 'R06AA02' },

  // GI
  { generic: 'omeprazole', strength: '20 mg', form: 'CAP', classes: ['PPI', 'antacid'], atcCode: 'A02BC01' },
  { generic: 'pantoprazole', strength: '40 mg', form: 'TAB', classes: ['PPI', 'antacid'], atcCode: 'A02BC02' },
  { generic: 'ranitidine', strength: '150 mg', form: 'TAB', classes: ['H2 blocker', 'antacid'], atcCode: 'A02BA02' },
  { generic: 'loperamide', brand: 'Imodium', strength: '2 mg', form: 'CAP', classes: ['antidiarrheal'], atcCode: 'A07DA03' },
  { generic: 'metoclopramide', strength: '10 mg', form: 'TAB', classes: ['antiemetic'], atcCode: 'A03FA01' },
  { generic: 'domperidone', strength: '10 mg', form: 'TAB', classes: ['antiemetic'], atcCode: 'A03FA03' },

  // Cardiovascular
  { generic: 'amlodipine', strength: '5 mg', form: 'TAB', classes: ['calcium channel blocker', 'antihypertensive'], atcCode: 'C08CA01' },
  { generic: 'amlodipine', strength: '10 mg', form: 'TAB', classes: ['calcium channel blocker', 'antihypertensive'], atcCode: 'C08CA01' },
  { generic: 'losartan', strength: '50 mg', form: 'TAB', classes: ['ARB', 'antihypertensive'], atcCode: 'C09CA01' },
  { generic: 'losartan', strength: '100 mg', form: 'TAB', classes: ['ARB', 'antihypertensive'], atcCode: 'C09CA01' },
  { generic: 'telmisartan', strength: '40 mg', form: 'TAB', classes: ['ARB', 'antihypertensive'], atcCode: 'C09CA07' },
  { generic: 'enalapril', strength: '5 mg', form: 'TAB', classes: ['ACE inhibitor', 'antihypertensive'], atcCode: 'C09AA02' },
  { generic: 'lisinopril', strength: '10 mg', form: 'TAB', classes: ['ACE inhibitor', 'antihypertensive'], atcCode: 'C09AA03' },
  { generic: 'metoprolol', strength: '50 mg', form: 'TAB', classes: ['beta blocker', 'antihypertensive'], atcCode: 'C07AB02' },
  { generic: 'atenolol', strength: '50 mg', form: 'TAB', classes: ['beta blocker', 'antihypertensive'], atcCode: 'C07AB03' },
  { generic: 'atorvastatin', strength: '20 mg', form: 'TAB', classes: ['statin', 'lipid-lowering'], atcCode: 'C10AA05' },
  { generic: 'rosuvastatin', strength: '20 mg', form: 'TAB', classes: ['statin', 'lipid-lowering'], atcCode: 'C10AA07' },
  { generic: 'simvastatin', strength: '20 mg', form: 'TAB', classes: ['statin', 'lipid-lowering'], atcCode: 'C10AA01' },
  { generic: 'furosemide', brand: 'Lasix', strength: '40 mg', form: 'TAB', classes: ['loop diuretic'], atcCode: 'C03CA01' },
  { generic: 'hydrochlorothiazide', strength: '25 mg', form: 'TAB', classes: ['thiazide diuretic'], atcCode: 'C03AA03' },
  { generic: 'spironolactone', strength: '25 mg', form: 'TAB', classes: ['potassium-sparing diuretic'], atcCode: 'C03DA01' },
  { generic: 'isosorbide mononitrate', strength: '30 mg', form: 'TAB', classes: ['nitrate', 'antianginal'], atcCode: 'C01DA14' },

  // Diabetes
  { generic: 'metformin', strength: '500 mg', form: 'TAB', classes: ['biguanide', 'antidiabetic'], atcCode: 'A10BA02' },
  { generic: 'metformin', strength: '850 mg', form: 'TAB', classes: ['biguanide', 'antidiabetic'], atcCode: 'A10BA02' },
  { generic: 'glimepiride', strength: '2 mg', form: 'TAB', classes: ['sulfonylurea', 'antidiabetic'], atcCode: 'A10BB12' },
  { generic: 'gliclazide', strength: '60 mg MR', form: 'TAB', classes: ['sulfonylurea', 'antidiabetic'], atcCode: 'A10BB09' },
  { generic: 'sitagliptin', strength: '50 mg', form: 'TAB', classes: ['DPP-4 inhibitor', 'antidiabetic'], atcCode: 'A10BH01' },
  { generic: 'empagliflozin', strength: '10 mg', form: 'TAB', classes: ['SGLT2 inhibitor', 'antidiabetic'], atcCode: 'A10BK03' },

  // Respiratory
  { generic: 'salbutamol', brand: 'Ventolin', strength: '100 mcg/puff', form: 'INH', classes: ['bronchodilator', 'beta-2 agonist'], atcCode: 'R03AC02' },
  { generic: 'salbutamol', strength: '2 mg/5 ml', form: 'SYRUP', classes: ['bronchodilator', 'beta-2 agonist'], atcCode: 'R03CC02' },
  { generic: 'budesonide', strength: '200 mcg/puff', form: 'INH', classes: ['inhaled corticosteroid'], atcCode: 'R03BA02' },
  { generic: 'montelukast', strength: '10 mg', form: 'TAB', classes: ['leukotriene receptor antagonist'], atcCode: 'R03DC03' },
  { generic: 'guaifenesin', strength: '100 mg/5 ml', form: 'SYRUP', classes: ['expectorant'] },
  { generic: 'dextromethorphan', strength: '15 mg/5 ml', form: 'SYRUP', classes: ['antitussive'] },
  { generic: 'carbocisteine', strength: '500 mg', form: 'CAP', classes: ['mucolytic'] },
  { generic: 'oseltamivir', brand: 'Tamiflu', strength: '75 mg', form: 'CAP', classes: ['antiviral', 'neuraminidase inhibitor'], atcCode: 'J05AH02' },

  // Endocrine / steroids
  { generic: 'prednisone', strength: '20 mg', form: 'TAB', classes: ['corticosteroid', 'glucocorticoid'], atcCode: 'H02AB07' },
  { generic: 'methylprednisolone', strength: '4 mg', form: 'TAB', classes: ['corticosteroid', 'glucocorticoid'], atcCode: 'H02AB04' },
  { generic: 'levothyroxine', strength: '50 mcg', form: 'TAB', classes: ['thyroid hormone'], atcCode: 'H03AA01' },

  // CNS
  { generic: 'sertraline', strength: '50 mg', form: 'TAB', classes: ['SSRI', 'antidepressant'], atcCode: 'N06AB06' },
  { generic: 'fluoxetine', strength: '20 mg', form: 'CAP', classes: ['SSRI', 'antidepressant'], atcCode: 'N06AB03' },
  { generic: 'escitalopram', strength: '10 mg', form: 'TAB', classes: ['SSRI', 'antidepressant'], atcCode: 'N06AB10' },
  { generic: 'alprazolam', strength: '0.5 mg', form: 'TAB', classes: ['benzodiazepine', 'anxiolytic'], atcCode: 'N05BA12', controlled: true },
  { generic: 'diazepam', strength: '5 mg', form: 'TAB', classes: ['benzodiazepine', 'anxiolytic'], atcCode: 'N05BA01', controlled: true },
  { generic: 'tramadol', strength: '50 mg', form: 'CAP', classes: ['opioid', 'analgesic'], atcCode: 'N02AX02', controlled: true },
  { generic: 'codeine', strength: '15 mg', form: 'TAB', classes: ['opioid', 'analgesic'], atcCode: 'R05DA04', controlled: true },

  // Vitamins / supplements
  { generic: 'ferrous sulfate', strength: '325 mg', form: 'TAB', classes: ['iron supplement'] },
  { generic: 'folic acid', strength: '5 mg', form: 'TAB', classes: ['vitamin B9'] },
  { generic: 'cholecalciferol', brand: 'Vitamin D3', strength: '1000 IU', form: 'TAB', classes: ['vitamin D'] },
  { generic: 'multivitamin', strength: '1 tab', form: 'TAB', classes: ['vitamin'] },
  { generic: 'cyanocobalamin', strength: '1000 mcg', form: 'TAB', classes: ['vitamin B12'] },

  // Topical
  { generic: 'mupirocin', strength: '2%', form: 'OINT', classes: ['topical antibiotic'] },
  { generic: 'betamethasone', strength: '0.05%', form: 'CREAM', classes: ['topical corticosteroid'] },
  { generic: 'hydrocortisone', strength: '1%', form: 'CREAM', classes: ['topical corticosteroid'] },
  { generic: 'clotrimazole', strength: '1%', form: 'CREAM', classes: ['topical antifungal'] },

  // Eye
  { generic: 'tobramycin', strength: '0.3%', form: 'EYE DROP', classes: ['aminoglycoside', 'antibiotic'] },
  { generic: 'moxifloxacin', strength: '0.5%', form: 'EYE DROP', classes: ['fluoroquinolone', 'antibiotic'] },

  // Misc
  { generic: 'oral rehydration salts', brand: 'Hydrite', strength: '1 sachet', form: 'POWDER', classes: ['electrolyte'] },
  { generic: 'ascorbic acid', brand: 'Vitamin C', strength: '500 mg', form: 'TAB', classes: ['vitamin C'] },
];
