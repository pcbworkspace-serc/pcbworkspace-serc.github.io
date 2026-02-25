const DEFAULT_SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";
const DEFAULT_PCB_WORKSPACE_ACCESS_VIDEO_URL =
  "https://image2url.com/r2/default/videos/1772004985663-f0a926d8-f6d7-4317-9923-883f49c38eda.mp4";

function getWebhookUrl() {
  return import.meta.env.VITE_WELCOME_EMAIL_WEBHOOK_URL?.trim() ?? "";
}

function getSupportEmail() {
  return import.meta.env.VITE_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

function getVideoUrl() {
  return import.meta.env.VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL?.trim() || DEFAULT_PCB_WORKSPACE_ACCESS_VIDEO_URL;
}

export function buildWelcomeEmailPayload(recipientEmail: string) {
  const supportEmail = getSupportEmail();
  const videoUrl = getVideoUrl();

  const subject = "Welcome to PCB Workspace Access — SERC";

  const text = [
    `Hi ${recipientEmail},`,
    "",
    "Welcome to PCB Workspace Access from SERC (Space Robotics Creations)!",
    "We’re excited to have you onboard.",
    "",
    "Your account is now active and you can start using the software right away.",
    videoUrl ? `Getting started video (same as PCB Workspace Access): ${videoUrl}` : "Getting started video: (configure VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL)",
    "",
    `If you need support, contact us at ${supportEmail}.`,
    "",
    "— SERC Team",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>Hi ${recipientEmail},</p>
      <p><strong>Welcome to PCB Workspace Access</strong> from <strong>SERC (Space Robotics Creations)</strong>!<br/>We’re excited to have you onboard.</p>
      <p>Your account is now active and you can start using the software right away.</p>
      <p>
        <strong>Getting started video (same as PCB Workspace Access):</strong><br/>
        ${videoUrl ? `<a href="${videoUrl}" target="_blank" rel="noopener noreferrer">${videoUrl}</a>` : "Configure VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL"}
      </p>
      <p>If you need support, contact us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      <p>— SERC Team</p>
    </div>
  `.trim();

  return {
    to: recipientEmail,
    subject,
    text,
    html,
  };
}

export async function sendWelcomeEmail(recipientEmail: string) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return;
  }

  const payload = buildWelcomeEmailPayload(recipientEmail);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Intentionally swallow errors to avoid blocking signup.
  }
}
