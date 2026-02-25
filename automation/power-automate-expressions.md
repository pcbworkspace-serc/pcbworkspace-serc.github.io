# Power Automate copy-paste expressions (PayPal -> Supabase -> Email)

Use this with [paypal-to-code-flow.md](paypal-to-code-flow.md).

## Trigger condition

- Left: `@{triggerBody()?['event_type']}`
- Operator: `is equal to`
- Right: `PAYMENT.CAPTURE.COMPLETED`

## Compose actions

### Compose: captureId

```text
@{triggerBody()?['resource']?['id']}
```

### Compose: orderId

```text
@{triggerBody()?['resource']?['supplementary_data']?['related_ids']?['order_id']}
```

### Compose: payerEmail

```text
@{toLower(triggerBody()?['resource']?['payer']?['email_address'])}
```

### Compose: payerName

```text
@{trim(concat(coalesce(triggerBody()?['resource']?['payer']?['name']?['given_name'], ''), ' ', coalesce(triggerBody()?['resource']?['payer']?['name']?['surname'], '')))}
```

### Compose: amount

```text
@{float(triggerBody()?['resource']?['amount']?['value'])}
```

### Compose: currency

```text
@{triggerBody()?['resource']?['amount']?['currency_code']}
```

## HTTP action to Supabase RPC

- Method: `POST`
- URI:

```text
https://YOUR_PROJECT_ID.supabase.co/rest/v1/rpc/record_purchase_and_issue_code
```

- Headers:

```text
apikey: YOUR_SUPABASE_SERVICE_ROLE_KEY
Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY
Content-Type: application/json
```

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

## Extract issued code from RPC response

If RPC response body is an array like `[{"issued_code":"SERC-ABC123"}]`, use:

```text
@{first(body('HTTP_to_Supabase_RPC'))?['issued_code']}
```

(Replace `HTTP_to_Supabase_RPC` with your actual HTTP action name.)

## Outlook Send email (V2)

### To

```text
@{outputs('payerEmail')}
```

### Subject

```text
Your PCB Workspace Access Code — SERC
```

### Body (HTML)

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

### Is HTML

```text
Yes
```

## Optional duplicate-guard condition

Add condition right after trigger:

```text
@equals(triggerBody()?['event_type'], 'PAYMENT.CAPTURE.COMPLETED')
```

Any duplicate webhook for same capture ID is safely handled by SQL function (returns existing code).
