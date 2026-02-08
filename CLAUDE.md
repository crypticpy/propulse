# Propulse — Project Rules

## UX Rules

### No Flyout/Slide-in Panels

**NEVER** use side-of-browser flyout panels (position: fixed, slide-in from right/left).
They break user focus, appear off-screen, and don't match the app's interaction model.

Use instead:

- **Centered modals** with backdrop for detail views and confirmations
- **Inline expansion** within the current view for contextual editing
- **Popovers** anchored near the trigger element for quick actions

### Canvas-Based Views

For visual builder / flowchart views (Station Builder Lab):

- Use **zoom** (mouse wheel / pinch), not horizontal scroll
- Use **pan** (click-drag background, or middle-click drag)
- Equipment interactions: drag-and-drop like Kanban cards
- Keep user focus centered — no actions that move attention to browser edges
