import { DynamicModule, Global, Module } from '@nestjs/common';
import { PRISMA_MODULE_OPTIONS, PrismaModuleOptions, PrismaService } from './prisma.service';

@Global()
@Module({})
export class PrismaModule {
  static forRoot(options: PrismaModuleOptions = {}): DynamicModule {
    return {
      module: PrismaModule,
      providers: [{ provide: PRISMA_MODULE_OPTIONS, useValue: options }, PrismaService],
      exports: [PrismaService],
    };
  }
}
