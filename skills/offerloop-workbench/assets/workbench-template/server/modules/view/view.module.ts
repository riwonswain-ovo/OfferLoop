import { Module } from '@nestjs/common';
import { ViewController } from './view.controller';

@Module({
  controllers: [ViewController],
  providers: [],
})
export class ViewModule{}