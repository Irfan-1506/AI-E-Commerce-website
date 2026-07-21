import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AssistantService } from './assistant.service';

@UseGuards(AuthGuard('jwt'))
@Controller('assistant')
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Post('chat')
  @Throttle({ default: { limit: 15, ttl: 60_000 } }) // each call costs real money — tighter than the general API limit
  chat(@Req() req: any, @Body('message') message: string) {
    return this.assistant.chat(req.user.userId, message);
  }

  @Post('reset')
  reset(@Req() req: any) {
    return this.assistant.clearHistory(req.user.userId);
  }
}
