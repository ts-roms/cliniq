import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RegisterPatientDto } from './dto/register-patient.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator.js';
import { Audit } from '../audit/audit.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.register', entity: 'User' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.login', entity: 'User' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.refresh', entity: 'User' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @Public()
  @Post('patient-register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.patientRegister', entity: 'User' })
  registerPatient(@Body() dto: RegisterPatientDto) {
    return this.auth.registerPatient(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
