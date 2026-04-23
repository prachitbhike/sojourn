# NPC Creator Playground – Accessibility Checklist

Date: 2026-04-23  
Scope: MVP vertical slice (playground app)

## Manual Verification

- [x] Captions can be toggled on/off via checkbox next to the sprite stage.
- [x] Keyboard navigation
  - [x] Persona selector buttons reachable by `Tab`.
  - [x] Message input focusable and submit via `Enter`.
  - [x] Send button accessible via `Tab` and activatable with `Space`/`Enter`.
  - [x] Transcript clear button reachable and operable via keyboard.
- [x] Screen reader labels
  - [x] Message input uses `aria-label="Message the NPC"`.
  - [x] Metrics panel exposes updates with `aria-live="polite"`.
- [x] Audio fallback
  - [x] Captions remain visible when audio muted.
- [ ] Contrast review (pending automated tooling).

## Follow-ups

1. Integrate automated contrast checker into CI.
2. Add focus outlines that comply with WCAG contrast ratios.
3. Provide keyboard shortcut to toggle captions.
