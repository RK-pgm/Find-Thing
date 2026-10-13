# Found It — School Lost & Found

## Run locally

1. Open PowerShell in this folder.
2. Start the app:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-server.ps1
   ```

The script uses Node.js from your PATH. If it is missing, it tries the Node.js runtime bundled with Codex. If neither is available, install Node.js and restart VS Code.

3. Open <http://127.0.0.1:3000>. On localhost, the browser can use the camera after you grant permission.

Account and item data is saved in `data/store.json`; photos are saved in `uploads/`. Both folders are ignored by Git so school data does not get committed with the source.
## Administrator setup

When no administrator account exists, the server prints a one-time setup code in the terminal.
Register using the exact name `AdminRK` and student ID `T36699`, enter that code, and choose a
password. The code becomes invalid after the administrator account is created. Keep the terminal
private while the code is visible.

The Admin panel shows counts for lost reports, found reports, accounts, and support requests.
Administrators can reply to school support messages and delete student accounts. Deleting an
account also deletes that account's reports, photos, and related messages. Administrator accounts
cannot be deleted from the panel.

## Staff inbox

For a local demo, set a staff student ID before starting the server, then register that ID as the staff account:

```powershell
$env:STAFF_STUDENT_ID = 'staff-id-here'
node server.js
```

This only marks the matching ID as staff. It does not verify that a person belongs to the school.
The one-time administrator code protects initial administrator setup, but this demo still does not
verify student identities. Do not publish it or enter real student data until the school adds
roster or school-account verification, HTTPS hosting, managed database storage, backups, and a staff
account policy.

## Included

- Registration with name, student ID, and password; login is required before the board opens.
- Salted scrypt password hashes and HTTP-only same-site session cookies.
- Lost and found reports with optional camera capture/photo upload.
- Category/location filters and a basic item similarity score.
- Private messages between a report owner and another signed-in user, including replies.
- A school support queue that configured staff accounts can read and reply to.
- An administrator dashboard with account management and lost/found summaries.

Sessions live in server memory and end when the server stops. This is suitable for a local school project demo, not a production service.



