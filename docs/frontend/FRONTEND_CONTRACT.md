# Frontend contract

Project-specific rules for Find-Thing. These rules protect the student task flow while allowing visual choices to evolve.

## Hard lines

- Keep primary labels, actions, empty states, and errors in Thai and use words students understand.
- Do not expose secrets or sensitive student information in public notice responses.
- Destructive actions need confirmation or a recoverable path.
- Every core asynchronous flow needs understandable loading, empty, success, and error feedback.
- Long names, descriptions, and generated notice codes must wrap, truncate safely, or move into details without breaking the layout.
- Preserve keyboard focus visibility, dialog labels and close paths, reduced-motion support, and mobile access to the primary action.

## Page patterns

| Surface | Default pattern | Rules |
|---|---|---|
| Notice board | Search and filters → type tabs → notice list | Keep search and report actions near the top; make active filters clear and easy to reset |
| Report dialog | Choose lost/found → enter item details → publish | Keep the familiar `#item-dialog` styling scoped; reveal optional fields only when relevant |
| Notice details | Photo and item facts → match hints → contact or claim action | Keep actions next to the notice; never crop submitted photos in previews |
| Student history | Request state → next step → cancel where allowed | Explain statuses in plain language and keep destructive actions confirmed |

## Component and styling rules

- Extend the existing HTML/CSS/JavaScript before considering a framework or component dependency.
- Avoid broad end-of-file overrides for a one-dialog change. Scope form exceptions to `#item-dialog` and verify effects on the board and other dialogs.
- Keep the shared spacing and button hierarchy consistent; primary action, secondary action, and utility action must read differently.
- Preserve progressive disclosure for reward amount, filters, and other optional details.
- Show the optional pickup/deposit location only for found-item notices; do not add an automatic notice-duration field.
- Use color together with text, icon, border, or selection state; do not communicate status with color alone.
- Keep full-size images readable with `object-fit: contain` unless the user explicitly requests a crop.

## Verification gate

Before delivering a core UI change:

1. Review the affected flow from entry through success and recovery.
2. Check desktop and mobile layout, including dialogs, long text, empty results, and form errors.
3. Check keyboard focus, dialog close behavior, and reduced-motion behavior.
4. Run `git diff --check`; run JavaScript syntax checks when scripts change.
5. Use browser screenshots only when site access is granted. If an access gate denies inspection, do not bypass it; state the limitation and complete the available static review.
