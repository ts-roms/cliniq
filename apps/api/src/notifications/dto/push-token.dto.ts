import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const PLATFORMS = ['ios', 'android', 'web', 'unknown'] as const;
type Platform = (typeof PLATFORMS)[number];

export class RegisterPushTokenDto {
  /** Stable per-install id (Expo installation id, or random uuid kept by the client). */
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  deviceId!: string;

  /** ExponentPushToken[...] string returned by `Notifications.getExpoPushTokenAsync()`. */
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  token!: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS as readonly string[])
  platform!: Platform;
}

export class UnregisterPushTokenDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  deviceId!: string;
}
