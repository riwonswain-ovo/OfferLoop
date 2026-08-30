// 业务异常类
import { HttpStatus } from '@nestjs/common';
import { RESPONSE_CODE_TO_HTTP_STATUS_MAP, ResponseCode } from '../constants/api_response_code';

export class BusinessException extends Error {
  constructor(
    public readonly code: ResponseCode,
    public readonly message: string,
    public readonly httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'BusinessException';
  }
  getHttpStatus(): HttpStatus {
    return RESPONSE_CODE_TO_HTTP_STATUS_MAP[this.code];
  }
}
