export class ApiResponse {
  constructor(
    public statusCode: number,
    public success: boolean,
    public message: string = "Success",
    public data: object | null = null,
  ) {
    this.success = statusCode < 400;
  }
}
