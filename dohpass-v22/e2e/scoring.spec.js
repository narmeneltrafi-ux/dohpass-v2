// End-to-end regression test for the scoring bug fixed in PR #3.
// Logs in as the dedicated e2e user, visits each quiz track, reads the
// visible question, looks up the correct answer in Supabase, clicks it,
// submits, and asserts the UI reports "Correct". If scoring and UI ever
// disagree again (the class of bug that returned `selected === -1` for
// every row), this test will fail.
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { resolveCorrectIndex } from '../src/lib/resolveCorrectIndex.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL
const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function requireEnv() {
  for (const [name, val] of Object.entries({
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    E2E_USER_EMAIL,
    E2E_USER_PASSWORD,
  })) {
    if (!val) throw new Error(`E2E is missing required env var: ${name}`)
  }
}

let _supabase
function getSupabase() {
  if (!_supabase) {
    requireEnv()
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return _supabase
}

let _serviceSupabase
function getServiceSupabase() {
  if (!_serviceSupabase) {
    requireEnv()
    _serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _serviceSupabase
}

async function lookupAnswer(table, questionText) {
  const { data, error } = await getServiceSupabase()
    .from(table)
    .select('id, answer, options')
    .eq('q', questionText)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Supabase lookup failed for ${table}: ${error.message}`)
  if (!data) throw new Error(`No row found in ${table} for question: ${questionText.slice(0, 80)}`)
  return data
}

async function login(page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(E2E_USER_EMAIL)
  await page.locator('input[type="password"]').fill(E2E_USER_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/', { timeout: 15_000 })
}

async function answerOneQuestion(page, { path, table }) {
  await page.goto(path)

  const questionEl = page.getByTestId('question-text')
  await expect(questionEl).toBeVisible({ timeout: 15_000 })
  const questionText = (await questionEl.textContent())?.trim()
  expect(questionText, `question text on ${path}`).toBeTruthy()

  const row = await lookupAnswer(table, questionText)
  const correctIdx = resolveCorrectIndex(row.options, row.answer)
  expect(correctIdx, `resolver returned -1 for ${table}/${row.id}`).toBeGreaterThanOrEqual(0)

  await page.locator(`[data-testid="option"][data-option-index="${correctIdx}"]`).click()
  await page.getByRole('button', { name: 'Submit Answer' }).click()

  const feedback = page.getByTestId('feedback')
  await expect(feedback).toBeVisible({ timeout: 10_000 })
  await expect(feedback).toHaveAttribute('data-feedback-correct', 'true')
  await expect(feedback).toContainText('Correct')
}

test.describe('scoring regression', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('specialist quiz scores the endorsed option as correct', async ({ page }) => {
    await answerOneQuestion(page, { path: '/specialist', table: 'specialist_questions' })
  })

  test('GP quiz scores the endorsed option as correct', async ({ page }) => {
    await answerOneQuestion(page, { path: '/gp', table: 'gp_questions' })
  })
})
