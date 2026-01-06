# ISSUE-004: Investigate OpenCode Tool Call Caching

**Priority:** Low  
**Type:** Research / Investigation  
**Target:** v1.1.0  
**Status:** Pending  
**Effort:** Easy

---

## Question

How does OpenCode handle duplicate tool calls with identical parameters?

**Specific questions:**
1. If a tool returns the same result twice, does OpenCode cache/dedupe it?
2. Does calling `get_workflow("name")` multiple times bloat the context?
3. Is there any memoization at the SDK/plugin level?

## Why This Matters

If workflows are fetched multiple times in a conversation:
- Same workflow requested by AI multiple times
- Hint suggests workflow, AI fetches it, then re-references it later

Understanding caching behavior helps us decide:
- Should we implement our own caching layer?
- Is the current `[use_workflow:...]` reference system sufficient?
- Could we optimize by returning cached content?

## Investigation Steps

1. Read OpenCode SDK source to understand tool call handling
2. Check if there's a caching layer in the plugin runtime
3. Test empirically: call same tool twice, observe context growth
4. Review OpenCode plugin docs for caching guidance

## Files to Check

| Repository | Path | Purpose |
|------------|------|---------|
| `opencode` | `src/plugin/` | Plugin runtime |
| `opencode` | `src/sdk/` | SDK tool handling |
| `@opencode-ai/plugin` | Package source | Tool decorator behavior |

## Acceptance Criteria

- [ ] Document how OpenCode handles duplicate tool calls
- [ ] Determine if context bloat is a real concern
- [ ] Recommend: implement caching vs rely on existing behavior
- [ ] Create follow-up issue if optimization needed
