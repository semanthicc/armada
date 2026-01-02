# Heuristics Specification

> Confidence tracking, validation logic, and time decay for Semanthicc

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Heuristic** | A learned pattern, decision, or constraint that helps prevent mistakes |
| **Confidence** | 0.0 to 1.0 score indicating reliability of the heuristic |
| **Golden Rule** | Promoted heuristic exempt from time decay (constitutional) |
| **Domain** | Tag for categorization: `typescript`, `testing`, `auth`, etc. |

## Confidence Mechanics

### Initial State

```typescript
const DEFAULT_CONFIDENCE = 0.5;  // Starting confidence
const GOLDEN_THRESHOLD = 0.9;    // Auto-promote threshold
const DECAY_HALF_LIFE_DAYS = 30; // Days until confidence halves
```

### Validate (Pattern Confirmed Correct)

```typescript
function validate(memory: Memory): Memory {
  return {
    ...memory,
    times_validated: memory.times_validated + 1,
    confidence: Math.min(1.0, memory.confidence + 0.05),
    last_validated_at: Date.now()
  };
}
```

**Effect**: +0.05 confidence, capped at 1.0

### Violate (Pattern Proven Wrong)

```typescript
function violate(memory: Memory): Memory {
  return {
    ...memory,
    times_violated: memory.times_violated + 1,
    confidence: Math.max(0.0, memory.confidence - 0.1)
  };
}
```

**Effect**: -0.1 confidence, floored at 0.0

**Asymmetry**: Violations hurt more than validations help (2:1 ratio). This is intentional — wrong advice is worse than no advice.

### Time Decay (30-Day Half-Life)

```typescript
const HALF_LIFE_DAYS = 30;

function getEffectiveConfidence(memory: Memory): number {
  // Golden rules never decay
  if (memory.is_golden) {
    return memory.confidence;
  }
  
  const lastActivity = memory.last_validated_at || memory.created_at;
  const daysSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
  
  // Exponential decay: confidence * 0.5^(days/30)
  const decayFactor = Math.pow(0.5, daysSinceActivity / HALF_LIFE_DAYS);
  return memory.confidence * decayFactor;
}
```

**Example decay curve**:
| Days | Decay Factor | 0.8 confidence becomes |
|------|--------------|------------------------|
| 0    | 1.0          | 0.80                   |
| 15   | 0.71         | 0.57                   |
| 30   | 0.50         | 0.40                   |
| 60   | 0.25         | 0.20                   |
| 90   | 0.125        | 0.10                   |

### Golden Rule Promotion

```typescript
const GOLDEN_THRESHOLD = 0.9;
const MIN_VALIDATIONS = 3;

function checkGoldenPromotion(memory: Memory): boolean {
  return (
    memory.confidence >= GOLDEN_THRESHOLD &&
    memory.times_validated >= MIN_VALIDATIONS &&
    memory.times_violated === 0  // Never been wrong
  );
}
```

**Criteria**:
1. Confidence ≥ 0.9
2. Validated ≥ 3 times
3. Never violated

**Effect**: Set `is_golden = 1`, exempt from time decay forever.

### Demotion from Golden

```typescript
function checkGoldenDemotion(memory: Memory): boolean {
  // Violated golden rule loses status
  return memory.is_golden && memory.times_violated > 0;
}
```

**Trigger**: Any violation of a golden rule demotes it.

## Concept Types

| Type | Description | Example |
|------|-------------|---------|
| `pattern` | Recurring solution or approach | "Use repository pattern for data access" |
| `decision` | Deliberate choice with reasoning | "Chose Redis over Memcached for clustering" |
| `constraint` | Limitation or requirement | "Can't use ESM due to legacy bundler" |
| `learning` | Discovered fact from failure/success | "Tests fail without mock server running" |
| `context` | Project configuration/setup | "Monorepo with pnpm workspaces" |
| `rule` | Golden rule (constitutional) | "Never use `any` type" |

## Query Logic

### Get Top Heuristics for Injection

```typescript
async function getTopHeuristics(projectId: number | null, limit = 5): Promise<Memory[]> {
  const memories = await db.query(`
    SELECT * FROM memories 
    WHERE concept_type IN ('pattern', 'rule', 'constraint')
    AND status = 'current'
    AND (project_id = ? OR project_id IS NULL)
    ORDER BY is_golden DESC, confidence DESC
  `, [projectId]);
  
  // Apply time decay and filter
  return memories
    .map(m => ({ ...m, effectiveConfidence: getEffectiveConfidence(m) }))
    .filter(m => m.effectiveConfidence > 0.1)  // Skip very old patterns
    .sort((a, b) => b.effectiveConfidence - a.effectiveConfidence)
    .slice(0, limit);
}
```

### Injection Format (~300 tokens)

```typescript
function formatHeuristicsForInjection(memories: Memory[]): string {
  if (memories.length === 0) return '';
  
  const lines = memories.map(m => {
    const scope = m.project_id ? '' : '[global] ';
    const golden = m.is_golden ? '⭐ ' : '';
    const conf = m.effectiveConfidence.toFixed(2);
    return `- ${golden}${scope}[${conf}] ${m.content}`;
  });
  
  return `
## Project Heuristics
${lines.join('\n')}
`.trim();
}
```

**Example output**:
```
## Project Heuristics
- ⭐ [0.95] Never use `any` type in this codebase
- [global] [0.87] Always run tests before commit
- [0.72] Use date-fns for date manipulation (not moment.js)
- [0.65] API routes follow /api/v1/{resource} pattern
- [0.58] Database migrations must be reversible
```

## Domain Tags

Recommended domains (not enforced, just conventions):

| Domain | Use For |
|--------|---------|
| `typescript` | TS-specific patterns, type conventions |
| `testing` | Test patterns, mocking strategies |
| `api` | API design, HTTP conventions |
| `auth` | Authentication, authorization patterns |
| `database` | DB schema, query patterns |
| `build` | Build system, bundling, deployment |
| `git` | Version control conventions |
| `style` | Code style, formatting |
| `performance` | Optimization patterns |
| `security` | Security practices |

## Failure & Success Learning (Passive Capture)

### From Tool Outcomes

```typescript
// Hook into tool.execute.after
async function recordToolOutcome(tool: string, result: ToolResult): Promise<void> {
  if (result.error) {
    // Record failure pattern
    await addMemory({
      concept_type: 'learning',
      content: `Tool '${tool}' failed: ${extractKeyInsight(result.error)}`,
      domain: inferDomain(tool),
      source: 'passive',
      source_tool: tool,
      confidence: 0.3  // Low initial confidence for passive
    });
  }
}
```

### Explicit Capture

```typescript
// User or AI explicitly records
await addMemory({
  concept_type: 'decision',
  content: 'Chose Redis over Memcached because we need clustering',
  domain: 'database',
  source: 'explicit',
  confidence: 0.5
});
```

## Constants

```typescript
// src/constants.ts
export const HEURISTICS = {
  DEFAULT_CONFIDENCE: 0.5,
  VALIDATE_DELTA: 0.05,
  VIOLATE_DELTA: 0.1,
  GOLDEN_THRESHOLD: 0.9,
  MIN_VALIDATIONS_FOR_GOLDEN: 3,
  DECAY_HALF_LIFE_DAYS: 30,
  MIN_EFFECTIVE_CONFIDENCE: 0.1,  // Below this, don't inject
  MAX_INJECTION_COUNT: 5,
  MAX_INJECTION_TOKENS: 500
} as const;
```
