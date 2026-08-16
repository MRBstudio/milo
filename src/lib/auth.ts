export function isOperator(req: Request): boolean {
  const pw = req.headers.get("x-operator-password");
  return !!process.env.OPERATOR_PASSWORD && pw === process.env.OPERATOR_PASSWORD;
}
