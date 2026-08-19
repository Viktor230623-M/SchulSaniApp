import nodemailer from "nodemailer";

const smtpHost = process.env["SMTP_HOST"]?.trim();
const smtpPort = Number(process.env["SMTP_PORT"] ?? "587");
const smtpUser = process.env["SMTP_USER"]?.trim();
const smtpPassword = process.env["SMTP_PASSWORD"];
const mailFrom = process.env["MAIL_FROM"]?.trim();
const mailFromName = process.env["MAIL_FROM_NAME"]?.trim() || process.env["APP_NAME"]?.trim();
const mailReplyTo = process.env["MAIL_REPLY_TO"]?.trim();
const appBaseUrl = process.env["APP_BASE_URL"]?.trim()?.replace(/\/$/, "");
const smtpSecure = process.env["SMTP_SECURE"] === "true";
const smtpRequireTls = process.env["SMTP_REQUIRE_TLS"] !== "false";

export const mailerConfig = {
  enabled: Boolean(smtpHost),
  appBaseUrl,
};

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} ist fuer lokale Konten erforderlich`);
  return value;
}

export function assertMailerConfig(): void {
  required("SMTP_HOST", smtpHost);
  required("MAIL_FROM", mailFrom);
  required("APP_BASE_URL", appBaseUrl);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error("SMTP_PORT muss eine gueltige Portnummer sein");
  }
  if ((smtpUser && !smtpPassword) || (!smtpUser && smtpPassword)) {
    throw new Error("SMTP_USER und SMTP_PASSWORD muessen gemeinsam gesetzt werden");
  }
}

let transporter: nodemailer.Transporter | undefined;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  assertMailerConfig();
  required("MAIL_FROM", mailFrom);

  transporter = nodemailer.createTransport({
    host: required("SMTP_HOST", smtpHost),
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
    requireTLS: smtpRequireTls,
    tls: { rejectUnauthorized: true },
  });
  return transporter;
}

export function authLink(path: string, token: string): string {
  assertMailerConfig();
  return `${required("APP_BASE_URL", appBaseUrl)}/${path}?token=${encodeURIComponent(token)}`;
}

export async function verifyMailer(): Promise<void> {
  await getTransporter().verify();
}

export async function sendMail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const from = required("MAIL_FROM", mailFrom);
  await getTransporter().sendMail({
    from: mailFromName ? `"${mailFromName}" <${from}>` : from,
    replyTo: mailReplyTo,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
