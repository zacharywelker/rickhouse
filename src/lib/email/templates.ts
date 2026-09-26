import type { Mail } from "./send";

type Person = { name: string; email: string };

const sign = "\n\n— Rickhouse";

function firstName(person: Person): string {
  return person.name.trim().split(/\s+/)[0] || "there";
}

export function resetMail(person: Person, url: string): Mail {
  return {
    to: person.email,
    subject: "Reset your Rickhouse password",
    text:
      `Hi ${firstName(person)},\n\nSomeone asked to reset the password for your Rickhouse account. ` +
      `If that was you, choose a new one here (the link works for 24 hours):\n\n${url}\n\n` +
      `If it wasn't, ignore this email; your password hasn't changed.${sign}`,
  };
}

export function inviteMail(person: Person, url: string): Mail {
  return {
    to: person.email,
    subject: "You're invited to Rickhouse",
    text:
      `Hi ${firstName(person)},\n\nAn account has been made for you on Rickhouse. ` +
      `Choose your password here to get started (the link works for 24 hours):\n\n${url}${sign}`,
  };
}

export function otpMail(person: Person, otp: string): Mail {
  return {
    to: person.email,
    subject: `Your Rickhouse sign-in code: ${otp}`,
    text: `Hi ${firstName(person)},\n\nYour sign-in code is ${otp}. It works once, for a few minutes.${sign}`,
  };
}

export function securityNoticeMail(person: Person, what: string): Mail {
  return {
    to: person.email,
    subject: "Security notice from Rickhouse",
    text:
      `Hi ${firstName(person)},\n\n${what}\n\n` +
      `If this was you, there's nothing to do. If it wasn't, reset your password straight away and tell ` +
      `whoever runs this Rickhouse.${sign}`,
  };
}
