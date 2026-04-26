# Spec for change-login-password

branch: claude/feature/change-login-password

## Summary

Add a user menu to the header that appears when clicking the logged-in username. The menu includes a "Change Password" option that opens a modal dialog, allowing the user to update their login password without restarting the server or editing environment variables. Credentials will be migrated from env vars to the existing SQLite database.

## Functional Requirements

- Clicking the username in the header opens a small dropdown menu
- The dropdown contains at minimum two items: "Change Password" and "Log out"
- Selecting "Change Password" opens a modal dialog
- The modal dialog has three fields: current password, new password, and confirm new password
- Submitting the form validates that the current password is correct before applying the change
- New password and confirm new password must match
- New password must meet a minimum length requirement (at least 8 characters)
- On success the modal closes and a brief success notification is shown
- On failure (wrong current password, mismatch, too short) an inline error message is shown without closing the modal
- The session remains valid after a successful password change (no forced re-login)
- Passwords are stored as hashed values in the SQLite database, not as plain text
- The server falls back to the env var credentials on first run if no user record exists in the database (migration path)
- The existing logout button is removed from the header and replaced by the dropdown menu item

## Possible Edge Cases

- User submits the change password form with the same password as the current one — allow or reject with a clear message
- Server restarts while the user has a valid session after changing their password — session should remain valid
- The SQLite database is reset or deleted — the server should fall back to env var credentials so the user is not locked out
- Concurrent requests to change the password from two browser tabs — last write wins; no data corruption
- Very long passwords or passwords with special characters — must be handled correctly by the hash function

## Acceptance Criteria

- [ ] Clicking the username in the top-right header opens a dropdown with "Change Password" and "Log out"
- [ ] The dropdown closes when clicking outside it
- [ ] The change password dialog opens from the dropdown option
- [ ] The dialog requires the correct current password before accepting a change
- [ ] The dialog rejects mismatched new/confirm passwords with an inline error
- [ ] The dialog rejects passwords shorter than 8 characters with an inline error
- [ ] A successful change shows a success notification and closes the dialog
- [ ] The user remains logged in after changing the password
- [ ] Changed password persists across server restarts (stored in SQLite)
- [ ] The server accepts the env var password on first boot when no DB record exists

## Open Questions

- Should there be a password complexity requirement beyond minimum length (e.g. mixed case, numbers)?
- Should changing the password invalidate other active sessions (e.g. from other browsers)?
- Is a single shared admin account sufficient long-term, or should multi-user support be considered?

## Testing Guidelines

Create a test file(s) in the ./tests folder for new feature, and create meaningful test for the following cases without going too heavy:

- POST /api/auth/change-password with correct current password and valid new password returns 200
- POST /api/auth/change-password with wrong current password returns 401
- POST /api/auth/change-password with mismatched new/confirm passwords returns 422
- POST /api/auth/change-password with too-short new password returns 422
- Login with the new password succeeds after a successful change
- Login with the old password fails after a successful change
