import "server-only";
import nodemailer from "nodemailer";
import { getSmtpConfig, type SmtpConfig } from "./settings";

export type Mail = { to: string; subject: string; text: string };

function transportFor(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Implicit TLS (usually 465). Otherwise nodemailer upgrades with
    // STARTTLS whenever the server offers it.
    secure: config.secure,
    ...(config.username ? { auth: { user: config.username, pass: config.password ?? "" } } : {}),
  });
}

/** Throws when SMTP isn't configured or the server refuses the message. */
export async function sendMail(mail: Mail): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) throw new Error("Email is not set up.");
  await transportFor(config).sendMail({ from: config.fromAddress, ...mail });
}

/** Mail that shouldn't fail the action that triggered it: logged, not thrown. */
export async function sendMailQuietly(mail: Mail): Promise<void> {
  try {
    await sendMail(mail);
  } catch (error: unknown) {
    console.error("[rickhouse] could not send email", mail.subject, error);
  }
}
