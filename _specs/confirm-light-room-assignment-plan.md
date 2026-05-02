# Implementation Plan: Confirm and Guard Light Room Assignment

Companion to [`confirm-light-room-assignment.md`](confirm-light-room-assignment.md).

## 1. Spec reality check vs. existing code

Three findings shape the plan:

**Finding A — `groupId` / `groupName` are already on the lights list.** The `LightRow` interface at [`nextjs-ui/app/(dashboard)/lights/page.tsx:40-55`](../nextjs-ui/app/(dashboard)/lights/page.tsx) already reads `groupId` and `groupName`, and the route at [`nextjs-ui/app/api/sensors/route.ts:117-156`](../nextjs-ui/app/api/sensors/route.ts) populates them via `fetchGroups` / `fetchMembers` and exposes them on every assigned-sensor row. No server-side change needed for read-side data.

**Finding B — there is no `DELETE /api/light-groups/{id}/members/{sensorId}` endpoint, and no equivalent.** The spec hint is inaccurate: the only existing membership-mutation endpoints are `PATCH /api/light-groups/[id]` (with `sensorIds`) and `DELETE /api/light-groups/[id]` (entire group). The PATCH path explicitly rejects `sensorIds.length < 2` at [`nextjs-ui/app/api/light-groups/[id]/route.ts:43-45`](../nextjs-ui/app/api/light-groups/[id]/route.ts), so it cannot be used to remove the second-to-last or last member without a workaround. There is no UI string "Remove from group" anywhere in the codebase today. Therefore one new tiny route file is needed.

**Finding C — `PATCH /api/sensors/[id]` already drops group membership when `room_id` changes** (lines 34-37). The spec confirms this is now defense-in-depth. We do not change it.

## 2. New files

### 2.1 `nextjs-ui/app/api/light-groups/[id]/members/[sensorId]/route.ts` (new)

A `DELETE` handler matching the URL the spec hints at. Logic:

- Parse `id` (groupId) and `sensorId` from `await ctx.params` (Next 16 Promise pattern, see `nextjs-ui/CLAUDE.md`).
- Open `getDb()`.
- Wrap in a transaction: `DELETE FROM light_group_members WHERE group_id = ? AND sensor_id = ?`. If `result.changes === 0`, return 404.
- After the delete, call `pruneEmptyGroups(db)` from `lib/server/light-groups.ts:184-189`. This handles the "last member" case automatically: when only one member is left the group still exists, but if zero members the group is pruned. **The spec wants the dialog to warn before this happens, but the server still must do the right thing.** Note: `pruneEmptyGroups` only removes groups that have zero members; a group with one member is still permitted. That matches the spec's "Do not change how groups are pruned" non-goal.
- Return `Response.json({ ok: true })`.
- Use the `httpErrorResponse` style from `/api/light-groups/[id]/route.ts` for symmetry.

### 2.2 `nextjs-ui/app/components/warren/light-room-dialogs.tsx` (new)

Single file exporting **three small named components** that all wrap the existing `Alert` primitive (the same pattern as `confirm-dialog.tsx`). Three components rather than one parameterized component because the body shape differs meaningfully, and the action labels and tone vary. A single super-prop component would be a switch statement masquerading as a component. Keep `confirm-dialog.tsx` untouched.

The new file exports:

#### `GroupedLightGuardDialog`

Props:
```
open: boolean
lightLabel: string
groupName: string
busy: boolean
onRemoveFromGroup: () => Promise<void> | void
onCancel: () => void
```

Body: Catalyst `Alert` + `AlertTitle` "Light is in a group" + `AlertDescription` reading "*<lightLabel>* is part of the **<groupName>** group. Remove it from the group before moving it to another room.". Actions: `Button plain` Cancel, `Button color="dark/zinc"` (primary, not destructive). When `busy`, the primary button label switches to "Removing…" and is disabled.

#### `MoveLightDialog`

Props:
```
open: boolean
lightLabel: string
sourceRoomName: string | null
targetRoomName: string
mode: 'move' | 'add'
busy: boolean
onConfirm: () => Promise<void> | void
onCancel: () => void
```

Body: title "Move light?" (or "Add light to room?" when `mode === 'add'`); description states light name, source ("Unassigned" if null), target. Actions: `Button plain` Cancel, `Button color="dark/zinc"` with label "Move" or "Add to room".

#### `RemoveLightFromRoomDialog`

Props:
```
open: boolean
lightLabel: string
roomName: string
busy: boolean
onConfirm: () => Promise<void> | void
onCancel: () => void
```

Body: title "Remove from room?", description "*<lightLabel>* will be removed from *<roomName>* and become unassigned.". Actions: `Button plain` Cancel, `Button color="red"` (destructive) with label "Remove".

All three import: `Alert, AlertActions, AlertDescription, AlertTitle` from `@/app/components/alert` and `Button` from `@/app/components/button`.

## 3. Edited files

### 3.1 `nextjs-ui/app/(dashboard)/lights/page.tsx`

The only client file that needs material changes. All edits are inside the existing component.

**A. Imports.** Add `GroupedLightGuardDialog, MoveLightDialog, RemoveLightFromRoomDialog` from `@/app/components/warren/light-room-dialogs`.

**B. New state hooks** (insert near the existing `useState` block at lines 79-89):

```ts
const [pendingMove, setPendingMove] = useState<{ row: LightRow; targetRoomId: number; targetRoomName: string } | null>(null)
const [pendingRemove, setPendingRemove] = useState<LightRow | null>(null)
const [groupGuard, setGroupGuard] = useState<{ row: LightRow; intent: 'move' | 'remove' } | null>(null)
const [dialogBusy, setDialogBusy] = useState(false)
```

**C. Replace `moveToRoom` direct call with intent + dialog flow.** At lines 212-229, rename to `commitMove` (post-confirmation handler), and add `requestMove(row, room)`:

1. If `row.groupId != null`, `setGroupGuard({ row, intent: 'move' })` and return.
2. Otherwise look up the target room name from the closure-captured `rooms` array and call `setPendingMove({ row, targetRoomId: room.id, targetRoomName: room.name })`.

`commitMove` reads from `pendingMove` rather than args, sets `dialogBusy`, awaits the fetch + refresh, then `setPendingMove(null)` in `finally`.

**D. Replace `removeFromRoom` direct call with intent + dialog flow.** At lines 231-240, similarly:

1. `requestRemove(row)` — if grouped, `setGroupGuard({ row, intent: 'remove' })`; otherwise `setPendingRemove(row)`.
2. `commitRemove` runs the existing PATCH-with-`roomId: null`, with busy state and refresh.

**E. New `commitRemoveFromGroup` handler** for the guard dialog's primary button:
- Read `groupGuard.row`. Bail if `row.id === null || row.groupId == null`.
- `setDialogBusy(true)`.
- `await fetch('/api/light-groups/${row.groupId}/members/${row.id}', { method: 'DELETE', credentials: 'include' })`.
- `await refresh()` so the row picks up `groupId: null` on next paint.
- `setGroupGuard(null)`; `setDialogBusy(false)`.
- On error: surface via a new `groupGuardError` state rendered inside the dialog.

**F. Update the dropdown item bindings.** At lines 395-407 the room-pick item:

```tsx
onClick={() => { if (!current) moveToRoom(row, r.id) }}
```

becomes

```tsx
onClick={() => { if (!current) requestMove(row, r) }}
```

passing the full room object so we have the name.

At lines 408-416 the "Remove from room" item: `removeFromRoom(row)` → `requestRemove(row)`.

**G. Mount the three dialogs** alongside the existing `<ConfirmDialog>` at lines 455-461 and the rename `<Dialog>` at lines 463-497. Reuse the same display-name fallback the row uses at line 331: `row.label?.trim() || row.hueName?.trim() || 'Light'`. Centralize it as a `displayName(row)` helper near the top of the file.

### 3.2 No other production files need editing

- `confirm-dialog.tsx` is unchanged.
- `tile-menu.tsx` and the dashboard tiles are unchanged — spec non-goal.
- `/api/sensors/route.ts` and `/api/sensors/[id]/route.ts` are unchanged.
- `/api/rooms/[id]/light-groups/route.ts` is unchanged.

## 4. Component breakdown — three components, not one

Decision: **three components, all in one file** (`light-room-dialogs.tsx`). Justification:

- They share zero behavioral state, only the `Alert` chrome (already a primitive).
- The bodies differ structurally — guard has 2 lines (light + group), move has 3 lines (light + source + target), remove has 1 line.
- Action button tones differ (`dark/zinc` vs `red`), and labels are prose-driven by intent.
- Wiring three small functions is shorter than the discriminated-union prop type a single component would need.

`confirm-dialog.tsx` is intentionally NOT extended. It is the simple `message: string + confirmLabel` shape used by "Hide light?". Adding multi-line bodies and source/target structure would over-fit it.

## 5. State-management approach (the kebab-to-dialog handoff)

The kebab item's `onClick` no longer fires a request; it sets a "pending intent" state. The dialog reads from that state and renders. The dialog's primary button calls a `commit*` handler that does the network call. The Headless dropdown auto-closes when a `MenuItem` is clicked, so by the time the dialog opens the menu is gone — the spec's "the menu can close immediately" is satisfied for free.

| State | Set when | Cleared when |
|---|---|---|
| `pendingMove` | `requestMove(row, room)` and `row.groupId == null` | Cancel, or `commitMove` finishes |
| `pendingRemove` | `requestRemove(row)` and `row.groupId == null` | Cancel, or `commitRemove` finishes |
| `groupGuard` | `requestMove`/`requestRemove` and `row.groupId != null` | Cancel, or `commitRemoveFromGroup` finishes |
| `dialogBusy` | true at start of any `commit*` | false in `finally` |

No prop drilling, no context.

## 6. The endpoint for "Remove from group"

**Confirmed: there is no existing endpoint, and `PATCH /api/light-groups/[id]` cannot serve as a substitute** because of the `sensorIds.length < 2` guard at [`nextjs-ui/app/api/light-groups/[id]/route.ts:43-45`](../nextjs-ui/app/api/light-groups/[id]/route.ts).

Resolution: add the route at section 2.1. It is small (under 25 lines), purely additive, and matches the URL the spec hinted at. It also defers to `pruneEmptyGroups` so the "last member" case is handled server-side.

If avoiding a new endpoint were a hard requirement, the alternative is to issue `PATCH /api/sensors/[row.id]` with `roomId: row.roomId` (lines 34-37 of `/api/sensors/[id]/route.ts` unconditionally drop membership rows when `'roomId' in body`). That works today but is semantically a hack. **Recommend the new endpoint.**

## 7. Edge cases — explicit handling

| Case | How it's handled |
|---|---|
| **Unmaterialized Hue light (`row.id === null`) being assigned for the first time** | `requestMove` checks `row.groupId == null` (always true — no sensor row, so no membership row), goes to `MoveLightDialog` with `mode: 'add'`. `commitMove` follows the existing branch at lines 220-227 that does `POST /api/sensors`. Title reads "Add light to room?", source line reads "Unassigned". |
| **Last-member-of-group on Remove from group** | The new DELETE route calls `pruneEmptyGroups(db)`. If this was the last member, the group row is deleted; the next `refresh()` clears the badge. Two-step flow honored: first the guard (acknowledging breaking the group), then the kebab reopens for the room move. |
| **Source = "Unassigned"** | `MoveLightDialog` renders source as "Unassigned" via the null check. Existing list at line 338 already displays "Unassigned" for `row.roomName == null`, so the wording is consistent. |
| **Grouped light + Remove from room** | `requestRemove` checks `row.groupId != null` and routes to `groupGuard` instead of `pendingRemove`. Guard wording stays the same regardless of `intent`. |
| **Group-removal failure (network)** | `commitRemoveFromGroup` keeps `groupGuard` open and surfaces the error via a `groupGuardError: string \| null` state, rendered inside `GroupedLightGuardDialog`. Pattern matches `light-group-detail-modal.tsx:127`. |
| **Race: SWR refresh while guard dialog is open** | `groupGuard.row` snapshot is captured at click time; dialog still shows the originally-named group. After commit, `refresh()` reconciles. |
| **Cancel during in-flight commit** | `dialogBusy` disables both primary and Cancel buttons during the fetch. |
| **`groupId` set but `groupName` is null** | Defensive: render `groupName ?? 'a light group'` in the dialog body. Server populates both together, so this is paranoia, but cheap. |

## 8. Test plan (Playwright E2E)

Existing suite: `nextjs-ui/tests/e2e/`. New file: `tests/e2e/light-room-assignment.spec.ts`. Reuse `login`, `loginViaApi`, `pairFakeBridge`, `unpairBridge` from `tests/e2e/fixtures.ts`. Mirror the seeding pattern from `light-group.spec.ts:35-66`.

### 8.1 New spec: `light-room-assignment.spec.ts`

Setup helper (per test): pair fake bridge → create two rooms ("Room A", "Room B") → assign 2 lights into Room A → group those 2 into "Group A" → leave 1 unassigned Hue light untouched. Cleanup deletes both rooms and unpairs.

Cases:

1. **Move dialog appears for non-grouped light, Cancel leaves state untouched.** Set up a route monitor; verify zero PATCH calls during cancel.
2. **Move dialog Confirm fires PATCH and refreshes.** Expect `PATCH /api/sensors/[id]` with `roomId: <Room B id>`.
3. **Grouped light triggers guard, never PATCHes.** Pick a grouped light's kebab → Room B → expect "Light is in a group" naming "Group A". Cancel. Verify zero PATCH calls.
4. **Guard's "Remove from group" calls the new endpoint.** Click "Remove from group" → expect `DELETE /api/light-groups/<id>/members/<sensorId>` 200. Then re-pick Room B → move dialog (not guard) → Move → PATCH.
5. **Last-member case prunes the group.** With 1 member left in Group A, kebab → Remove from group → DELETE → group pruned → no badge anywhere. Optionally assert `/api/light-groups/<id>` returns 404.
6. **Remove from room on grouped light triggers guard.** Cancel; verify zero PATCH.
7. **Remove from room on ungrouped light shows red Remove confirmation.** Confirm → PATCH with `roomId: null`.
8. **Unassigned Hue light first-time placement uses the same dialog with "Add" copy.** Title "Add light to room?" → "Add to room" → POST (not PATCH) with `roomId` and `deviceId`.

### 8.2 Existing API contract test extension

Add to `tests/e2e/light-group.spec.ts` (or a new `member-removal.spec.ts`):

- `DELETE /api/light-groups/<existing>/members/<member>` returns 200; subsequent `GET /api/sensors` shows `groupId: null`.
- `DELETE /api/light-groups/999999/members/<sensor>` and `DELETE /api/light-groups/<group>/members/999999` both return 404 cleanly.

### 8.3 No regression to existing specs

Confirm `light-group.spec.ts:35-100` and `dashboard.spec.ts` unaffected.

## 9. Sequencing

1. Land the new server route. Verify with the contract test in 8.2.
2. Land `light-room-dialogs.tsx` — pure addition with no integration yet.
3. Land the edits in `lights/page.tsx` together with the new Playwright spec from 8.1.

Three steps can also be a single PR.

## 10. Anticipated challenges

- **Headless `Menu` closing.** Auto-closes on `MenuItem` click — confirmed by the existing `removeFromRoom` flow. State updates inside `onClick` happen synchronously enough that React batches the menu close + dialog open in the same tick.
- **`row.id === null` for unassigned Hue lights.** Guard logic must NOT trigger on these. The `row.groupId != null` check is sufficient. The "Remove from room" item is already gated by `row.id !== null && row.roomId !== null` at line 408.
- **Refresh ordering.** `await refresh()` before closing the dialog so re-opening the kebab doesn't show stale data.
- **Dialog stacking.** Page already mounts a `Dialog` (rename) and an `Alert` (`ConfirmDialog`). Both portal-based via Headless and stack cleanly; no z-index work needed.

## Critical Files

- [`nextjs-ui/app/(dashboard)/lights/page.tsx`](../nextjs-ui/app/(dashboard)/lights/page.tsx) — edited
- [`nextjs-ui/app/components/warren/light-room-dialogs.tsx`](../nextjs-ui/app/components/warren/light-room-dialogs.tsx) — new
- [`nextjs-ui/app/api/light-groups/[id]/members/[sensorId]/route.ts`](../nextjs-ui/app/api/light-groups/[id]/members/[sensorId]/route.ts) — new
- [`nextjs-ui/app/api/sensors/route.ts`](../nextjs-ui/app/api/sensors/route.ts) — read-only reference
- [`nextjs-ui/tests/e2e/light-room-assignment.spec.ts`](../nextjs-ui/tests/e2e/light-room-assignment.spec.ts) — new
