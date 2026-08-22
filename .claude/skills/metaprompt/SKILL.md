---
name: metaprompt
description: Run Anthropic's metaprompt process to write or rewrite a prompt template from scratch. Use this skill EVERY time the user asks for a prompt, a system prompt, a prompt template, or asks to improve, harden, restructure, or debug an existing prompt — including prompts destined for API calls, Supabase edge functions, question-generation or review pipelines, agents, and classifiers. Trigger on phrases like "write a prompt", "prompt for", "system prompt", "improve this prompt", "the model keeps", "make it output", "prompt engineering", or any request where the deliverable is text that will be fed to a model rather than read by a human. Do not hand-write a prompt from intuition when this skill applies — the user has asked for the full metaprompt process every time.
---

# Metaprompt

Turn a task description into a structured prompt template, using Anthropic's metaprompt rather than intuition.

## Why this exists

Hand-written prompts drift: variables get buried after the instructions, reasoning gets requested after the verdict, edge cases go unhandled. The metaprompt is a long multi-shot prompt whose examples encode those fixes. Reconstructing it from memory loses the examples, which is where most of the value sits — so read the real thing.

## Process

1. **Read `references/metaprompt.md` in full.** Do not skim it and do not work from a summary of it. The multi-shot examples are the mechanism.
2. **Fix the task statement.** One sentence, imperative, describing what the target model should do — not what the user wants overall. If the user's request is vague ("a prompt for my question generator"), ask exactly one clarifying question before proceeding.
3. **Pick input variables** if the user hasn't named them: the minimal, non-overlapping set. Rarely more than three.
4. **Run the metaprompt** with `{{TASK}}` replaced by the task statement, and produce the three blocks below.
5. **Test it** before declaring done — see Testing.

## Output format

ALWAYS return all three blocks, in this order, in this shape:

```
<Inputs>
{$VARIABLE_ONE}
{$VARIABLE_TWO}
</Inputs>

<Instructions Structure>
Where each variable goes and why; what order the sections run in; whether a scratchpad is warranted.
</Instructions Structure>

<Instructions>
The finished prompt template.
</Instructions>
```

Never skip `<Instructions Structure>`. It is where placement mistakes get caught, and it is cheap.

## Rules the template itself must follow

- Variables are demarcated by XML tags (`<document>…</document>`), never bare braces floating in prose. The model needs to see where a value starts and ends.
- Long variables — documents, question banks, patient notes, transcripts — go **before** the instructions that operate on them. Short ones can sit inline.
- Justification before verdict, always. Score after reasoning, never before.
- Scratchpad or inner-monologue tags only for genuinely multi-step tasks. Omit for simple ones; they add cost and noise.
- Include an explicit escape hatch: what the model should say when the input doesn't support an answer.
- Name the output tags the model should wrap its response in. Specify the opening tag name; don't litter the template with empty open/close pairs.

## Testing

A generated template is a starting point, not a finished artefact. Before it ships:

- Fill it with 1–2 realistic example values and run it. Show the user the filled prompt and the output.
- For anything going into production (an edge function, a batch pipeline), tell the user plainly that a chat-based test is a sanity check, not evidence. Real validation is the template run against 10–20 real inputs, with the failures reviewed by a human.
- If the user supplies an existing prompt to improve, show what changed and why — placement, ordering, missing escape hatch — not just the new version.

## Running it programmatically

`scripts/run_metaprompt.py` replicates Anthropic's metaprompt notebook for use outside a chat: it calls the API with the metaprompt, extracts the `<Instructions>` block, and optionally test-runs the result on example values.

```bash
export ANTHROPIC_API_KEY=...
python scripts/run_metaprompt.py \
  --task "Grade a DOH exam question against the style guide" \
  --variables QUESTION STYLE_GUIDE \
  --test-values QUESTION=... STYLE_GUIDE=...
```

Use this when the user wants prompts generated in a build step or batch, rather than one at a time in conversation. Generated templates belong in version control — generate once, review, commit. Do not call the metaprompt at request time in a production path: it adds a slow extra API round-trip to every request, costs tokens per call, and produces output that drifts as models change — where a committed, human-reviewed template does not.

## Domain notes

**Exam/question-generation prompts.** The bank content is the long variable — it goes first. Ask for the model's reasoning about clinical accuracy and distractor plausibility before it emits the question, not after. Build in a "this topic can't support a valid single-best-answer question" escape hatch; without one the model invents one anyway.

**Clinical summarisation prompts.** The source note goes first. Require the template to flag missing fields explicitly rather than silently omitting them — an absent staging line and an unrecorded staging line are different facts, and a summary that hides the difference is unsafe for handover.

**Classifier/grader prompts.** Reasoning before label, no exceptions. Ask for the label in a fixed, parseable form so downstream code doesn't need fuzzy matching.
