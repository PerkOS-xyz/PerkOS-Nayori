type OpenApiOperation = {
  security?: unknown[];
};

const economicPaths = new Set(['/v1', '/mpp/v1', '/v1/quotes']);

export function isCredentialFreeReadOperation(
  path: string,
  method: string,
  operation: OpenApiOperation,
) {
  return (
    method.toUpperCase() === 'GET' &&
    !economicPaths.has(path) &&
    (!operation.security || operation.security.length === 0)
  );
}

export function isEconomicOperation(path: string) {
  return economicPaths.has(path);
}
