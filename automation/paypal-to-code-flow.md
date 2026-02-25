# PayPal buyer tracking + one-time code automation

This flow tracks who purchased your software and auto-sends their one-time access code.

PayPal payment link:
- https://www.paypal.com/ncp/payment/CBD88P2LKUHB8

## What this automates

1. PayPal webhook receives successful payment event (`PAYMENT.CAPTURE.COMPLETED`)
2. Power Automate calls Supabase SQL function to:
   - store purchase record in `purchases`
   - generate a new unique code in `access_codes`
3. Power Automate emails buyer from `spaceroboticscreations@outlook.com` with that code and the setup video

## 1) Supabase setup

Run both SQL scripts in Supabase SQL editor:

- `supabase/access_codes.sql`
- `supabase/paypal_purchases.sql`

This creates:
- `access_codes` (codes consumed by your app)
- `purchases` (audit log of PayPal buyers)
- `record_purchase_and_issue_code(...)` function

## 2) Create Power Automate flow

### Trigger

1. Create flow with trigger **When an HTTP request is received**.
2. Use schema file:
   - `automation/paypal-webhook-request-schema.json`

### Condition

Add a condition:
- Left: `@{triggerBody()?['event_type']}`
- Operator: `is equal to`
- Right: `PAYMENT.CAPTURE.COMPLETED`

Only proceed on true branch.

### Build buyer fields (Compose actions)

- `captureId` = `@{triggerBody()?['resource']?['id']}`
- `orderId` = `@{triggerBody()?['resource']?['supplementary_data']?['related_ids']?['order_id']}`
- `payerEmail` = `@{toLower(triggerBody()?['resource']?['payer']?['email_address'])}`
- `payerName` = `@{concat(coalesce(triggerBody()?['resource']?['payer']?['name']?['given_name'], ''), ' ', coalesce(triggerBody()?['resource']?['payer']?['name']?['surname'], ''))}`
- `amount` = `@{float(triggerBody()?['resource']?['amount']?['value'])}`
- `currency` = `@{triggerBody()?['resource']?['amount']?['currency_code']}`

### Call Supabase RPC (HTTP action)

- Method: `POST`
- URL: `https://YOUR_PROJECT_ID.supabase.co/rest/v1/rpc/record_purchase_and_issue_code`
- Headers:
  - `apikey`: `YOUR_SUPABASE_SERVICE_ROLE_KEY`
  - `Authorization`: `Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`
  - `Content-Type`: `application/json`
- Body:

```json
{
  "p_paypal_capture_id": "@{outputs('captureId')}",
  "p_paypal_order_id": "@{outputs('orderId')}",
  "p_payer_email": "@{outputs('payerEmail')}",
  "p_payer_name": "@{outputs('payerName')}",
  "p_amount": @{outputs('amount')},
  "p_currency": "@{outputs('currency')}",
  "p_payment_link": "https://www.paypal.com/ncp/payment/CBD88P2LKUHB8"
}
```

The RPC response contains `issued_code`.

### Send buyer email (Outlook action)

Use **Send an email (V2)**:

- To: `@{outputs('payerEmail')}`
- Subject: `Your PCB Workspace Access Code — SERC`
- Body (HTML):

```html
<p>Hi @{outputs('payerName')},</p>
<p>Thank you for purchasing <strong>PCB Workspace Access</strong> from <strong>SERC</strong>.</p>
<p>Your one-time access code is:</p>
<p><strong>@{first(body('HTTP_to_Supabase_RPC'))?['issued_code']}</strong></p>
<p>Getting started video:<br/>
<a href="https://image2url.com/r2/default/videos/1772004985663-f0a926d8-f6d7-4317-9923-883f49c38eda.mp4">Watch video</a></p>
<p>If you need help, contact spaceroboticscreations@outlook.com.</p>
<p>— SERC Team</p>
```

## 3) Connect PayPal webhook to flow URL

1. In PayPal Developer Dashboard, open your app/webhooks.
2. Set webhook URL to the Power Automate trigger URL.
3. Subscribe at least to:
   - `PAYMENT.CAPTURE.COMPLETED`

## 4) Verify tracking

After a payment:
- Buyer gets one-time code email
- New row appears in `purchases` table
- New code appears in `access_codes` table (unused until signup)

## Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend `.env`.
- Keep it only inside Power Automate secure connection/variables.
- Your frontend should continue using only `VITE_SUPABASE_ANON_KEY`.
