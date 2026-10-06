import 'reflect-metadata';
import { bootstrapService } from '@foodgrid/utils/server';
import { AppModule } from './app.module';
import { SERVICE } from './service.config';

void bootstrapService(AppModule, SERVICE);
