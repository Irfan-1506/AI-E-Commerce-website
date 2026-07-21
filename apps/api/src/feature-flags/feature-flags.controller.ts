import { Body, Controller, Get, Post, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private flags: FeatureFlagsService) {}

  // Called by the frontend on load — returns which flags are on FOR THIS
  // USER specifically (percentage rollout resolved server-side), not the
  // raw flag definitions. Works for anonymous users too (falls back to a
  // stable per-session id) so rollout gating isn't login-gated.
  @Get('evaluate')
  async evaluate(@Req() req: any) {
    const userId = req.user?.userId ?? req.cookies?.accessToken ?? 'anonymous';
    const flags = await this.flags.list();
    const result: Record<string, boolean> = {};
    for (const flag of flags) {
      result[flag.key] = await this.flags.isEnabledForUser(flag.key, userId);
    }
    return result;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Get()
  list() {
    return this.flags.list();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Post(':key')
  upsert(
    @Param('key') key: string,
    @Body() body: { enabled: boolean; rolloutPercentage: number; description?: string },
  ) {
    return this.flags.upsert(key, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete(':key')
  delete(@Param('key') key: string) {
    return this.flags.delete(key);
  }
}
