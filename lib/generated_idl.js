const IDL_FACTORY_PREFIX = "export const idlFactory = ";
const INIT_EXPORT_BOUNDARY = "\nexport const init =";

function factoryExpression(javascript) {
  if (typeof javascript !== "string") return undefined;
  if (!javascript.startsWith(IDL_FACTORY_PREFIX)) return undefined;
  const expressionStart = IDL_FACTORY_PREFIX.length;
  const end = javascript.lastIndexOf(INIT_EXPORT_BOUNDARY);
  if (end <= expressionStart) return undefined;
  return javascript.slice(expressionStart, end).trim();
}

export function isGeneratedIdlJavaScript(javascript) {
  return factoryExpression(javascript) !== undefined;
}

export function evalGeneratedIdlFactory(javascript) {
  const expression = factoryExpression(javascript);
  if (expression === undefined) {
    throw new Error("Unable to locate generated idlFactory");
  }
  // The source is emitted from a validated Candid AST by the packaged compiler.
  // eslint-disable-next-line no-eval
  const idlFactory = (0, eval)(expression);
  if (typeof idlFactory !== "function") {
    throw new Error("Generated idlFactory is not a function");
  }
  return idlFactory;
}
