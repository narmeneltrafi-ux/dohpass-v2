import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────
// Curated 5-question demo. Hardcoded by design — zero DB calls,
// zero RLS surface, full control over the psychological arc:
// win → win → wobble → miss → win → WALL.
// Questions written to DOH Specialist compliance standard.
// ─────────────────────────────────────────────────────────────

const DEMO_QUESTIONS = [
  {
    id: 1,
    system: 'Cardiology',
    topic: 'Acute coronary syndrome',
    difficulty: 'Easy',
    stem: 'A 68-year-old man with hypertension presents with central chest pain radiating to the left arm for 40 minutes. ECG shows ST elevation in leads II, III, and aVF. The nearest PCI-capable centre is 30 minutes away.',
    leadIn: 'What is the single most appropriate next step?',
    options: [
      { key: 'A', text: 'Aspirin 300 mg only' },
      { key: 'B', text: 'Primary PCI within 90 minutes' },
      { key: 'C', text: 'Thrombolysis with streptokinase' },
      { key: 'D', text: 'CT pulmonary angiogram' },
      { key: 'E', text: 'High-dose statin and discharge' },
    ],
    correct: 'B',
    citation: 'ESC STEMI Guidelines 2023',
    explanation: {
      correct: 'Inferior STEMI within the 12-hour window mandates primary PCI as the reperfusion strategy of choice when achievable within 120 minutes of first medical contact.',
      distractors: {
        A: 'Antiplatelet therapy alone does not achieve reperfusion.',
        C: 'Thrombolysis is reserved for centres without timely PCI access — here PCI is reachable.',
        D: 'Wrong diagnosis — the ECG shows territorial ST elevation, not PE.',
        E: 'Discharging an active STEMI is dangerous and inappropriate.',
      },
      learning: 'When primary PCI is achievable within 120 minutes, it beats thrombolysis.',
    },
  },
  {
    id: 2,
    system: 'Endocrinology',
    topic: 'Diabetic ketoacidosis',
    difficulty: 'Moderate',
    stem: 'A 24-year-old woman with type 1 diabetes presents with vomiting and abdominal pain. She is drowsy. Capillary glucose 28 mmol/L, venous pH 7.18, bicarbonate 11 mmol/L, ketones 5.2 mmol/L. Potassium is 5.4 mmol/L.',
    leadIn: 'What is the most appropriate initial management step?',
    options: [
      { key: 'A', text: 'Start fixed-rate IV insulin immediately' },
      { key: 'B', text: 'Give IV sodium bicarbonate' },
      { key: 'C', text: 'Commence IV 0.9% sodium chloride' },
      { key: 'D', text: 'Administer IV potassium replacement first' },
      { key: 'E', text: 'Give a STAT bolus of IV insulin' },
    ],
    correct: 'C',
    citation: 'JBDS DKA Guidelines / general IM',
    explanation: {
      correct: 'Fluid resuscitation with 0.9% sodium chloride is the first step in DKA — patients are profoundly volume-depleted, and rehydration begins before or alongside insulin.',
      distractors: {
        A: 'Fixed-rate insulin follows fluids; starting insulin first risks dangerous hypokalaemia and worsens hypovolaemia.',
        B: 'Bicarbonate is not routinely given and is reserved for extreme acidosis only.',
        D: 'Potassium is currently high-normal — replacement is added once it falls below 5.5 with insulin.',
        E: 'Bolus insulin is not used in modern DKA protocols — fixed-rate infusion is standard.',
      },
      learning: 'Fluids first in DKA. Insulin and potassium are titrated against the fluid resuscitation, not ahead of it.',
    },
  },
  {
    id: 3,
    system: 'Nephrology',
    topic: 'Hyperkalaemia',
    difficulty: 'Moderate–Hard',
    stem: 'A 72-year-old man on ramipril and spironolactone for heart failure presents feeling generally unwell. Potassium is 6.8 mmol/L. ECG shows tall, tented T waves and broadening of the QRS complex.',
    leadIn: 'What is the most appropriate immediate intervention?',
    options: [
      { key: 'A', text: 'IV calcium gluconate' },
      { key: 'B', text: 'IV insulin with dextrose' },
      { key: 'C', text: 'Nebulised salbutamol' },
      { key: 'D', text: 'Oral calcium resonium' },
      { key: 'E', text: 'Urgent haemodialysis' },
    ],
    correct: 'A',
    citation: 'UK Renal Association / general IM',
    explanation: {
      correct: 'With ECG changes present, IV calcium gluconate is given FIRST to stabilise the myocardial membrane and protect against arrhythmia. It does not lower potassium but buys time.',
      distractors: {
        B: 'Insulin–dextrose shifts potassium intracellularly and is given next — but cardiac protection comes first when ECG changes are present.',
        C: 'Salbutamol is an adjunct shifting agent, not the immediate priority with ECG changes.',
        D: 'Calcium resonium acts over hours — useless in an emergency.',
        E: 'Dialysis is definitive but not the immediate bedside step while the heart is at risk.',
      },
      learning: 'Hyperkalaemia with ECG changes: stabilise the membrane (calcium) BEFORE shifting or removing potassium.',
    },
  },
  {
    id: 4,
    system: 'Infectious Disease',
    topic: 'Neutropenic sepsis',
    difficulty: 'Hard',
    stem: 'A 59-year-old woman receiving chemotherapy for breast cancer presents with a temperature of 38.6°C, 8 days after her last cycle. She looks well, observations are otherwise stable. Neutrophil count is 0.4 ×10⁹/L.',
    leadIn: 'What is the most appropriate immediate management?',
    options: [
      { key: 'A', text: 'Take blood cultures and review in 4 hours' },
      { key: 'B', text: 'Start empirical IV piperacillin–tazobactam immediately' },
      { key: 'C', text: 'Await culture results before any antibiotics' },
      { key: 'D', text: 'Oral co-amoxiclav and discharge with safety-net advice' },
      { key: 'E', text: 'Give paracetamol and reassess if fever persists' },
    ],
    correct: 'B',
    citation: 'NICE NG / IDSA Neutropenic Sepsis',
    explanation: {
      correct: 'Neutropenic sepsis is a medical emergency. Empirical broad-spectrum IV antibiotics (e.g. piperacillin–tazobactam) must be started within ONE hour — the "looks well" appearance is dangerously reassuring in a neutropenic patient.',
      distractors: {
        A: 'A 4-hour delay breaches the one-hour antibiotic target and can be fatal.',
        C: 'Waiting for cultures before antibiotics is never acceptable in suspected neutropenic sepsis.',
        D: 'Oral antibiotics and discharge are inappropriate for a neutropenic, febrile patient.',
        E: 'Treating the fever symptomatically misses a life-threatening emergency.',
      },
      learning: 'Fever + neutropenia = empirical IV antibiotics within 1 hour, regardless of how well the patient looks.',
    },
  },
  {
    id: 5,
    system: 'Cardiology',
    topic: 'Atrial fibrillation — anticoagulation',
    difficulty: 'Moderate',
    stem: 'A 70-year-old woman with newly diagnosed non-valvular atrial fibrillation has hypertension and type 2 diabetes. She has no history of bleeding, normal renal function, and is not on any anticoagulant.',
    leadIn: 'What is the most appropriate stroke-prevention strategy?',
    options: [
      { key: 'A', text: 'Aspirin 75 mg daily' },
      { key: 'B', text: 'No anticoagulation; reassess in 12 months' },
      { key: 'C', text: 'A direct oral anticoagulant (DOAC)' },
      { key: 'D', text: 'Clopidogrel monotherapy' },
      { key: 'E', text: 'Dual antiplatelet therapy' },
    ],
    correct: 'C',
    citation: 'ESC AF Guidelines 2024 / NICE',
    explanation: {
      correct: 'Her CHA₂DS₂-VASc score is ≥3 (age, hypertension, diabetes, female sex). A DOAC is first-line for stroke prevention in non-valvular AF with an elevated score and no contraindication.',
      distractors: {
        A: 'Aspirin is no longer recommended for stroke prevention in AF — it is inferior and not safer.',
        B: 'Withholding anticoagulation in a high-risk patient leaves her exposed to preventable stroke.',
        D: 'Clopidogrel monotherapy is not adequate stroke prevention in AF.',
        E: 'Dual antiplatelet therapy carries bleeding risk without matching DOAC efficacy in AF.',
      },
      learning: 'Non-valvular AF with elevated CHA₂DS₂-VASc: DOAC first-line. Antiplatelets are not a substitute.',
    },
  },
];

const FREE_LIMIT = 5;
const TOTAL_BANK = 2995;

export default function SampleQuestionDemo() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [hitWall, setHitWall] = useState(false);

  const q = DEMO_QUESTIONS[index];
  const isCorrect = selected === q.correct;

  const handleSelect = (key) => {
    if (revealed) return;
    setSelected(key);
    setRevealed(true);
    const correct = key === q.correct;
    setStreak((s) => (correct ? s + 1 : 0));
    setAnsweredCount((c) => c + 1);
  };

  const handleNext = () => {
    if (answeredCount >= FREE_LIMIT) {
      setHitWall(true);
      return;
    }
    if (index + 1 >= DEMO_QUESTIONS.length) {
      setHitWall(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
  };

  if (hitWall) {
    const remaining = TOTAL_BANK - answeredCount;
    return (
      <div className="sqd-wrap">
        <div className="sqd-wall">
          <div className="sqd-wall__streak">
            {streak >= 3 ? `🔥 ${streak} in a row` : `You answered ${answeredCount} questions`}
          </div>
          <h3 className="sqd-wall__title">
            That was {answeredCount} of {TOTAL_BANK.toLocaleString()}.
          </h3>
          <p className="sqd-wall__sub">
            {remaining.toLocaleString()} more DOH-style questions are waiting —
            every one with a guideline-cited explanation like the ones you just saw.
          </p>
          <button className="aw-btn sqd-wall__cta" onClick={() => navigate('/pricing')}>
            Unlock the full bank →
          </button>
          <p className="sqd-wall__trust">No credit card to start · Free preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sqd-wrap">
      <div className="sqd-card">
        <div className="sqd-head">
          <span className="sqd-tag">{q.system} · {q.difficulty}</span>
          <span className="sqd-meta">
            {streak > 0 && <span className="sqd-streak">🔥 {streak} streak</span>}
            <span className="sqd-counter">Q {answeredCount + (revealed ? 0 : 1)} / {FREE_LIMIT} free</span>
          </span>
        </div>

        <p className="sqd-stem">{q.stem}</p>
        <p className="sqd-leadin">{q.leadIn}</p>

        <div className="sqd-options">
          {q.options.map((opt) => {
            let cls = 'sqd-opt';
            if (revealed) {
              if (opt.key === q.correct) cls += ' sqd-opt--correct';
              else if (opt.key === selected) cls += ' sqd-opt--wrong';
              else cls += ' sqd-opt--dim';
            }
            return (
              <button
                key={opt.key}
                className={cls}
                onClick={() => handleSelect(opt.key)}
                disabled={revealed}
              >
                <span className="sqd-opt__key">{opt.key}</span>
                <span className="sqd-opt__text">{opt.text}</span>
                {revealed && opt.key === q.correct && <span className="sqd-opt__icon">✓</span>}
                {revealed && opt.key === selected && opt.key !== q.correct && (
                  <span className="sqd-opt__icon">✕</span>
                )}
              </button>
            );
          })}
        </div>

        {revealed && (
          <div className={`sqd-explain ${isCorrect ? 'sqd-explain--ok' : 'sqd-explain--miss'}`}>
            <div className="sqd-explain__head">
              <span className="sqd-explain__verdict">
                {isCorrect ? 'Correct' : 'Not quite'}
              </span>
              <span className="sqd-explain__cite">{q.citation}</span>
            </div>
            <p className="sqd-explain__why">{q.explanation.correct}</p>
            <div className="sqd-explain__distractors">
              {Object.entries(q.explanation.distractors).map(([k, v]) => (
                <p key={k}><strong>{k}</strong> — {v}</p>
              ))}
            </div>
            <p className="sqd-explain__learn">
              <strong>Key point:</strong> {q.explanation.learning}
            </p>
            <button className="sqd-next" onClick={handleNext}>
              {answeredCount >= FREE_LIMIT || index + 1 >= DEMO_QUESTIONS.length
                ? 'See what you\'re missing →'
                : 'Next question →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
