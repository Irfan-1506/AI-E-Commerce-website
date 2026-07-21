import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { StorageService } from './storage.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SELLER', 'ADMIN')
@Controller('storage')
export class StorageController {
  constructor(private storage: StorageService) {}

  @Post('upload-url')
  getUploadUrl(@Body('filename') filename: string, @Body('mimeType') mimeType: string) {
    return this.storage.getUploadUrl(filename, mimeType);
  }
}
