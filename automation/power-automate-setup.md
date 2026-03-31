# Power Automate setup for SERC welcome emails

This flow sends the welcome email from your Outlook account (`spaceroboticscreations@outlook.com`) when the app posts to your webhook.

## 1) Create flow

1. Go to Power Automate → **Create**.
2. Choose **Automated cloud flow** or **Instant cloud flow**.
3. Add trigger: **When an HTTP request is received**.
4. Open [power-automate-request-schema.json](power-automate-request-schema.json) and paste it into **Use sample payload to generate schema**.

## 2) Add email action

1. Add action: **Office 365 Outlook → Send an email (V2)**.
2. Set fields:
   - **To** = `@{triggerBody()?['to']}`
   - **Subject** = `@{triggerBody()?['subject']}`
   - **Body** = `@{triggerBody()?['html']}`
   - **Is HTML** = `Yes`
3. Optional: put `spaceroboticscreations@outlook.com` in **From (Send as)** if your connector supports it.

## 3) Save and copy webhook URL

1. Save flow.
2. Copy the generated HTTP POST URL from trigger.
3. Put it into your app env:

```sh
VITE_WELCOME_EMAIL_WEBHOOK_URL=https://prod-xx.westus.logic.azure.com:443/workflows/...
```

## 4) Configure video link in app

Set the same video URL used in "PCB Workspace Access":

```sh
VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL=https://YOUR_VIDEO_LINK
```

## 5) Test quickly

Use [power-automate-sample-payload.json](power-automate-sample-payload.json) and send it to your flow URL via Postman or curl.

curl example:

```bash
curl -X POST "YOUR_FLOW_URL" \
  -H "Content-Type: application/json" \
  -d @automation/power-automate-sample-payload.json
```

If flow run succeeds, the buyer receives the SERC welcome email with the video link.
