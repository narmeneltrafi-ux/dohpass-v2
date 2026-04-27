-- Migration: gp_flashcards_redistribute_systems
-- Date: 2026-04-27
-- Purpose: GP flashcards were all dumped into a single 'Primary Care' system,
--   creating one giant tile with 880 cards. Redistribute by mapping each
--   subtopic to its proper specialty system, mirroring the specialist-track
--   structure. Idempotent — CASE produces the same result on re-run.
-- Note: paired with generate-flashcards Edge Function v32 which adds
--   GP_TOPIC_TO_SYSTEM map so future cron runs land cards in correct systems.

UPDATE flashcards SET system = CASE subtopic
  -- Cardiology
  WHEN 'Cardiology GP' THEN 'Cardiology'
  WHEN 'Hypertension' THEN 'Cardiology'
  WHEN 'Dyslipidaemia' THEN 'Cardiology'
  WHEN 'Ischaemic Heart Disease' THEN 'Cardiology'
  WHEN 'Heart Failure' THEN 'Cardiology'
  WHEN 'Atrial Fibrillation' THEN 'Cardiology'
  WHEN 'Emergency Chest Pain' THEN 'Cardiology'
  -- Neurology
  WHEN 'Neurology GP' THEN 'Neurology'
  WHEN 'Stroke and TIA' THEN 'Neurology'
  WHEN 'Epilepsy' THEN 'Neurology'
  -- Mental Health
  WHEN 'Psychiatry' THEN 'Mental Health'
  WHEN 'Psychiatry GP' THEN 'Mental Health'
  WHEN 'Depression' THEN 'Mental Health'
  WHEN 'Anxiety' THEN 'Mental Health'
  WHEN 'Dementia' THEN 'Mental Health'
  -- Musculoskeletal
  WHEN 'Orthopaedics and MSK' THEN 'Musculoskeletal'
  WHEN 'Osteoarthritis' THEN 'Musculoskeletal'
  WHEN 'Osteoporosis' THEN 'Musculoskeletal'
  WHEN 'Rheumatoid Arthritis' THEN 'Musculoskeletal'
  -- Respiratory
  WHEN 'Respiratory GP' THEN 'Respiratory'
  WHEN 'Asthma' THEN 'Respiratory'
  WHEN 'COPD' THEN 'Respiratory'
  -- Endocrinology
  WHEN 'Endocrinology GP' THEN 'Endocrinology'
  WHEN 'Diabetes Type 2' THEN 'Endocrinology'
  WHEN 'Thyroid Disorders' THEN 'Endocrinology'
  -- Gastroenterology
  WHEN 'Gastroenterology GP' THEN 'Gastroenterology'
  WHEN 'Peptic Ulcer Disease' THEN 'Gastroenterology'
  WHEN 'GERD' THEN 'Gastroenterology'
  -- Public Health
  WHEN 'Preventive Medicine' THEN 'Public Health'
  WHEN 'Public Health' THEN 'Public Health'
  WHEN 'Vaccinations' THEN 'Public Health'
  -- Women's Health
  WHEN 'Obstetrics and Gynaecology' THEN 'Women''s Health'
  WHEN 'Contraception' THEN 'Women''s Health'
  WHEN 'Antenatal Care' THEN 'Women''s Health'
  -- Nephrology
  WHEN 'Nephrology GP' THEN 'Nephrology'
  WHEN 'UTI' THEN 'Nephrology'
  -- Haematology
  WHEN 'Haematology GP' THEN 'Haematology'
  WHEN 'Anaemia' THEN 'Haematology'
  -- Paediatrics
  WHEN 'Paediatrics' THEN 'Paediatrics'
  WHEN 'Paediatric Common Illnesses' THEN 'Paediatrics'
  -- Standalone systems
  WHEN 'Oncology Red Flags' THEN 'Oncology'
  WHEN 'Dermatology' THEN 'Dermatology'
  WHEN 'Dermatology GP' THEN 'Dermatology'
  WHEN 'Urology' THEN 'Urology'
  WHEN 'ENT' THEN 'ENT'
  WHEN 'Ophthalmology' THEN 'Ophthalmology'
  WHEN 'Infectious Disease GP' THEN 'Infectious Disease'
  WHEN 'Emergency Medicine GP' THEN 'Emergency Medicine'
  WHEN 'Geriatrics' THEN 'Geriatrics'
  WHEN 'Palliative Care' THEN 'Palliative Care'
  WHEN 'Radiology and Investigations' THEN 'Radiology'
  WHEN 'Pharmacology and Prescribing' THEN 'Pharmacology'
  ELSE system
END
WHERE track = 'gp' AND is_active = true;
