// /* 模板代码 仅作示例 */
// import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, ParseIntPipe } from '@nestjs/common';
// import type { Request } from 'express';
// import { HelloService } from './hello.service';

// @Controller('api/hello')
// export class HelloController {
//   constructor(private readonly helloService: HelloService) {}

//   @Get('test')
//   async test(@Req() req: Request, @Query('limit') limit?: string) {
//     const { userId } = req.userContext;
//     const limitNum = limit ? parseInt(limit) : 5;
//     return this.helloService.test(userId, limitNum);
//   }
// }
