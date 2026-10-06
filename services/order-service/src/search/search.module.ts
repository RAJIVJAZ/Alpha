import { Module } from '@nestjs/common';
import { OutletsModule } from '../outlets/outlets.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({ imports: [OutletsModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
