export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string = "Something went wrong",
    public data: object | null = null,
    public success: boolean = false,
    public errors: any[] = [],
    public stack: string = "",
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype); // If your tsconfig.json has target < ES2015, now natively it does same thing as TS emits code so that subclasses of built-ins don’t automatically get a correct prototype link
    this.statusCode = statusCode;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
