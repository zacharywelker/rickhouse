/** A rule the user ran into, worded for them. The admin actions show the message as written. */
export class AdminRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminRuleError";
  }
}
