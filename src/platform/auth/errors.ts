export class AuthenticationRequiredError extends Error {
  constructor() { super("Sign in required"); }
}
