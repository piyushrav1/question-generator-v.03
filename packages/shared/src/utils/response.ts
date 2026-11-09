export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: Record<string, unknown>
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export function createSuccessResponse<T>(data: T, meta?: Record<string, unknown>): ApiSuccessResponse<T> {
  return meta ? { success: true, data, meta } : { success: true, data }
}

export function createErrorResponse(code: string, message: string, details?: unknown): ApiErrorResponse {
  return {
    success: false,
    error: details !== undefined ? { code, message, details } : { code, message },
  }
}
