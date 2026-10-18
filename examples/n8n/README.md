# Skysay read-only n8n workflow

Import verify-workspace.json into n8n. Tested with n8n 2.43.6 and the built-in
HTTP Request node v4.2. No community node or model credential is required.

Create a Header Auth credential inside n8n:
- Name: Authorization
- Value: Bearer followed by a space and your Skysay key

The key needs account:read. Select this credential in Read Skysay workspace.
Do not put the key in the workflow JSON or in a chat. Exported workflows do
not include the credential secret, but can include credential references;
review every export before sharing it.

Execute manually. The only request is GET /v1/workspace-context. It returns
workspace/project information, not a call result. No schedule, phone action,
model, SMS, purchase or webhook trigger is configured. The workflow is inactive.
Automatic execution persistence is disabled in this sample; the manual editor
still displays the returned workspace data, and your instance's logs/backups
remain subject to its configuration.

Do not enable automatic retries for future call/SMS nodes until their exact
idempotency and approval behavior is verified.
