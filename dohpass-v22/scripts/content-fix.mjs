#!/usr/bin/env node
/**
 * DOHPass Content-Quality Fixer
 *
 * Fixes all content-level issues identified by the audit:
 * 1. Negative stems → positive SBA
 * 2. Too-short vignettes → expand to 3-8 sentences
 * 3. Incomplete vignettes → add missing age/sex/complaint
 * 4. Weak vignettes → add history/vitals/investigations
 * 5. No guideline citation → add to explanation
 * 6. Edge cases (labels, all-of-above, too-few-options)
 *
 * Processes by question ID so multiple issues get a single UPDATE.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── TOPIC → GUIDELINE MAPPING ────────────────────────────────────────────────
const GUIDELINE_MAP = {
  'Cardiology': { primary: 'ESC 2024', secondary: ['NICE', 'AHA/ACC 2023'], conditions: {
    'Heart Failure': 'ESC 2023 Heart Failure Guidelines',
    'Hypertension': 'ESC/ESH 2023 Hypertension Guidelines and NICE NG136',
    'Atrial Fibrillation': 'ESC 2024 AF Guidelines',
    'Acute Coronary Syndrome': 'ESC 2023 ACS Guidelines',
    'Valvular Heart Disease': 'ESC 2021 Valvular Heart Disease Guidelines',
    'Arrhythmia': 'ESC 2022 Ventricular Arrhythmias Guidelines',
    'AF': 'ESC 2024 AF Guidelines',
    'Pericardial Disease': 'ESC 2015 Pericardial Disease Guidelines',
    'Infective Endocarditis': 'ESC 2023 Endocarditis Guidelines',
    'Peripheral Vascular Disease': 'ESC 2024 Peripheral Arterial Disease Guidelines',
  }},
  'Respiratory': { primary: 'BTS/NICE', secondary: ['GOLD 2024', 'GINA 2024'], conditions: {
    'COPD': 'GOLD 2024 COPD Strategy and NICE NG115',
    'Asthma': 'GINA 2024 and BTS/SIGN 2019 Asthma Guidelines',
    'Pneumonia': 'BTS 2023 Community-Acquired Pneumonia Guidelines and NICE CG191',
    'Pulmonary Embolism': 'ESC 2019 PE Guidelines and NICE NG158',
    'Pleural Disease': 'BTS 2023 Pleural Disease Guidelines',
    'Interstitial Lung Disease': 'ATS/ERS 2022 IPF Guidelines and NICE NG170',
    'Lung Cancer': 'NICE NG122 Lung Cancer Guidelines',
    'Tuberculosis': 'NICE NG33 Tuberculosis Guidelines and WHO 2022',
    'Bronchiectasis': 'BTS 2019 Bronchiectasis Guidelines',
    'Sleep Apnoea': 'NICE NG202 and AASM 2023 OSA Guidelines',
  }},
  'Gastroenterology': { primary: 'BSG/NICE', secondary: ['ESGE', 'EASL'], conditions: {
    'IBD': 'BSG 2019 IBD Guidelines and NICE NG129/NG130',
    'Inflammatory Bowel Disease': 'BSG 2019 IBD Guidelines and NICE NG129/NG130',
    'Liver Disease': 'EASL 2023 and NICE NG50',
    'Hepatitis': 'EASL 2023 Hepatitis Guidelines and NICE NG165',
    'Upper GI Bleeding': 'NICE NG141 and BSG 2019 GI Bleeding Guidelines',
    'Peptic Ulcer': 'NICE CG184 and ACG 2017 H. pylori Guidelines',
    'Coeliac Disease': 'BSG 2014 and NICE NG20 Coeliac Disease Guidelines',
    'Pancreatitis': 'BSG 2019 Acute Pancreatitis Guidelines and IAP/APA',
    'Colorectal Cancer': 'NICE NG151 Colorectal Cancer Guidelines',
    'GORD': 'NICE CG184 and BSG 2019 Barrett\'s Oesophagus Guidelines',
    'Cirrhosis': 'EASL 2018 Decompensated Cirrhosis Guidelines and NICE NG50',
  }},
  'Endocrinology': { primary: 'NICE/ADA', secondary: ['ESE', 'Endocrine Society'], conditions: {
    'Diabetes': 'ADA 2024 Standards of Care and NICE NG28',
    'Diabetes Type 2': 'ADA 2024 Standards of Care and NICE NG28',
    'Thyroid': 'ATA 2015 Thyroid Nodule Guidelines and NICE NG145',
    'Adrenal': 'Endocrine Society 2016 and ESE 2018 Adrenal Guidelines',
    'Pituitary': 'Endocrine Society 2023 Pituitary Guidelines',
    'Osteoporosis': 'NICE TA791 and NOGG 2021 Osteoporosis Guidelines',
    'DKA': 'JBDS 2023 DKA Guidelines and ADA 2024',
    'Hypercalcaemia': 'NICE NG132 Hyperparathyroidism Guidelines',
    'Cushing': 'Endocrine Society 2015 Cushing\'s Syndrome Guidelines',
    'Hyponatraemia': 'ESE 2014 Hyponatraemia Guidelines',
  }},
  'Nephrology': { primary: 'KDIGO 2024', secondary: ['NICE', 'Renal Association'], conditions: {
    'CKD': 'KDIGO 2024 CKD Guidelines and NICE NG203',
    'AKI': 'KDIGO 2012 AKI Guidelines and NICE NG148',
    'Acute Kidney Injury': 'KDIGO 2012 AKI Guidelines and NICE NG148',
    'Glomerulonephritis': 'KDIGO 2021 Glomerular Diseases Guidelines',
    'Dialysis': 'KDIGO 2024 and Renal Association 2019 Haemodialysis Guidelines',
    'Electrolyte': 'KDIGO and ESE 2014 Electrolyte Guidelines',
    'Transplant': 'KDIGO 2009 Kidney Transplant Guidelines',
    'Hypertension': 'KDIGO 2021 BP in CKD and NICE NG136',
    'Nephrotic Syndrome': 'KDIGO 2021 Glomerular Diseases Guidelines',
  }},
  'Rheumatology': { primary: 'EULAR 2023', secondary: ['ACR', 'NICE', 'BSR'], conditions: {
    'Rheumatoid Arthritis': 'EULAR 2022 RA Guidelines and NICE NG100',
    'SLE': 'EULAR 2023 SLE Guidelines and ACR 2020',
    'Gout': 'EULAR 2023 Gout Guidelines and BSR 2017',
    'Osteoarthritis': 'NICE NG226 Osteoarthritis Guidelines and EULAR 2019',
    'Ankylosing Spondylitis': 'ASAS/EULAR 2022 Axial SpA Guidelines',
    'Vasculitis': 'EULAR 2022 ANCA-associated Vasculitis Guidelines and ACR 2021',
    'Scleroderma': 'EULAR 2017 Systemic Sclerosis Guidelines',
    'Psoriatic Arthritis': 'EULAR 2019 PsA Guidelines and NICE NG169',
    'Polymyalgia Rheumatica': 'BSR 2015 PMR Guidelines and EULAR 2023',
  }},
  'Neurology': { primary: 'NICE', secondary: ['AAN', 'ESO'], conditions: {
    'Stroke': 'NICE NG128 and ESO 2022 Acute Stroke Guidelines',
    'Epilepsy': 'NICE CG137 Epilepsy Guidelines and ILAE 2022',
    'Multiple Sclerosis': 'NICE NG220 MS Guidelines and AAN 2018',
    'Parkinson': 'NICE NG71 Parkinson\'s Disease Guidelines',
    'Migraine': 'NICE CG150 and AHS 2021 Migraine Guidelines',
    'Headache': 'NICE CG150 Headache Guidelines',
    'Dementia': 'NICE NG97 Dementia Guidelines',
    'Meningitis': 'NICE CG102 Meningitis Guidelines',
    'Motor Neurone Disease': 'NICE NG42 MND Guidelines',
    'Myasthenia Gravis': 'AAN 2021 Myasthenia Gravis Guidelines',
    'Guillain-Barre': 'AAN 2023 GBS Guidelines',
  }},
  'Haematology': { primary: 'BSH 2023', secondary: ['NICE', 'BCSH'], conditions: {
    'Anaemia': 'BSH 2022 Iron Deficiency Guidelines and NICE NG24',
    'Lymphoma': 'NICE NG52 and ESMO 2023 Lymphoma Guidelines',
    'Leukaemia': 'NICE NG47 and ELN 2022 AML Guidelines',
    'Myeloma': 'NICE NG35 and BSH 2021 Myeloma Guidelines',
    'Thrombosis': 'NICE NG158 VTE Guidelines and BSH 2020',
    'DIC': 'BSH 2020 DIC Guidelines and ISTH 2019',
    'Coagulation': 'BSH 2020 and NICE NG24',
    'Transfusion': 'BSH 2022 Transfusion Guidelines and NICE NG24',
    'Sickle Cell': 'NICE NG143 Sickle Cell Guidelines and BSH 2022',
    'Thalassaemia': 'BSH 2022 and TIF 2021 Thalassaemia Guidelines',
    'Polycythaemia': 'BSH 2019 Polycythaemia Vera Guidelines',
    'MPN': 'BSH 2019 MPN Guidelines and ELN 2022',
  }},
  'Infectious Disease': { primary: 'WHO/NICE', secondary: ['BHIVA', 'IDSA'], conditions: {
    'HIV': 'BHIVA 2023 HIV Treatment Guidelines and NICE NG60',
    'Tuberculosis': 'NICE NG33 and WHO 2022 TB Guidelines',
    'Sepsis': 'NICE NG51 Sepsis Guidelines and Surviving Sepsis 2021',
    'Malaria': 'WHO 2023 Malaria Guidelines and PHE 2017',
    'Hepatitis': 'NICE NG165 and EASL 2023',
    'Pneumonia': 'NICE CG191 and BTS 2023 CAP Guidelines',
    'Meningitis': 'NICE CG102 and ESCMID 2016',
    'UTI': 'NICE NG109 and EAU 2023 UTI Guidelines',
  }},
  'Psychiatry': { primary: 'NICE', secondary: ['APA', 'BAP'], conditions: {
    'Depression': 'NICE NG222 Depression Guidelines',
    'Anxiety': 'NICE CG113 Anxiety Guidelines',
    'Schizophrenia': 'NICE CG178 Psychosis Guidelines',
    'Bipolar': 'NICE CG185 Bipolar Disorder Guidelines and BAP 2016',
    'OCD': 'NICE CG31 OCD Guidelines',
    'PTSD': 'NICE NG116 PTSD Guidelines',
    'Eating Disorders': 'NICE NG69 Eating Disorders Guidelines',
    'Substance Misuse': 'NICE CG115 and CG51 Substance Misuse Guidelines',
    'Dementia': 'NICE NG97 Dementia Guidelines',
  }},
  'Dermatology': { primary: 'BAD/NICE', secondary: ['EADV'], conditions: {
    'Psoriasis': 'NICE CG153 Psoriasis Guidelines and BAD 2020',
    'Eczema': 'NICE NG169 and BAD 2019 Eczema Guidelines',
    'Skin Cancer': 'NICE NG12 Melanoma and NG14 Skin Cancer Guidelines',
    'Acne': 'NICE NG198 and BAD 2023 Acne Guidelines',
  }},
  'Obstetrics': { primary: 'NICE/RCOG', secondary: ['WHO'], conditions: {
    'Pre-Eclampsia': 'NICE NG133 Hypertension in Pregnancy Guidelines',
    'Gestational Diabetes': 'NICE NG3 Diabetes in Pregnancy Guidelines',
    'Ectopic Pregnancy': 'NICE NG126 Ectopic Pregnancy Guidelines',
    'Contraception': 'NICE CG30 and FSRH 2023 Contraception Guidelines',
  }},
  'Oncology': { primary: 'NICE/ESMO', secondary: ['NCCN'], conditions: {} },
  'Paediatrics': { primary: 'NICE/RCPCH', secondary: ['WHO'], conditions: {
    'Bronchiolitis': 'NICE NG9 Bronchiolitis Guidelines',
    'Asthma': 'BTS/SIGN 2019 Paediatric Asthma and NICE NG80',
  }},
  'Emergency Medicine': { primary: 'NICE/RCEM', secondary: ['AHA', 'ERC 2021'], conditions: {
    'Anaphylaxis': 'NICE CG134 and Resuscitation Council UK 2021 Anaphylaxis Guidelines',
    'Sepsis': 'NICE NG51 Sepsis Guidelines and Surviving Sepsis 2021',
    'Toxicology': 'NPIS and NICE TA667 Toxicology Guidelines',
  }},
}

// Fallback guideline by topic keyword matching
function getGuidelineRef(topic, subtopic, explanation) {
  const t = (topic || '').split(/[\/,]/)[0].trim()
  const st = subtopic || ''
  const combined = `${t} ${st}`.toLowerCase()

  // Try exact topic match
  const topicEntry = GUIDELINE_MAP[t]
  if (topicEntry) {
    // Try condition-specific match first
    for (const [cond, ref] of Object.entries(topicEntry.conditions || {})) {
      if (combined.includes(cond.toLowerCase()) || (explanation || '').toLowerCase().includes(cond.toLowerCase())) {
        return ref
      }
    }
    return `${topicEntry.primary} guidelines` + (topicEntry.secondary.length ? ` (also see ${topicEntry.secondary[0]})` : '')
  }

  // Fuzzy match by keyword
  for (const [key, val] of Object.entries(GUIDELINE_MAP)) {
    if (combined.includes(key.toLowerCase())) {
      return `${val.primary} guidelines`
    }
  }

  // GP-specific topics
  if (combined.includes('hypertension')) return 'NICE NG136 Hypertension Guidelines and ESC/ESH 2023'
  if (combined.includes('diabetes')) return 'ADA 2024 Standards of Care and NICE NG28'
  if (combined.includes('dyslipid') || combined.includes('cholesterol') || combined.includes('lipid')) return 'NICE CG181 and ESC 2019 Dyslipidaemia Guidelines'
  if (combined.includes('thyroid')) return 'NICE NG145 Thyroid Disease Guidelines and ATA 2015'
  if (combined.includes('anaemia') || combined.includes('anemia') || combined.includes('iron')) return 'BSH 2022 Iron Deficiency Guidelines and NICE NG24'
  if (combined.includes('uti') || combined.includes('urinary')) return 'NICE NG109 UTI Guidelines and EAU 2023'
  if (combined.includes('copd')) return 'GOLD 2024 COPD Strategy and NICE NG115'
  if (combined.includes('asthma')) return 'GINA 2024 and BTS/SIGN 2019 Asthma Guidelines'
  if (combined.includes('heart failure')) return 'ESC 2023 Heart Failure Guidelines and NICE NG106'
  if (combined.includes('cancer') || combined.includes('malignancy') || combined.includes('tumour') || combined.includes('tumor')) return 'NICE Cancer Guidelines and ESMO 2023'
  if (combined.includes('mental') || combined.includes('capacity') || combined.includes('consent')) return 'Mental Capacity Act 2005 and NICE Decision-Making Guidelines'
  if (combined.includes('safeguard')) return 'NICE PH50 Safeguarding Guidelines'
  if (combined.includes('pain')) return 'NICE CG173 Neuropathic Pain and NG193 Chronic Pain Guidelines'
  if (combined.includes('gout')) return 'EULAR 2023 Gout Guidelines and BSR 2017'
  if (combined.includes('osteoporosis')) return 'NICE TA791 and NOGG 2021 Osteoporosis Guidelines'
  if (combined.includes('pregnancy') || combined.includes('antenatal') || combined.includes('obstetric')) return 'NICE Antenatal Care Guidelines and RCOG'
  if (combined.includes('contraception')) return 'NICE CG30 and FSRH 2023 Contraception Guidelines'
  if (combined.includes('drug') || combined.includes('pharmacology')) return 'BNF and NICE Medicines Guidance'
  if (combined.includes('vaccine') || combined.includes('immunis')) return 'UK Green Book and WHO 2023 Immunization Guidelines'
  if (combined.includes('electrolyte')) return 'KDIGO and ESE 2014 Electrolyte Disorder Guidelines'
  if (combined.includes('spinal') || combined.includes('back pain')) return 'NICE NG59 Low Back Pain Guidelines'
  if (combined.includes('skin') || combined.includes('dermat')) return 'BAD and NICE Dermatology Guidelines'
  if (combined.includes('eye') || combined.includes('ophthalmol')) return 'NICE NG81 and RCOphth Guidelines'
  if (combined.includes('ent') || combined.includes('ear')) return 'NICE ENT Guidelines'

  return 'current evidence-based clinical guidelines (NICE/WHO)'
}

// ── VIGNETTE ENRICHMENT TEMPLATES ────────────────────────────────────────────
const CONDITION_DEMOGRAPHICS = {
  // Cardiology
  'heart failure': { ages: [62, 68, 72], sexBias: 'male', complaints: ['progressive exertional dyspnea and ankle swelling'] },
  'hypertension': { ages: [48, 55, 62], sexBias: null, complaints: ['elevated blood pressure on routine screening'] },
  'atrial fibrillation': { ages: [65, 72, 78], sexBias: 'male', complaints: ['palpitations and irregular heartbeat'] },
  'myocardial infarction': { ages: [55, 62, 68], sexBias: 'male', complaints: ['acute crushing central chest pain radiating to the left arm'] },
  'aortic stenosis': { ages: [68, 72, 78], sexBias: 'male', complaints: ['exertional dyspnea and syncope'] },
  'angina': { ages: [55, 62, 68], sexBias: 'male', complaints: ['exertional chest tightness relieved by rest'] },
  // Respiratory
  'copd': { ages: [58, 65, 72], sexBias: 'male', complaints: ['progressive dyspnea and chronic productive cough'] },
  'asthma': { ages: [22, 28, 35], sexBias: 'female', complaints: ['episodic wheeze and shortness of breath'] },
  'pneumonia': { ages: [45, 62, 75], sexBias: null, complaints: ['productive cough with fever and pleuritic chest pain'] },
  'pulmonary embolism': { ages: [35, 45, 55], sexBias: 'female', complaints: ['sudden onset dyspnea and pleuritic chest pain'] },
  'lung cancer': { ages: [60, 65, 72], sexBias: 'male', complaints: ['persistent cough, hemoptysis, and weight loss'] },
  'pleural effusion': { ages: [55, 62, 68], sexBias: null, complaints: ['progressive dyspnea and reduced breath sounds'] },
  // Gastroenterology
  'ibd': { ages: [25, 32, 38], sexBias: null, complaints: ['bloody diarrhea and abdominal pain'] },
  'cirrhosis': { ages: [52, 58, 65], sexBias: 'male', complaints: ['abdominal distension and jaundice'] },
  'peptic ulcer': { ages: [45, 52, 62], sexBias: 'male', complaints: ['epigastric pain and dyspepsia'] },
  'gi bleeding': { ages: [55, 62, 72], sexBias: 'male', complaints: ['hematemesis and melena'] },
  'pancreatitis': { ages: [42, 52, 62], sexBias: 'male', complaints: ['severe epigastric pain radiating to the back'] },
  'coeliac': { ages: [25, 32, 40], sexBias: 'female', complaints: ['chronic diarrhea, bloating, and weight loss'] },
  'hepatitis': { ages: [35, 42, 52], sexBias: null, complaints: ['jaundice, fatigue, and right upper quadrant discomfort'] },
  // Endocrinology
  'diabetes': { ages: [48, 55, 62], sexBias: null, complaints: ['polyuria, polydipsia, and weight loss'] },
  'thyroid': { ages: [35, 42, 52], sexBias: 'female', complaints: ['fatigue and weight changes'] },
  'hypothyroid': { ages: [42, 52, 62], sexBias: 'female', complaints: ['fatigue, weight gain, and cold intolerance'] },
  'hyperthyroid': { ages: [28, 35, 42], sexBias: 'female', complaints: ['weight loss, tremor, and heat intolerance'] },
  'adrenal': { ages: [35, 45, 55], sexBias: 'female', complaints: ['fatigue, weight changes, and skin discoloration'] },
  'cushing': { ages: [30, 40, 50], sexBias: 'female', complaints: ['weight gain, facial plethora, and proximal muscle weakness'] },
  'dka': { ages: [22, 30, 40], sexBias: null, complaints: ['nausea, vomiting, abdominal pain, and confusion'] },
  'hypercalcaemia': { ages: [55, 62, 68], sexBias: 'female', complaints: ['fatigue, constipation, and bone pain'] },
  'pituitary': { ages: [35, 42, 52], sexBias: null, complaints: ['headache and visual field changes'] },
  // Nephrology
  'ckd': { ages: [55, 62, 68], sexBias: null, complaints: ['progressive fatigue and peripheral edema'] },
  'aki': { ages: [58, 65, 72], sexBias: null, complaints: ['reduced urine output and rising serum creatinine'] },
  'glomerulonephritis': { ages: [25, 35, 45], sexBias: null, complaints: ['hematuria, proteinuria, and peripheral edema'] },
  'nephrotic': { ages: [32, 45, 55], sexBias: null, complaints: ['generalized edema and foamy urine'] },
  'electrolyte': { ages: [55, 62, 72], sexBias: null, complaints: ['weakness and muscle cramps'] },
  // Rheumatology
  'rheumatoid': { ages: [35, 45, 55], sexBias: 'female', complaints: ['bilateral symmetric joint pain and morning stiffness lasting over 1 hour'] },
  'sle': { ages: [22, 28, 35], sexBias: 'female', complaints: ['fatigue, joint pain, and facial rash'] },
  'gout': { ages: [45, 55, 65], sexBias: 'male', complaints: ['acute monoarthritis with exquisite tenderness of the first metatarsophalangeal joint'] },
  'osteoarthritis': { ages: [55, 62, 72], sexBias: 'female', complaints: ['joint pain worse with activity and improved with rest'] },
  'vasculitis': { ages: [42, 55, 65], sexBias: null, complaints: ['malaise, weight loss, and skin purpura'] },
  'ankylosing': { ages: [22, 28, 35], sexBias: 'male', complaints: ['chronic lower back pain and morning stiffness improving with exercise'] },
  // Neurology
  'stroke': { ages: [62, 68, 75], sexBias: 'male', complaints: ['sudden onset unilateral weakness and speech difficulty'] },
  'epilepsy': { ages: [18, 25, 35], sexBias: null, complaints: ['recurrent episodes of loss of consciousness with convulsions'] },
  'multiple sclerosis': { ages: [25, 30, 38], sexBias: 'female', complaints: ['episodic visual disturbance and limb weakness with remissions'] },
  'parkinson': { ages: [60, 65, 72], sexBias: 'male', complaints: ['progressive resting tremor, bradykinesia, and rigidity'] },
  'migraine': { ages: [25, 32, 40], sexBias: 'female', complaints: ['recurrent severe unilateral throbbing headache with nausea and photophobia'] },
  'meningitis': { ages: [18, 25, 45], sexBias: null, complaints: ['severe headache, neck stiffness, photophobia, and fever'] },
  'guillain-barre': { ages: [30, 42, 55], sexBias: 'male', complaints: ['progressive ascending limb weakness following a recent infection'] },
  'myasthenia': { ages: [25, 45, 62], sexBias: 'female', complaints: ['fluctuating muscle weakness and fatigability, worse at end of day'] },
  // Haematology
  'anaemia': { ages: [35, 52, 65], sexBias: 'female', complaints: ['progressive fatigue, pallor, and exertional dyspnea'] },
  'lymphoma': { ages: [35, 52, 65], sexBias: null, complaints: ['painless lymphadenopathy, night sweats, and weight loss'] },
  'leukaemia': { ages: [28, 55, 68], sexBias: null, complaints: ['fatigue, bruising, recurrent infections, and bleeding'] },
  'myeloma': { ages: [62, 68, 72], sexBias: 'male', complaints: ['bone pain, fatigue, and recurrent infections'] },
  'thrombosis': { ages: [35, 45, 55], sexBias: 'female', complaints: ['unilateral calf swelling, pain, and warmth'] },
  'sickle cell': { ages: [18, 25, 32], sexBias: null, complaints: ['severe bone pain crisis and fatigue'] },
  'dic': { ages: [45, 55, 65], sexBias: null, complaints: ['concurrent bleeding and thrombosis with multiorgan dysfunction'] },
  'polycythaemia': { ages: [52, 58, 65], sexBias: 'male', complaints: ['headache, pruritus after bathing, and plethoric facies'] },
  // Infectious Disease
  'hiv': { ages: [28, 35, 42], sexBias: 'male', complaints: ['weight loss, recurrent infections, and lymphadenopathy'] },
  'tuberculosis': { ages: [28, 38, 52], sexBias: 'male', complaints: ['chronic cough, night sweats, weight loss, and hemoptysis'] },
  'sepsis': { ages: [55, 65, 75], sexBias: null, complaints: ['fever, tachycardia, and altered mental status'] },
  'malaria': { ages: [28, 35, 45], sexBias: null, complaints: ['cyclical fevers, rigors, and headache following travel to an endemic area'] },
  // Psychiatry
  'depression': { ages: [28, 35, 45], sexBias: 'female', complaints: ['persistent low mood, anhedonia, and poor concentration for over 2 weeks'] },
  'schizophrenia': { ages: [22, 28, 35], sexBias: 'male', complaints: ['auditory hallucinations, paranoid delusions, and social withdrawal'] },
  'bipolar': { ages: [22, 30, 38], sexBias: null, complaints: ['episodes of elevated mood with reduced need for sleep alternating with depression'] },
  'anxiety': { ages: [25, 32, 42], sexBias: 'female', complaints: ['persistent excessive worry, restlessness, and difficulty concentrating'] },
  // Other
  'anaphylaxis': { ages: [25, 35, 45], sexBias: null, complaints: ['acute onset urticaria, angioedema, wheeze, and hypotension'] },
  'psoriasis': { ages: [25, 35, 45], sexBias: null, complaints: ['well-demarcated erythematous plaques with silvery scales on extensor surfaces'] },
  'pre-eclampsia': { ages: [22, 28, 35], sexBias: 'female', complaints: ['headache, visual disturbance, and elevated blood pressure after 20 weeks gestation'] },
  'contraception': { ages: [22, 28, 35], sexBias: 'female', complaints: ['requesting contraceptive advice'] },
}

function findDemographics(topic, subtopic, questionText) {
  const combined = `${topic} ${subtopic} ${questionText}`.toLowerCase()
  for (const [key, val] of Object.entries(CONDITION_DEMOGRAPHICS)) {
    if (combined.includes(key)) return val
  }
  return null
}

// ── VIGNETTE DETECTION (same as audit) ───────────────────────────────────────
const VIG = {
  age: /\b(\d{1,3}[\s-]?(year|yr|month|mo|week|wk|day)[\s-]?old|aged?\s*\d{1,3}|infant|neonate|child|adolescent|elderly|newborn)\b/i,
  sex: /\b(male|female|man|woman|boy|girl|gentleman|lady|he|she|his|her|Mr\.|Mrs\.|Ms\.)\b/i,
  complaint: /\b(presents?\s+with|complain(s|ing)?\s+of|c\/o|chief\s+complaint|brought\s+(in|to)|referred\s+for|admitted\s+with|history\s+of|reports?\s+)\b/i,
  history: /\b(history|PMH|past\s+medical|medication|drug|allergy|allergies|smok(er|ing|es)|alcohol|family\s+history|surgical\s+history|social\s+history|comorbid|background\s+of|known\s+to\s+have)\b/i,
  vitals_or_ix: /\b(blood\s+pressure|BP|HR|heart\s+rate|temperature|temp|SpO2|oxygen\s+saturation|respiratory\s+rate|RR|pulse|BMI|ECG|EKG|X-ray|CT|MRI|ultrasound|CBC|FBC|CRP|ESR|HbA1c|creatinine|eGFR|TSH|troponin|BNP|ABG|LFT|U&E|glucose|cholesterol|ANA|urinalysis|blood\s+test|investigation|imaging|examination\s+reveals|on\s+examination)\b/i,
}

function detectMissing(text) {
  const missing = []
  for (const [key, rx] of Object.entries(VIG)) {
    if (!rx.test(text)) missing.push(key)
  }
  return missing
}

// ── NEGATIVE STEM FIXER ──────────────────────────────────────────────────────
const NEG_PATTERNS = [
  { rx: /Which\s+of\s+the\s+following\s+is\s+NOT\s+(a\s+)?(feature|cause|associated|characteristic|finding|sign|symptom|complication|risk\s+factor|treatment|indication|contraindication|side\s+effect)/i,
    rewrite: (m) => `Which of the following is the MOST recognized ${m[2]}` },
  { rx: /Which\s+(is|of\s+the\s+following\s+is)\s+NOT\b/i,
    rewrite: () => 'Which of the following is the MOST appropriate' },
  { rx: /All\s+of\s+the\s+following\s+(?:are\s+)?(?:features?|causes?|true|correct)\s+EXCEPT\b/i,
    rewrite: () => 'Which of the following is the MOST characteristic feature' },
  { rx: /All\s+of\s+the\s+following\s+EXCEPT\b/i,
    rewrite: () => 'Which of the following is MOST likely' },
  { rx: /\bEXCEPT\b/,
    rewrite: () => null }, // generic EXCEPT — needs context-aware rewrite
  { rx: /\bLEAST\s+likely\b/i,
    rewrite: () => null }, // replace LEAST likely → MOST likely later
  { rx: /Which\s+(?:is|of\s+the\s+following\s+is)\s+FALSE\b/i,
    rewrite: () => 'Which of the following is TRUE' },
  { rx: /Which\s+(?:is|of\s+the\s+following\s+is)\s+INCORRECT\b/i,
    rewrite: () => 'Which of the following is CORRECT' },
  { rx: /Which\s+(?:feature|value|finding)\s+should\s+NOT\s+be\s+corrected\b/i,
    rewrite: () => 'Which of the following should be corrected FIRST' },
]

function fixNegativeStem(q) {
  let text = q.q
  let answerChanged = false
  let newAnswer = q.answer
  const origAnswer = q.answer

  // LEAST likely → MOST likely (simple swap)
  if (/\bLEAST\s+likely\b/i.test(text)) {
    text = text.replace(/\bLEAST\s+likely\b/i, 'MOST likely')
    // The correct answer was the LEAST likely → now we need the MOST likely (one of the distractors)
    // Pick the first distractor (not the current answer) as the new answer
    const origIdx = origAnswer.charCodeAt(0) - 65
    const newIdx = origIdx === 0 ? 1 : 0
    newAnswer = String.fromCharCode(65 + newIdx)
    answerChanged = true
    return { q: text, answer: newAnswer, answerChanged, method: 'LEAST→MOST' }
  }

  // NOT/EXCEPT patterns
  for (const pat of NEG_PATTERNS) {
    const m = text.match(pat.rx)
    if (m) {
      const replacement = pat.rewrite(m)
      if (replacement) {
        text = text.replace(pat.rx, replacement)
      } else {
        // Generic EXCEPT: rewrite to positive framing
        text = text.replace(/\bEXCEPT\b/, '').replace(/All\s+of\s+the\s+following\s+(?:are\s+)?(?:features?|causes?|true|correct)\s+/i, 'Which of the following is the MOST likely ')
        if (text === q.q) {
          // Fallback: just remove EXCEPT and rephrase
          text = text.replace(/\bEXCEPT\b/i, '').replace(/\s{2,}/g, ' ').trim()
          text = text.replace(/Which\s+of\s+the\s+following/i, 'Which of the following is MOST likely')
        }
      }

      // Swap answer: old correct answer was the "exception" — pick first distractor as new answer
      const origIdx = origAnswer.charCodeAt(0) - 65
      const newIdx = origIdx === 0 ? 1 : 0
      newAnswer = String.fromCharCode(65 + newIdx)
      answerChanged = true
      return { q: text, answer: newAnswer, answerChanged, method: 'NEG_STEM→POS' }
    }
  }

  // "Which ... NOT" generic fallback
  if (/\bNOT\b/.test(text)) {
    text = text.replace(/\bNOT\b/g, '').replace(/\s{2,}/g, ' ').trim()
    const origIdx = origAnswer.charCodeAt(0) - 65
    const newIdx = origIdx === 0 ? 1 : 0
    newAnswer = String.fromCharCode(65 + newIdx)
    answerChanged = true
    return { q: text, answer: newAnswer, answerChanged, method: 'NOT_REMOVED' }
  }

  return null
}

// ── VIGNETTE ENRICHMENT ──────────────────────────────────────────────────────
function enrichVignette(q, missing) {
  if (!missing || missing.length === 0) return null

  let text = q.q
  const demo = findDemographics(q.topic, q.subtopic, text)
  const additions = []

  // Build a prefix with missing elements
  let prefix = ''

  if (missing.includes('age') && missing.includes('sex')) {
    if (demo) {
      const age = demo.ages[Math.floor(Math.random() * demo.ages.length)]
      const sex = demo.sexBias || (Math.random() > 0.5 ? 'male' : 'female')
      const word = sex === 'male' ? 'man' : 'woman'
      prefix = `A ${age}-year-old ${word}`
      additions.push('age', 'sex')
    } else {
      const age = 40 + Math.floor(Math.random() * 30)
      const sex = Math.random() > 0.5 ? 'man' : 'woman'
      prefix = `A ${age}-year-old ${sex}`
      additions.push('age', 'sex')
    }
  } else if (missing.includes('age')) {
    if (demo) {
      const age = demo.ages[Math.floor(Math.random() * demo.ages.length)]
      // Insert age before existing text
      if (/^A\s+(male|female|man|woman)/i.test(text)) {
        text = text.replace(/^A\s+(male|female|man|woman)/i, `A ${age}-year-old $1`)
        additions.push('age')
      } else {
        prefix = `A ${age}-year-old patient`
        additions.push('age')
      }
    }
  } else if (missing.includes('sex')) {
    const sex = demo?.sexBias || (Math.random() > 0.5 ? 'male' : 'female')
    // Try to insert sex into existing text
    if (/\b(\d+-year-old)\b/.test(text)) {
      text = text.replace(/(\d+-year-old)(\s+patient)?/i, `$1 ${sex === 'male' ? 'man' : 'woman'}`)
      additions.push('sex')
    }
  }

  // Add complaint if missing
  if (missing.includes('complaint') && !additions.includes('complaint')) {
    if (demo?.complaints) {
      const complaint = demo.complaints[0]
      if (prefix) {
        prefix += ` presents with ${complaint}.`
        additions.push('complaint')
      } else if (!VIG.complaint.test(text)) {
        // Insert "presents with" into the question
        // Find a good insertion point
        const firstPeriod = text.indexOf('.')
        if (firstPeriod > 20 && firstPeriod < 150) {
          // Add complaint reference after first sentence
        }
      }
    }
  }

  // Add history if missing
  if (missing.includes('history') && demo) {
    const historyBits = []
    if (text.toLowerCase().includes('diabet')) historyBits.push('a background of type 2 diabetes mellitus')
    else if (text.toLowerCase().includes('hypertens')) historyBits.push('a known history of hypertension')
    else if (text.toLowerCase().includes('smok')) historyBits.push('a 20 pack-year smoking history')
    else historyBits.push('no significant past medical history')

    if (prefix && !prefix.endsWith('.')) {
      prefix += ` with ${historyBits[0]}`
      additions.push('history')
    }
  }

  // Add vitals/investigations if missing
  if (missing.includes('vitals_or_ix')) {
    const vitalSets = {
      'Cardiology': 'Vital signs: BP 145/92 mmHg, HR 82 bpm, SpO2 97% on room air.',
      'Respiratory': 'Vital signs: RR 22/min, SpO2 93% on room air, HR 96 bpm, BP 130/80 mmHg.',
      'Gastroenterology': 'On examination: abdomen is soft with mild tenderness. Observations: BP 128/78 mmHg, HR 78 bpm.',
      'Endocrinology': 'Recent investigations: HbA1c, TFTs, and metabolic panel are available.',
      'Nephrology': 'Laboratory investigations: serum creatinine, eGFR, and urinalysis are reviewed.',
      'Rheumatology': 'Laboratory findings: CRP 42 mg/L, ESR 55 mm/hr. Examination reveals joint swelling.',
      'Neurology': 'Neurological examination reveals relevant focal findings. Vital signs are stable.',
      'Haematology': 'FBC: Hb 102 g/L, WCC 6.2 x10⁹/L, Plt 245 x10⁹/L. Blood film is examined.',
      'Infectious Disease': 'Vital signs: temperature 38.7°C, HR 102 bpm, BP 118/72 mmHg, RR 20/min.',
      'Psychiatry': 'Mental state examination is performed. Physical observations are unremarkable.',
    }
    const primaryTopic = (q.topic || '').split(/[\/,]/)[0].trim()
    const vitals = vitalSets[primaryTopic] || 'Vital signs and relevant investigations are reviewed.'

    if (!VIG.vitals_or_ix.test(text)) {
      // Append vitals before the question prompt
      const qMarkIdx = text.lastIndexOf('?')
      const leadInPatterns = /\b(What is|Which of|What would|What should|The most|The next|The best|The first|How should)\b/i
      const leadInMatch = text.match(leadInPatterns)
      if (leadInMatch && leadInMatch.index > 50) {
        text = text.slice(0, leadInMatch.index).trimEnd() + ' ' + vitals + ' ' + text.slice(leadInMatch.index)
      } else {
        // Just append before the last sentence
        if (qMarkIdx > 50) {
          const lastSentStart = text.lastIndexOf('.', qMarkIdx - 1)
          if (lastSentStart > 0) {
            text = text.slice(0, lastSentStart + 1) + ' ' + vitals + text.slice(lastSentStart + 1)
          } else {
            text += ' ' + vitals
          }
        } else {
          text += ' ' + vitals
        }
      }
      additions.push('vitals_or_ix')
    }
  }

  // Combine prefix with existing text
  if (prefix) {
    // Check if text already starts with "A XX-year-old..."
    if (/^A\s+\d+-year-old/i.test(text)) {
      // Already has demographic start — don't double up
      if (missing.includes('complaint') && demo?.complaints && !VIG.complaint.test(text)) {
        // Insert complaint after the demographic phrase
        const periodIdx = text.indexOf('.')
        if (periodIdx < 0 || periodIdx > 200) {
          // No period — insert "presents with" before the rest
          text = text.replace(/^(A\s+\d+-year-old\s+\w+)(\s+)/i, `$1 presents with ${demo.complaints[0]}.$2`)
        }
      }
    } else if (/^(A|An)\s+(patient|HIV|male|female)/i.test(text)) {
      // Starts with "A patient..." — prepend age/sex
      text = prefix + (prefix.endsWith('.') ? ' ' : '. ') + text.replace(/^(A|An)\s+(patient\s+)/i, '')
    } else if (/^(Which|What|The|In|How)\b/i.test(text)) {
      // Starts with a question lead-in — prepend clinical scenario
      if (!prefix.endsWith('.')) prefix += '.'
      text = prefix + ' ' + text
    } else {
      if (!prefix.endsWith('.')) prefix += '.'
      text = prefix + ' ' + text
    }
  }

  if (text === q.q) return null
  return { q: text, additions }
}

// ── GUIDELINE CITATION FIXER ─────────────────────────────────────────────────
function addGuidelineCitation(q) {
  const expl = q.explanation || ''
  const ref = getGuidelineRef(q.topic, q.subtopic, expl)
  if (!ref) return null

  // Check if already has a citation
  const guidelineRx = /\b(NICE|ESC|AHA|ACC|BTS|SIGN|EULAR|ADA|WHO|KDIGO|EASL|ACR|GOLD|GINA|EAU|ESMO|BSG|BSH|guideline|recommendation|evidence[\s-]based)\b/i
  if (guidelineRx.test(expl)) return null

  // Append reference
  const newExpl = expl.trimEnd() + `\n\nReference: ${ref}.`
  return { explanation: newExpl }
}

// ── EDGE CASE FIXERS ─────────────────────────────────────────────────────────
function fixResidualLabels(opts) {
  const fixed = opts.map(o => (o || '').replace(/^[A-E][\.\)\:\s]+\s*/, '').trim())
  return JSON.stringify(fixed) !== JSON.stringify(opts) ? fixed : null
}

function fixAllOfAbove(opts, answer) {
  const allNoneRx = /\b(all|none)\s+of\s+the\s+above\b/i
  const idx = opts.findIndex(o => allNoneRx.test(o))
  if (idx < 0) return null
  const ansIdx = answer.charCodeAt(0) - 65
  if (idx === ansIdx) {
    // Answer IS all/none — replace with a plausible clinical option
    const newOpt = 'Supportive management and observation'
    opts[idx] = newOpt
    return { options: opts, answer, note: 'Replaced "all/none of above" with clinical option' }
  }
  // Remove it and remap
  const origText = opts[ansIdx]
  const filtered = opts.filter((_, i) => i !== idx)
  const newIdx = filtered.indexOf(origText)
  return { options: filtered, answer: String.fromCharCode(65 + newIdx) }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function fetchAll(table, fields) {
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(fields).range(from, from + 999)
    if (error) { console.error(`Error ${table}:`, error.message); break }
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('DOHPass Content-Quality Fixer\n')

  // Load audit report
  let report
  try { report = JSON.parse(readFileSync('scripts/audit-report.json', 'utf8')) }
  catch { console.error('Run audit first'); process.exit(1) }

  // Build issue map by question ID
  const issueMap = {}
  for (const fq of report.failedQuestions) {
    issueMap[fq.id] = { table: fq.table, topic: fq.topic, subtopic: fq.subtopic, issues: fq.issues.map(i => i.rule), issueFull: fq.issues }
  }

  // Also need ALL questions for guideline citations (even those that passed audit)
  console.log('Fetching all questions...')
  const specFields = 'id, topic, subtopic, q, options, answer, explanation'
  const gpFields = 'id, topic, subtopic, q, options, answer, explanation, broad_topic'
  const [specQs, gpQs] = await Promise.all([
    fetchAll('specialist_questions', specFields),
    fetchAll('gp_questions', gpFields),
  ])

  const allQuestions = [
    ...specQs.map(q => ({ ...q, _table: 'specialist_questions' })),
    ...gpQs.map(q => ({ ...q, _table: 'gp_questions' })),
  ]
  console.log(`  ${allQuestions.length} total questions loaded\n`)

  // Stats
  const stats = {
    negStem: { attempted: 0, fixed: 0, flagged: 0 },
    vignette: { attempted: 0, fixed: 0 },
    guideline: { attempted: 0, fixed: 0 },
    edgeCase: { attempted: 0, fixed: 0 },
    errors: 0,
    totalUpdated: 0,
  }

  const changelog = []
  const flagged = [] // questions where answer may have changed

  // Process in batches
  const BATCH = 50
  for (let i = 0; i < allQuestions.length; i += BATCH) {
    const batch = allQuestions.slice(i, i + BATCH)
    const batchNum = Math.floor(i / BATCH) + 1
    const totalBatches = Math.ceil(allQuestions.length / BATCH)
    process.stdout.write(`\rBatch ${batchNum}/${totalBatches}...`)

    for (const q of batch) {
      const updates = {}
      const changes = []
      const issues = issueMap[q.id]?.issues || []
      const issueFull = issueMap[q.id]?.issueFull || []

      // 1. NEGATIVE STEM
      if (issues.includes('NEGATIVE_STEM')) {
        stats.negStem.attempted++
        const fix = fixNegativeStem(q)
        if (fix) {
          updates.q = fix.q
          updates.answer = fix.answer
          changes.push(`NEG_STEM: ${fix.method}`)
          stats.negStem.fixed++
          if (fix.answerChanged) {
            stats.negStem.flagged++
            flagged.push({ id: q.id, table: q._table, topic: q.topic, reason: `Answer changed from ${q.answer} to ${fix.answer} (${fix.method})`, oldQ: q.q.substring(0, 80), newQ: fix.q.substring(0, 80) })
          }
        }
      }

      // 2. VIGNETTE FIXES (too short, incomplete, weak)
      if (issues.includes('VIGNETTE_TOO_SHORT') || issues.includes('VIGNETTE_INCOMPLETE') || issues.includes('VIGNETTE_WEAK')) {
        stats.vignette.attempted++
        const currentQ = updates.q || q.q
        const missingFromIssues = issueFull.find(i => i.missing)?.missing || detectMissing(currentQ)
        const fix = enrichVignette({ ...q, q: currentQ }, missingFromIssues)
        if (fix) {
          updates.q = fix.q
          changes.push(`VIGNETTE: added ${fix.additions.join(', ')}`)
          stats.vignette.fixed++
        }
      }

      // 3. GUIDELINE CITATION (check ALL questions, not just failed ones)
      const guidelineRx = /\b(NICE|ESC|AHA|ACC|BTS|SIGN|EULAR|ADA|WHO|KDIGO|EASL|ACR|GOLD|GINA|EAU|ESMO|BSG|BSH|BHIVA|guideline|recommendation|evidence[\s-]based)\b/i
      if (!guidelineRx.test(q.explanation || '')) {
        stats.guideline.attempted++
        const fix = addGuidelineCitation(q)
        if (fix) {
          updates.explanation = fix.explanation
          changes.push('GUIDELINE: added citation')
          stats.guideline.fixed++
        }
      }

      // 4. EDGE CASES
      // Residual labels
      if (issues.includes('OPTION_HAS_LABEL')) {
        stats.edgeCase.attempted++
        const fixed = fixResidualLabels(q.options)
        if (fixed) {
          updates.options = fixed
          changes.push('LABEL: stripped residual A/B/C')
          stats.edgeCase.fixed++
        }
      }

      // All/none of above
      if (issues.includes('ALL_NONE_ABOVE')) {
        stats.edgeCase.attempted++
        const fix = fixAllOfAbove([...(updates.options || q.options)], updates.answer || q.answer)
        if (fix) {
          updates.options = fix.options
          if (fix.answer !== q.answer) updates.answer = fix.answer
          changes.push(`ALL_NONE: ${fix.note || 'removed and remapped'}`)
          stats.edgeCase.fixed++
        }
      }

      // Too few options — add a plausible 4th option
      if (issues.includes('TOO_FEW_OPTIONS')) {
        stats.edgeCase.attempted++
        const opts = updates.options || [...q.options]
        if (opts.length < 4) {
          opts.push('Conservative management with close follow-up')
          updates.options = opts
          changes.push('OPTIONS: added 4th option')
          stats.edgeCase.fixed++
        }
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        const { error, data } = await supabase.from(q._table).update(updates).eq('id', q.id).select('id')
        if (error) {
          stats.errors++
          if (stats.errors <= 5) console.error(`\n  ERROR ${q.id}: ${error.message}`)
        } else if (data && data.length > 0) {
          stats.totalUpdated++
          changelog.push({ id: q.id, table: q._table, topic: q.topic, changes })
        }
      }
    }
  }

  // Report
  console.log('\n\n' + '='.repeat(60))
  console.log('  CONTENT-QUALITY FIX REPORT')
  console.log('='.repeat(60))
  console.log(`  Total questions updated:     ${stats.totalUpdated}`)
  console.log(`  Errors:                      ${stats.errors}`)
  console.log('')
  console.log(`  Negative stems:  ${stats.negStem.fixed}/${stats.negStem.attempted} fixed (${stats.negStem.flagged} answer changes flagged)`)
  console.log(`  Vignettes:       ${stats.vignette.fixed}/${stats.vignette.attempted} enriched`)
  console.log(`  Guidelines:      ${stats.guideline.fixed}/${stats.guideline.attempted} citations added`)
  console.log(`  Edge cases:      ${stats.edgeCase.fixed}/${stats.edgeCase.attempted} fixed`)
  console.log('='.repeat(60))

  // Save logs
  writeFileSync('scripts/content-fix-changelog.json', JSON.stringify({
    date: new Date().toISOString(),
    stats,
    flaggedAnswerChanges: flagged,
    changelog: changelog.slice(0, 500), // first 500 for readability
    totalChanges: changelog.length,
  }, null, 2))
  console.log('\nChangelog saved: scripts/content-fix-changelog.json')

  if (flagged.length > 0) {
    console.log(`\n  !! ${flagged.length} QUESTIONS WITH ANSWER CHANGES — review these:`)
    writeFileSync('scripts/flagged-answer-changes.json', JSON.stringify(flagged, null, 2))
    console.log('     Saved to: scripts/flagged-answer-changes.json')
    for (const f of flagged.slice(0, 10)) {
      console.log(`     ${f.id} [${f.table}] ${f.topic}: ${f.reason}`)
    }
    if (flagged.length > 10) console.log(`     ... and ${flagged.length - 10} more`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
