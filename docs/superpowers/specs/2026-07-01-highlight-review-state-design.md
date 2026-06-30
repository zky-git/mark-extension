# Highlight Review State Design

## Context

MarkBuddy currently treats review membership as a highlight tag. A highlight enters the review queue when its `tags` array contains the configured review tag, defaulting to `学习`. This makes review look like a normal classification tag and caused confusion in the side panel: users can read the review affordance as a default tag on list items.

The product direction is now explicit:

- Review is for remembering specific highlighted excerpts, not whole webpages.
- Saving a highlight must not automatically add it to review.
- A user must manually add an excerpt to review.
- Review state should be independent from normal tags.
- Existing legacy review tags should not be migrated or treated as review state.

## Goals

- Keep review at highlight level.
- Store review membership in a dedicated `review.enabled` field.
- Store SM-2 scheduling state under `review.sm2`.
- Preserve ordinary bookmark and tag behavior.
- Remove the review-tag setting from the active review model.
- Make the side panel UI communicate that `+` is an action, not a tag.

## Non-Goals

- No webpage-level review queue.
- No automatic review enrollment for new highlights.
- No migration from legacy `tags: ['学习']` data.
- No compatibility mode where old review tags keep contributing to the review queue.
- No changes to the SM-2 scoring algorithm itself.

## Data Model

New highlights remain review-neutral by default:

```js
{
  id,
  url,
  text,
  color,
  savedAt,
  serializedRange,
  active: true
}
```

When a user manually adds a highlight to review, the highlight gains:

```js
review: {
  enabled: true,
  sm2: {
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewAt: 0
  }
}
```

After a score is submitted, `review.sm2` is replaced with the result of the existing SM-2 calculation. Removing a highlight from review sets `review.enabled = false` and leaves any ordinary `tags` untouched.

## Behavior

The due-review query includes only active highlights with independent review state:

```js
highlight.active !== false &&
highlight.review?.enabled === true
```

A highlight is due when:

- it is review-enabled and has no `review.sm2`, or
- `review.sm2.nextReviewAt <= Date.now()`.

Legacy highlights that only have the old review tag are not due. This is intentional: the new model starts cleanly from explicit review state.

## UI

In each highlight row:

- Not in review: show a compact `+` button with accessible text such as "加入复习".
- In review: show "复习中".
- Clicking `+` enables `review.enabled`.
- Clicking "复习中" disables `review.enabled`.

The settings panel should no longer expose "复习标签" as an active configuration. If explanatory text remains, it should describe manual excerpt review rather than a configurable tag.

The review banner and review mode keep their current placement and interaction pattern. They read from the new due-review query.

## Storage Messages

The background script should replace tag-based review updates with review-specific operations, for example:

- `UPDATE_HIGHLIGHT_REVIEW` with `{ id, enabled }`
- `GET_DUE_REVIEWS`
- `UPDATE_REVIEW_RESULT`

`UPDATE_HIGHLIGHT_TAGS` remains only for ordinary tag editing if highlight tags are used elsewhere.

## Backup And Export

JSON backup should preserve the new `review` object because backups already include full highlight records. Markdown export does not need to expose review state unless a separate export feature is requested later.

## Testing

Focused tests should cover:

- new highlights are not review-enabled by default;
- legacy `tags: ['学习']` highlights are not due;
- enabling review makes an active highlight due immediately;
- scoring a review updates `review.sm2`;
- disabling review removes the highlight from the due queue;
- side panel review controls use independent review state rather than tags.

## Open Decisions

None. The chosen model is highlight-level, manual opt-in, independent review state, with no legacy tag migration.
