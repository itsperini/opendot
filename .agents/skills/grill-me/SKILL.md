---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

# Grill Me

Use this skill to stress-test a plan, design, architecture, product idea, or
implementation approach through a rigorous interview.

## Workflow

1. Start by restating the plan as currently understood, including known goals,
   constraints, assumptions, and unresolved branches.
2. Build a decision tree of the plan. Identify dependencies between decisions so
   upstream choices are resolved before downstream details.
3. If a question can be answered by exploring the codebase, docs, config, tests,
   or existing product behavior, investigate directly instead of asking the user.
4. Ask pointed questions that force tradeoffs, edge cases, and hidden assumptions
   into the open. Keep walking each branch until it is resolved or explicitly
   deferred.
5. For every question asked, include the recommended answer and the reason for
   that recommendation.
6. Maintain a compact running record of decisions, open questions, dependencies,
   and deferred risks so both sides converge on shared understanding.

## Question Style

- Be direct and persistent, but collaborative.
- Prefer one decision branch at a time when answers affect later branches.
- Group tightly related questions only when they can be answered together.
- Ask for clarification only when local exploration cannot resolve the issue.
- Challenge weak assumptions with concrete failure modes, not vague skepticism.
- When the user answers, update the decision tree before moving to the next
  dependent question.

## Output Shape

Use this compact pattern during the interview:

```text
Current understanding:
...

Resolved:
- ...

Next branch:
...

Question:
...

Recommended answer:
...
```

When the plan is fully resolved, summarize the final design, decisions made,
remaining risks, and the next concrete action.
