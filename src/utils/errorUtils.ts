
// tslint:disable-next-line:export-name
export class UserError extends Error {}

export class MavenNotFoundError extends UserError {}

export class OperationCanceledError extends UserError {}

export class JavaExtensionNotActivatedError extends Error {}
