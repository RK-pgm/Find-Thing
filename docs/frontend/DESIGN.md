# Find-Thing frontend design

## Product and users

Find-Thing helps students and school staff report lost or found belongings, search the school's notices, and arrange safe returns.

Core objects are an item notice, a return request, a private message, and a report for staff review. Keep these workflows separate: browse notices first, inspect one notice, then contact or request a return.

## Product temperament

Use a clear, reassuring school-community tone. The current direction uses evergreen, warm paper, and a small amber accent to connect the interface to the school identity without making task pages feel like marketing.

Keep the existing semantic HTML, CSS, and vanilla JavaScript foundation. Do not add a component framework just to restyle a page.

## Core journeys

| Journey | Entry and first decision | Success | Recovery |
|---|---|---|---|
| Report an item | Board → choose “ของหาย” or “พบของ” → complete the form | The notice appears on the board | Keep errors beside the form; preserve entered values and explain how to correct them |
| Find an item | Board → search or filter → inspect a notice | The student contacts the reporter or requests a return | Offer clear empty results and an easy way to change or clear filters |
| Return an item | Notice → submit proof → track the request | The owner approves and confirms the return | Show the request status and next step in the student's history |

## Visual and interaction decisions

- Thai is the primary UI language. Use short, task-specific labels and messages.
- The board prioritizes search, filters, recent notices, and the two report actions.
- Keep the item photo fully visible in previews (`object-fit: contain`); students use details in the whole image to identify belongings.
- The report dialog keeps its earlier, roomier appearance at the user's request. Scope its styling to `#item-dialog` so global dialog polish does not change it accidentally.
- The optional finder reward appears only for lost-item notices; entering an amount stays optional.
- Public contact details are opt-in. Private messages remain the default contact path.
- Keep motion restrained, honor reduced-motion preferences, and preserve visible keyboard focus.
- On narrow screens, put report actions and search first, keep navigation reachable, and retain touch targets of at least 44px where practical.

## Known risks

- `style.css` contains legacy and later override layers. Before changing a shared selector, check which pages and dialogs it affects; prefer a component-scoped rule for exceptions.
- Local visual browser inspection may be blocked by saved site permissions. Do not work around that gate; use code review and static checks, and report when screenshots could not be captured.

## Review record

- 2026-10-29: Restored the report dialog's earlier styling while retaining the board refresh, after user feedback that the add-report screen should remain familiar.
