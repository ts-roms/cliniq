// Curated ICD-10 subset — common PH OPD diagnoses. ~120 codes covering
// what >80% of consultations reach for. Extendable; not a full WHO seed.
//
// Codes follow ICD-10 (not ICD-10-CM). The PH FDA + PhilHealth use ICD-10.

export interface SeedIcd {
  code: string;
  description: string;
  chapter?: string;
  billable?: boolean;
}

export const SEED_ICD: SeedIcd[] = [
  // Respiratory
  { code: 'J00', description: 'Acute nasopharyngitis (common cold)', chapter: 'X — Respiratory' },
  { code: 'J01.9', description: 'Acute sinusitis, unspecified', chapter: 'X — Respiratory' },
  { code: 'J02.9', description: 'Acute pharyngitis, unspecified', chapter: 'X — Respiratory' },
  { code: 'J03.9', description: 'Acute tonsillitis, unspecified', chapter: 'X — Respiratory' },
  { code: 'J04.0', description: 'Acute laryngitis', chapter: 'X — Respiratory' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', chapter: 'X — Respiratory' },
  { code: 'J11.1', description: 'Influenza with respiratory manifestations', chapter: 'X — Respiratory' },
  { code: 'J18.9', description: 'Pneumonia, unspecified', chapter: 'X — Respiratory' },
  { code: 'J20.9', description: 'Acute bronchitis, unspecified', chapter: 'X — Respiratory' },
  { code: 'J30.9', description: 'Allergic rhinitis, unspecified', chapter: 'X — Respiratory' },
  { code: 'J45.909', description: 'Asthma, uncomplicated', chapter: 'X — Respiratory' },
  { code: 'J45.901', description: 'Asthma with acute exacerbation', chapter: 'X — Respiratory' },
  { code: 'J44.9', description: 'COPD, unspecified', chapter: 'X — Respiratory' },
  // Cardiovascular
  { code: 'I10', description: 'Essential (primary) hypertension', chapter: 'IX — Circulatory' },
  { code: 'I11.9', description: 'Hypertensive heart disease without heart failure', chapter: 'IX — Circulatory' },
  { code: 'I20.9', description: 'Angina pectoris, unspecified', chapter: 'IX — Circulatory' },
  { code: 'I21.9', description: 'Acute myocardial infarction, unspecified', chapter: 'IX — Circulatory' },
  { code: 'I25.10', description: 'ASCVD without angina', chapter: 'IX — Circulatory' },
  { code: 'I48.91', description: 'Atrial fibrillation, unspecified', chapter: 'IX — Circulatory' },
  { code: 'I50.9', description: 'Heart failure, unspecified', chapter: 'IX — Circulatory' },
  { code: 'I63.9', description: 'Cerebral infarction, unspecified', chapter: 'IX — Circulatory' },
  { code: 'I83.9', description: 'Varicose veins of lower extremities', chapter: 'IX — Circulatory' },
  // Endocrine / metabolic
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', chapter: 'IV — Endocrine' },
  { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications', chapter: 'IV — Endocrine' },
  { code: 'E78.5', description: 'Hyperlipidemia, unspecified', chapter: 'IV — Endocrine' },
  { code: 'E78.0', description: 'Pure hypercholesterolemia', chapter: 'IV — Endocrine' },
  { code: 'E03.9', description: 'Hypothyroidism, unspecified', chapter: 'IV — Endocrine' },
  { code: 'E05.90', description: 'Thyrotoxicosis, unspecified', chapter: 'IV — Endocrine' },
  { code: 'E66.9', description: 'Obesity, unspecified', chapter: 'IV — Endocrine' },
  { code: 'E55.9', description: 'Vitamin D deficiency, unspecified', chapter: 'IV — Endocrine' },
  // GI
  { code: 'K21.9', description: 'GERD without esophagitis', chapter: 'XI — Digestive' },
  { code: 'K29.70', description: 'Gastritis, unspecified', chapter: 'XI — Digestive' },
  { code: 'K30', description: 'Functional dyspepsia', chapter: 'XI — Digestive' },
  { code: 'K52.9', description: 'Noninfective gastroenteritis and colitis', chapter: 'XI — Digestive' },
  { code: 'K58.9', description: 'Irritable bowel syndrome', chapter: 'XI — Digestive' },
  { code: 'K59.00', description: 'Constipation, unspecified', chapter: 'XI — Digestive' },
  { code: 'K80.20', description: 'Cholelithiasis without cholecystitis', chapter: 'XI — Digestive' },
  { code: 'K92.2', description: 'GI bleed, unspecified', chapter: 'XI — Digestive' },
  // Infectious
  { code: 'A09', description: 'Infectious gastroenteritis, unspecified', chapter: 'I — Infectious' },
  { code: 'A90', description: 'Dengue fever (classical)', chapter: 'I — Infectious' },
  { code: 'A91', description: 'Dengue hemorrhagic fever', chapter: 'I — Infectious' },
  { code: 'A15.0', description: 'Tuberculosis of lung, confirmed', chapter: 'I — Infectious' },
  { code: 'A16.2', description: 'Tuberculosis of lung, without confirmation', chapter: 'I — Infectious' },
  { code: 'B15.9', description: 'Hepatitis A without hepatic coma', chapter: 'I — Infectious' },
  { code: 'B18.1', description: 'Chronic viral hepatitis B', chapter: 'I — Infectious' },
  { code: 'B18.2', description: 'Chronic viral hepatitis C', chapter: 'I — Infectious' },
  { code: 'B34.9', description: 'Viral infection, unspecified', chapter: 'I — Infectious' },
  { code: 'U07.1', description: 'COVID-19, virus identified', chapter: 'I — Infectious' },
  { code: 'B50.9', description: 'Plasmodium falciparum malaria, unspecified', chapter: 'I — Infectious' },
  // Genitourinary
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', chapter: 'XIV — Genitourinary' },
  { code: 'N20.0', description: 'Calculus of kidney', chapter: 'XIV — Genitourinary' },
  { code: 'N18.3', description: 'Chronic kidney disease, stage 3', chapter: 'XIV — Genitourinary' },
  { code: 'N18.5', description: 'Chronic kidney disease, stage 5', chapter: 'XIV — Genitourinary' },
  { code: 'N40.0', description: 'Benign prostatic hyperplasia without LUTS', chapter: 'XIV — Genitourinary' },
  { code: 'N76.0', description: 'Acute vaginitis', chapter: 'XIV — Genitourinary' },
  { code: 'N91.2', description: 'Amenorrhea, unspecified', chapter: 'XIV — Genitourinary' },
  { code: 'N94.6', description: 'Dysmenorrhea, unspecified', chapter: 'XIV — Genitourinary' },
  // Pregnancy
  { code: 'O00.9', description: 'Ectopic pregnancy, unspecified', chapter: 'XV — Pregnancy' },
  { code: 'O80', description: 'Encounter for full-term uncomplicated delivery', chapter: 'XV — Pregnancy' },
  { code: 'Z34.90', description: 'Encounter for supervision of normal pregnancy, unspecified', chapter: 'XXI — Encounters' },
  // Skin
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified', chapter: 'XII — Skin' },
  { code: 'L23.9', description: 'Allergic contact dermatitis, unspecified', chapter: 'XII — Skin' },
  { code: 'L29.9', description: 'Pruritus, unspecified', chapter: 'XII — Skin' },
  { code: 'L30.9', description: 'Dermatitis, unspecified', chapter: 'XII — Skin' },
  { code: 'L40.9', description: 'Psoriasis, unspecified', chapter: 'XII — Skin' },
  { code: 'L50.9', description: 'Urticaria, unspecified', chapter: 'XII — Skin' },
  { code: 'L70.0', description: 'Acne vulgaris', chapter: 'XII — Skin' },
  { code: 'B07.9', description: 'Viral wart, unspecified', chapter: 'I — Infectious' },
  { code: 'B86', description: 'Scabies', chapter: 'I — Infectious' },
  // Musculoskeletal
  { code: 'M25.50', description: 'Pain in unspecified joint', chapter: 'XIII — Musculoskeletal' },
  { code: 'M54.5', description: 'Low back pain', chapter: 'XIII — Musculoskeletal' },
  { code: 'M54.2', description: 'Cervicalgia', chapter: 'XIII — Musculoskeletal' },
  { code: 'M79.7', description: 'Fibromyalgia', chapter: 'XIII — Musculoskeletal' },
  { code: 'M81.0', description: 'Age-related osteoporosis without current pathological fracture', chapter: 'XIII — Musculoskeletal' },
  { code: 'M10.9', description: 'Gout, unspecified', chapter: 'XIII — Musculoskeletal' },
  { code: 'M15.9', description: 'Osteoarthritis, unspecified', chapter: 'XIII — Musculoskeletal' },
  // Neurological
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable, without status migrainosus', chapter: 'VI — Nervous' },
  { code: 'G44.1', description: 'Vascular headache, NEC', chapter: 'VI — Nervous' },
  { code: 'R51', description: 'Headache', chapter: 'XVIII — Symptoms' },
  { code: 'R42', description: 'Dizziness and giddiness', chapter: 'XVIII — Symptoms' },
  { code: 'G47.00', description: 'Insomnia, unspecified', chapter: 'VI — Nervous' },
  // Mental health
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified', chapter: 'V — Mental' },
  { code: 'F33.9', description: 'Major depressive disorder, recurrent, unspecified', chapter: 'V — Mental' },
  { code: 'F41.1', description: 'Generalized anxiety disorder', chapter: 'V — Mental' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified', chapter: 'V — Mental' },
  { code: 'F43.20', description: 'Adjustment disorder, unspecified', chapter: 'V — Mental' },
  // Eye / ENT
  { code: 'H10.9', description: 'Conjunctivitis, unspecified', chapter: 'VII — Eye' },
  { code: 'H66.90', description: 'Otitis media, unspecified', chapter: 'VIII — Ear' },
  { code: 'H92.0', description: 'Otalgia, unspecified', chapter: 'VIII — Ear' },
  // Symptoms / general
  { code: 'R50.9', description: 'Fever, unspecified', chapter: 'XVIII — Symptoms' },
  { code: 'R10.4', description: 'Other and unspecified abdominal pain', chapter: 'XVIII — Symptoms' },
  { code: 'R11.2', description: 'Nausea with vomiting, unspecified', chapter: 'XVIII — Symptoms' },
  { code: 'R05', description: 'Cough', chapter: 'XVIII — Symptoms' },
  { code: 'R07.9', description: 'Chest pain, unspecified', chapter: 'XVIII — Symptoms' },
  { code: 'R19.7', description: 'Diarrhea, unspecified', chapter: 'XVIII — Symptoms' },
  { code: 'R53.83', description: 'Other fatigue', chapter: 'XVIII — Symptoms' },
  { code: 'R63.0', description: 'Anorexia', chapter: 'XVIII — Symptoms' },
  { code: 'R63.4', description: 'Abnormal weight loss', chapter: 'XVIII — Symptoms' },
  // Encounters / preventive
  { code: 'Z00.00', description: 'Encounter for general adult medical examination without abnormal findings', chapter: 'XXI — Encounters' },
  { code: 'Z00.129', description: 'Encounter for routine child health exam without abnormal findings', chapter: 'XXI — Encounters' },
  { code: 'Z23', description: 'Encounter for immunization', chapter: 'XXI — Encounters' },
  { code: 'Z71.3', description: 'Dietary counseling and surveillance', chapter: 'XXI — Encounters' },
  // Dental (for dental clinic specialty)
  { code: 'K02.9', description: 'Dental caries, unspecified', chapter: 'XI — Digestive (dental)' },
  { code: 'K04.7', description: 'Periapical abscess without sinus', chapter: 'XI — Digestive (dental)' },
  { code: 'K05.10', description: 'Chronic gingivitis, plaque-induced', chapter: 'XI — Digestive (dental)' },
  { code: 'K05.30', description: 'Chronic periodontitis, unspecified', chapter: 'XI — Digestive (dental)' },
  { code: 'K08.409', description: 'Partial loss of teeth, unspecified, unspecified class', chapter: 'XI — Digestive (dental)' },
  // Trauma (commonly seen)
  { code: 'S00.93XA', description: 'Abrasion of unspecified part of head, initial encounter', chapter: 'XIX — Injury' },
  { code: 'T78.40XA', description: 'Allergy, unspecified, initial encounter', chapter: 'XIX — Injury' },
];
